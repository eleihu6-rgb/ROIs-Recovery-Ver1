# PBS Portal 弹窗统一交互规范设计

日期：2026-07-08

## 背景

PBS Portal 目前多个业务弹窗各自手写 overlay、弹窗容器、最大高度和滚动逻辑。Days Off、Pairing、Line、Reserve、Standing Bid、Tier、Dashboard 等页面视觉风格基本一致，但弹窗行为不完全统一，容易出现以下体验问题：

- 打开弹窗后背景页面仍可滚动。
- 长内容弹窗时，滚动区域不稳定，footer 可能跟随内容滚走。
- 下拉框、日期选择器、autocomplete 等前景浮层容易被弹窗内容区裁切。
- 部分弹窗与 viewport 的居中关系不一致。

用户明确要求这次覆盖 **PBS Portal 所有弹窗**，并明确说明 PBS 不使用 `@rois/ui AppDialog` 的 Gantt 风格；PBS 当前白底、圆角、轻阴影、紫色 action 的视觉风格需要保留。

## 目标

统一 PBS Portal 所有弹窗的基础交互行为：

1. 弹窗打开时锁定背景页面滚动。
2. 弹窗始终以浏览器 viewport 为基准居中显示。
3. 弹窗内容超过可视高度时，只滚动弹窗 body 区域。
4. 弹窗 header 和 footer 保持固定可见。
5. 下拉框、日期选择器、autocomplete 等浮层保持在弹窗前景，不被 body 滚动区裁切。
6. 保留 PBS 当前视觉风格，不引入 Gantt `AppDialog` 视觉。
7. 通过 Playwright 覆盖真实 UI 回归，避免只凭代码检查判断完成。

## 非目标

- 不迁移到 `@rois/ui AppDialog`。
- 不引入 Gantt 蓝色标题栏、拖拽弹窗、Gantt footer 样式。
- 不重做 PBS 弹窗视觉设计。
- 不改业务表单字段、按钮文案、保存逻辑、校验逻辑或 API contract。
- 不把日历点击捕获层当作业务弹窗改造，例如 calendar 中用于拦截点击的透明 full-screen button。
- 不一次性重构所有业务表单内部组件。

## 范围

纳入本次统一标准的弹窗包括 pbs-portal 中所有真实 `role="dialog"` / modal 类型弹窗，以及顶部导航中的 modal 类浮层。

初步识别的主要文件：

- `pbs-portal/src/features/days-off/components/days-off-bid-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-property-config-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-occurrence-bid-dialog.tsx`
- `pbs-portal/src/features/pairing/components/pairing-search-panel.tsx`
- `pbs-portal/src/features/line/components/line-bid-dialog.tsx`
- `pbs-portal/src/features/reserve/components/reserve-bid-dialog.tsx`
- `pbs-portal/src/features/reserve/components/reserve-short-call-type-dialog.tsx`
- `pbs-portal/src/features/standing-bid/components/standing-bid-dialog.tsx`
- `pbs-portal/src/features/tier/components/tier-detail-dialog.tsx`
- `pbs-portal/src/features/tier/components/tier-pairing-set-preview-dialog.tsx`
- `pbs-portal/src/features/dashboard/components/pairing-calendar-bid-detail-dialog.tsx`
- `pbs-portal/src/app/layout/dashboard-top-nav.tsx` 中的 modal 类 overlay

排除项：

- `pbs-portal/src/shared/components/schedule/schedule-event-calendar.tsx` 中的 full-screen click capture layer。
- `pbs-portal/src/features/reserve/components/reserve-coverage-calendar.tsx` 中的 full-screen click capture layer。

## 推荐方案

新增一个 PBS 专用可复用弹窗外壳组件，暂定名：

- `PbsDialogFrame`

建议位置：

- `pbs-portal/src/shared/components/ui/pbs-dialog-frame.tsx`

该组件只封装弹窗外壳和基础行为，不封装业务表单逻辑，不改变 PBS 视觉语言。

### 组件职责

`PbsDialogFrame` 负责：

- 渲染 PBS 当前风格的遮罩层。
- 将弹窗固定在 viewport 中心。
- 打开时锁定 `document.body` 滚动，关闭时恢复原值。
- 提供弹窗最大高度：`calc(100vh - 32px)` 或同等安全边距。
- 提供 header / body / footer 三段布局。
- body 使用 `min-h-0 flex-1 overflow-y-auto`。
- header 和 footer 使用 `shrink-0`，始终保持可见。
- 设置 `role="dialog"`、`aria-modal="true"`、标题/label 关联。
- 支持 Escape 关闭，且 pending 状态可禁用关闭。
- 支持点击遮罩关闭的能力，但默认是否启用需要按现有弹窗行为保持。
- 保持 z-index 足够低于 dropdown/autocomplete portal 但高于页面内容；已存在的 pairing 下拉 portal z-index 需要继续在弹窗上方。

`PbsDialogFrame` 不负责：

- 业务字段渲染。
- 业务校验。
- API 调用。
- tier、bid、date、airport 等业务控件逻辑。
- 改造视觉主题或颜色 token。

### 视觉约束

必须保留 PBS 当前弹窗视觉：

- 白色背景。
- 浅灰边框。
- 当前圆角体系，例如 `rounded-2xl` / `rounded-3xl`。
- 当前轻阴影。
- 当前标题区排版。
- 当前按钮视觉与紫色主操作按钮。

不得引入：

- `@rois/ui AppDialog`。
- Gantt 蓝色标题栏。
- Gantt 拖拽弹窗行为。
- 与当前 PBS 风格不一致的全新视觉语言。

## 实施策略

建议分三步实施，保持每一步都可验证。

### 第一步：基础容器

新增 `PbsDialogFrame`，并添加 focused component test 或至少通过使用方测试覆盖其关键行为：

- open 时锁背景滚动。
- unmount 时恢复 body overflow。
- 支持自定义宽度、label/title、footer、pending close guard。
- body 内部滚动，footer 不滚走。

### 第二步：迁移核心 bid 配置弹窗

优先迁移用户最常使用、最容易暴露问题的弹窗：

- Days Off bid dialog
- Pairing property config dialog
- Line bid dialog
- Reserve bid dialog
- Reserve short call type dialog

迁移时只替换外壳结构，不改业务字段和保存逻辑。

### 第三步：迁移剩余业务弹窗

继续迁移：

- Standing Bid dialog
- Pairing occurrence dialog
- Pairing search tier dialog
- Tier detail dialog
- Tier pairing set preview dialog
- Dashboard pairing calendar bid detail dialog
- Dashboard top nav 中确认属于 modal 的浮层

特殊弹窗如果已有局部容器定位需求，需要保留业务语义，但仍应满足背景锁滚、viewport 居中、内部滚动、footer 固定这些通用标准。

## 验收标准

实现完成后，需要满足：

1. 打开任意 PBS 业务弹窗时，背景页面不可滚动。
2. 弹窗相对 viewport 居中；滚动页面后打开弹窗仍居中。
3. 弹窗内容过高时，只有弹窗 body 区域滚动。
4. footer 操作区始终可见，不随 body 滚走。
5. header 关闭按钮始终可见。
6. Pairing airport dropdown、Pairing number autocomplete、date picker 等浮层不被弹窗 body 裁切。
7. Days Off、Pairing、Line、Reserve、Standing Bid、Tier、Dashboard 的代表弹窗视觉仍保持 PBS 当前风格。
8. 不改变业务保存 payload、按钮文案、校验结果和成功/失败行为。
9. 通过项目 UI 标准检查和相关测试。

## 测试要求

必须补充或更新 Playwright 用例，真实驱动 PBS Portal UI。

建议覆盖：

- Days Off：打开 Configure Days Off Bid 后，验证 body overflow locked，弹窗居中，footer 可见。
- Pairing：打开 Configure Pairing Bid，验证背景锁滚；打开 airport dropdown / pairing number autocomplete，验证浮层在前景且未被裁切。
- Line：打开 Line Reserve / Line Bid 弹窗，验证长内容内部滚动和 footer 固定。
- Reserve：打开 Reserve Bid 或 Short Call Type，验证背景锁滚和弹窗居中。
- Tier 或 Dashboard：选择一个代表性 detail dialog，验证统一行为覆盖非 bid 弹窗。

同时运行：

- `pbs-portal` touched-area Vitest。
- 相关 `e2e/tests/pbs-portal/...` Playwright spec。
- `pbs-portal` lint。
- `pbs-portal` build。
- 根目录 `npm run check:ui`。
- `git diff --check`。
- GitNexus `detect_changes` 后再提交。

## 风险与缓解

风险：

- 多个弹窗当前结构不完全一致，统一外壳可能影响局部布局。
- 部分测试可能依赖当前 DOM 层级或滚动容器。
- Dashboard / Tier 弹窗可能有特殊定位需求。
- 背景锁滚如果没有正确恢复，会影响后续页面交互。

缓解：

- 先迁移核心 bid 弹窗，再迁移剩余弹窗。
- 迁移时保持 DOM 中可访问 label、button 文案和 test id 稳定。
- 背景锁滚使用 effect cleanup 恢复原 body overflow。
- 对特殊弹窗允许传入 className / bodyClassName / footer / width，但不绕开统一滚动规则。
- 用 Playwright 验证真实交互，而不是只依赖 jsdom。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 这是一个共享 UI 外壳和多弹窗迁移任务，多个文件会围绕同一基础组件和同一批 E2E 测试变化；拆分并行容易出现重复改动、样式不一致和测试冲突。
- Suggested split: 不建议并行实现。主 agent 先新增 PBS 弹窗外壳，再按弹窗类型顺序迁移并验证。
- Write boundaries: `pbs-portal/src/shared/components/ui/` 新增外壳；各业务 dialog 文件只替换外层结构；E2E 和 touched-area tests 更新。
- Conflict risk: Medium。风险集中在弹窗 DOM 结构变化、滚动容器变化、测试选择器变化。
- Execution gate: 本 spec 经用户确认后，才进入实现计划和代码改动。

## 待确认事项

1. `PbsDialogFrame` 命名是否接受；如果希望更贴近现有命名，可改为 `PortalDialogFrame` 或 `PbsModalFrame`。
2. 遮罩点击是否关闭弹窗：建议默认保持每个现有弹窗的行为，暂不统一强制点击外部关闭。
3. 顶部导航 modal 是否第一批一起迁移，还是作为第二批跟随剩余弹窗迁移。
