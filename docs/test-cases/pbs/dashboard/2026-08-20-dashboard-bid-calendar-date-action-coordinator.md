# Dashboard Bid Calendar Date Action Coordinator 回归测试

## 范围

本用例覆盖 `DashboardSchedulePanel` 中 Bid calendar 日期操作协调逻辑的前端重构。重构目标是把 Days Off / Pairing 日期操作切换、sessionStorage 记忆、pending intent 和互斥清理抽到 `useBidCalendarDateActionCoordinator`，不改变用户可见业务行为。

## 前置条件

- 当前用户可登录 PBS Portal。
- 当前 bid period 可编辑。
- 当前 roster period 中至少有：
  - 已保存 Days Off bid。
  - 已保存 Pairing bid。
  - 某个日期存在可选 pairing occurrences。

## 用例 1：Bid 页面单日期显示双模式 tab

1. 打开 PBS Portal `Bid` 页面。
2. 在左侧 `BIDDING CALENDAR` 点击一个可编辑日期。
3. 查看弹出的 date action popover。

期望：

- popover 顶部显示 `DAYS OFF` 和 `PAIRING` 两个 tab。
- 默认 tab 使用上一次记忆的模式；首次进入默认为 `DAYS OFF`。
- 点击 `PAIRING` 后，popover 内容切换为 pairing occurrence 选择。
- 再点击 `DAYS OFF` 后，popover 内容切换为 tier selection。
- 两次切换仍然针对同一个日期。

## 用例 2：Pairing 单模式页面不显示 Days Off tab

1. 打开 PBS Portal `Pairing` 页面。
2. 在左侧 `BIDDING CALENDAR` 点击一个可添加 pairing 的日期。
3. 查看 date action popover。

期望：

- popover 直接显示 Pairing bid 添加内容。
- 不显示 `DAYS OFF` tab。
- 不显示 `PAIRING` tab。
- 选择 pairing occurrence 和 tier 后，保存 payload 与重构前一致。

## 用例 3：Days Off 单模式页面不显示 Pairing tab

1. 打开 PBS Portal `Days Off` 页面。
2. 在左侧 `BIDDING CALENDAR` 点击一个可编辑日期。
3. 查看 date action popover。

期望：

- popover 直接显示 Days Off tier selection。
- 不显示 `DAYS OFF` tab。
- 不显示 `PAIRING` tab。
- 保存后左侧日历和 Days Off 页面右侧 draft 状态保持一致。

## 用例 4：weekday Days Off 批量操作不显示双模式 tab

1. 打开 PBS Portal `Days Off` 页面。
2. 点击左侧 calendar header 中某个 weekday。
3. 查看 weekday action popover。

期望：

- popover 显示该 weekday 在当前月份内的批量 Days Off 操作。
- 不显示 `DAYS OFF / PAIRING` tab。
- 保存后只影响 Days Off bid，不新增 Pairing bid。

## 用例 5：Dashboard 首页不新增日期添加入口

1. 打开 PBS Portal `Dashboard` 页面。
2. 查看中间 `BIDDING CALENDAR`。
3. 尝试点击普通日期空白区域。

期望：

- Dashboard 首页不出现 date add popover。
- Dashboard 首页不显示 `DAYS OFF / PAIRING` tab。
- 点击已有 Pairing bid event 仍然可以打开 Pairing Bid detail dialog。

## 用例 6：打开 Pairing event detail 后不残留 date popover

1. 打开 PBS Portal `Bid` 页面。
2. 点击一个日期打开 date action popover。
3. 不保存，直接点击 calendar 上已有 Pairing bid event。

期望：

- 原 date action popover 关闭。
- Pairing Bid detail dialog 打开。
- detail dialog 不显示 `DAYS OFF / PAIRING` tab。
- 关闭 detail dialog 后不会自动恢复旧 date action popover。

