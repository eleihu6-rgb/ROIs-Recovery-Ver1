# PBS Dashboard Base Timezone 测试用例

## 测试目标

确认 PBS Dashboard 所有时刻类展示按 crew base local time 显示，不按 UTC 或浏览器本地时区显示。

## 前置条件

1. PBS Server 已部署包含 Dashboard base timezone 修复的版本。
2. 当前测试用户 `pbs_user.base` 有值，例如 `YVR`。
3. live schema 的 `airport` 表中该 base 有合法 `zone_id`，例如 `YVR -> America/Vancouver`。
4. 当前用户可登录 PBS Portal 并进入 `Dashboard`。

## 用例 1：LAST LOGIN 跨天显示

步骤：

1. 准备一个 `last_login_at` 接近 UTC 午夜后的用户，例如 `2026-04-02T02:30:00Z`。
2. 用户 base 设置为 `YVR`。
3. 登录 PBS Portal。
4. 查看 Dashboard 左侧 `LAST LOGIN`。

预期结果：

- `LAST LOGIN` 显示为 `Apr 01, 19:30`。
- 不应显示为 UTC 的 `Apr 02, 02:30`。

## 用例 2：BID START / BID END 按 base local time 显示

步骤：

1. 当前 period 的 open/close instant 分别设置为：
   - `bid_open_at = 2026-04-01T07:00:00Z`
   - `bid_close_at = 2026-04-09T06:59:00Z`
2. 用户 base 设置为 `YVR`。
3. 登录 PBS Portal。
4. 查看 Dashboard 左侧 `BID START` / `BID END`。

预期结果：

- `BID START` 显示 `Apr 01, 00:00`。
- `BID END` 显示 `Apr 08, 23:59`。
- 不应显示 UTC 的 `Apr 01, 07:00` / `Apr 09, 06:59`。

## 用例 3：REMAINING 不受 timezone 展示影响

步骤：

1. 让当前 business now 处于 open window 内。
2. 进入 Dashboard。
3. 记录 `REMAINING`。
4. 对比后端 `businessNow` 和 `bid_close_at` 的真实 instant 差值。

预期结果：

- `REMAINING` 与真实剩余时长一致。
- timezone 只影响 `BID START` / `BID END` 的显示日期时间，不改变剩余时长计算。

## 用例 4：找不到 base timezone 时 fallback

步骤：

1. 准备一个 base 不存在于 live `airport` 表的测试用户。
2. 登录 PBS Portal。
3. 进入 Dashboard。

预期结果：

- Dashboard 可以正常打开。
- 时间字段 fallback UTC 显示。
- 接口不返回 500。

## 回归范围

- Dashboard 中间 calendar grid 仍正常显示 period 月份。
- Pairing calendar event 的 start/end date 不回退成 UTC 截断日期。
- Pairing detail 弹窗中的 `Report / STD / STA / DEP / ARR` 等时间仍按 pairing/base timezone 展示。
