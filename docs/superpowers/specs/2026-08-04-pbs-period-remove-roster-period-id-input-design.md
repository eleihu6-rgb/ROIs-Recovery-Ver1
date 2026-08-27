# PBS Period 移除 Roster Period ID 手工输入设计

## 目标

`Roster Period ID` 是 `roster_period.id` 数据库内部主键，不应由管理员识别或手工填写。PBS Period
管理页面应只接收业务字段，由后端根据 `Period Code` 自动定位或创建对应的 `roster_period` 记录。

## 范围

### Gantt

- 从 Add PBS Period 和 Edit PBS Period 弹窗删除 `Roster Period ID` 字段。
- 从 `PbsPeriodInput` 请求类型删除 `rosterPeriodId`。
- 从 Period Admin 响应类型删除重复的 `rosterPeriodId`；保留唯一的记录 `id`，供编辑、删除操作定位现有记录。

### Live Server

- Period 新增请求不再接受 `rosterPeriodId`。
- 旧客户端显式传入 `rosterPeriodId` 时返回 `400`，不能静默忽略。
- 新增 Period 时统一根据 `Period Code`：
  1. 匹配已有 `roster_period.name` 或 `roster_period.roster_period`；
  2. 匹配到则更新该记录的 PBS 字段；
  3. 未匹配到则按现有规则创建对应 `roster_period`。
- 编辑 Period 继续使用 URL 中的 `:id` 定位已有记录，不接受请求体中的 `rosterPeriodId`。

## 不修改

- 不删除数据库 `roster_period.id`。
- 不删除 `pbs_bid.roster_period_id` 或 `pbs_award_result.roster_period_id` 关联。
- 不修改现有 Period 数据。
- 不执行数据库 migration。
- 不改变 `Period Code`、Bid Open、Bid Close 等其他字段行为。

## 错误处理

- 新增或编辑请求携带 `rosterPeriodId`：返回 `400 Invalid PBS period payload/update`。
- `Period Code` 无法解析出排班月份时，沿用现有新增失败行为；本次不扩展周期代码格式。

## 测试与验收

- Gantt TypeScript 与生产构建通过。
- Live Server TypeScript 与 Period focused Vitest 通过。
- API 测试确认 POST 不带 `rosterPeriodId` 时可以分别按 `name`、`roster_period` 匹配已有记录，且无匹配时创建新记录。
- API 测试确认 PATCH 只使用 URL `:id` 定位并更新已有记录。
- API 测试确认新增和编辑请求传入 `rosterPeriodId` 均返回 `400`，且不执行数据库查询。
- Playwright 驱动真实 Add/Edit Period 弹窗，确认不存在 `Roster Period ID`，实际保存成功且请求体不含该字段。
- `npm run check:ui` 为 0 个 hard violation。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 前端字段与后端请求契约紧密耦合，改动规模小，拆分增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: Gantt Period 页面与 API 类型、Live Server Period route、相关测试。
- Conflict risk: Low。
- Execution gate: spec 经用户确认后实施。
