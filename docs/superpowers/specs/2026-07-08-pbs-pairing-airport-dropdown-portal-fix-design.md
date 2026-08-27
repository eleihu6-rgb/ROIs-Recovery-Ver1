# PBS Pairing Airport 下拉框 Portal 化修复 Spec

## 背景

`Configure Pairing Bid` 弹窗里的 `Any Landing In Airport` 下拉框目前出现明显 UI 回归：

- 下拉列表被弹窗内容区裁剪。
- 右侧出现弹窗 body 滚动条和下拉列表滚动条并排的双滚动条。
- 底部 `CANCEL / SAVE FAVORITE / ADD BID` 操作区会压住下拉内容。
- 用户无法像正常 select/dropdown 一样稳定查看和选择 airport。

通过 git 历史核对，问题来自两次改动叠加：

1. `6b2d75de feat(pbs): airport multi-select + duration controls for pairing properties` 在 2026-06-20 新增 `AirportMultiSelect` 时，下拉框使用了 `absolute left-0 right-0 top-[calc(100%+6px)]`，并在内部设置 `max-h-[260px] overflow-y-auto`。这让 airport list 从一开始就不参与弹窗布局。
2. `d0585382 fix: constrain PBS pairing config dialog` 和 `b3af09c6 fix: restore portal pairing config dialog` 在 2026-07-05 为了解决 Pairing dialog 长内容撑出视口的问题，引入了外层 `max-h / overflow-hidden`、body `overflow-y-auto`、footer `shrink-0` 的结构。这个修复是必要的，但它让原本的 absolute airport dropdown 被滚动容器裁剪，形成当前截图里的问题。

因此，本次修复不能回滚 2026-07-05 的弹窗高度约束；正确方向是让 airport dropdown 像 Ant Select 一样作为独立浮层渲染，而不是继续被弹窗 body 裁剪。

## 目标

1. `AirportMultiSelect` 打开后表现为正常下拉框，视觉和交互接近 Ant Select。
2. 下拉层不被 `PairingPropertyConfigDialog` 的 `overflow-hidden` 或 body `overflow-y-auto` 裁剪。
3. 保留 2026-07-05 的 Pairing dialog 高度保护：长内容不能重新撑爆弹窗，footer 仍然稳定可访问。
4. 下拉层在选项较多时可以在自身内部滚动，但不能导致弹窗 body 出现截图中的并排双滚动条体验。
5. `Any Landing In Airport`、`Any/Every Layover In Airport`、`Work Start Station` 等复用 airport multi-select 的属性保持一致行为。
6. 不改变 airport option 数据来源、保存结构、filter 逻辑、chip 选择和清空逻辑。

## 非目标

- 不回滚 `PairingPropertyConfigDialog` 的 `max-h-[calc(100vh-32px)]`、`overflow-hidden`、body scroll、footer 固定结构。
- 不把 airport list 改成弹窗 body 内的内嵌展开区域。
- 不迁移 Pairing dialog 到 `AppDialog`。
- 不重做 Pairing property catalog、数据库可见性或 pairing bid 保存语义。
- 不引入 Ant Design 或其他重量级 UI 框架；这里只借鉴 Ant-style portal dropdown 的交互形态。
- 不顺手重构所有 dropdown/autocomplete 组件。

## 现状定位

相关文件：

- `pbs-portal/src/features/pairing/components/pairing-bid-airport-select.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-bid-control.tsx`
- `e2e/tests/pbs-portal/pairing-airport-select.spec.ts`
- `e2e/pages/pbs-portal/bid-workbench-page.ts`

当前关键结构：

- `AirportMultiSelect` 根节点是 `relative w-full`。
- dropdown 当前是根节点内部的 `absolute` 子元素。
- `PairingPropertyConfigDialog` 外层是 `flex max-h-[calc(100vh-32px)] ... overflow-hidden`。
- dialog body 是 `min-h-0 flex-1 overflow-y-auto`。
- footer 在 body 外部，通过 `shrink-0` 固定在底部。

这几个条件组合后，absolute dropdown 实际被限制在弹窗滚动区和外层 overflow 边界内，不能表现为真正的浮层。

## 推荐方案

采用 **方案 A：Airport dropdown 改为 portal/fixed 浮层**。

### 方案 A：Portal/fixed 浮层（推荐）

实现方式：

- `AirportMultiSelect` 的 trigger 仍留在原位置。
- dropdown 通过 `createPortal(..., document.body)` 渲染到 `document.body`。
- 使用 trigger 的 `getBoundingClientRect()` 计算浮层位置。
- 浮层使用 `position: fixed`，宽度与 trigger 一致。
- 浮层 z-index 高于 Pairing dialog 内容和 footer，例如 `z-[90]`。
- 打开时根据视口空间决定向下或向上展开。
- 选项列表保留自身 `max-height + overflow-y-auto`，作为正常 select 的内部滚动。
- outside click 需要同时识别 trigger 容器和 portal dropdown，避免点击 dropdown 内部时误关闭。

优点：

- 体验接近 Ant Select，是用户期望的正常 dropdown。
- 不破坏 2026-07-05 的 dialog 长内容保护。
- 不把下拉列表变成弹窗 body 内的普通内容块。
- 对 Pairing dialog 外壳影响最小。

缺点：

- 需要处理定位、resize/scroll 重算、outside click 边界。
- 比单纯改 CSS 略复杂，但复杂度局限在 `AirportMultiSelect` 内部。

### 方案 B：把 dropdown 改成 dialog body 内的展开区域

实现方式：

- 去掉 `absolute`，让 airport list 作为普通 DOM 内容参与 body 布局。
- 由 dialog body 负责滚动。

优点：

- 实现简单。
- 不会被 footer 覆盖。

缺点：

- 体验不再像正常下拉框，更像内嵌列表。
- 与用户明确希望的 Ant-style select 不一致。
- 不能恢复 2026-07-05 之前“正常 dropdown”的使用感觉。

不采用。

### 方案 C：回滚 2026-07-05 的 dialog 高度约束

不采用。

原因：

- 7 月 5 日修复的是长 Pairing Number / confirmed runs 场景，属于真实问题。
- 回滚会让长内容重新撑爆弹窗，footer 不稳定。
- 这会用一个旧 bug 替换当前 bug，不符合本次目标。

## 详细设计

### 1. `AirportMultiSelect` 结构

保留现有 trigger/chip 区域：

- 已选 airport chip 展示不变。
- 空值 placeholder `Select airports...` / `Select stations...` 不变。
- 点击 trigger 打开/关闭下拉不变。
- `Escape` 关闭不变。

新增或调整：

- 为 trigger 容器保留 `containerRef`。
- 为 portal dropdown 增加 `dropdownRef`。
- `open` 为 true 时计算 `dropdownPosition`。
- dropdown 不再作为 `containerRef` 内的 absolute child，而是 portal 到 `document.body`。

### 2. 定位策略

基础定位：

- `left = triggerRect.left`
- `width = triggerRect.width`
- 下方展开时：`top = triggerRect.bottom + 6`
- 上方展开时：`top = triggerRect.top - 6 - dropdownHeight`

高度限制：

- 默认最大高度继续接近现有 `260px`，避免视觉变化过大。
- 下方可用空间不足时，优先在可用空间内压缩高度。
- 如果下方空间明显不足且上方空间更多，则向上展开。
- 最小可用高度建议不低于 `160px`；极小视口下允许降到更低，但不能溢出 viewport。

视口边界：

- dropdown 不应超出 `window.innerHeight`。
- 左右边界以 trigger 为准；如果 viewport 过窄，宽度应不超过 `calc(100vw - 32px)`，并适当 clamp `left`。

滚动/resize：

- 打开时立即计算位置。
- window `resize` 时重新计算。
- 页面或父滚动容器 scroll 时重新计算或关闭；推荐重新计算，保持 select 浮层跟随 trigger。
- 事件监听仅在 `open` 时注册，关闭时清理。

### 3. Outside Click 和键盘

当前 outside click 只判断 `containerRef.contains(event.target)`。portal 后需要扩展：

- 如果 target 在 trigger 容器内，不关闭。
- 如果 target 在 portal dropdown 内，不关闭。
- 其他位置点击关闭。

键盘：

- `Enter` / `Space` / `ArrowDown` 打开下拉的行为保留。
- `Escape` 关闭行为保留。
- 不在本次新增完整 arrow navigation/highlight；避免范围扩大。

### 4. 下拉内容

下拉内容保持现有语义：

- 顶部 filter input。
- `Clear all` 逻辑不变。
- `Landing / Layover / Work Start` group 逻辑不变。
- option checkbox-like visual 不变。
- `No airports match` / `No stations match` 不变。

样式调整：

- portal 根节点使用 `fixed` 和高 z-index。
- 保持现有 border、shadow、rounded 视觉。
- 内部 options 区域继续使用自身 `overflow-y-auto`，这是正常 dropdown 内部滚动，不应转嫁给 dialog body。

### 5. 与 Pairing Dialog 的关系

`PairingPropertyConfigDialog` 的 2026-07-05 结构必须保留：

- 外层 `max-h-[calc(100vh-32px)]`。
- 外层 `overflow-hidden`。
- body `min-h-0 flex-1 overflow-y-auto`。
- footer `shrink-0`。

本次不应通过修改 dialog overflow 来解决 dropdown 问题。dialog 的职责是限制长表单；dropdown 的职责是作为浮层逃离这个限制。

## 验收标准

### 功能验收

- 打开 `Configure Pairing Bid -> Any Landing In Airport` 后，airport dropdown 可见，宽度与输入框一致。
- dropdown 不被弹窗 body 裁剪。
- dropdown 不被 `CANCEL / SAVE FAVORITE / ADD BID` footer 覆盖到无法阅读或选择。
- dropdown options 很多时，只有 dropdown options 区域内部滚动，dialog body 不出现截图中的并排双滚动条问题。
- filter 输入、选择 airport、取消选择、`Clear all` 均保持可用。
- `Any/Every Layover In Airport` 和 `Work Start Station` 使用同一组件时行为一致。

### 回归验收

- Pairing dialog 长内容仍然被限制在 viewport 内。
- footer 仍然固定在 dialog 底部，不随 body 内容滚走。
- `Pairing Number` confirmed runs 长列表不会重新撑爆弹窗。
- Search Pairings criteria 中复用 Pairing config dialog 的入口不退化。

## 测试计划

### Playwright

更新 `e2e/tests/pbs-portal/pairing-airport-select.spec.ts`：

- 打开 Pairing 页面。
- 打开 `Any Landing In Airport` 的 `Configure Pairing Bid`。
- 点击 `pairing-airport-combobox`。
- 断言 dropdown/listbox 可见。
- 获取 dropdown 和 footer / `ADD BID` 按钮 bounding box：
  - dropdown 不应被 dialog body 裁剪。
  - dropdown 与 footer 不应发生阻塞性重叠；如果 viewport 空间不足，dropdown 应调整高度或向上展开。
- filter 一个 airport，例如 `CUN`，选择后 chip 出现。

保留或扩展现有 airport select 用例，覆盖 `Work Start Station` 分组。

### Component / Vitest

如当前 component test 环境能稳定支持 portal，可补充：

- `AirportMultiSelect` 打开时 `role="listbox"` 渲染到 `document.body`。
- outside click 对 trigger/dropdown 内部点击不关闭，对外部点击关闭。

如果 portal 定位依赖浏览器 layout，主回归以 Playwright 为准。

### 视觉和标准检查

实现阶段预计执行：

```bash
cd /Users/lei/Codehub/rois-ai
npm run check:ui

cd /Users/lei/Codehub/rois-ai/e2e
npx playwright test tests/pbs-portal/pairing-airport-select.spec.ts --reporter=list --config=config/playwright.config.ts --project=pbs-portal

cd /Users/lei/Codehub/rois-ai
git diff --check
```

如实现只触及 `pbs-portal` 前端运行时代码，还需要按项目规则 bump：

- `pbs-portal/src/version.ts`
- `gantt/src/version.ts` 中对应 frontend 版本

## 风险与注意事项

- portal 后 outside click 必须同时考虑 trigger 和 dropdown，否则点击 dropdown 内部可能误关闭。
- fixed 定位需要在 dialog body 滚动时重新计算，否则 trigger 移动后浮层可能错位。
- 不能通过把 dialog 外层改成 `overflow-visible` 来修；那会削弱 7 月 5 日对长内容的保护。
- z-index 需要高于 dialog footer，但不要高到覆盖全局 toast / critical overlay。建议遵循现有 portal date picker 的层级思路。
- 不新增 UI 框架依赖。
- 本次只修 airport multi-select；其他 autocomplete 如果以后有同类问题，单独评估是否抽通用 portal popover。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是单个组件的浮层行为修复和一组 E2E 回归，拆分会增加协调成本。
- Suggested split: 不拆分。
- Write boundaries: `pbs-portal/src/features/pairing/components/pairing-bid-airport-select.tsx`、相关 E2E 测试、必要版本文件。
- Conflict risk: 低；主要风险是定位行为和 Playwright 稳定性。
- Execution gate: 用户 review 并确认本 spec 后再进入实现。
