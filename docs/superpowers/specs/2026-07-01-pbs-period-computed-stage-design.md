# PBS Period 系统自动阶段设计

## 背景

当前 PBS Portal 员工是否可编辑 bid，同时受两个条件控制：

1. `pbs_period.status = OPEN`
2. `PBS Business Now` 落在 `bid_open_at` 和 `bid_close_at` 之间

这导致一个实际问题：管理员已经把业务时间设置到 `2026-05-01`，且 `Jun 2026 / P` 的时间窗口也是 `2026-05-01 00:00` 到 `2026-05-08 23:59`，但用户 `247` 仍然只读，因为该 period 的数据库 `status` 还是 `DRAFT`。

用户明确要求：不要再让管理员手动维护 `Status`，系统应根据日期自动判断阶段，并在管理端显示系统计算结果。

## 目标

- 员工是否可编辑只由 `PBS Business Now` 和 period 的 `Bid Open / Bid Close` 决定。
- 管理员不再手动修改 period 状态。
- Gantt 管理端仍显示周期阶段，但显示的是系统自动计算结果。
- PBS Portal 的只读原因和 banner 文案基于系统阶段，而不是数据库 `status`。

## 非目标

- 不删除数据库中的 `pbs_period.status` 字段。
- 不做历史数据迁移。
- 不改变 `Portal Active Period` 的手动/自动选期逻辑。
- 不改变 `PBS Business Time` 的口径。
- 不改变 pairings、crew bids、calendar 数据结构。

## 核心规则

新增一个系统计算阶段，建议命名为 `computedStage`。

阶段计算规则：

| 条件 | computedStage | canEditBid |
|---|---|---|
| `bid_open_at` 或 `bid_close_at` 缺失 | `INCOMPLETE` | `false` |
| `businessNow < bid_open_at` | `NOT_OPEN` | `false` |
| `bid_open_at <= businessNow <= bid_close_at` | `OPEN` | `true` |
| `businessNow > bid_close_at` | `CLOSED` | `false` |

`pbs_period.status` 不再参与 `canEditBid` 判定。

## 后端设计

### pbs-server

修改 `pbs-server/src/services/lineholder/current-bid.ts`：

- `buildReadOnlyReason` 不再检查 `row.status !== "OPEN"`。
- 增加纯函数计算 `computedStage`。
- `canEditBid = computedStage === "OPEN"`。
- `readOnlyReason` 根据 `computedStage` 生成：
  - `NOT_OPEN`: `Bidding opens at <time>.`
  - `CLOSED`: `Bidding closed at <time>.`
  - `INCOMPLETE`: `Bid period window is incomplete.`
  - `OPEN`: `null`
- `toPbsActivePeriod` 返回 `computedStage`，供 Portal 使用。

需要同步更新 contracts 类型，避免前后端使用隐式字段。

### live-server

Gantt 管理端 period 列表来自 `live-server/src/routes/pbs/period-admin.ts`。

该接口应基于 PBS Business Time 返回每个 period 的系统计算阶段：

- 新增返回字段 `computedStage`。
- 保留原始 `status` 字段作为历史字段，但前端不再用它表示开放状态。
- `GET /api/pbs/period-admin`、`GET /api/pbs/period-admin/portal-active-period` 都应返回 `computedStage`。
- `POST/PATCH /api/pbs/period-admin` 不再允许管理员输入或修改 `status`。

## Gantt 管理端设计

修改 `gantt/src/components/pbs/pbs-period-view.tsx`：

- Period 表格 `Status` 列改为显示 `computedStage`。
- 新增/编辑 period 弹窗移除 `Status` 可编辑字段，或改为只读展示。
- `Generate Year` 生成周期时不再要求管理员决定 `status`。
- `Portal Active Period` 当前配置展示中，如果显示 period 状态，应显示 `computedStage`，不是数据库 `status`。

推荐 UI 文案：

- `NOT_OPEN`: `Not Open`
- `OPEN`: `Open`
- `CLOSED`: `Closed`
- `INCOMPLETE`: `Incomplete`

颜色建议：

- `OPEN`: 绿色
- `NOT_OPEN`: 蓝灰色
- `CLOSED`: 灰色
- `INCOMPLETE`: 橙色

## PBS Portal 设计

Portal 现有 `activePeriod.canEditBid` 继续作为页面编辑总开关。

需要调整：

- `activePeriod.status` 不再用于判断可编辑。
- `activePeriod.computedStage` 用于展示当前阶段。
- 只读 banner 不再显示 `Bid period status is DRAFT.`。
- 当 `computedStage = OPEN` 时，页面可编辑。
- 当 `computedStage != OPEN` 时，页面只读并显示对应时间原因。

示例：

- 当前在窗口内：`Bidding open for Jun 2026`
- 未开放：`Bidding not open for Jun 2026`
- 已关闭：`Bidding closed for Jun 2026`
- 时间缺失：`Bidding window is incomplete for Jun 2026`

## 数据兼容

- 旧的 `pbs_period.status` 可以继续存在。
- 旧值 `DRAFT/OPEN/CLOSED` 不再影响 Portal 是否可编辑。
- 为降低风险，本阶段不删除字段、不迁移数据、不清理旧状态。

## 验收标准

1. 当 `PBS Business Now` 位于 `Bid Open / Bid Close` 之间时，即使 `pbs_period.status = DRAFT`，Portal 也可编辑。
2. 用户 `247` 命中 `F8/P -> Jun 2026`，业务时间在 `2026-05-01` 时，可以编辑 Pairing bid。
3. 当业务时间早于 `Bid Open`，Portal 只读，并提示未开放时间。
4. 当业务时间晚于 `Bid Close`，Portal 只读，并提示已关闭时间。
5. Gantt 管理端不能手动修改 period 状态。
6. Gantt 管理端列表显示系统计算阶段，而不是数据库原始 `status`。
7. `Portal Active Period` 手动/自动选期行为不变。

## 测试计划

### pbs-server

- 增加/更新 `current-period-bid` 或 `current-bid` 单元测试：
  - `status = DRAFT` 但业务时间在窗口内，`canEditBid = true`。
  - 早于 `bid_open_at`，`canEditBid = false`，原因是未开放。
  - 晚于 `bid_close_at`，`canEditBid = false`，原因是已关闭。
  - 时间缺失，`canEditBid = false`。

### pbs-portal

- 更新 active period banner / read-only 状态测试：
  - `computedStage = OPEN` 可编辑。
  - `computedStage = NOT_OPEN/CLOSED/INCOMPLETE` 只读。

### gantt

- 更新 PBS Period 管理页 E2E：
  - Status 不可编辑。
  - 列表显示系统计算阶段。
  - 修改 Bid Open / Bid Close 后阶段随业务时间变化。

## 风险与处理

- 风险：旧代码仍读取 `status` 判断可编辑。
  - 处理：搜索并统一改为 `canEditBid` 或 `computedStage`。

- 风险：管理员误解数据库 `status` 与页面阶段不一致。
  - 处理：前端不再显示原始 `status`，只显示系统计算阶段。

- 风险：接口同时返回 `status` 和 `computedStage` 后语义混乱。
  - 处理：Portal 和 Gantt 只使用 `computedStage` 展示阶段；`status` 仅作为兼容字段保留。

## Multi-Agent Parallelism Assessment

- Recommendation: Yes
- Rationale: 该改动跨 `pbs-server`、`pbs-portal`、`live-server`、`gantt` 和测试，边界清晰，可并行探索/实现。
- Suggested split:
  - Agent A: `pbs-server` active period 判定与 contracts。
  - Agent B: `live-server` period-admin computed stage API。
  - Agent C: `gantt` 管理端展示与 E2E。
  - Agent D: `pbs-portal` banner/只读 UI 与测试。
- Write boundaries: 每个 agent 只写对应模块；contracts 由主 agent 或 Agent A 统一修改，避免冲突。
- Conflict risk: 中等，主要在 shared contracts 和 active period 类型。
- Execution gate: 用户确认 spec 后再开始实现；实现前先明确 contracts 修改由谁负责。
