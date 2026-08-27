# PBS Prefer Off 重叠防呆与共享小日历一致性测试案例

日期：2026-05-20  
范围：PBS Portal 左侧 `BIDDING CALENDAR`、Days Off `Prefer Off` 保存防呆、`bidding-calendar` 事件类型命名。

## 前置条件

- 使用有 Current bid 的 PBS 账号，例如 3002。
- Bid period 为 `Apr 2026`。
- 当前 draft 中至少能添加 Days Off `Prefer Off`。

## 用例 1：同 Tier 重叠 Prefer Off 不允许保存

1. 进入 `/fpqe/pbs/days-off`。
2. 添加一条 `Prefer Off`，选择 `T1`，日期为 `2026-04-19, 2026-04-20, 2026-04-21, 2026-04-22, 2026-04-30`。
3. 再添加一条 `Prefer Off`，选择 `T1`，模式为 `Date Range`，范围为 `2026-04-19 - 2026-04-22`。

预期结果：

- 第二次保存被阻止。
- 页面通过统一 message 提示重叠日期，例如 `Prefer Off dates overlap for T1: 2026-04-19, 2026-04-20, 2026-04-21, 2026-04-22.`
- 不出现右侧面板内重复的红色错误块。
- Network 中对应保存请求不应成功写入重复条件；如果绕过前端直接调接口，后端返回 400。

## 用例 2：不同 Tier 同日期允许

1. 添加一条 `Prefer Off`，选择 `T1`，日期 `2026-04-19`。
2. 添加另一条 `Prefer Off`，选择 `T2`，范围 `2026-04-19 - 2026-04-22`。

预期结果：

- 两条条件都允许保存。
- 左侧小日历按当前选中的 tier 显示对应 Off。

## 用例 3：历史重复数据不渲染成双层 Off

1. 准备已有重复数据：同一账号、同一 period、同一 tier 下存在列表型 Prefer Off 和范围型 Prefer Off，且覆盖 `2026-04-19 - 2026-04-22`。
2. 强制刷新 `/fpqe/pbs/days-off`。
3. 强制刷新 `/fpqe/pbs/pairing`。
4. 强制刷新 `/fpqe/pbs/dashboard`。

预期结果：

- 三个页面左侧 `BIDDING CALENDAR` 中 `2026-04-19 - 2026-04-22` 都只显示一条连续 Off。
- 不出现上下两层 Off。
- `2026-04-30` 仍单独显示 Off。
- Network 中不出现 `/api/calendar-days-off/*`。

## 用例 4：事件类型命名

1. 打开浏览器 Network。
2. 请求 `/api/bidding-calendar/current`。

预期结果：

- Prefer Off 生成的日历事件 `type` 为 `prefer_off_bid`。
- 不再返回 `day_off_bid`。
- 事件来源仍为 `source: "pbs_bid_group"`。

## 回归范围

- Days Off：新增、编辑、删除 `Prefer Off`。
- Pairing：左侧日历 day off 阻挡 pairing bid 的逻辑不变。
- Dashboard：左侧日历展示与 Pairing / Days Off 一致。
- Tier：从 summary 跳转编辑 Days Off `Prefer Off` 的入口不受影响。
