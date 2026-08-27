# 设计：Scenario 优化闭环（live-server ⇄ engine-server ⇄ ro-engine）

> 日期：2026-06-02
> 范围：在 Gantt 场景界面点击「运行场景」，经 live-server 调度 engine-server 执行 RO 优化，
> live-server 负责导出过滤后的原始表数据（`ro_input.gz`），engine-server 运行 ro-engine 产出
> `ro_output.gz`，归档到 `complete/` 并回写结果，Gantt 打开场景时读取优化结果展示排班。

---

## 1. 目标与非目标

### 目标
- Gantt「Run」按钮触发真实优化（替换当前仅切换状态的假实现）。
- live-server 新增「场景数据导出」接口：按场景过滤条件导出原始表为 CSV，打包为 `ro_input.gz`。
- 复用 engine-server 现有任务生命周期（fetch input → 运行子进程 → 回传 output → 归档）。
- engine-server 优化成功后把 `ro_input.gz` + `ro_output.gz` 归档到 **本机 `complete/`** 目录，
  回调 live-server 写回 `scenario.file_path` 等元数据并置场景为 DONE。
- Gantt 打开 DONE 场景时，live-server 按需从 engine-server 拉取 `ro_output.gz`，
  将 `ASSIGNMENTS` 叠加到 pairing 数据上，返回排班视图。

### 非目标（本期不做）
- ro-engine 输入语义层转换：本期 live-server 只忠实导出**原始表**（`## table_name` CSV 段）。
  原始表 → ro-engine 语义 section（CREWS/PAIRINGS/JOB_PARAMS…）的转换在 engine 侧/适配层后续处理。
- 复杂过滤：本期只做「时间窗 + 机组子表时间交叉」的简单过滤，`filter_params` 富化逐步迭代。
- 共享文件服务器：本期采用 **方案 B**（file_path 指向 engine-server 本机，live-server 按需拉取）；
  后续改造为 live-server 与 engine-server 都能读写的共享文件服务器。
- PO/TO 优化器：本设计仅覆盖 RO，PO/TO 沿用 engine-server 现有 `finished/` 流程不变。

---

## 2. 端到端数据流

```
[Gantt "Run"] ──POST /api/scenario/:id/run (JWT)──▶ [live-server]
                                                       │ ① 校验状态，transition DRAFT→RUNNING
                                                       │ ② POST /optimize/start
                                                       │    { type:"RO", parameters:{scenarioId}, url:<live-base>, token:<JWT> }
                                                       ▼
                                                  [engine-server] 创建 RO 任务
   [live-server export] ◀──POST /api/scenario/export {scenarioId}──┘   (engine 用同一 JWT 回调)
        │ ③ 构建 ro_input.gz（## table CSV 段，gzip）
        └──gz bytes──▶ [engine-server] ── 运行 ro-engine 子进程 ──▶ ro_output.gz
                                                       │ ④ move ro_input.gz + ro_output.gz → complete/<airline>/<scenario>/
                                                       │    记录 complete 路径
   [live-server result] ◀──POST /api/scenario/result (metadata JSON)──┘
        │ ⑤ 写 scenario.file_path/file_size/checksum，optimized_count++，KPI→scenario_kpi
        └ transition RUNNING→DONE（失败则 FAILED）

[Gantt "Open"] ──GET /api/scenario/:id/roster──▶ [live-server]
        │ ⑥ 按 file_path 从 engine-server 拉取 ro_output.gz（方案 B）
        │   解析 ASSIGNMENTS（crew_id→pairing_id），叠加 pairing 数据
        └──roster JSON──▶ Gantt 渲染
```

---

## 3. `ro_input.gz` 格式与内容

### 3.1 容器格式
单个 gzip 文本文件，内部按 `## table_name` 分段，每段为该表的 CSV（首行表头）。沿用 ro-engine
`read_input_gz` 已有的 `## SECTION` 约定，engine-server 原样透传不解析。

```
## crew
id,crew_no,name,...
1,F8001,...
## pairing
id,pairing_no,...
...
```

### 3.2 导出表清单（v1）

| 段名（表） | 过滤规则 |
|---|---|
| `scenario` | 当前运行的场景行（id = scenarioId） |
| `workset` | 该场景对应 workset 行（id = scenario.workset_id） |
| `crew` | 按场景过滤条件（v1：division/base/fleet 等 `filter_params`，缺省全量） |
| `crew_rank` | crew_id ∈ 已选机组 且 时间交叉 |
| `crew_base` | 同上 |
| `crew_fleet` | 同上 |
| `crew_qualification` | 同上 |
| `crew_status` | 同上 |
| `crew_certificate` | 同上 |
| `roster_flight` | 时间窗内 + `filter_params` |
| `pairing` | 时间窗内 + `filter_params` |
| `pairing_segment` | pairing_id ∈ 已选 pairing |
| `pairing_composition` | 同上 |
| `flight` | 时间窗内（被 pairing/roster 引用） |
| `flight_composition` | flight 关联 |
| `rule_group` | group_code = 场景选择的 rule group 代码（见 §5.3 scenario 页面调整：新增选择并持久化 group_code） |
| `rule_group_item` | 属于上述 rule_group |
| `rule_instance` | 上述 rule_group_item 引用 |
| `rule_template` | rule_instance 引用 |
| `base` | 全量（参照表，量小） |
| `rank` | 全量 |
| `fleet` | 全量 |
| `airport` | 仅被过滤后 flight/pairing 的 dep/arr 三字码引用到的机场 |

> **时间交叉判定（机组子表）**：`effdt <= scenario.end_dt_loc AND (expdt >= scenario.str_dt_loc OR expdt IS NULL)`。

### 3.3 性能要求（硬性）
- **禁止循环内单步查询（N+1）**。每张表一条 SQL，全部用 `Promise.all` 并发执行。
- 子表过滤通过 `crew_id IN (SELECT id FROM crew WHERE <filters>)` / `pairing_id IN (...)` 子查询完成，
  使每张表仍是**单次往返**且彼此独立，可并发。
- 单表行集 → CSV 在内存流式拼接，最终一次 gzip；避免逐行字符串拼接的二次分配。
- 导出接口超时与 engine-server `http_client.timeout`（默认 600s）对齐。

---

## 4. `ro_output.gz` 与结果回写

### 4.1 输出格式
ro-engine 产出 `## SECTION`：`RESULT_META`、`KPI`、`ASSIGNMENTS`（crew_id→pairing_id）。

### 4.2 结果回调（方案 B：只传元数据）
engine-server 归档成功后，`POST /api/scenario/result`，body 为 **JSON 元数据**（不含大体积 ASSIGNMENTS）：

```jsonc
{
  "scenarioId": 123,
  "taskId": "uuid",
  "status": "DONE",            // DONE | FAILED | INFEASIBLE | TIMEOUT
  "filePath": "/.../complete/f8/123/ro_output.gz",  // engine-server 本机路径
  "fileSize": 10240,
  "checksum": "sha256...",
  "kpi": [ { "code": "...", "value": 1.0 }, ... ],   // 来自 KPI 段
  "resultMeta": { ... }                              // 来自 RESULT_META 段
}
```

live-server 结果处理：写 `scenario.file_path/file_size/checksum`，`optimized_count++`，
KPI 段落地 `scenario_kpi`，按 status 置 DONE/FAILED。**不在 live-server 落地排班行**（文件化场景，
不向 live 业务表加 scenario_id，符合「用文件替代历史快照表」）。

### 4.3 读回（方案 B）
`GET /api/scenario/:id/roster`：live-server 用 `scenario.file_path` 调 engine-server 新增的
**结果文件读取接口** 拉取 `ro_output.gz` → 解析 `ASSIGNMENTS` → 以 crew_id→pairing_id 叠加到
live-server 自有 pairing/roster_flight 数据 → 返回 Gantt 排班 JSON。

> 后续共享文件服务器改造后，此处改为 live-server 直接读共享路径，去掉 engine-server 代理读。

---

## 5. 各模块改动清单

### 5.1 live-server（新增为主）
| 改动 | 文件 |
|---|---|
| `POST /api/scenario/:id/run` 路由 | `src/routes/scenario/scenario.ts` |
| 运行编排（校验状态、调 engine、存 task_id） | `src/services/scenario/scenario-service.ts` |
| engine-server HTTP 客户端 | `src/services/engine-server-client.ts`（仿 `rule-engine-client.ts`） |
| `ENGINE_SERVER_URL` 环境变量（默认 `http://localhost:3003`） | `src/config/env.ts` |
| `POST /api/scenario/export`（原始表导出 → ro_input.gz） | `src/routes/scenario/scenario.ts` + `src/services/scenario/scenario-export-service.ts` |
| `POST /api/scenario/result`（结果回写） | 路由 + service |
| `GET /api/scenario/:id/roster`（读回优化排班） | 路由 + service |

> `/export` 与 `/result` 由 engine-server 携带 Gantt JWT 调用，走现有全局 JWT 认证钩子。

### 5.2 engine-server（复用为主）
| 改动 | 文件 |
|---|---|
| RO 优化器配置：`server_integration: true`、`url.input=/api/scenario/export`、`url.output=/api/scenario/result` | `config.yaml(.example)` |
| 结果提交改为发送**元数据 JSON**（含 complete 路径/KPI/RESULT_META），而非透传 output 字节 | `src/tasks/task_manager.py._submit_output_data` + `src/utils/http_client.py` |
| `move_to_complete()`：RO 成功后把 ro_input.gz+ro_output.gz 移到 `complete/<airline>/<scenario>/`，返回路径 | `src/files/file_manager.py` + 配置 `paths.complete_dir` |
| 结果文件读取接口（供 live-server 方案 B 拉取） | `src/api/routes.py`（新增 `GET /optimize/result/{task_id}` 或按路径） |

### 5.3 gantt（接线）
| 改动 | 文件 |
|---|---|
| `scenario-run-btn` 改为调用真实 `POST /run`，轮询状态至 DONE/FAILED | `src/components/scenario/scenario-toolbar.tsx` + `src/stores/scenario-store.ts` + `src/services/scenario-api.ts` |
| 「Open」读取 `GET /:id/roster` 渲染优化排班 | 同上 |
| **新增「rule group」选择并持久化 group_code**（供 export 过滤 rule_group；`rule_group.group_code` varchar(50) 与现有 `ruleset_id` varchar(9) 不匹配，需新增字段或存入 `filter_params.ruleGroupCode`） | `src/components/scenario/scenario-detail-panel.tsx` + 后端 scenario 模型/服务 |

---

## 6. 认证

- Gantt 携带 JWT 调 live-server `/run`。
- live-server 调 engine-server `/optimize/start` 时传 `token=<该 JWT>`（engine-server JWT 模式复用，
  回调 live-server 时自动带上）。`JWT_SECRET` 两端共享，已具备。
- engine-server → live-server 的 `/export`、`/result` 走 JWT；live-server → engine-server 的结果读取接口
  走 JWT 或 API Key。

---

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| `/optimize/start` 失败 | live-server 回滚场景到 DRAFT，返回错误 |
| 导出 SQL 失败 | `/export` 返回 5xx，engine-server 视为 InputFetchError，任务 FAILED |
| ro-engine 退出码 1/2/3 | engine-server 仍归档并回调，status=INFEASIBLE/TIMEOUT/FAILED；live-server 置 FAILED 并记 error |
| 结果回调失败 | engine-server 记错误并归档到 complete（带失败标记）；场景保持 RUNNING 由人工/重试处理 |
| 打开时拉取 output 失败 | `/roster` 返回明确错误，前端区分「加载失败」与「空结果」 |

---

## 8. 测试计划

- **live-server（Vitest）**
  - `scenario-export-service`：给定场景时间窗 + 机组集合，断言各 `## table` 段存在、行数正确、
    时间交叉过滤生效、airport 仅含被引用三字码；断言**无 N+1**（mock db 调用次数 = 固定表数）。
  - `/result` 回写：写 file_path/size/checksum、optimized_count++、KPI 落 scenario_kpi、状态置 DONE。
  - `/roster`：mock engine-server 返回 ro_output.gz，断言 ASSIGNMENTS 正确叠加为排班行。
  - 缓存一致性：场景状态/结果写入后相关缓存失效。
- **engine-server（pytest）**
  - `move_to_complete` 行为；结果提交为元数据 JSON；结果文件读取接口鉴权与字节正确。
- **e2e（Playwright，§Playwright-Required）**
  - `e2e/gantt/scenario-run.spec.ts`：点击 Run → 状态变 RUNNING → 轮询至 DONE →
    Open 显示具体优化排班（断言具体 crew/pairing 文本与计数，非仅可见）；失败路径区分加载失败与空态。

---

## 9. 版本号

- live-server（后端）→ `BACKEND_VERSION +1`
- engine-server（后端）→ 同一 `BACKEND_VERSION`（同维度）
- gantt（前端）→ `FRONTEND_VERSION +1`
- 不涉及 rule-engine checker/calculator → `RULE_VERSION` 不变

---

## 10. 待迭代（记录，不在本期）
- `filter_params` 富化（rank/fleet/base/division 等多维过滤）。
- 原始表 → ro-engine 语义 section 转换层。
- 共享文件服务器改造（live-server 与 engine-server 共读写，去掉方案 B 代理读）。
