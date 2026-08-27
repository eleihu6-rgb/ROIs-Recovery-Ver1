# PBS Bid Feedback 表格对齐与 Credit 单位设计

## 目标

- Bid Feedback 的 Pairing 列表中，表头与每行数据严格按同一列位置展示。
- 所有列的表头和数据均采用居中对齐，避免不同字段使用不同对齐方式造成视觉错位。
- 表头与数据区形成一个连续、稳定的表格整体，消除灰色大表头压住数据区的割裂感。
- 弹窗复用 Bid 条件弹窗的页面缩放和内容高度自适应行为，不在窄屏下以未缩放的固定高度覆盖页面。
- 表格正文使用 10px 标准字号，表头使用 12px 标准字号；在项目既有命名字号中采用最接近用户所需约 1.3 倍比例的档位，同时降低表头视觉重量。
- Credit 统一显示小时单位，例如 `5:10h`；右侧 Pairing 详情的 Credit 同步显示单位。

## 实施范围

- 仅修改 `pbs-portal` 的 Bid Feedback 展示和对应自动化测试。
- 保留现有接口、`totalCredit` 数据格式、分页、选择状态及 Eligibility 行为。
- 不修改 PBS Server、数据库或算法。

## 设计

1. Pairing 表头和数据行继续复用同一个 CSS Grid 列模板，不重写为 HTML Table。
2. 表头、数据和 Eligibility 图标统一使用 `justify-self-center text-center`，所有列均按各自 Grid 轨道中心对齐。
3. 表头改为与数据区一致的 `bg-background`，仅保留浅色下边框；降低表头视觉重量，使其字号、行高和间距与数据行协调，但仍通过弱化文字颜色表达列标题层级。
4. 保留选中行淡紫底色、ineligible 行红色状态底色、Eligibility 状态和 hover/focus 行为，不新增斑马纹、阴影或额外分隔层。统一白底只适用于没有状态着色的普通未选中行。
5. 移除 Bid Feedback 专用的 `portalToBody`，改为通过 `useScaledPageCanvasPortalTarget()` 取得现有 scaled-canvas portal root，并传给 `PbsDialogFrame.portalTarget`；同时为 dialog overlay 设置 `pointer-events-auto`，抵消 portal root 的 `pointer-events-none`，确保关闭、标签和列表行仍可点击。这样弹窗处于 PBS 页面缩放容器中，同时继续启用 `PbsDialogFrame` 既有的初始聚焦、焦点循环和关闭后焦点恢复；不修改共享 `PbsDialogFrame`。
6. 移除非 Loading 状态固定 `760px` 高度，保留共享弹窗的视口最大高度限制，由内容决定实际高度；内容超高时使用弹窗主体和列表自身滚动。
7. Pairing 列表外层 section（包含表头、数据列表和可选分页区）使用 `320px` 最大高度：数据较少时按表头、实际行数和分页区自然收缩；数据较多时由内部 `role="listbox"` 承担滚动，分页区固定在 section 底部且计入 `320px` 总高度。双栏 Grid 使用非拉伸对齐，左侧列表不得被右侧详情强制拉高；宽屏维持左右双栏，窄屏维持上下排列。
8. 表格数据行使用项目标准 `text-2xs`（10px），表头使用标准 `text-xs`（12px）。实际比例为 1.2 倍，是现有命名字号中最接近约 1.3 倍的合规档位；不新增字号 token，也不引入任意像素字号。
9. 通过专用格式化函数把非空 Credit 从 `HH:MM` 展示为 `HH:MMh`，避免修改服务端原始值。
10. 表头、行单元格、Pairing 列表 section 增加稳定测试标识。组件测试覆盖 Credit 格式化、对齐 class、字号、自适应 panel class、最大高度、非拉伸布局、统一背景和测试标识；真实几何布局只由 Playwright 验证。
11. Playwright 比较各列表头与对应数据内容的中心点，允许不超过 1px 的浏览器取整误差，并检查表头只与没有状态着色的普通未选中数据行共享背景、没有横向滚动；ineligible 红色状态行不参与白底一致性比较。
12. Playwright fixture 的 Award 提供足以超过 `320px` 的多行数据，Avoid 仅提供一行：Award 断言列表 `scrollHeight > clientHeight` 且列表承担滚动；Avoid 断言列表随单行内容收缩且 `scrollHeight <= clientHeight`。桌面双栏下验证左侧不被右侧拉高；窄屏上下布局下验证弹窗不超过视口。
13. Playwright 断言 `bid-feedback-dialog` 通过现有 `scaled-page-dialog-portal-root` 位于 `shared-bidding-workbench-canvas` 内，并在窄屏 fit 缩放状态下检查弹窗边界完全处于 `shared-bidding-workbench-viewport` 可见范围内，从真实 DOM 和几何结果证明缩放上下文已复用；同时真实点击关闭按钮、Bids/Calendar、Award/Avoid 和 Pairing 列表行，确认 overlay 恢复了指针事件。组件测试覆盖打开后初始焦点位于弹窗内、Tab 焦点循环及关闭后焦点恢复，防止 portal 迁移造成键盘可访问性回归。

## 验收标准

- 表头六列与首行对应单元格水平位置一致。
- 所有表头与对应数据内容均居中对齐，`Days` 与 `Credit` 不再产生视觉错位。
- 表头与没有状态着色的普通未选中数据行使用统一白底，通过单条浅边框自然衔接，看起来是一张完整表格而不是上下两张表；选中行继续使用淡紫底色，ineligible 行继续保留红色状态底色。
- 表头不再使用明显灰底或过重字号；选中行仍能清晰辨识。
- 弹窗不再传入 `portalToBody`，改用现有 scaled-canvas `portalTarget` 并通过 overlay 的 `pointer-events-auto` 保持鼠标交互，不再声明固定 `760px` 高度，并与 Configure Pairing Preference 使用相同的缩放上下文；关闭、切换和列表选择可正常点击，打开后初始聚焦、Tab 焦点循环和关闭后焦点恢复保持有效。
- 窄屏弹窗按内容自适应高度；内容超高时可滚动且 panel 不超过视口，页面底部不再出现由固定高度造成的不自然留白。
- 少量 Avoid 数据时列表按实际内容收缩；大量 Award 数据时包含表头、数据列表和分页区的外层 section 最大高度为 `320px`，由内部 `role="listbox"` 承担滚动，分页区固定且计入总高度，弹窗主体不代替列表承担该滚动。
- 宽屏双栏中左侧列表不因右侧详情更高而被拉伸；窄屏中弹窗属于 `shared-bidding-workbench-canvas` 且实际边界完全位于缩放视口内。
- 表格正文使用 `text-2xs`，表头使用 `text-xs`，表头层级清晰但不压迫数据行。
- Pairing 列表和右侧详情均显示 `5:10h` 形式的 Credit。
- Award 与 Avoid 两个列表均通过内容中心点对齐检查；Award 额外保留 Eligibility 图标列。
- 桌面双栏与窄屏上下布局均不出现列错位、内容截断或横向滚动条。
- Portal 组件测试、Playwright、lint、build 与 UI Standard Gate 全部通过。
- 更新 `docs/test-cases/pbs/bid/2026-08-10-bid-feedback.md`，补充人工验证步骤。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 修改集中在同一个组件及其测试，并行编辑容易冲突。
- Suggested split: 不拆分。
- Write boundaries: Bid Feedback 组件、组件测试、Playwright、QA 测试说明。
- Conflict risk: Low。
- Execution gate: 用户审核本 Spec 并明确同意实施后开始修改。
