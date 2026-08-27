# Gantt PBS Simulated Crew Portal 配置维护设计

## 背景

`Simulated Crew Portal` 已经可以通过 `dictionary` 中的 `SYS_PARAM / PBS_PORTAL_PUBLIC_URL` 和 `SYS_PARAM / PBS_SIMULATED_LOGIN_TTL_SECONDS` 生成模拟登录链接。当前问题是配置虽然存在数据库里，但管理员如果要修改，需要直接改数据库，不适合日常运维。

用户希望在 `Simulated Crew Portal` 页面上直接维护这些配置，避免每次调整 portal 地址或 token 时效都通过 SQL 操作。

## 目标

在 Gantt 的 `PBS > Simulated Crew Portal` 页面增加一个配置区块，让 admin 用户可以查看和修改模拟登录相关业务配置。

## 范围

本轮新增：

1. 页面新增 `Portal Configuration` 区块。
2. 配置项包括：
   - `Portal URL`
   - `Token TTL Seconds`
3. 页面加载时读取当前配置。
4. 点击 `Save Configuration` 后保存到 live schema 的 `dictionary`。
5. 保留现有 `Simulate Portal Login` 和 `Log` 功能。
6. 非 admin 用户不能访问和保存配置。

本轮不做：

- 不在页面展示或修改 `PBS_INTERNAL_API_SECRET`。
- 不新增配置表。
- 不做配置历史审计列表，除非后续单独要求。
- 不改变 PBS Portal 的实际登录、token 消费和日志展示逻辑。

## 推荐方案

推荐方案：配置仍存 `live.dictionary SYS_PARAM`，但通过页面和 admin API 维护。

原因：

- 现有架构已经明确 `system_parameter` 被 `dictionary` 替代。
- 配置不用进 env，也不需要重启服务。
- 页面操作比直接 SQL 安全，可做校验、权限和错误提示。
- 不引入新表，改动范围小。

备选方案：

1. 继续手动改数据库：实现成本最低，但运维体验差，也容易改错 schema。
2. 改回 env：部署简单，但每次改都要改服务配置并可能重启，且用户已经明确不希望这么做。
3. 新增专用配置表：结构更清晰，但当前只有两个业务参数，新增表属于过度设计。

## UI 设计

页面布局：

```text
Simulated Crew Portal                                      [Log]

[Portal Configuration]
Portal URL             https://crew-f8-usva-sit.roiscloud.com/pbs
Token TTL Seconds      300
[Save Configuration]

[Simulate Portal Login]
Crew                   19
[Simulate]
```

交互要求：

- `Portal Configuration` 放在 `Simulate Portal Login` 上方。
- 两个区块样式保持现有 PBS admin 页面风格：小标题、边框、紧凑表单。
- `Save Configuration` 独立于 `Simulate`。
- 保存成功使用现有全局 toast。
- 保存失败不能展示 raw exception / stack / SQL。
- 配置读取失败时显示页面内配置区块错误状态，并保留 `Simulate` 区块。
- 如果 `Portal URL` 配置行缺失，配置区块仍允许 admin 输入并保存；保存接口通过 upsert 创建缺失行。缺失配置时 `Simulate` 本身仍会失败并提示配置缺失。

字段校验：

- `Portal URL`
  - 必填。
  - 必须是合法 `http://` 或 `https://` URL。
  - 保存时去掉尾部多余 `/`。
  - 最大长度受 `dictionary.code_value varchar(50)` 限制。当前 SIT/UAT URL 在范围内；如果未来域名超过 50，需要单独扩字段。
- `Token TTL Seconds`
  - 必填。
  - 正整数。
  - 范围：`1` 到 `3600`。
  - 推荐默认值：`300`。

## API 设计

### Gantt 调 live-server

读取配置：

```http
GET /api/admin/simulated-crew-portal/config
```

返回：

```json
{
  "portalPublicUrl": "https://crew-f8-usva-sit.roiscloud.com/pbs",
  "loginTtlSeconds": 300
}
```

说明：live-server route 仍使用项目标准 response envelope；上面是 Gantt API client 解包后给页面组件使用的数据形状。

保存配置：

```http
PUT /api/admin/simulated-crew-portal/config
Content-Type: application/json

{
  "portalPublicUrl": "https://crew-f8-usva-sit.roiscloud.com/pbs",
  "loginTtlSeconds": 300
}
```

错误：

- 非 admin：`403`。
- URL 不合法：`400`。
- TTL 不合法：`400`。
- `dictionary.code_value` 超长：`400`，提示需要缩短 URL 或后续扩字段。
- 数据库失败：`500`，用户只看到产品化错误文案。

### live-server 到 pbs-server

继续复用当前内网代理模式：

```http
GET /api/internal/simulated-crew-portal/config
PUT /api/internal/simulated-crew-portal/config
X-Internal-Secret: <secret>
```

说明：

- `live-server` 负责 Gantt admin 权限。
- `pbs-server` 负责读写 PBS 模拟登录配置，因为模拟登录服务已经在 pbs-server 读取 `live.dictionary`。
- 内部接口仍通过 `PBS_INTERNAL_API_SECRET` 保护。

## 后端数据写入

写入目标：

```text
<LIVE_SCHEMA>.dictionary
```

写入行：

```text
parent_code = SYS_PARAM
code = PBS_PORTAL_PUBLIC_URL
code_value = portalPublicUrl

parent_code = SYS_PARAM
code = PBS_SIMULATED_LOGIN_TTL_SECONDS
code_value = loginTtlSeconds
```

写入行为：

- 使用 upsert。
- 若配置行不存在，则创建。
- 若配置行存在，则更新 `code_value`、`updated_by`、`updated_at`。
- 不修改 `PBS_INTERNAL_API_SECRET`。

## 安全和权限

- 页面只允许 Gantt admin 访问。
- 保存配置必须经过 live-server admin 鉴权。
- pbs-server internal config 接口必须校验 `X-Internal-Secret`。
- `PBS_INTERNAL_API_SECRET` 仍只放 env / secret manager，不暴露给前端。
- 用户可见错误不能泄漏数据库 schema、SQL、stack、secret。

## 测试计划

后端：

- pbs-server config service：
  - 正常读取配置。
  - 配置缺失时返回默认 TTL，但 URL 缺失仍作为配置错误。
  - 保存时校验 URL。
  - 保存时校验 TTL 范围。
  - 超过 `varchar(50)` 的 URL 返回明确错误。
- pbs-server internal route：
  - 无 `X-Internal-Secret` 返回 403。
  - GET / PUT 正常。
- live-server admin route：
  - 非 admin 返回 403。
  - GET / PUT 代理 pbs-server，并校验 response envelope。

前端：

- Gantt unit test：
  - 页面加载显示配置。
  - 保存成功显示 toast。
  - URL / TTL 校验错误显示在字段旁。
  - 非 admin 或 403 返回时切回安全页面。
- Playwright：
  - admin 打开 `Simulated Crew Portal`。
  - 能看到 `Portal Configuration` 和 `Simulate Portal Login` 两个区块。
  - 修改配置并点击保存，请求 payload 正确。
  - `Log` 弹窗仍可打开。
  - `Simulate` 功能不受配置区块影响。

验证命令：

```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/simulated-crew-portal/*.test.ts src/routes/simulated-crew-portal*.test.ts
cd live-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois pnpm exec vitest run src/routes/admin/pbs-simulated-crew-portal.test.ts
cd gantt && pnpm exec vitest run src/components/pbs/__tests__/pbs-simulated-crew-portal-view.test.tsx
cd e2e && npx playwright test --config=config/playwright.gantt-only.config.ts tests/gantt/pbs-simulated-crew-portal.spec.ts --reporter=list
npm run check:ui
```

## 验收标准

- Admin 可以在 `Simulated Crew Portal` 页面查看当前 Portal URL 和 TTL。
- Admin 可以在页面保存 Portal URL 和 TTL，不需要手动 SQL。
- 保存后再次打开页面显示新配置。
- 模拟登录使用最新配置生成 URL。
- `PBS_INTERNAL_API_SECRET` 不出现在页面、接口返回或前端代码中。
- 非 admin 无法读取或保存配置。
- 现有 `Simulate` 和 `Log` 行为保持不变。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个页面、一组 admin route 和一个 pbs-server 配置 service，文件少且接口强耦合，拆多 agent 容易产生契约不一致。
- Suggested split: 不建议拆分。主 agent 顺序完成 backend contract、frontend UI、tests。
- Write boundaries: 单 agent 维护 `gantt/src/components/pbs/*`、`live-server/src/routes/admin/*`、`pbs-server/src/services/simulated-crew-portal/*` 和对应测试。
- Conflict risk: 中等。当前模拟登录功能还在同一批未提交改动里，多 agent 容易改到同一文件。
- Execution gate: 用户确认本 spec 后再开始实现。
