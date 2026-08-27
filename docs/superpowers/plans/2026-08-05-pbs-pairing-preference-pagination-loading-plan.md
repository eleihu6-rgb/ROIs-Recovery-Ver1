# PBS Pairing Preference 结果刷新回顶与骨架屏实施计划

1. 在现有单元测试中增加延迟响应，验证分页和筛选刷新期间旧数据隐藏、骨架屏出现、分页按钮禁用和请求完成后新数据出现。
2. 在 `PairingPreferencePicker` 内使用 query placeholder 状态统一识别分页、关键词搜索、应用筛选和清除筛选产生的结果过渡，并为数据滚动区增加回顶逻辑。
3. 使用 7 行 × 40px 的逐列骨架替换结果过渡期间的旧数据，保留表头和 280px 数据区。
4. 更新真实 Playwright 用例，验证滚动到底部后翻页及应用筛选均回顶并展示骨架屏。
5. 运行聚焦 Vitest、Playwright、`pbs-portal` build/lint 和根目录 `npm run check:ui`。
