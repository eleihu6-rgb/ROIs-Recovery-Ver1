# Standing Bid Existing Tier 筛选实施计划

1. 为共享 Rule Bid Existing 区增加可选 toolbar 与“可见行”输入边界；未启用时保持现有页面不变。
2. 在 Standing Bid 页面维护 `ALL / T1–T7` 本地状态，只派生 Existing 可见行，保存继续使用完整草稿。
3. 增加 Standing 页面组件测试和共享面板未启用回归测试。
4. 更新 Standing QA 测试案例，并运行聚焦测试、Playwright、`check:ui`、lint 和 build。
