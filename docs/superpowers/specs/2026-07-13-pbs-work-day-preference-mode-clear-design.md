# PBS Work Day Preference 模式切换清空设计

日期：2026-07-13
状态：已实施并完成验证，待用户审阅

## 目标

`WHEN SHOULD THE WORK DAY OCCUR?` 在 `Specific dates / weekdays` 与 `Date range` 间切换时，不能保留或恢复旧模式输入，避免用户误以为隐藏值会随 bid 一同提交。

## 规则

- 每次模式切换都清空日期、星期、范围起始日和范围结束日。
- 切换后的当前模式从空值开始；切回此前模式也不恢复旧草稿。
- 当前模式未填写有效值时，Add Bid / Save Favorite 继续保持禁用。
- 不改变 `date-or-dow-list` 与 `date-range` 的 payload 契约、后端验证或数据库。

## 验收

1. Specific → Range 后只显示空的 Start date / End date，保存按钮禁用。
2. Range → Specific 后只显示空的 Select dates，所有 weekday 未选中，保存按钮禁用。
3. Vitest 与真实 Pairing 页面 Playwright 都覆盖此回归。

## Multi-Agent Parallelism Assessment

- Recommendation: No。
- Rationale: 状态和 payload 只集中在同一 editor，拆分反而会增加行为不一致风险。
