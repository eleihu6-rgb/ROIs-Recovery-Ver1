# PBS 共享左侧日历视觉一致性修复设计

日期：2026-04-29
作者：Codex
状态：已确认并实现

## 背景

用户反馈 `/days-off` 页面左侧日历样式像是被改坏了，并提醒左侧区域可能是共享组件或共享数据。

排查确认：左侧 `BIDDING CALENDAR` 是 PBS 工作台共享区域，不是 Days Off 页面私有组件。它由 `SharedBiddingWorkbenchLayout` 固定渲染 `DashboardSchedulePanel`，内部使用共享的 `ScheduleEventCalendar`、共享的 calendar days off query，以及 `useBiddingCalendarStore` 保存当前 active layer。

最近为了支持 Days Off 页面月历点选，把 `/days-off` 路由下的共享日历切到 editable 模式。这个改动保留了共享数据，但让 `ScheduleEventCalendar` 在 editable 模式下额外把星期标题变成按钮，并给标题按钮加入 padding、hover 背景和确认弹窗逻辑；日期格也从只读 `article` 变成可点击 `button`。这些交互能力是需要的，但默认视觉不应改变共享日历的布局和样式。

## 目标

1. 保持 `/days-off`、`/pairing`、`/layer` 等工作台页面左侧日历默认视觉一致。
2. Days Off 页面继续支持点击日期格添加或删除 day off bid。
3. Days Off 页面继续支持点击星期标题，一键添加该星期几的所有日期。
4. 确认弹窗作为浮层出现，不改变日历布局，不遮挡被点击日期格主体。
5. 保持共享 calendar draft 数据、query key、active layer store 和保存逻辑不分叉。

## 不做范围

- 不改 Days Off 右侧 bid/property 面板。
- 不改 calendar days off 后端接口和 API contract。
- 不改 Pairing、Layer、Reserve、Award 页面左侧日历的只读语义。
- 不重新设计左侧日历整体视觉语言。
- 不引入新的 UI 库或第三方依赖。

## 方案

### 1. 共享壳层保持现状

继续由 `SharedBiddingWorkbenchLayout` 判断当前路由是否为 `/days-off`，只在 Days Off 页面传入 `editableDaysOffCalendar`。

这样可以保证：

- 左侧日历仍然只实例化一次共享工作台区域。
- 页面切换时仍共享 calendar draft query cache。
- active layer 不因为页面切换重置。

### 2. 日期格可编辑但视觉等同只读格

在 `ScheduleEventCalendar` 中保留 editable date cell 的 `button` 语义，但让它的布局表现和原来的 `article` 一致：

- 明确使用 `block w-full appearance-none`。
- 保持同样的 `h-[103px]`、边框、背景、padding、文字布局。
- 不给 active day off cell 增加 purple ring 或额外选中外观。
- hover/focus 只提供轻量反馈，不造成格子尺寸或网格对齐变化。

### 3. 星期标题保留点击能力但默认像普通文字

星期标题继续在 Days Off 页面作为按钮存在，满足“一键添加同星期日期”的需求。

视觉规则：

- 默认状态和只读页面的 weekday label 尽量一致。
- 不用额外 padding 撑高标题行。
- hover/focus 可以给轻量颜色或下划线/背景反馈，但不能改变整体高度、列宽或间距。
- aria label 保留可访问性提示。

### 4. 确认弹窗位置只影响浮层

确认弹窗继续由共享日历接收 `actionPopover` 渲染。

定位规则：

- 点击中间日期格时，弹窗出现在该格正上方附近。
- 点击最左侧或最右侧日期格时，弹窗向右或向左收敛，避免溢出左侧面板。
- 如果点击第一行日期格，弹窗不能跑出日历区域上方，也不能挡住被点击格子的主体；优先放到该格下方或可视区域内的邻近位置。
- 弹窗用 absolute/floating positioning，不参与文档流，不改变日历格子高度。

## 验收标准

1. `/days-off` 与 `/pairing` 左侧日历默认状态下视觉一致：星期标题高度、日期格尺寸、边框、字体、间距一致。
2. Days Off 页日期格仍能点击并弹出确认操作。
3. Days Off 页星期标题仍能点击并弹出批量添加确认操作。
4. 弹窗不遮挡被点击日期格主体，左右边缘可自适应偏移。
5. Pairing/Layer 等非 Days Off 页面不出现日期格按钮和星期标题批量添加按钮。
6. 相关测试通过，并补充可编辑模式不会改变共享日历结构样式的回归断言。

## 验证计划

自动测试：

- `pbs-portal/src/shared/components/schedule/schedule-event-calendar.test.tsx`
- `pbs-portal/src/app/layout/shared-bidding-workbench-layout.test.tsx`

建议命令：

```bash
cd /Users/lei/Codehub/rois-ai/pbs-portal
npm test -- --run src/shared/components/schedule/schedule-event-calendar.test.tsx src/app/layout/shared-bidding-workbench-layout.test.tsx
```

视觉核对：

- 对比 `/pairing` 与 `/days-off` 左侧日历首屏。
- 在 `/days-off` 点击中间、最左侧、最右侧、第一行日期格，确认弹窗位置符合体验要求。
- 点击 weekday header，确认批量添加弹窗可用且不会改变标题行布局。
- 点击 weekday header 时，弹窗应出现在对应星期标题上方；SUN/SAT 这类边缘列需要向内偏移，避免超出左侧日历区域。
- weekday 批量添加确认按钮只显示 `ADD ALL`，避免长文案在按钮里换行。

## 风险

- 该组件是共享组件，样式修复必须避免影响其他工作台页面。
- 弹窗定位如果只按固定像素处理，缩放画布下可能出现偏移，需要基于现有日历网格常量谨慎调整。
- 测试环境不做真实视觉截图断言，仍需要浏览器人工核对关键页面。
