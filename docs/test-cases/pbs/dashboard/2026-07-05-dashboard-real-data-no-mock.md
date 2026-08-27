# PBS Dashboard 真实数据与去 mock QA 用例

## 前置条件

- PBS Portal 可登录。
- 当前环境已配置 PBS Business Time 与当前 bid period。
- 测试账号在 `pbs_user` 中存在，并同步了 base / rank / division。

## 用例 1：Dashboard 首页不显示旧 mock 值

1. 登录 PBS Portal。
2. 打开 `/dashboard`。
3. 检查左侧 `BID INFORMATION-LOCAL TIME`。
4. 检查中间 `BIDDING CALENDAR`。
5. 检查右侧 `MESSAGE CENTER`。

预期：

- 不显示 `FRI DEC 21 2024 12:00 PM`。
- 不显示 `NOV 2025`。
- 不显示 `Emma Li@rois-tech.com`。
- 不显示 `LAX`、`646/2132`、`78:16`、`F80001`。
- 缺少权威来源的 `TARGETED LINE`、`TARGETED RESERVE`、`BASE LINE AVERAGE` 显示 `-`。

## 用例 2：Bid Information 来自当前 bid period

1. 设置 Business Time 到一个已配置 bid window 内。
2. 打开 `/dashboard`。

预期：

- `BID START` / `BID END` 与当前 `roster_period` 的 `pbs_bid_open_at` / `pbs_bid_close_at` 一致。
- `REMAINING` 根据 PBS Business Time 计算。
- 页面不使用浏览器本机时间或静态日期。

## 用例 3：User Information 来自真实 profile

1. 使用有完整 live 资料的账号登录。
2. 打开 `/dashboard`。

预期：

- 姓名、邮箱、base、position、fleet、language、seniority、existing credit 来自后端 profile。
- `STATUS`、`TRAINING MONTH` 如果没有确认来源，显示 `-`。
- `LAST LOGIN` 来自 `pbs_user.last_login_at`，没有值时显示 `-`。

## 用例 4：Message Center 无配置时不伪造内容

1. 使用当前 F8 数据打开 `/dashboard`。
2. 查看右侧 Message Center。

预期：

- `BASE LINE AVERAGE` 在无权威来源时显示 `-`。
- Fleet 列表来自当前 period pairing fleet 分布或真实 fleet catalog。
- 不显示 AA 示例 fleet/sub-fleet 静态清单。

## 用例 5：共享 Bidding Calendar 跨页面不回退静态日历

1. 打开 `/dashboard`。
2. 切换到 `/days-off`。
3. 切换到 `/pairing`。

预期：

- 共享 `BIDDING CALENDAR` 使用 `/bidding-calendar/current` 数据。
- 请求失败时显示 loading/error 状态，不显示 `NOV 2025` 静态日历。
- 已选 Tier 状态不因页面切换重置。
