# PBS Preference Condition 标准化 Batch 3 QA 用例

## 范围

本批覆盖 Days Off 条件：

- Prefer Off
- Long Stretch Off / Compressed Flying

## 前置条件

- 使用 PBS Portal Days Off 页面。
- 当前 bid period 有可选日期。
- 用户可进入 Current Bid，并能新增 / 编辑 Days Off bid。

## Prefer Off

### Specific dates 最小有效保存

1. 打开 `Add Prefer Off`。
2. 确认 `TIERS` 默认未选，`Specific Dates` 默认选中。
3. 选择 `T1`。
4. 在 calendar 中选择一个日期。
5. 点击 `ADD BID`。

预期：

- 未选 tier 或当前 mode 没有有效日期 / weekday / weekend 时 `ADD BID` disabled。
- 保存后 bid values 只包含当前 mode 的日期值。
- 编辑该 bid 时日期和 time window 正确回显；不显示 fulfilment / minimum / maximum。

### Mode 和 Time Window 清理

1. 在 `Specific Dates` 下选择一个日期。
2. 打开 `TIME WINDOW`，填写 `08:00–18:00`。
3. 切换到 `Date Range`。
4. 关闭 `TIME WINDOW`。
5. 选择完整 date range 后保存。

预期：

- 切换 mode 后旧 specific date 不显示、不提交。
- `TIME WINDOW` 关闭后不再展示 time from/to，也不提交旧 window。
- 如果 time window 打开但 from/to 非法，`ADD BID` disabled。

### Fulfilment 已移除

1. 选择多个 Prefer Off period，例如多个 weekdays 或多个 specific dates。

预期：

- 不显示 `FULFILMENT`、`All selected periods`、`Flexible quantity`、`Minimum required`、`Maximum required`。
- 保存 payload 标准化为 `allOrNothing=true`、`minimumN=null`、`maximumN=null`。

## Long Stretch Off / Compressed Flying

### Whole-month 默认

1. 打开 `Add Long Stretch Off / Compressed Flying`。
2. 确认 `TIERS` 默认未选，`LIMIT TO A DATE RANGE` 关闭，且不显示 `PREFERENCE`、`Award`、`Avoid`。
3. 选择 `T1`。
4. 设置 minimum consecutive days off。
5. 点击 `ADD BID`。

预期：

- 未选 tier 时 `ADD BID` disabled。
- date range limit 关闭时，保存 payload 使用当前 bid period 的 whole-month from/to。
- 保存 payload 固定为 `action=award`；导出到 `LINE_RULES.csv` 时 204 `Parameters_JSON` 不包含 `action`。

### Limited date range

1. 打开 `LIMIT TO A DATE RANGE`。
2. 只选择 start date。
3. 选择一个短于 minimum consecutive days off 的 range。
4. 再选择一个足够长的 range。

预期：

- range 不完整时 `ADD BID` disabled。
- range 天数短于 minimum consecutive days off 时显示错误并禁用保存。
- 合法 range 可保存，关闭 switch 后旧 limited range 不进入 payload。

## 回归范围

- Days Off 页面新增 bid、编辑 existing bid、Save Favorite。
- Calendar-managed Prefer Off 与手动 Prefer Off 的合并 / 编辑路径。
- Long Stretch Off existing bid 回显 limited range 开关。
- Footer 的 `Save Favorite` 和 `ADD BID` 使用同一 validity。
