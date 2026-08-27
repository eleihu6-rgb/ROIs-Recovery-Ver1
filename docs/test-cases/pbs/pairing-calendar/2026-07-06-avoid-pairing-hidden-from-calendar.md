# PBS Pairing Avoid 不显示在日历测试用例

## 目的

验证 `Avoid Pairing Number / Pairing ID` 保存后仍保留为 Pairing bid，但不在左侧共享 `BIDDING CALENDAR` 或 Dashboard 日历中显示任何日历条。

## 前置条件

- 测试账号可登录 PBS Portal。
- 当前 bid period 处于可编辑状态。
- 当前账号有可用的 Pairing Number / Pairing ID 可以添加。
- 左侧 `BIDDING CALENDAR` 展开。

## 操作步骤

1. 进入 `/pairing` 页面。
2. 添加一个 `Avoid Pairing Number` 条件，选择任意可用 pairing，并保存。
3. 确认右侧 Pairing properties / Existing 区域仍显示刚保存的 Avoid bid。
4. 查看左侧 `BIDDING CALENDAR`。
5. 切换到 Dashboard 页面，查看 Dashboard 中的 `BIDDING CALENDAR`。
6. 回到 `/pairing` 页面，再添加一个 `Award Pairing Number` 条件，选择一个可用 pairing，并保存。
7. 再次查看左侧 `BIDDING CALENDAR` 和 Dashboard。

## 预期结果

- 保存 `Avoid Pairing Number` 后，右侧 properties / Existing 中仍能看到该 Avoid bid。
- 左侧 `BIDDING CALENDAR` 不显示该 Avoid pairing 的红色条。
- 左侧 `BIDDING CALENDAR` 也不显示该 Avoid pairing 的蓝色、黄色、绿色或其他颜色条。
- Dashboard 的 `BIDDING CALENDAR` 同样不显示该 Avoid pairing 条。
- `Award Pairing Number` 保存后仍按原规则显示普通 pairing calendar bar。
- Award 和 Avoid 同时存在时，日历只显示 Award 对应的 pairing bar。

## 回归范围

- Pairing 页面添加 / 编辑 / 删除 Avoid Pairing Number。
- Pairing 页面添加 / 编辑 / 删除 Award Pairing Number。
- Shared `BIDDING CALENDAR` 在 Pairing、Dashboard 间切换后的展示一致性。
- Existing properties 与 bid summary 中 Avoid bid 的保留展示。

## 异常场景

- 如果只存在 Avoid Pairing Number，日历中不应出现 pairing bar。
- 如果 Avoid pairing 覆盖 Prefer Off 日期，不应因为 Avoid 产生 pairing/day-off 日历冲突展示。
- 如果 Dashboard 先打开、Pairing 后打开，两处日历展示仍一致。
