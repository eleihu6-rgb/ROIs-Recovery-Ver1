# PBS Portal 自定义日期选择器缩放适配设计

## 背景

当前 PBS Portal 已把原生 `input type="date"` 替换为自定义 `PortalDatePicker`，目标是避免浏览器根据系统语言显示中文占位符，例如 `年/月/日`。

新问题是：`PortalDatePicker` 的日历弹层通过 `createPortal` 挂到 `document.body`，但 PBS Portal 主工作区运行在 `ScaledPageCanvas` 里。`ScaledPageCanvas` 会按 1920x1080 设计基线对整页做 `transform: scale(...)`，而挂到 `body` 的弹层不会继承这个缩放。因此在较小视口或完整缩小模式下，日历弹层仍按原始像素渲染，视觉上比弹窗大很多，出现：

- 日历格子和星期标题过大。
- `SUN MON TUE...` 在视觉上拥挤。
- 日历弹层压住业务弹窗底部按钮。
- 弹层与输入框、业务弹窗的比例不一致。

这个不是单纯字体大小问题，而是“页面已缩放，body 级弹层未缩放”的坐标体系不一致。

## 目标

- 自定义日期选择器继续保持英文 ISO 输入体验：`YYYY-MM-DD`。
- 不恢复原生 `type="date"`。
- 日历弹层在 Portal 缩放页面中必须跟随业务弹窗等比例缩放。
- 日历弹层仍能避免被父容器裁剪。
- 在 1920x1080 基线、1080-1920 自适应区间、低于 1080 的完整缩小模式下都保持可用。
- 日期选择器不应遮挡业务弹窗底部操作按钮；空间不足时应优先向上展开或在视口内夹紧。

## 非目标

- 不重新设计 Days Off / Line / Reserve / Pairing 的业务弹窗结构。
- 不把 Portal 员工端业务弹窗迁回 `@rois/ui AppDialog`。
- 不引入新第三方 date picker 依赖。
- 不做移动端底部抽屉版本；本次只处理桌面 Portal 工作台。

## 方案比较

### 方案 A：把日历弹层渲染回当前表单 DOM 内

优点：
- 能自然继承 `ScaledPageCanvas` 的缩放。
- 实现直观。

缺点：
- 很容易被业务弹窗内部 `overflow`、滚动区域或父容器边界裁剪。
- 后续多个表单布局复用时容易出现局部补丁。

结论：不推荐。

### 方案 B：保留 `body` portal，但让弹层感知当前视觉缩放

优点：
- 继续避免父容器裁剪。
- 与当前 `createPortal` 架构兼容，改动集中在共享组件。
- 可以通过 anchor 元素的 `getBoundingClientRect().width / offsetWidth` 推导实际视觉缩放，不需要业务页面额外传参。
- 同一个组件可覆盖 Days Off / Reserve / Pairing / Line 中所有日期字段。

缺点：
- 定位计算必须同时使用未缩放设计尺寸和缩放后的视觉尺寸，测试要覆盖。

结论：推荐。

### 方案 C：把日期选择做成完整业务弹窗内的选择面板

优点：
- 最稳定，不依赖浮层定位。

缺点：
- 交互变重，和日期输入这种轻量操作不匹配。
- 改动面更大，会影响多个业务弹窗布局。

结论：本次不采用。

## 推荐设计

采用方案 B：`PortalDatePicker` 保持挂载到 `document.body`，但增加 scale-aware 定位与渲染。

### 缩放来源

在打开或重新定位时，从输入框外层 anchor 元素推导缩放比例：

```text
visualScale = anchor.getBoundingClientRect().width / anchor.offsetWidth
```

如果 `offsetWidth` 不存在或结果异常，则回退为 `1`。

这个方式能直接反映当前元素最终视觉缩放，包括 `ScaledPageCanvas` 的 `transform: scale(...)`，不用把 `pageScale` 从布局层层传入表单组件。

### 弹层渲染

保留设计尺寸：

- 设计宽度：`288px`
- 设计高度：按当前日历内容自然高度或固定估算高度

渲染到 `body` 后：

- `style.left/top` 使用真实视口坐标。
- `transform: scale(visualScale)`。
- `transform-origin: top left`。
- `width` 仍使用设计宽度，内部字号和格子尺寸保持设计体系。

视觉占用空间按：

```text
visualWidth = designWidth * visualScale
visualHeight = designHeight * visualScale
```

定位夹紧时使用 `visualWidth / visualHeight`，不是原始设计尺寸。

### 展开方向

定位策略：

1. 默认在输入框下方展开。
2. 如果下方放不下，则向上展开。
3. 如果上下都放不下，则夹在视口内，并限制最大视觉高度，内部允许轻量滚动。
4. 左右位置按缩放后的视觉宽度夹在视口内。

### 视觉修正

- 星期标题保持英文 `SUN` 到 `SAT`。
- 缩放后不应出现 `SUNMONTUE` 粘连。
- 日历格子、标题、按钮与业务弹窗比例一致。
- 使用当前 Portal 轻量白色弹窗风格，不改成 Gantt 工具窗风格。

## 影响范围

- `pbs-portal/src/shared/components/ui/portal-date-picker.tsx`
  - 增加视觉缩放推导。
  - 修改弹层定位和夹紧逻辑。
  - 修改弹层 `style`，增加 `transform`。
- `pbs-portal/src/shared/components/ui/portal-date-picker.test.tsx`
  - 增加缩放定位单元测试。
- `e2e/tests/pbs-portal/condition-default-favorites.spec.ts`
  - 扩展当前无中文日期输入的 Playwright 覆盖，增加缩放视口下的日历弹层检查。

不涉及后端、数据库、API、业务规则。

## 验收标准

- 在截图类似视口下，打开 Days Off 日期选择器：
  - 日历弹层与业务弹窗等比例缩放。
  - 星期标题间距正常。
  - 日历弹层不压住 `ADD BID` / `SAVE FAVORITE` / `CANCEL` 按钮。
  - 日历弹层在视口内完整可见或有受控内部滚动。
- 在 1920x1080 基线下，日期选择器视觉不退化。
- 点击日期后仍写入 `YYYY-MM-DD`。
- 点击外部、按 Escape 仍关闭弹层。
- 代码中仍不存在产品 UI 的中文日期占位符。
- 不新增第三方依赖。

## 测试计划

自动化测试：

- `pnpm -C pbs-portal run test -- portal-date-picker`
  - 覆盖 `type="text"`、英文占位符、日期选择、Escape 关闭。
  - 新增缩放定位测试：mock `offsetWidth` 与 `getBoundingClientRect()`，验证 `transform: scale(...)` 和位置夹紧使用缩放后尺寸。
- `pnpm -C pbs-portal run test`
- `pnpm -C pbs-portal exec tsc --noEmit --pretty false`
- `pnpm -C pbs-portal run lint`
- `pnpm -C pbs-portal run build`
- `npm run check:ui`
- Playwright：
  - 在 PBS Portal Days Off 页面打开 `Configure Days Off Bid`。
  - 打开日期选择器。
  - 断言日期弹层 bbox 不覆盖弹窗 footer 操作按钮。
  - 断言星期标题仍独立可见。
  - 断言输入框仍为英文 ISO 日期体验。

人工 QA：

- 在常见桌面尺寸下手动打开 Days Off / Reserve / Pairing 中的日期输入。
- 确认弹层比例、位置、关闭行为一致。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 本次改动集中在一个共享日期选择器组件及其测试，拆分多 agent 会增加同文件冲突。
- Suggested split: 不拆分。
- Write boundaries: 单一实现者修改 `PortalDatePicker`、相关 Vitest、相关 Playwright。
- Conflict risk: 中等；当前工作树已有其他窗口改动，必须只触碰本次相关文件。
- Execution gate: 用户确认本 spec 后再实现。

## 待确认

请确认本方案是否按“保留 body portal，但跟随 Portal 缩放体系适配”的方向执行。
