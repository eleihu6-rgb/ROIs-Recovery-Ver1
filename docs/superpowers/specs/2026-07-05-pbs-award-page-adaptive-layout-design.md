# PBS Award 页面等比例自适应布局修复设计

## 背景

Award 页面当前在 `JUN 2026 AWARD CALENDAR` 和右侧 `ROSTER DETAILS` 并排展示时，会出现内容覆盖、局部挤压、横向滚动条等问题。

这里真正的问题不是日历需要内部滚动，而是 Award 页面没有遵守 PBS Portal 其他主页面的等比例缩放布局规范。

当前相关事实：

- Dashboard 页面使用 `ScaledPageCanvas`：页面先按设计稿宽高布局，再由 canvas 统一按视口比例缩放。
- Pairing / Days Off / Line / Reserve / Tier 通过 `SharedBiddingWorkbenchLayout` 使用 `ScaledPageCanvas`。
- `/award` 当前直接在 `MainLayout` 里渲染 `AwardRightPanel`，没有进入 `ScaledPageCanvas`。
- 因为 Award 没有统一缩放，页面内容在较小视口下不是整体缩小，而是在局部 grid/card 内互相挤压，最终出现覆盖和滚动条。

## 问题判断

上一版设计把“自适应”错误地理解成了“卡片内部滚动”。这不是项目要的效果。

正确口径是：

- PBS Portal 桌面工作台页面以设计稿尺寸为基准。
- 页面内部元素按设计稿布局。
- 视口变化时，由外层 `ScaledPageCanvas` 统一缩放整页。
- 不应该让单个 card 通过横向滚动来解决整体宽度不足。

因此本次修复应该针对 Award 页的页面壳层，而不是给 `AwardMonthCalendar` 增加滚动容器或降低 `contentMinWidth`。

## 目标

1. Award 页面使用和 Dashboard / shared bidding pages 一致的 `ScaledPageCanvas` 等比例缩放机制。
2. Award 页面在 `1920 x 1080`、`1440 x 900` 等桌面视口下整体按比例适配。
3. Award Calendar、Roster Details、Reason Report Preview 不互相覆盖。
4. 不出现由本次修复引入的日历内部横向滚动条。
5. Loading 态和真实数据态走同一套缩放壳层，避免加载完成后布局跳变。
6. 不改变 Award 页面业务数据和业务语义。

## 非目标

- 不重做 Award 页面业务功能。
- 不修改 Award 数据接口。
- 不把 Award 路由迁入 `SharedBiddingWorkbenchLayout`。
- 不改 `ScheduleEventCalendar` 共享组件行为。
- 不通过内部横向滚动或局部缩小字体来掩盖页面没有缩放的问题。

## 方案对比

### 方案 A：Award 页面接入 `ScaledPageCanvas`（推荐）

做法：

- 在 `AwardPage` 层使用 `ScaledPageCanvas`。
- 设计稿尺寸跟 Dashboard / shared workbench 保持一致：`designWidth={1888}`、`designHeight={968}`。
- `AwardRightPanel` 继续作为 Award 结果页主体卡片，使用 `var(--portal-page-shell-height)` 填满画布高度。
- `AwardPageLoading` 也放在同一 `ScaledPageCanvas` 内。
- 回滚上一版错误的 Award Calendar 内部 `overflow-auto`、`contentMinWidth` 改小、grid `minmax` 挤压式修复。
- Award Calendar 保持原本 `contentMinWidth={760}`，由外层 canvas 缩放负责适配。

优点：

- 和项目其他页面的自适应机制一致。
- 解决根因：Award 页面没有统一缩放。
- 不改变 Award 业务定位。
- 改动集中，风险可控。

缺点：

- Award 仍是独立结果页，不会自动共享 bidding workbench 的左侧 `BIDDING CALENDAR` 状态；但这是业务定位问题，不属于本次 bug。

### 方案 B：把 Award 迁入 `SharedBiddingWorkbenchLayout`

做法：

- 路由层把 `/award` 放进 shared bidding workbench。
- Award 使用共享左侧 `BIDDING CALENDAR`，右侧只显示结果详情。

优点：

- 页面骨架和 Pairing / Days Off 等完全一致。

缺点：

- Award 是 award result 页面，不是 bid editing 页面。
- 左侧到底显示 bid calendar 还是 award result calendar 需要重新定义。
- 设计范围大，不适合作为本次布局 bug 修复。

### 方案 C：卡片内部滚动 / 降低日历最小宽度（废弃）

做法：

- 给 Award Calendar 增加内部横向滚动。
- 降低 `contentMinWidth`。
- 主 grid 改成局部可收缩。

问题：

- 这不是项目现有自适应方式。
- 会出现截图里的横向滚动条。
- 页面元素不是整体等比例适配，而是局部挤压。
- 已确认不符合用户期望。

## 推荐方案

采用方案 A。

理由：

- Award 页的问题是缺少 `ScaledPageCanvas`。
- 其他页面已经证明该模式是项目规范和实际视觉预期。
- 修页面壳层比给子卡片打补丁更符合架构。
- 可以保留 Award 当前业务页面结构，不扩大业务范围。

## 设计细节

### 1. AwardPage 接入缩放画布

`AwardPage` 负责提供页面级缩放壳：

- 引入 `ScaledPageCanvas`。
- 对 loading / error / data 三种状态使用同一画布。
- 画布参数对齐 Dashboard / shared workbench：
  - `designWidth={1888}`
  - `designHeight={968}`
  - 可加 `viewportTestId="award-page-viewport"`
  - 可加 `canvasTestId="award-page-canvas"`

预期：

- Award 页在较小桌面视口下整体缩小。
- 页面内 summary card、calendar、right panel 一起缩放。
- 不靠内部 scrollbar 解决宽度不足。

### 2. AwardRightPanel 保持设计稿内布局

`AwardRightPanel` 应继续按设计稿尺寸布局：

- 外层保持 `h-[var(--portal-page-shell-height)]`。
- 主体左右两列保持原设计比例。
- 不引入为了视口适配而写的局部 `overflow-auto` 或强制缩小。
- panel 边界清晰即可，缩放交给 canvas。

### 3. AwardMonthCalendar 回滚局部滚动方案

`AwardMonthCalendar` 不应该自己承担页面自适应职责：

- 移除内部 `overflow-auto` wrapper。
- 保持 `ScheduleEventCalendar` 和 weekday header 同级渲染。
- 保持 `contentMinWidth={760}`，这属于设计稿内部布局宽度。

### 4. Loading 态一致

`AwardPageLoading` 不应单独使用未缩放的 viewport 尺寸：

- Loading panel 放入同一 `ScaledPageCanvas`。
- Loading skeleton 使用和 AwardRightPanel 相同的设计稿布局结构。
- loading -> loaded 不应出现尺度跳变。

## 影响范围

预计修改文件：

- `pbs-portal/src/features/award/pages/award-page.tsx`
- `pbs-portal/src/features/award/components/award-right-panel.tsx`
- `pbs-portal/src/features/award/components/award-month-calendar.tsx`
- `pbs-portal/src/features/award/pages/award-page.test.tsx`
- `e2e/tests/pbs-portal/award-adaptive-layout.spec.ts`
- `docs/test-cases/pbs/award/2026-07-05-award-adaptive-layout.md`
- `gantt/src/version.ts`
- `pbs-portal/src/version.ts`

## 验收标准

### 视觉适配

- Award 页面在 `1920 x 1080` 下正常展示，无覆盖。
- Award 页面在 `1440 x 900` 下整体等比例缩放。
- Summary cards 不被局部挤压成异常样式。
- Award Calendar 不出现本次修复引入的横向滚动条。
- Roster Details 不被 Award Calendar 覆盖。

### 布局一致性

- Award 页存在 `award-page-canvas` / `award-page-viewport` 测试标识。
- `award-page-canvas` 使用 transform scale。
- Award 页缩放行为与 Dashboard / shared bidding pages 同类。

### 回归

- Award 页面 loading 态、正常数据态、空数据态都进入缩放画布。
- 不改变 Award 数据请求和渲染内容。
- 不影响 Pairing / Days Off 等已使用 shared workbench 的页面。

## 测试计划

### 自动化测试

1. 更新 Award 页面组件测试：
   - 页面能渲染 `award-page-canvas`。
   - loading 态使用 `award-page-canvas`。
   - Award Calendar 和 Roster Details 正常存在。

2. 更新 Playwright 布局回归：
   - 打开 `/award`。
   - 断言 `award-page-canvas` 存在并有 `transform: matrix(...)` 或 `scale(...)`。
   - 断言 `award-page-viewport` 没有页面级横向滚动。
   - 断言 Award Calendar 与 Roster Details 的 bounding box 不重叠。
   - 断言 Award Calendar 不依赖内部横向滚动条。

3. 运行 UI 标准检查：
   - `npm run check:ui`

4. 运行 PBS Portal 相关验证：
   - Award Vitest
   - Award Playwright
   - `pnpm lint`
   - `pnpm build`

### QA 人工测试

更新 `docs/test-cases/pbs/award/2026-07-05-award-adaptive-layout.md`：

- 明确预期是整页等比例缩放。
- 明确不应出现内部横向滚动条。
- 检查 `1920 x 1080` 和 `1440 x 900`。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是集中在 Award 页面壳层和布局测试的小范围修复，多 agent 会增加冲突风险。
- Suggested split: 不拆分。
- Write boundaries: 仅限 Award 页面、Award 测试、PBS Award QA 文档、版本号。
- Conflict risk: 中等；实施前必须检查 `git status`，提交时只 stage 本次相关文件。
- Execution gate: 当前 spec 已按用户反馈修正，按此执行。

## 风险与注意事项

- 不要再用内部横向滚动作为自适应方案。
- 不要降低 `ScheduleEventCalendar` 的设计最小宽度来“挤进去”。
- 不要把 Award 迁入 `SharedBiddingWorkbenchLayout`，避免改变业务语义。
- 不要改 Award 数据接口。
- 不要影响 Dashboard / Pairing 等已有缩放壳层。

