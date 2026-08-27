# PBS Award Roster Summary 人工测试用例

## 前置条件

- PBS Portal 前端和 `pbs-server` 后端可访问。
- PBS Business Time 命中 `Jun 2026` 当前 period。
- 测试账号 `StanislavProfatilov`（`crew_id=2071`）可登录。
- `f8.roster_publish` 中存在 `crew_id=2071` 的 `Jun 2026` roster 数据。

## 测试步骤

1. 登录 PBS Portal。
2. 打开 `Award` 页面。
3. 查看页面顶部 summary 卡片。
4. 查看左侧 `JUN 2026 AWARD CALENDAR` legend。
5. 查看右侧 roster 明细表标题、表头和底部总数。
6. 查看 `Reason Report Preview`。
7. 在 1920 x 1080 视口检查页面底部布局。

## 预期结果

- 顶部状态显示 `Published · Jun 2026`。
- 顶部 summary 显示以下 6 项：
  - `Period`
  - `Duties`
  - `Days Off`
  - `Pairings`
  - `Credit Hours`
  - `Block Hours`
- 顶部不显示 `Tier`、`Premium PRM`、`Activities`。
- `StanislavProfatilov` 的 Jun 2026 数据显示：
  - `Duties = 19`
  - `Days Off = 13`
  - `Pairings = 0`
  - `Credit Hours = 24:00`
  - `Block Hours = --`
- Calendar legend 显示：
  - `Pairing`
  - `Day Off`
  - `Activity / Leave`
- 右侧明细表标题为 `ROSTER DETAILS`。
- 明细表表头包含 `CODE`、`DUTY / ACTIVITY`、`POSITION`。
- 明细表表头不显示 `TIER`。
- 明细表中 Day Off 的 `TYPE` 显示为 `Day Off`，不显示 `Ground`。
- 明细表底部显示 `Total: 19 duties`。
- Reason Report 在 award result 数据未发布时保持不可用提示，不伪造 reason report。
- Award 主卡填满共享工作台可用高度，页面底部不出现大面积蓝灰背景空白。
- `Jun 2026` 这类 5 周月份的月历日期格会按可用高度增高，不应只显示一块短月历后把底部留空。

## 边界场景

- 如果当前 period 没有 roster 数据，页面应保持 empty state：`No published award roster is available for this period.`
- 如果全部 item 没有 `blockMinutes`，`Block Hours` 显示 `--`。
- 如果存在 flight pairing，`Pairings` 应显示 pairing 数，`Block Hours` 应汇总非空 `blockMinutes`。
- 6 周月份仍应完整显示所有日期行，不裁切事件条。

## 回归范围

- Award 页面不应重新出现左侧 Bidding Calendar 工作台。
- Award 页面当前 period 仍应遵循 PBS Business Time。
- Reason Report 可用性仍由 `pbs_award_result / pbs_award_item` 决定。
