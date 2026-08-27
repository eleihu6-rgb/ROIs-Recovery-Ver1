# Award Final 生命周期与历史结果验收用例

## 前置条件

- 已执行 `2026-08-07-pbs-award-final-history-lifecycle.sql`。
- 至少存在两个已成功发布且当前机组均有发布记录的 Period。
- 较新的 Period 配置了 `Award Publish`、`Final` 和 `Mis-award Deadline`。

## 用例 1：时间配置校验

1. 在 Live 的 PBS Period 管理页新建或编辑 Period。
2. 分别填写 Roster、Bid、Award Publish、Final、Mis-award Deadline 时间。
3. 验证只有满足 `Bid Open < Bid Close <= Award Publish <= Final < Mis-award Deadline` 才能保存。
4. 验证列表和编辑弹窗完整回显三个 Award 时间节点。

预期：非法顺序被字段级错误阻止；合法配置保存成功，时分秒不发生时区漂移。

## 用例 2：未发布的新 Period 不遮挡历史 Award

1. 保留上一 Period 的有效发布记录。
2. 创建更新的 Period，但不发布，分别将当前时间置于 `SCHEDULED`、`PUBLISH_PENDING`。
3. 使用上一 Period 已发布的机组账号进入 Award。

预期：仍展示上一 Period 的 Award；页面提示更新 Period 尚未发布，不展示其未发布数据。

## 用例 3：发布后立即切换

1. 为更新 Period 完成 Live 发布，确认当前机组在 `schedule_publish_record` 中存在精确匹配记录。
2. 刷新 Award 页面。

预期：默认切换到更新 Period；状态为 `PUBLISHED`，结果来自该 Period，不混用上一 Period 数据。

## 用例 4：Final 与申诉截止状态

1. 将系统时间依次置于 Final 前、Final 到申诉截止之间、申诉截止之后。
2. 刷新 Award 页面。

预期：状态依次为 `PUBLISHED`、`FINAL`、`MIS_AWARD_CLOSED`；Final 只改变状态，不替换已发布结果。

## 用例 5：历史 Period 切换

1. 打开 Award 历史 Period 选择器。
2. 选择上一已发布 Period。
3. 在加载过程中观察页面，再等待完成。

预期：列表只包含当前机组实际可读的已发布 Period；切换时旧结果被骨架屏替换，不短暂冒充新选择；完成后日历、Roster Details、Selected Duty 和状态全部属于所选 `rosterPeriodId`。

## 用例 6：无可读发布记录

1. 使用在所有 Period 中均无对应发布记录的机组账号访问 Award。

预期：页面显示明确的无可用 Award 状态，不回退到其他机组、未发布 Period 或仅依赖日期推断的结果。

## 用例 7：Period migration 后 Current Bid 回归

1. 使用有效机组账号访问 Pairing Bid 页面。
2. 检查 `GET /api/pairing-bids/current`。
3. 确认页面能够加载 Current Period 和已有草稿。

预期：接口返回 200；`pbs_bid.roster_period_id` 与 Live Period ID 正确匹配，不出现 PostgreSQL `42883` bigint/text 运算符错误。
