# PBS Pairing「Any Leg Is Redeye」测试用例

## 前置条件

- PBS Portal 和 PBS Server 正常启动。
- 当前用户已登录 PBS Portal。
- Pairing 页和 Search Pairings 页可正常加载当前 bid period。
- 测试数据中至少包含：
  - 一个存在本地跨夜 leg 的 pairing。
  - 一个不存在本地跨夜 leg 的 pairing。

## 测试范围

- Pairing property `117 Any Leg Is Redeye`。
- 配置窗口控件形态。
- Search Pairings / Preview 的 Award / Avoid 语义。
- 与其他 Pairing 条件组合时的回归。

## 用例 1：配置窗口控件形态

步骤：

1. 打开 Pairing 页面。
2. 在可用 property 中找到 `Any Leg Is Redeye`。
3. 打开配置窗口。

预期结果：

- `TIERS` 正常显示并可选择。
- `MODE` 只显示 `Award` / `Avoid`。
- 不显示 `Every`。
- 不显示 operator。
- `BID` 区域只显示 `Enabled`，没有输入框、下拉框或时间控件。

## 用例 2：Award Redeye Pairing

步骤：

1. 配置 `Any Leg Is Redeye`。
2. 选择一个或多个 tier。
3. `MODE` 选择 `Award`。
4. 保存或进入 Search Pairings preview。

预期结果：

- 请求不报 `Search preview is not supported yet for Any Leg Is Redeye`。
- 结果包含至少一个存在本地跨夜 leg 的 pairing。
- 不存在本地跨夜 leg 的 pairing 不应因为该条件命中。

## 用例 3：Avoid Redeye Pairing

步骤：

1. 配置 `Any Leg Is Redeye`。
2. 选择一个或多个 tier。
3. `MODE` 选择 `Avoid`。
4. 保存或进入 Search Pairings preview。

预期结果：

- 请求成功。
- 结果排除存在任意本地跨夜 leg 的 pairing。
- 没有 Redeye leg 的 pairing 可以保留在结果中。

## 用例 4：与其他 Pairing 条件组合

步骤：

1. 配置 `Any Leg Is Redeye`。
2. 再配置一个其他 Pairing 条件，例如 `Any Flight Number` 或 `Pairing Length`。
3. 查看 preview 结果。

预期结果：

- 多个不同 property 仍按现有规则组合。
- `Any Leg Is Redeye` 不影响其他条件控件。
- preview 请求成功并返回符合组合条件的结果。

## 边界场景

- 如果某条 leg 的机场无法匹配时区主数据，该 leg 不命中 Redeye，但请求不应失败。
- UTC 日期跨日但出发/到达本地日期未跨日，不应命中 Redeye。
- 出发/到达本地日期跨日，即使 UTC 日期未跨日，也应命中 Redeye。

## 回归范围

- `Any Flight Number`
- `Any Enroute Check-In Time`
- `Pairing Check-In Time`
- `Pairing Check-Out Time`
- `Pairing Length`
- Pairing property flag 类控件显示

