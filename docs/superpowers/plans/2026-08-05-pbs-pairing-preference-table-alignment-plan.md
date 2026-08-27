# PBS Pairing Preference 表格对齐实施计划

1. 先补组件测试和 Playwright 回归，覆盖单表结构、列对齐、Route 可读性和滚动行为。
2. 将独立表头/数据表合并为一张原生表格，统一列定义并使用 sticky 表头。
3. 调整列宽比例并取消横向滚动；Route 不限行换行完整显示，行高按内容自然增长。
4. 补充 QA 人工测试用例，运行相关 Vitest、Playwright、build、lint 和 UI 标准检查。

范围仅限 Pairing Preference 结果表格及其测试/文档，不修改 API、数据结构或业务筛选逻辑。
