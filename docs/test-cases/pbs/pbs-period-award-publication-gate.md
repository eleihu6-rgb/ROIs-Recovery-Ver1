# PBS Period 与 Award 发布门禁测试用例

## 目标

验证同一条 `roster_period` 同时承载 Roster Period、Bid Window 和 Award 计划展示时间，并确认 Award 只在计划时间到达且存在匹配的成功发布记录后展示。

## 前置条件

- 已执行 `2026-08-06-pbs-period-award-publication-gate.sql`。
- 管理员可访问 Gantt → PBS → Period。
- Crew 用户可访问 Bidding Portal → Award。

## 用例

### 1. 管理员维护完整周期

1. 新增 Period，填写 Period Code、Roster Start、Roster End、Bid Open、Bid Close、Award Publish。
2. 保存并重新打开编辑弹窗。

预期：

- 所有字段按原值回显。
- 列表显示 Roster Range、Bid Window、Award Publish、Actual Published。
- `Roster Start <= Roster End`、`Bid Open < Bid Close <= Award Publish`。

### 2. 周期重叠校验

1. 新增一个与现有 Roster Range 重叠的 Period。
2. 新增一个与现有 Bid Window 重叠的 Period。

预期：两个请求分别返回 409，且页面使用统一错误消息展示，不保存冲突数据。

### 3. Flair 2026 特殊 RP

执行 Generate Year 2026 并查看预览。

预期：

- Jan：2026-01-01 至 2026-01-30。
- Feb：2026-01-31 至 2026-03-01。
- Mar：2026-03-02 至 2026-03-31。
- Apr 起按自然月。

### 4. Award 尚未到计划时间

设置 `Award Publish > Business Now`，即使已有 `roster_publish` 或 `pbs_award_result` 数据也打开 Award。

预期：状态为 `Scheduled`，不加载、不展示 Award roster 数据。

### 5. 到期但发布记录缺失

设置 `Award Publish <= Business Now`，但不创建匹配的成功 `schedule_publish_record`。

预期：状态为 `Awaiting publication`，页面说明计划时间已到但发布记录尚未就绪。

### 6. 匹配发布记录后可见

创建满足以下条件的发布记录：

- `roster_period_id` 匹配；
- `published = 1`；
- `str_dt/end_dt` 完整覆盖 RP；
- division/base/crew 精确匹配当前 Crew；
- ac_type 与当前 Crew 在 Period 内的有效机队集合完全相等；
- `file_path`、`file_size`、`checksum` 保持 null。

预期：Award 状态为 `Published`，并从 `roster_publish` 读取该 Crew 的结果。

### 7. 无效发布记录不能解锁

分别验证错误周期、覆盖日期不足、错误 division/base/crew/ac_type、`published != 1`。

预期：均保持 `Awaiting publication`。

### 8. Bid 与 Award 周期独立

让较新 Period 处于 Bid Open，同时较早 Period 已满足 Award 发布门禁。

预期：Bid 页面使用较新 Period；Award 页面仍展示较早且已发布的 Period。
