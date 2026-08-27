# PBS Pairing 搜索分页回顶修复

## 目标

用户在 Pairing 搜索结果列表底部切换页码或每页数量后，结果列表立即回到顶部，避免新一页仍停留在底部。

## 方案

- 仅重置 `PairingSearchPanel` 内部 `resultsViewport` 的滚动位置，不滚动浏览器页面或左侧日历。
- 页码、上一页、下一页和输入页码跳转统一复用现有 `goToPage`，在有效页码变化时立即设置结果容器 `scrollTop = 0`。
- 修改每页数量时同样立即回顶，再调用现有 `onPageSizeChange`。
- 使用瞬时回顶，不增加动画、依赖或新的共享抽象。
- 当前页未变化、无效页码或禁用按钮不触发额外滚动。

## 验收标准

1. 结果列表滚到底部后，点击下一页、上一页或具体页码，`scrollTop` 立即变为 `0`。
2. 输入合法页码并按 Enter 后回到顶部。
3. 修改每页数量后回到顶部，并保持现有“回到第 1 页”行为。
4. 浏览器页面和左侧 Bidding Calendar 的滚动位置不受影响。
5. Playwright 驱动真实分页控件验证上述行为；Portal 测试、lint、build 和 UI gate 通过。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 单组件、单一滚动容器的局部修复，并行成本高于收益。
- Write boundaries: `PairingSearchPanel`、相关测试和 QA 用例。
- Conflict risk: 低；需保留当前工作区同文件中的未提交筛选功能改动。
- Execution gate: 用户已确认设计；不执行 Git commit。
