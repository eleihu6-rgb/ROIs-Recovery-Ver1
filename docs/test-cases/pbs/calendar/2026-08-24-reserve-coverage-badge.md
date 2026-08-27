# PBS 左侧日历 Reserve Coverage 指标回归

## 前置条件

- 使用一个有当前 PBS 周期的 crew 登录 PBS Portal。
- 当前周期的 `/api/bidding-calendar/current` 返回 `dayOffCapacity`。
- Reserve coverage 接口 `/api/reserve-bids/current/coverage` 有当前周期日期数据。

## 操作步骤与预期结果

1. 打开 `Dashboard` 或 `Bid` 页面默认入口。
   - 左侧 `BIDDING CALENDAR` 的日期格底部显示 `DO requested/max`，例如 `DO 23/33`。
   - 如果 Reserve coverage 有同日数据，同一日期格底部同时显示 `RES need/off`，例如 `RES 12/33`。

2. 进入 `Bid` 页面，切换到 `ROSTER` tab。
   - 左侧日期格仍同时显示 `DO requested/max` 与 `RES need/off`。
   - `Reserve Preference` 仍可以从 `ROSTER` tab 打开并保存。

3. 从 `ROSTER` 切回 `DAYS OFF` 或 `PAIRING` tab。
   - 左侧日期格继续同时显示 `DO requested/max` 与 `RES need/off`。
   - 原有 pairing / off 条不变，日期点击和新增 bid 入口不被遮挡。

4. 模拟或观察 Reserve coverage 接口失败。
   - 左侧日历仍正常显示月份、tier 矩阵和原有事件。
   - Reserve 指标可以为空，但不能导致整块日历报错或空白。

## 边界场景

- 灰色的非当前月份日期不显示 `DO` / `RES` 指标。
- 当 numerator 小于 denominator 时为绿色，相等时为黄色，超过时为红色。
- 同一日期可以同时展示两个指标：`DO` 在上，`RES` 在下；缺哪组数据就只隐藏缺失的那一行。

## 回归范围

- Dashboard 左侧日历。
- Bid 页面 `DAYS OFF`、`PAIRING`、`ROSTER` tab。
- ROSTER 下 `Reserve Preference` 新增和编辑流程。
- Help Center 中关于 `DO` / `RES` 日历指标的说明。
