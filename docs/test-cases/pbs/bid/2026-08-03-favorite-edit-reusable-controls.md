# PBS 收藏编辑仅显示可复用条件测试用例

## 目标

确认只有“收藏卡片 → 编辑收藏”隐藏明确年月日相关控件，Current Bid 新增和编辑不受影响。

## 前置条件

- 登录 PBS Portal。
- Current Bid 中存在可新增的 Days Off、Pairing、Roster 条件。
- 收藏中存在 `Prefer Off`、带日期范围能力的 Pairing 条件、`Commuter Pattern` 和 `Reserve / Flying Date Pattern`。

## 收藏编辑

1. 打开 Bid 页面，在 `FAVORITED PROPERTIES` 中编辑 `Prefer Off`。
2. 确认不显示 `Specific Dates` 和 `Date Range`。
3. 确认仍显示 `Days of Week`、`Weekends` 和 `Time Window`。
4. 编辑带日期范围能力的 Pairing 收藏。
5. 确认不显示 `LIMIT TO ... DATE`。
6. 编辑 `Commuter Pattern` 收藏。
7. 确认不显示 `LIMIT TO A DATE RANGE`。
8. 编辑 `Reserve / Flying Date Pattern` 收藏。
9. 确认日期范围仅包含 `Whole Month`、`First Half`、`Second Half`，不包含 `Date Range`、`Specific Dates`。
10. 更新以上收藏，确认收藏正常保存，卡片的 Tx 选择不被清空。

## Current Bid 回归

1. 从非收藏条件新增 `Prefer Off`，确认仍显示并可选择 `Specific Dates`、`Date Range`。
2. 新增或编辑支持事件日期的 Pairing 条件，确认日期限制控件仍显示并可使用。
3. 新增或编辑 `Commuter Pattern`，确认 `LIMIT TO A DATE RANGE` 仍显示并可使用。
4. 新增或编辑 `Reserve / Flying Date Pattern`，确认仍可选择 `Date Range` 和 `Specific Dates`。

## 预期结果

- 收藏编辑只提供跨月份可复用的条件。
- Current Bid 的明确日期能力完全保持不变。
- 页面不显示额外提示，不改变现有弹窗布局、按钮和保存交互。
