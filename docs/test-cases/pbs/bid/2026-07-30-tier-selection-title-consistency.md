# PBS Bid Tier 选择标题一致性

## 前置条件

- 使用存在当前 Bid 草稿和 Standing Bid 草稿的测试账号。
- Pairing、Days Off、Line、Standing Bid、Reserve 页面可正常打开。

## 必选场景

1. 分别打开 Pairing、Days Off、Line、Standing Bid 和 Reserve 的新增 Bid 弹窗。
2. 打开 Dashboard 日历中的 Pairing 新增快捷弹层。
3. 确认 Tier 区域标题均为 `APPLY TO TIERS · REQUIRED`。
4. 选择任意 T1–T7 后，确认标题仍为 `APPLY TO TIERS · REQUIRED`。
5. 清空可清空的 Tier 选择时，确认新增/提交按钮继续遵循原有禁用或校验规则。

## 可选场景

1. 打开 Dashboard 已有 Pairing Bid 的 Tier 编辑区域。
2. 确认标题为 `APPLY TO TIERS`，不显示 `REQUIRED`。
3. 清空全部 Tier 并保存，确认仍按现有业务规则完成。
4. 打开 Dashboard Days Off 日历编辑弹层，确认标题为 `APPLY TO TIERS`。
5. 清空全部 Tier，确认该日期从所有 Tier 移除。

## Favorite 场景

1. 打开同时提供 `SAVE FAVORITE` 和 `ADD BID` 的配置弹窗。
2. 不选择 Tier，确认 `SAVE FAVORITE` 仍按原规则可用，`ADD BID` 不可提交。
3. 打开 Favorite-only 编辑弹窗，确认原本隐藏的 Tier 区域仍保持隐藏。

## Reserve 回归

1. 打开 Reserve Preference 弹窗，确认标题为 `APPLY TO TIERS · REQUIRED`。
2. 打开 Reserve Coverage Calendar 快捷弹层，确认不再显示 `Apply to Tx`。
3. 确认其标题为 `APPLY TO TIERS · REQUIRED`，并且真实 Tier 选择和提交行为不变。

## 无障碍与视觉

1. Dashboard 和 Reserve Calendar 的 `fieldset` 使用真实 `legend`。
2. 标题大小写、字距、颜色以及红色 `REQUIRED` 在各入口一致。
3. 键盘可以继续访问所有 Tier 选择按钮或 checkbox。
