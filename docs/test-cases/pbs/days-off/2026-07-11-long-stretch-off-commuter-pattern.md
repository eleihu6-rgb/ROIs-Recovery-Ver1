# PBS Long Stretch Off / Commuter Pattern QA 测试用例

日期：2026-07-11
范围：PBS Portal Days Off / Line bid conditions

## 前置条件

- 使用可编辑的当前 bid period。
- PBS Portal 能正常打开 Days Off 与 Line 页面。
- 当前用户有权限保存当前 bid draft。

## 场景 1：Days Off 新增 Long Stretch Off

1. 进入 `Days Off` 页面。
2. 打开 `ADD DAYS OFF PROPERTIES`。
3. 选择 `Long Stretch Off / Compressed Flying`。
4. 确认弹窗标题为 `Configure Long Stretch Off / Compressed Flying`，没有重复副标题和 `BID` 标题。
5. 确认 `TIERS` 默认未选，`ADD BID` 禁用。
6. 确认不显示 `PREFERENCE`、`Award`、`Avoid`。
7. 选择 `T1`。
8. 设置 `Minimum Consecutive Days Off = 10`。
9. 保持 `Limit to a Date Range` 关闭。
10. 点击 `ADD BID`。

预期结果：

- 保存成功。
- Existing Properties 中出现 `Long Stretch Off / Compressed Flying`。
- 后端 payload 使用 `propertyCode=204`。
- 后端 payload 固定为 `action=award`。
- 日期范围按当前 bid month 整月保存，不提交旧缓存窗口。

## 场景 2：Long Stretch 日期范围防呆

1. 新增或编辑 `Long Stretch Off / Compressed Flying`。
2. 打开 `Limit to a Date Range`。
3. 确认日期输入框出现，并且日历可以打开和选择日期。
4. 设置 `Minimum Consecutive Days Off = 10`。
5. 选择短于 10 天的日期范围，例如 3 天。

预期结果：

- 弹窗显示日期范围过短错误。
- `SAVE FAVORITE` 与 `ADD BID` / `UPDATE BID` 禁用。
- 不向后端提交。

## 场景 3：Long Stretch Tier 防呆

1. 打开 `Long Stretch Off / Compressed Flying` 弹窗。
2. 取消最后一个 active Tier。

预期结果：

- Tier 区域显示 `Required`。
- `SAVE FAVORITE` 与 `ADD BID` / `UPDATE BID` 禁用。
- 重新选择任一 Tier 后按钮恢复。

## 场景 4：Line 新增 Commuter Pattern

1. 进入 `Line` 页面。
2. 打开 `ADD LINE PROPERTIES`。
3. 选择 `Commuter Pattern`。
4. 确认弹窗标题为 `Configure Commuter Pattern`，没有重复副标题和 `BID` 标题。
5. 确认默认选中 `T1`。
6. 在 `WORK BLOCK` 中设置 `Work 4 to 5 days`。
7. 在 `OFF BLOCK` 中设置 `Then 4 days off`。
8. 确认 summary 显示 `Work 4-5 days, then 4 days off`。
9. 点击 `ADD BID`。

预期结果：

- 保存成功。
- Existing Properties 中显示 `Work 4-5 days, then 4 days off`。
- 后端 payload 使用 `propertyCode=408`。
- 不出现 `Days Off Max`。
- 未打开 date range 时，不提交 `dateRange`。

## 场景 5：Commuter Pattern 日期范围

1. 打开 `Commuter Pattern` 弹窗。
2. 打开 `Limit to a Date Range`。
3. 确认日期输入框出现，并且日历可以打开和选择日期。
4. 选择当前 bid period 内的合法日期范围。
5. 点击 `ADD BID` 或 `UPDATE BID`。

预期结果：

- 保存成功。
- 后端 payload 使用 `propertyCode=408`。
- bid JSON 中包含 `dateRange: { from, to }`。
- Existing Properties 摘要包含日期范围。

## 场景 6：Commuter Pattern 防呆

1. 打开 `Commuter Pattern` 弹窗。
2. 取消最后一个 active Tier。
3. 重新选择 Tier。
4. 设置 `Work` 左侧天数大于右侧天数。

预期结果：

- 空 Tier 时显示 `Required`，保存按钮禁用。
- `Work min > Work max` 时显示错误，保存按钮禁用。
- 修正为合法范围后按钮恢复。

## 回归范围

- Days Off `Prefer Off` 仍可新增、编辑、保存。
- Days Off 旧隐藏项 `203 Min Consecutive Days Off` 不作为新增入口出现。
- Days Off `205 Days Off / Days On Pattern` 不作为新增入口出现。
- `Long Stretch Off / Compressed Flying` 导出仍是 `MIN_CONSECUTIVE_DAYS_OFF_IN_WINDOW`，`Parameters_JSON` 只包含 `from`、`minimumDaysOff`、`to`，不包含 `action`。
- Line `Commuter Pattern` 导出仍是 `COMMUTER_PATTERN`，且 `maxDaysOff = minDaysOff`，并保留可选 `dateRange`。
