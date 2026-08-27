# Pairing Preference Filter Dialog 测试用例

## 前置条件

- 登录 PBS Portal，进入 `Bid > Pairing`。
- 当前 bid period 有可用 Pairing 数据。
- 打开 `Pairing Preference` 配置弹窗。

## 主流程

1. 在 `Pairings` 表格右上点击 `Filters`。
2. 预期：出现 `Pairing Filters` 弹窗，主配置弹窗仍停留在 Pairing Preference 内。
3. 配置以下条件：
   - Pairing start date range。
   - Check-in / Check-out time。
   - Length min/max。
   - Route Station。
   - Layover Station。
   - Layover Count min/max。
   - Credit min/max，格式 `HH:MM`。
   - Redeye、DHD。
4. 点击 `Apply Filters`。
5. 预期：
   - Filter 弹窗关闭。
   - Pairings 表格刷新，页码回到第 1 页。
   - `Filters` 按钮显示 active count。
   - 已选择的 pairing 不因当前过滤后不可见而丢失。

## Cancel / Clear

1. 打开 `Filters`，输入任意未应用条件，点击 `Cancel` 或右上关闭。
2. 预期：弹窗关闭，列表不刷新，再次打开时未应用条件不保留。
3. 打开 `Filters`，点击 `Clear All`。
4. 预期：只清空弹窗草稿，不立即刷新列表。
5. 点击 `Apply Filters`。
6. 预期：已应用过滤条件清空，列表按仅 `pairingScope=fly` 刷新。

## 校验场景

- Check-out From 晚于 To：显示错误，不关闭弹窗，不发送请求。
- Pairing start date 超出当前 bid period：显示错误，不发送请求。
- Length / Layover Count min 大于 max：显示错误，不发送请求。
- Credit 非 `HH:MM` 或 min 大于 max：显示错误，不发送请求。
- Check-in 支持跨午夜，例如 `22:00` 到 `08:00`，应允许保存过滤。

## 回归范围

- `Search Pairings` 页面原有筛选控件不新增、不改变。
- `Pairing Preference` 的 Add Bid / Save Favorite payload 不包含这些 filter 条件，只保存用户选中的 pairing IDs。
- Redeye filter 与 `Redeye Preference` bid 使用同一 Redeye dictionary 配置。
