# PBS Dashboard 日历裁切与滚动修复设计

## 背景

在 `localhost:3030/pbs/dashboard` 的矮窗口或浏览器缩放场景下，Dashboard 中间的 `BIDDING CALENDAR` 底部会被视口裁切，页面也无法滚动到日历底部。当前复现截图对应的 CSS 视口接近 `1280x650`，页面最大滚动高度为 `0`，但中间日历实际可视底部已经超过视口底部。

根因不是接口或数据问题，而是布局约束叠加：

- `MainLayout` 使用 `h-dvh` 和 `overflow-hidden`，页面主体 `main` 也使用 `overflow-hidden`。
- `ScaledPageCanvas` 按当前视口计算固定可视高度，并对内容做缩放。
- Dashboard 中间日历内容包含标题、period 状态、tier 矩阵、weekday、月历和底部 days-off capacity badge，实际高度可能超过当前可视高度。
- 现有 E2E 只验证日历 panel 自身没有内部裁切，没有验证整个 Dashboard 在矮窗口下是否可滚动到日历底部。

## 目标

修复 Dashboard 页面中间日历被底部裁切且不可滚动的问题。

验收标准：

- 在接近截图的矮窗口场景下，中间 `BIDDING CALENDAR` 优先通过 compact 自适应完整展示，而不是第一选择就让用户滚动。
- 当窗口进一步变矮、内容无论如何都无法合理压缩时，Dashboard 仍然可以访问到中间日历完整底部。
- 日历底部最后一周和 capacity badge 不应被不可达裁切。
- 标准桌面窗口下保持当前 spacious 视觉，不因为 compact 逻辑显得过密。
- 其他 PBS 页面不能因为本次布局调整出现新的滚动、缩放、裁切或工作台布局问题。
- 必须用 Playwright 驱动真实页面验证，而不是只靠代码检查。

## 非目标

- 不重做 Dashboard 三栏视觉设计。
- 不压缩月历 cell 高度来“挤进一屏”。
- 不改 days-off capacity 的显示内容、颜色含义或计算逻辑。
- 不调整 Bid、Reserve、Award、Standing Bid 的业务交互。

## 修复策略

优先选择“中间日历自适应优先、滚动兜底”的布局修复：

1. Dashboard 根据当前可用高度为中间 `BIDDING CALENDAR` 选择 normal / compact 表现。
2. 保留现有 `ScaledPageCanvas` 的宽度缩放策略和三栏比例。
3. compact 表现优先减少中间日历自己的垂直占用，而不是压缩整页或让用户马上滚动。
4. 当 compact 后仍然放不下时，再允许 Dashboard 出现纵向滚动，保证内容可达。
5. 如果只改 Dashboard 页面即可解决，则不触碰共享 `MainLayout`。
6. 如果必须调整共享布局组件，则改动必须保持现有页面默认表现，并通过页面级 class/参数/容器策略把影响控制在需要适配的场景内。

推荐实现方向：

- 给 `DashboardSchedulePanel` 增加 Dashboard 专用 compact 布局能力，例如减少外层 padding、标题与 tier matrix 间距、tier matrix 高度、月历 cell 高度等。
- compact 的压缩应保持可读性和点击区域，不用极端缩小字体或让 badge 挤在一起。
- 给 Dashboard 的页面画布或外层容器提供滚动兜底，使其在极端矮窗口时不被父级 `overflow-hidden` 截断。
- 保持中间 `DashboardSchedulePanel` 内部不产生不必要的嵌套滚动，避免用户在多个滚动容器之间切换。
- 不把减少 `calendarHeight` 作为唯一修复手段；应是整体 compact spacing 方案的一部分。

## 影响范围

预计主要涉及：

- `pbs-portal/src/features/dashboard/pages/dashboard-page.tsx`
- `pbs-portal/src/shared/components/layout/scaled-page-canvas.tsx`（仅在 Dashboard 局部无法解决时考虑）
- `e2e/tests/pbs-portal/current-period-calendar-header.spec.ts`
- 相关组件测试文件（如果 class 或布局 contract 发生变化）

需要避免影响：

- Bid 页面共享 workbench 的左右布局和日历折叠行为。
- Pairing preference 弹窗、filter dialog 的缩放和 portal 定位。
- Award / Standing Bid 页面基于 `ScaledPageCanvas` 的一屏布局。

## 测试计划

Playwright 必测：

1. Dashboard 矮窗口回归：
   - 视口设置为接近截图的 `1280x650`。
   - 打开 `/pbs/dashboard`。
   - 验证 `BIDDING CALENDAR` 可见。
   - 验证中间日历进入 compact 表现，最后一周日期和底部 capacity badge 不被 viewport 裁切。
   - 如仍存在轻微滚动，必须验证滚动后能到达完整底部，不能出现不可达裁切。

2. Dashboard 标准窗口回归：
   - 视口 `1920x1080`。
   - 验证三栏布局保持正常，不进入 compact 表现，不产生明显多余外层滚动。

3. Dashboard 极端矮窗口兜底：
   - 选择比截图更矮的窗口，例如 `1280x560`。
   - 验证 compact 无法完全容纳时，页面仍可滚动到底部。

4. 共享页面不被破坏抽查：
   - 至少打开 Bid 页面或已有 workbench E2E 覆盖用例。
   - 验证共享 BIDDING CALENDAR / workbench 仍然正常渲染，不出现横向错位或意外滚动。

单元/组件测试：

- 如修改 `ScaledPageCanvas` contract，需要补充或更新组件测试。
- 如只改 Dashboard 页面 class，需要更新 Dashboard 页面测试，明确矮窗口下允许滚动。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是小范围布局修复，拆分会增加共享布局误改风险。
- Suggested split: 不拆。
- Write boundaries: Dashboard 页面、DashboardSchedulePanel 的 compact 参数、必要的共享 canvas 小参数、对应 Playwright/组件测试。
- Conflict risk: 中低；主要风险是共享 `ScaledPageCanvas` 被其他页面复用。
- Execution gate: 用户确认本 spec 后再进入实现。
