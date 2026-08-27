# PBS Award 日历 DO 标签显示设计

日期：2026-07-24
状态：已确认并实施
相关模块：`pbs-portal`、`pbs-server` Award 展示
明确不改：其他 Bid / Days Off 页面、Prefer Off 语义、live-server、数据库 schema、migration

## 背景

Award 页面展示的是最终发布结果。左侧 Award Calendar 绿色 day off 事件当前显示 `Off`，但在最终发布结果中，这一天已经确定为 `DO`，不再是 bid 阶段的 off 偏好表达。

用户明确补充：本次只改 Award 页面，其他页面仍保持现有 `Off` / Prefer Off 语义。

## 目标

- Award 左侧日历绿色 day off 事件显示为 `DO`。
- 只影响 Award 页面，不影响其他 bid 页面、Days Off 页面或导出逻辑。
- 保留右侧 roster / selected duty 已有的完整业务说明，例如 `Day Off`；`DO` 只作为发布日历上的短标签。
- 自动化测试覆盖 Award calendar 事件标签。

## 非目标

- 不把全项目的 `Off` 都替换为 `DO`。
- 不改 Prefer Off、Days Off bid 条件、summary、导出或搜索逻辑。
- 不改数据库和 publish 快照结构。
- 不改 Pairing / Line / Reserve 页面。

## 实施方案

推荐只在 Award calendar 的显示层处理：

- `PbsAwardCalendarEvent` 保持当前业务事件结构。
- Award 页面生成日历 segment 时，如果 `event.type === "day_off"`，segment 可见文本使用 `DO`。
- 如果当前后端 calendar event 已写死 `Off`，也可以同步改为 `DO`，但仅限 `pbs-server/src/services/award/award-results-mapper.ts` 的 Award calendar event label，不改 item label。
- 右侧 `Roster Details` 和 `Selected Duty` 继续显示 `Day Off`，因为那里是完整类型说明；代码徽章继续显示 `DO`。

## 验收标准

- Award 左侧日历绿色色块显示 `DO`，不再显示 `Off`。
- Award 右侧 `Roster Details` 仍能显示 `Day Off` 类型说明。
- 其他页面不受影响。
- `pbs-portal` Award 页面测试和 Award Playwright 用例通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单页面显示文案调整，影响面很小，拆分成本高于收益。
- Suggested split: 不拆。
- Write boundaries: Award mapper / Award calendar 测试。
- Conflict risk: Low。
- Execution gate: 用户确认本 spec 后实施。
