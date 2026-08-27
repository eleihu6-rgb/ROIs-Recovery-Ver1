# PBS Pairing 搜索切页加载态防误导

## 目标

分页、每页数量或筛选条件改变并请求新结果时，不再展示上一请求的 Pairing 卡片，避免用户把旧数据误认为新结果或误点 `ADD PAIRING`。

## 方案选择

### 采用：清空旧卡片并显示固定高度 Skeleton

- TanStack Query 当前 query key 的 `previewQuery.data` 是唯一可展示的卡片数据；组件保存的 `lastPreviewResponse` 只允许提供临时分页布局元数据，不得再次映射成卡片。
- All Pairings 的页码、page size、筛选条件或 period 造成 query key 改变，当前 key 没有响应且新请求正在进行时，结果区域只显示 `Refreshing results...` 和固定高度 Skeleton。
- 新响应返回后再一次性显示新卡片。
- 分页按钮、每页数量和页码输入在该加载阶段禁用，防止并发切页。
- 结果卡片不在 DOM 中，因此不存在误点旧卡片的风险。

### Skeleton 视觉修订

- 加载区只显示一张结构化 Pairing 卡片骨架，不再纵向堆叠两个大面积纯灰色块。
- 骨架模拟真实结果卡片的标题/操作区、摘要字段、左侧明细表和右侧月历轮廓，让用户能预期数据返回后的布局；四个区域分别保留可测试的标识。
- 骨架外壳复用真实结果卡片的 `min-height: 254px`、16px 内边距、8px 圆角；内容区复用 `minmax(0, 1fr) 324px` 两列和 28px 列间距，确保在 Portal 现有缩放布局中与真实卡片一致。
- 继续保留上方 `Refreshing results...` 作为加载阶段唯一的 `role="status"` / `aria-live="polite"`；结果摘要不再单独使用 live region，避免重复播报。
- Skeleton 设置 `aria-hidden="true"`，不包含按钮、链接、输入框等可聚焦后代；脉冲动画在 `prefers-reduced-motion: reduce` 时禁用。
- 不改变加载、失败、Retry 或数据查询逻辑。

### 不采用：旧卡片加遮罩并禁用

能够保留页面高度，但用户仍会看到不属于当前页的 Pairing，语义上仍可能误导。

### 不采用：继续保留旧卡片和刷新提示

这是当前行为；页码与卡片数据短暂不一致，并且旧卡片操作仍可能被点击。

## 数据与状态边界

- 仅当当前 query key 没有 `previewResponse`、但存在 `lastPreviewResponse` 且正在请求时清空旧结果；同一 query key 已有正确缓存并在后台刷新时，可以继续展示该页缓存数据。
- 加载和失败状态可保留 `lastPreviewResponse` 的 `totalItems` / `totalPages` 作为禁用分页控件的布局元数据，但结果摘要改为加载或失败文案，不把旧总数表述成当前结果。
- 请求失败时不恢复上一页卡片，显示现有结果区错误状态和键盘可操作的 `Retry`；用户也可以修改分页或筛选条件发起新请求。
- 左侧 Bidding Calendar、筛选控件和当前页码保持可见；不修改后端接口、缓存 contract 或数据库。
- 延续上一项修复：有效分页操作立即把结果容器滚回顶部。
- 加载时结果容器设置 `aria-busy="true"`，Skeleton 对辅助技术隐藏，加载文本使用 live status；成功后的结果摘要和失败 alert 可被辅助技术感知。

## 验收标准

1. 从第 1 页切到第 2 页且请求未返回时，第 1 页卡片和 `ADD PAIRING` 不可见。
2. 加载阶段显示可感知的 `Refreshing results...` 和固定高度 Skeleton，结果区域不会塌陷。
3. 加载阶段所有分页按钮、每页数量和页码输入禁用；旧总数不作为当前结果摘要展示。
4. 新响应返回后只显示新页卡片，分页控件恢复。
5. 新请求失败时不回显上一页卡片，显示现有错误状态和 `Retry`，点击后可以重试同一 query key。
6. 同一查询 key 的后台刷新不会错误清空属于当前页的有效缓存结果。
7. `aria-busy`、live status、隐藏 Skeleton 和错误 alert/Retry 具备正确无障碍语义。
8. 状态单测覆盖 page、page size、filters 等 All Pairings query key 变化、失败和同 key 缓存刷新；Playwright 使用延迟分页及失败响应验证旧卡片不可见、所有分页控件禁用、Skeleton、新卡片替换与同请求 Retry；Portal 单测、lint、build 和 UI gate 通过。
9. Playwright 断言加载区恰好一张结构化骨架，标题、摘要、明细和日历四个区域均存在，外层 `aria-hidden="true"` 且无可聚焦后代；在 1920×1080 Portal 缩放布局下保存截图作为视觉回归凭证。
10. 更新 `docs/test-cases/pbs/pairing/2026-08-04-search-stale-results-loading.md`，加入单骨架结构、动画降级和视觉布局人工验收步骤。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 页面状态计算与单个结果面板紧密耦合，拆分会增加冲突。
- Write boundaries: Pairing 搜索页面状态、结果面板、相关测试和 QA 用例。
- Conflict risk: 中；当前同文件已有未提交分页回顶和筛选改动，必须采用局部补丁。
- Execution gate: 用户已同意采用清空旧结果的方向；不执行 Git commit。
