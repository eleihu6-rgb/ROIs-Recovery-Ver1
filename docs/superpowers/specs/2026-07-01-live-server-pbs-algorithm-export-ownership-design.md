# Live Server 接管 PBS 算法偏好压缩包导出设计

## 背景

PBS 算法偏好压缩包用于给 `engine-server` / PBS rostering solver 提供 crew bid 偏好数据，压缩包内容固定包含：

- `DAYSOFF.csv`
- `PAIRING_SCORE.csv`
- `RESERVE_SCORE.csv`
- `LINE_RULES.csv`
- `LINE_RULES_README.md`

当前仓库里存在两套导出能力：

- `pbs-server`：已有完整接口，包括 `POST /api/admin/algorithm-export/scenario-package`，当前仍被 `engine-server` 调用。
- `live-server`：已有迁移后的管理员导出能力，但当前只注册了 `GET /api/admin/algorithm-export` 和 `GET /api/admin/algorithm-export/yeg-test-package`，缺少 `scenario-package`。

业务判断：该导出能力服务于优化链路和管理员操作，更适合作为 `live-server` 的管理功能。`pbs-server` 应回归 Portal / PBS 申请业务，不再承担算法包导出职责。

## 目标

1. 将算法偏好压缩包导出的权威入口收口到 `live-server`。
2. 补齐 `live-server` 的 `POST /api/admin/algorithm-export/scenario-package`。
3. 将 `engine-server` 从调用 `pbs-server` 改为调用 `live-server`。
4. 让 `pbs-server` 旧导出接口直接失败，不做兼容代理、不做静默兜底。
5. 保持压缩包内容和 solver 预期文件名不变。

## 非目标

- 不改变压缩包内 CSV 的业务字段含义。
- 不改变 solver 消费文件的方式。
- 不改变 Gantt 发起 scenario run 的入口。
- 不做 `pbs-server -> live-server` 反向代理兼容。
- 不引入新的跨服务协议版本层。

## 当前链路

```text
Gantt
  -> live-server POST /api/scenario/:id/run
  -> engine-server POST /api/optimize/start
  -> engine-server LegacyRO(inputSource=db)
  -> engine-server 调 pbs-server:
       POST /api/auth/session
       POST /api/admin/algorithm-export/scenario-package
       或 GET /api/admin/algorithm-export/yeg-test-package
  -> solver 消费 tgz 内 5 个文件
  -> engine-server 回调 live-server POST /api/scenario/result
```

## 目标链路

```text
Gantt
  -> live-server POST /api/scenario/:id/run
  -> engine-server POST /api/optimize/start
  -> engine-server LegacyRO(inputSource=db)
  -> engine-server 调 live-server:
       POST /api/admin/algorithm-export/scenario-package
       或 GET /api/admin/algorithm-export/yeg-test-package
  -> solver 消费 tgz 内 5 个文件
  -> engine-server 回调 live-server POST /api/scenario/result
```

`pbs-server` 旧入口如果仍被调用，必须返回明确错误，暴露未迁移调用方。

## 设计方案

### 1. live-server 补齐 scenario-package

在 `live-server/src/routes/admin/pbs-algorithm-export.ts` 注册：

```http
POST /api/admin/algorithm-export/scenario-package
Authorization: Bearer <admin token>
Content-Type: application/json

{
  "periodCode": "Jun 2026",
  "crewIds": ["536", "247"],
  "scenarioStart": "2026-06-01",
  "scenarioEnd": "2026-06-30"
}
```

响应：

- `200`
- `Content-Type: application/gzip`
- `Content-Disposition: attachment; filename="pbs-algorithm-export-scenario-Jun-2026.tgz"`
- body 为 `.tgz` bytes

校验：

- 必须是管理员 token。
- `periodCode` 必填且非空。
- `crewIds` 必填，允许空数组但仍会生成空 scope 包。
- `scenarioStart` / `scenarioEnd` 可选，但如果传入必须是 `YYYY-MM-DD`。

### 2. live-server service 增加 scenario scope

在 `live-server/src/services/algorithm-export/algorithm-export-service.ts` 增加与 `pbs-server` 等价的 `exportScenarioPackage`：

- 通过调用方传入的 `crewIds` 构建 scope。
- 基于 `crew.seniority_num` 保持稳定排序。
- 如果传入 `scenarioStart` / `scenarioEnd`，用于收窄 `PAIRING_SCORE` 所需 pairing 范围。
- 如果未传 scenario window，先按 `periodCode` 推导 bid month 作为 fallback window，避免全库 pairing 参与打分。

需要注意：`live-server` 现有 algorithm export service 已支持筛选 current package，但不具备 `pbs-server` 里的 `PairingScopeFilter` / `CrewPairingEligibility` 逻辑。迁移时必须补齐这些逻辑，不能只加 route。

### 3. engine-server 改为调用 live-server

当前 `engine-server` 的 `pbs_server_client.py` 实际承担“下载 solver bid package”职责。迁移后应改名或重构为更中性的客户端，例如：

- `bid_package_client.py`
- config 字段从 `pbs_server` 改为 `bid_package_server`

`live-server` 的登录接口是：

```http
POST /api/auth/login
Content-Type: application/json

{
  "userCode": "...",
  "password": "..."
}
```

成功响应为统一格式，token 在 `data.token`。这与 `pbs-server` 的 `/api/auth/session` 路径不同，所以迁移时必须显式实现 live-server 登录，不允许复用旧 PBS 登录 path。

配置目标：

```yaml
bid_package_server:
  url: "${BID_PACKAGE_SERVER_URL:http://localhost:3000}"
  username: "${BID_PACKAGE_ADMIN_USER:...}"
  password: "${BID_PACKAGE_ADMIN_PASSWORD:...}"
  period_code: "Jun 2026"
```

调用目标：

- 登录 live-server `POST /api/auth/login` 获取 admin JWT。
- 调 live-server `POST /api/admin/algorithm-export/scenario-package`。
- 回退路径仍可以调用 live-server `GET /api/admin/algorithm-export/yeg-test-package`。

不使用从 Gantt scenario run 透传下来的用户 JWT 调此管理员导出接口。原因是 `POST /api/scenario/:id/run` 当前并没有在 route 层显式要求管理员；如果复用普通用户 JWT，会让 scenario run 是否成功依赖发起人的用户权限，导致行为不稳定。engine-server 应使用配置的 live-server admin 凭据下载 solver package。

### 4. pbs-server 旧接口直接失败

按用户要求采用激进策略：不做兼容，不转发 live-server。

推荐实现：

- 保留路由文件中三个旧 path，但统一返回 `410 Gone`：
  - `GET /api/admin/algorithm-export`
  - `GET /api/admin/algorithm-export/yeg-test-package`
  - `POST /api/admin/algorithm-export/scenario-package`
- 响应 message 明确写：
  - `PBS algorithm export has moved to live-server.`

理由：

- 比直接删除路由导致 `404` 更容易定位问题。
- 不提供数据，不做代理，不隐藏未迁移调用方。
- 测试可以明确验证旧入口失败，符合“报错后直接修”的策略。

如果实现时判断保留 route 本身会增加维护成本，也可以直接取消注册旧路由，让调用方得到 `404`。但推荐 `410`，因为它更快暴露迁移原因。

## 影响范围

### live-server

- `src/routes/admin/pbs-algorithm-export.ts`
- `src/services/algorithm-export/algorithm-export-service.ts`
- `src/services/algorithm-export/types.ts`
- 可能涉及 `pairing-score-export.ts` / `export-scope.ts`，用于补齐 scenario window 和 per-crew eligibility。
- 增加 route/service 测试。

### engine-server

- `src/tasks/task_manager.py`
- `src/utils/pbs_server_client.py` 或替换为新客户端。
- `src/config/config.py`
- `config.yaml` / `config.yaml.example`
- 相关 LegacyRO workdir / package 下载测试。

### pbs-server

- `src/routes/algorithm-export.ts`
- `src/app.ts`
- 旧 route 测试改为断言 `410 Gone`。
- 是否删除 service 文件可在实现阶段按引用情况决定；如果仍有脚本或测试引用，先最小化移除注册和调用路径。

### packages/contracts

- `pbs-algorithm-export` contract 可继续保留路径常量，因为 live-server 也使用同一路径。
- 如果 `pbs-server` 不再语义上拥有该 contract，后续可单独重命名为 `algorithm-export`，本次不做以降低扩散。

## 错误处理

- live-server 参数错误返回 `400`。
- 非管理员返回 `403`。
- 未认证返回 `401`。
- 导出过程失败返回 `500`，日志保留 error object。
- pbs-server 旧入口返回 `410`，不调用 service。
- engine-server 调 live-server 失败时保持任务失败，不 fallback 到 pbs-server。

## 测试计划

### live-server

- 新增 / 更新 route 测试：
  - admin 可成功 `POST /api/admin/algorithm-export/scenario-package`。
  - 非 admin 返回 `403`。
  - 缺 `periodCode` / `crewIds` 返回 `400`。
  - 响应 header 为 `application/gzip` 和 scenario 文件名。
- 新增 / 更新 service 测试：
  - scenario scope 只包含传入 crew。
  - 未传 scenario window 时按 `periodCode` 推导月份窗口。
  - 传入 scenario window 时优先使用显式窗口。

### engine-server

- 更新客户端测试：
  - 登录 live-server。
  - 调 `scenario-package` 时传 `periodCode`、`crewIds`、`scenarioStart`、`scenarioEnd`。
  - 不再调用 pbs-server URL。
- 更新 LegacyRO workdir 测试：
  - scenario crew 存在时下载 scenario package。
  - scope 获取失败时调用 live-server 的 yeg-test-package。
  - live-server 返回错误时任务失败，不 fallback pbs-server。

### pbs-server

- 更新旧 route 测试：
  - 三个旧 algorithm-export path 返回 `410`。
  - 不再验证 tgz 成功导出。

### 集成验证

- 跑最小相关测试：
  - `cd live-server && npm test -- <algorithm-export related tests>`
  - `cd engine-server && python3 -m pytest tests/test_legacy_ro_workdir_prep.py -v`
  - `cd pbs-server && npm test -- src/routes/algorithm-export.test.ts`
- 跨模块后跑：
  - `npm run verify:pbs` 或项目当前可用的等价 PBS 验证命令。

## 风险与处理

1. **live-server 登录 contract 与 pbs-server 不同**
   - 已确认 live-server 使用 `POST /api/auth/login`，响应 `data.token`。
   - engine-server 新客户端必须调用该 path；不能继续调用 `/api/auth/session`。
   - 如果配置账号不是 live-server admin，package 下载应失败并暴露配置问题。

2. **live-server scenario-package 逻辑不完整**
   - 当前 live-server 迁移版缺少 scenario scope 和 pairing eligibility 的一部分能力。
   - 实施时必须以 pbs-server 现有实现为对照，避免生成包范围变大或 crew/rank 不匹配。

3. **旧 pbs-server 调用方暴露**
   - 这是预期行为。返回 `410` 后按日志/调用方逐个修。

4. **配置命名迁移影响部署**
   - 为了符合“无兼容”，配置字段可以直接改为 `bid_package_server`。
   - 部署环境必须同步更新环境变量；否则 engine-server 启动或 run 会失败，属于可见问题。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这次跨 `live-server`、`engine-server`、`pbs-server`，但核心 contract 和调用链强耦合，必须按顺序补齐 live-server，再切 engine-server，再让 pbs-server 旧入口失败。
- Suggested split: 不建议并行写代码；可以在实现前并行做只读对照审查，但当前主任务规模不大，协调成本高于收益。
- Write boundaries: 单 agent 顺序修改更安全，避免三个模块同时改同一 contract 造成不一致。
- Conflict risk: 中等，主要在共享 contract、auth contract、algorithm export service 语义。
- Execution gate: 只有用户确认本 spec 后才进入实现。

## 验收标准

1. engine-server 在 LegacyRO run 中只调用 live-server 下载算法偏好包。
2. live-server 支持 `POST /api/admin/algorithm-export/scenario-package` 并返回包含 5 个固定文件的 `.tgz`。
3. pbs-server 三个旧导出入口不再返回 tgz，直接失败。
4. 无 pbs-server 兼容代理或 fallback。
5. 相关单测 / 集成测试通过。
6. 真实 scenario run 如果配置正确，应能完成 package 下载；如果仍有旧调用方，应快速暴露为 `410` 或连接错误。
