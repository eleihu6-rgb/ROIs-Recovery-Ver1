# Pairing Search 切页旧结果隔离测试

## 目标

确认 Pairing Search 在分页、分页大小或过滤条件触发新请求时，不会继续展示上一请求的卡片，避免用户误认为旧数据属于当前条件并点击 `ADD PAIRING`。

## 前置条件

- 进入 Bid → Search Pairings → All Pairings。
- 当前结果至少有两页。
- 可通过浏览器网络限速或测试拦截延迟 `/api/pairing-search/preview` 响应。

## 测试步骤与预期

1. 等待第 1 页结果显示，然后点击第 2 页。
   - 旧卡片立即从结果区消失。
   - 显示 `Refreshing results...` 和一张结构化 Pairing 卡片 Skeleton。
   - Skeleton 包含标题/操作、摘要、明细表和右侧月历四个轮廓区域，不再显示两个大面积纯灰色块。
   - Skeleton 高度和两列布局与真实 Pairing 卡片一致，不包含可聚焦控件。
   - 结果区具有忙碌状态，分页、每页数量和页码输入暂时禁用。
   - 页面中不存在旧卡片对应的 `ADD PAIRING`。
2. 返回第 2 页成功响应。
   - Skeleton 消失。
   - 只显示第 2 页卡片。
   - 分页控件恢复可用。
3. 点击第 3 页，并让请求失败。
   - 第 2 页卡片不再显示，也不会在失败后恢复。
   - 结果区显示可访问的错误提示和 `Retry` 按钮。
4. 点击 `Retry`。
   - 重试期间重新显示 Skeleton。
   - 成功后只显示第 3 页卡片，错误提示消失。
5. 在系统开启“减少动态效果”后重复切页。
   - Skeleton 仍正确显示，但脉冲动画停止。

## 自动化覆盖

- 状态单测：`pbs-portal/src/features/pairing/search-pairings-page-logic.test.ts`
- Playwright：`e2e/tests/pbs-portal/pairing-search.spec.ts` 中 `PBS-3605`
