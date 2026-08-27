# PBS Airport 下拉浮层缩放适配设计

## 状态

- 日期：2026-07-30
- 状态：已确认并实施
- 范围：PBS Portal Pairing / Standing Bid 中的 Airport 选择浮层

## 背景

PBS Portal 在窄屏下通过 `ScaledPageCanvas` 将完整工作台和弹窗统一缩放。Airport Preference 的地点选择器当前把下拉层直接 portal 到 `document.body`，仍使用未缩放的字体、行高和固定列表高度，因此在 `1000×862` 等视口中明显大于弹窗，并越过弹窗可用区域。

同类问题也存在于 `AirportMultiSelect`：它已经能够根据上下空间决定展开方向和列表高度，但仍处于未缩放的 `document.body` 坐标系。

## 目标

- Airport 下拉浮层与工作台、弹窗使用同一视觉缩放比例。
- 下拉层根据可用空间向上或向下展开。
- 列表高度自适应，始终保留视口安全边距。
- Pairing、Standing Bid 及复用这些编辑器的入口行为一致。
- 不改变 Airport 数据、过滤、选择、取消选择和 Bid 保存逻辑。

## 方案比较

### 方案 A：共享 body portal 缩放定位工具（采用）

新增一个纯定位工具，统一计算：

- 锚点的视觉缩放比例；
- 下拉层宽度、上下展开方向、最大内容高度；
- 窄屏视口安全边距。

`AirportPreferenceLocationPicker` 与 `AirportMultiSelect` 都使用该工具，继续 portal 到 `document.body`，但像现有 `PortalDatePicker` 一样使用锚点的视觉缩放比例和 `fixed` 视口坐标。

优点：符合已经验证的 `PortalDatePicker` 模式；不需要跨缩放画布做坐标转换；两个 Airport 选择器不会再次漂移。
代价：需要增加一个小型共享定位工具和纯函数测试。

### 方案 B：portal 到 `ScaledPageCanvas` target

将下拉层 portal 到缩放画布的 target，并把视口坐标转换成画布设计坐标。

优点：由父画布统一缩放。
缺点：anchor 与 portal target 可能不在同一缩放上下文，坐标换算、fallback 和 target 切换复杂，容易闪现在错误位置。

### 方案 C：把下拉层留在弹窗 DOM 内

优点：天然继承缩放。
缺点：会被弹窗的 `overflow-hidden` / `overflow-y-auto` 裁切，不适用。

## 设计

### 共享定位

新增面向弹出式选择列表的纯函数，输入：

- anchor `DOMRect`；
- anchor 的 layout width，用于计算视觉缩放比例；
- 视口宽高，单位为 viewport CSS pixels；
- 设计态 header 高度和最大列表高度，单位为未缩放 design pixels；
- 设计态 gap，先乘以 scale 转换为视觉 gap；
- 视口安全边距，单位为 viewport CSS pixels。

输出：

- `viewportLeft`、`viewportTop` 或 `viewportBottom`，单位为 viewport CSS pixels；
- `designWidth`、`designMaxPopupHeight`、`designMaxOptionsHeight`，单位为未缩放 design pixels；
- `openAbove`；
- 视觉缩放比例。

缩放比例公式为 `anchorRect.width / anchorLayoutWidth`；零宽、非有限或非正值统一回退为 `1`。下拉层使用 `document.body + fixed + transform: scale(anchorScale)`：

- 向下展开时使用 `viewportTop = anchorRect.bottom + visualGap`、`transform-origin: top left`。
- 向上展开时使用 `viewportBottom = viewportHeight - anchorRect.top + visualGap`、`transform-origin: bottom left`。
- 通过 `bottom` 附着触发器上沿，使自然内容高度小于最大高度时仍紧贴触发器，不依赖预估真实浮层高度。
- 下拉层视觉宽度使用 `min(anchorRect.width, max(0, viewportWidth - 2 × margin))`；再除以 scale 得到 `designWidth`。

可用空间明确为：

- `spaceBelow = max(0, viewportHeight - margin - anchorRect.bottom - visualGap)`
- `spaceAbove = max(0, anchorRect.top - visualGap - margin)`

当下方无法容纳理想高度且上方空间更多时向上展开，否则向下展开。选中侧的 `availableVisualHeight` 决定整个 popup 和 options 的最大高度：

最大列表高度规则：

`designMaxPopupHeight = availableVisualHeight / scale`

`designMaxOptionsHeight = max(0, min(designMaxOptionsHeight, designMaxPopupHeight - designHeaderHeight))`

不设置硬性最小列表高度。空间不足时以安全边距为最高优先级；即使只能显示 header 或少量 option，也不能反向扩大导致溢出。当上下两侧都小于 header 时，整个 popup 使用 `designMaxPopupHeight` 并内部滚动/裁切，仍保持在安全边距内。

### 两个 Airport 选择器

- `AirportPreferenceLocationPicker` 移除固定 `max-h-[260px]` 和仅保证 120px 可见的定位逻辑，改为动态 `maxOptionsHeight`。
- `AirportMultiSelect` 复用同一定位工具，保留原有分组、过滤和 Clear all 行为。
- 两个下拉层都保留现有 listbox/option 语义、键盘操作、外部点击关闭和滚动/resize 重定位。
- 使用 `ResizeObserver` 观察 anchor；选择项导致 chip 换行、弹窗重排或 anchor 尺寸变化时重新定位。
- 打开、关闭或重新定位期间只在坐标有效后显示浮层，避免闪现在 `(0, 0)`。
- popup 外层应用 `designMaxPopupHeight`；正常空间下 header 固定、options 内滚动，极端空间不足时 popup 本身也允许内部滚动，边界优先于最小可见高度。

### 键盘与无障碍

- 为 options listbox 分配稳定 id，combobox 使用 `aria-controls` 指向它。
- 搜索输入和 Clear all 位于 popup 容器中，不放进带 `role="listbox"` 的节点；实际 options 容器使用 `role="listbox"`、可访问名称和 `aria-multiselectable="true"`。
- option 使用 `aria-selected`，不再使用 `aria-pressed`。
- popup 容器统一捕获 Escape，保证焦点位于 filter、Clear all 或任意 option 时都执行 `preventDefault()` 和 `stopPropagation()`，只关闭下拉层并把焦点还给 trigger；父 `PbsDialogFrame` 必须保持打开。
- 保留键盘打开、外部点击关闭和滚动/resize 重定位。

### 边界

- 下拉层视觉宽度与触发器一致。
- 优先向下展开；下方不足且上方空间更多时向上展开。
- 上下都不足时选择空间较大的一侧并压缩列表高度。
- 浮层的视觉边界不得越过视口安全边距。
- 当视口宽度不足时，视觉宽度直接降级到 `max(0, viewportWidth - 2 × margin)`。
- 不改变弹窗自身尺寸，不通过提高 z-index 或裁切内容掩盖问题。

## 验收标准

1. `1920×1080` 下 Airport 下拉层尺寸与当前桌面体验一致。
2. `1366×700` 和 `1000×862` 下，下拉层字体、行高和圆角与弹窗保持相同比例。
3. 下拉层完全位于视口安全边距内，不发生底部溢出。
4. 下方空间不足时能够向上展开。
5. Airport Preference 和普通 Airport Multi Select 都满足以上规则。
6. Pairing 与 Standing Bid 入口表现一致。
7. 搜索、选择、取消选择、Clear all、Escape 和外部点击关闭行为不变。
8. Escape 只关闭 Airport 下拉层并恢复 trigger 焦点，不关闭父 Bid 弹窗。
9. combobox、listbox 和 options 保持正确、可关联的无障碍语义。

## 测试

- 共享定位纯函数：覆盖非零视口偏移、`scale=1/0.5`、向上/向下、两侧都不足、上下均小于 header、窄视口、零宽和非有限 scale fallback。
- 两个 Airport 组件单元测试：覆盖 body portal、外部点击、从 filter/option/Clear all 触发 Escape、焦点恢复、父 dialog 保持打开、选择/取消、Clear all、ResizeObserver 重定位及 listbox 语义。
- Playwright 真实 UI：两个 Airport 选择器分别在 `1920×1080`、`1366×700`、`1000×862` 中比较 trigger/dropdown 的 `getBoundingClientRect().width / offsetWidth`，断言比例一致且四边位于安全边距内。
- 构造低位 anchor，确定性断言向上展开。
- Standing Bid 执行至少一个真实入口回归，证明复用路径生效。
- 新增 `docs/test-cases/pbs/...` QA 人工测试文档。
- 在 `pbs-portal` 运行完整 `npm test`、`npm run lint`、`npm run build`。
- 运行目标 Playwright 文件 `e2e/tests/pbs-portal/airport-dropdown-adaptation.spec.ts`，以及 Standing Bid 受影响入口回归。
- 在根目录运行 `npm run check:ui`。
- 最终交付逐项报告以上命令的精确 PASS / FAIL。

`ScaledPageCanvas`、`ScheduleEventCalendar` 和 `PortalDatePicker` 本次只作为参考，不修改其实现；不扩大对应回归范围。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 两个组件共用同一定位契约，测试和实现紧密耦合，单人修改更安全。
- Suggested split: 不拆分。
- Write boundaries: 共享定位工具、两个 Airport 选择器及对应测试。
- Conflict risk: 低。
- Execution gate: spec 审查通过并获得用户书面确认后实施。
