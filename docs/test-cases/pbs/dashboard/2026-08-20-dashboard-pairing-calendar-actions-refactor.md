# Dashboard Pairing Calendar Actions Hook 回归测试

## 背景

本次只重构 Dashboard 左侧 `BIDDING CALENDAR` 中 Pairing bid add/edit 的前端职责边界，把状态、query、mutation、cache refresh 从 `DashboardSchedulePanel` 抽到 `usePairingCalendarActions`。用户可见行为、接口 payload、保存逻辑不应变化。

## 前置条件

- 使用可登录的 crew portal 测试账号。
- 当前 period 至少有一个可编辑的 open bid period。
- Calendar 中存在至少一个已有 Pairing bid event。
- Pairing calendar add 入口可查询到某一天的 pairing occurrence。

## 测试步骤

1. 打开 PBS Portal Dashboard。
2. 确认 `BIDDING CALENDAR` 正常渲染 period、tier matrix 和 month calendar。
3. 点击已有 Pairing bid event。
4. 确认 `Pairing Bid` detail dialog 打开，能看到 pairing summary、pairing details、Tx 勾选区。
5. 修改 Tx，点击 `SAVE BID`。
6. 确认 dialog 关闭，并显示 `Pairing bid updated.`。
7. 打开 Pairing 页面或 Bid 页面，点击左侧 calendar 上一个可添加 pairing 的日期。
8. 确认 Pairing popover 打开，能搜索 / 选择 pairing runs。
9. 选择至少一个 pairing run 和至少一个 Tx，点击 `ADD BID`。
10. 确认显示 `Pairing bid added.`，Pairing 页面 Existing Properties 和 pool counts 后续刷新正常。
11. 在 Bid 页面点击同一天日期，确认 `DAYS OFF / PAIRING` tab 仍可切换，并且切换后会记住上一次选择。
12. 在 Days Off 页面点击日期，确认 Days Off 保存流程不受 Pairing hook 拆分影响。

## 只读期回归

1. 切到 closed / read-only bid period。
2. 确认 calendar 日期不显示新增 Days Off / Pairing action。
3. 点击已有 Pairing bid event。
4. 确认 detail dialog 仍可查看。
5. 确认 Tx edit / save 控件不可编辑或不展示。

## 预期结果

- Dashboard calendar 无视觉变化。
- Pairing date add、Pairing event detail edit、Days Off date add 均保持原行为。
- 保存 Pairing add/edit 时继续使用最新 draft meta，不出现 draft version 冲突误报。
- Pairing add 成功后相关 query cache、calendar query 和 pool counts refresh 正常更新。
- closed / read-only period 不暴露新增 action，但已有 event 可查看。

## 回归范围

- Dashboard。
- Shared bidding workbench 左侧 calendar。
- Pairing 页面 Existing Properties / pool counts。
- Bid 页面 Days Off / Pairing tab 切换。
- Days Off 页面 calendar 保存。
