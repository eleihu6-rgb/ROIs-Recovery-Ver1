# PBS Pairing Preference 时间列实施计划

1. 补组件测试，覆盖 `1645`、`16:45`、缺失时间、10列结构和状态行。
2. 复用 `formatPairingClock` 增加 `Check-in` / `Check-out` 两列并调整列宽。
3. 更新 Playwright，验证时间筛选与结果时间、10列对齐和无横向滚动。
4. 更新 QA 用例并运行 Vitest、Playwright、build、lint、UI 标准检查。
