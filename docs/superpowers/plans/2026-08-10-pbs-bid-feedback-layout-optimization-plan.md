# PBS Bid Feedback 布局优化实施计划

1. 将两个 Feedback 工具栏入口合并为一个紧凑图标按钮，保留冲突数量徽标、Tooltip 和可访问名称。
2. 重构 `BidFeedbackDialog` 的 Bids 视图：
   - 删除顶部灰色说明和黄色冲突区；
   - Award/Avoid/Days Off 使用主从布局；
   - 管理默认选择、页签、分页和响应式堆叠；
   - Calendar 继续使用完整宽度。
3. 更新组件测试，覆盖单入口、徽标、默认选择、行选择、页签和详情展示。
4. 更新 Playwright 与 QA 用例，覆盖真实按钮入口、主从布局、Calendar 和响应式视口。
5. 运行定向测试、Portal 全量测试、lint、build、`check:ui` 和 Bid Feedback Playwright。

本计划不修改 API、PBS Server、数据库、Redis 或算法导出，不需要 migration。
