# PBS Portal 隐藏 AON 摘要标签实施计划

1. 调整共享 Rule Bid 摘要标签生成逻辑，不再生成 `AON`，保留 `Min N`。
2. 保持 AON checkbox、`allOrNothing` 类型、请求和持久化数据流不变。
3. 更新组件/页面测试，分别验证摘要不显示 AON、编辑开关仍可操作、保存时 true/false 不被改写。
4. 更新冲突的 QA 人工测试说明。
5. 运行聚焦测试、`npm run check:ui`、构建和真实 Playwright 回归。

实施只触及 AON 展示及对应测试/文档，不覆盖工作树中现有的收藏日期规则改动。
