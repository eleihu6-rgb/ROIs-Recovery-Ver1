# Gantt PBS Crew Bid Import 异步导入设计

## 背景

`PBS > PBS Admin > Admin Tools > Crew Bid Import` 当前的 `Import` 是同步 HTTP 请求：前端上传 TXT 后一直等待后端完成全部 crew 写库，再返回结果。

实际验证中，March 2026 YEG 文件的单 crew 写库大约需要 15 秒，全量 79 人会超过前端当前 `120000ms` timeout。即使数据库权限已补齐，继续用同步请求也会导致用户看到 `timeout of 120000ms exceeded`，同时后端可能仍在继续处理，用户无法判断本次导入到底是否完成。

## 目标

1. `Import` 改成长任务模式，点击后快速返回 `runId`。
2. 后端后台继续执行真实导入，避免浏览器长时间挂起。
3. 前端自动轮询 `Import Runs`，让用户看到 `running / completed / completed_with_warnings / failed` 状态。
4. 导入完成后仍支持选择该 run 并执行 rollback。
5. 保留现有 `Dry Run` 同步行为，因为 dry-run 不写入 bid，当前耗时可接受。
6. 不在本轮重构导入算法性能；先修复管理端可用性和状态可见性。

## 方案比较

### 方案 A：只把前端 timeout 加长

- 优点：改动最少。
- 缺点：用户仍然看不到进度；后端如果跑 5-10 分钟，浏览器体验仍然很差；请求断开后状态不清楚。
- 结论：不推荐。

### 方案 B：异步 run + 前端轮询

- 优点：符合长任务管理端模式；用户可以离开再回来刷新 run；rollback 与历史记录天然复用。
- 缺点：需要改后端 run 状态流转、API 返回类型和前端轮询。
- 结论：推荐。

### 方案 C：BullMQ 队列 worker

- 优点：最正式，适合生产级长任务队列、重试和并发控制。
- 缺点：本轮改动更大，需要 Redis queue job schema、worker 部署和更多运维配置。
- 结论：后续可演进，本轮不做。

## 推荐设计

采用方案 B：在 live-server 内部启动后台任务。

### 后端状态流

扩展 `PbsCrewBidImportStatus`：

- `queued`
- `running`
- `completed`
- `completed_with_warnings`
- `failed`
- `rolled_back`

`POST /api/admin/crew-bid-imports` 行为调整：

1. 读取 multipart 文件和参数。
2. 解析 TXT 并创建 `pbs_crew_bid_import_run` 记录。
3. 初始状态写为 `queued` 或 `running`。
4. 立即返回 `{ runId, status, periodCode, startedAt, summary }`，前端不再等待全量写库。
5. 使用 `setImmediate` 或同等方式在当前 live-server 进程内后台执行真实导入。
6. 后台任务完成后更新 run summary、items、problems、backup。
7. 后台任务异常时更新 run 为 `failed`，并尽量写入错误 problem，避免用户只看到空状态。

### 数据库调整

已有表可复用：

- `pbs_crew_bid_import_run`
- `pbs_crew_bid_import_item`
- `pbs_crew_bid_import_problem`
- `pbs_crew_bid_import_backup`

本轮需要确认 `status` 字段无需枚举约束，因此可以直接存 `queued/running`。

如果需要记录顶层异常，优先复用 `pbs_crew_bid_import_problem`，没有 item 时 `item_id` 为空。

### 后端实现边界

在 `live-server/src/services/crew-bid-import/crew-bid-import-service.ts` 中拆分：

- 保留 `dryRun(...)` 同步返回完整结果。
- 新增 `startImport(...)`：创建 run 并启动后台任务，快速返回 run 基本信息。
- 抽出内部 `executeImportRun(...)`：执行原本 `importBids(...)` 的写库逻辑，最终更新 run。
- 保留 `getRun(...)` / `listRuns(...)`，让前端轮询。
- `rollbackRun(...)` 只允许 rollback 已完成且未 rollback 的 import run；`queued/running` 状态下禁用 rollback。

### 前端交互

`gantt/src/components/pbs/pbs-admin-tools.tsx`：

1. 点击 `Import` 后显示 `Import started: <runId>`。
2. 自动设置 `runPeriodCode` 为本次 period。
3. 自动选择本次 `runId`。
4. 每 2 秒轮询一次 `GET /api/admin/crew-bid-imports/{runId}`。
5. 当状态为 `completed / completed_with_warnings / failed / rolled_back` 时停止轮询。
6. 轮询过程中刷新 `Import Runs`，让表格状态同步。
7. `Rollback Selected Import` 在 `queued/running` 时禁用。
8. 结果区显示当前 run detail；running 状态下 summary 可以先显示 0 或已写入的最新 summary。

### API 类型

在 `packages/contracts/pbs-crew-bid-imports.d.ts` 和 `gantt/src/services/pbs-admin-tools-api.ts` 中同步：

- `PbsCrewBidImportStatus` 增加 `queued | running`。
- `PbsCrewBidImportResponse` 继续作为返回体，允许 `items/problems` 为空数组。
- 如果实现上需要更轻量的 start response，也必须保持前端类型明确，不用 `any`。

## 错误处理

- 创建 run 之前失败：继续返回 400/500，同现有行为。
- 创建 run 之后后台失败：不再让 HTTP 请求 500，而是把 run 状态更新为 `failed`。
- 后台失败时前端轮询到 `failed`，用户可以打开 detail 查看 problem。
- 正在运行的 run 禁止 rollback。
- 已 rollback 的 run 禁用 rollback。

## 验收标准

1. 全量 March 2026 YEG 文件点击 `Import` 后，前端在几秒内得到 `runId`，不再出现 `timeout of 120000ms exceeded`。
2. `Import Runs` 表格能看到该 run 从 `running` 到最终状态。
3. 完成后结果区能显示 summary、items、problems。
4. 完成后的 run 可以 rollback；running 状态不能 rollback。
5. `Dry Run` 行为保持不变。
6. `cd live-server && npx vitest run <相关测试>` 通过。
7. `cd gantt && npx tsc --noEmit` 通过。
8. 浏览器验证 Admin Tools 页面没有 UI 重叠，且轮询状态能正确刷新。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动跨 contract、live-server service/route、gantt 单页组件，但核心状态机耦合很紧，拆多 agent 容易改出不一致 API。
- Suggested split: 不拆，由主 agent 顺序完成。
- Write boundaries: `packages/contracts/pbs-crew-bid-imports.*`、`live-server/src/routes/admin/pbs-crew-bid-imports.ts`、`live-server/src/services/crew-bid-import/*`、`gantt/src/services/pbs-admin-tools-api.ts`、`gantt/src/components/pbs/pbs-admin-tools.tsx`、相关测试。
- Conflict risk: 中等，当前 worktree 已有同区域未提交改动，实施时必须只追加本需求相关修改，不回滚既有改动。
- Execution gate: 用户确认本 spec 后开始实现。
