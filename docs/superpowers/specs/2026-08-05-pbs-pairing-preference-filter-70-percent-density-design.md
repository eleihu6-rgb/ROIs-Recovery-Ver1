# PBS Pairing Preference 筛选栏 70% 密度设计

## 目标与范围

仅调整 `Configure Pairing Preference` 中 Filters 展开区的视觉密度。以当前已实现的紧凑版为基准，将标签、输入框、范围箭头、`days` 后缀、按钮、字号、内边距和间距缩小到约 70%，并让 `Dates`、`Check-in`、`Length`、`Check-out` 四组平均分配可用宽度。

本次不修改筛选字段、筛选规则、日期弹层、请求合同、分页、Pairing 表格、弹窗整体尺寸或其他页面。

## 设计

- 桌面布局使用四个等宽筛选列加一个自适应按钮列：`repeat(4, minmax(0, 1fr)) auto`。
- `Dates`、`Check-in`、`Length`、`Check-out` 四列计算宽度相同，允许网格像素取整产生不超过 1px 的差异。
- `Clear filters` / `Apply filters` 位于最右侧，按文案宽度展示，不参与四列平均分配。
- 真实 DOM 尺寸按当前基准约 70% 调整，禁止使用 `transform: scale()`：
  - 控件与按钮高度：36px → 25px，允许 24–26px。
  - 标签、输入值、箭头、`days` 后缀和按钮字号：12px → 9px，统一复用 `text-3xs` token（计算值 9px）。
  - 水平内边距：8px → 6px。
  - 筛选列和按钮组主要 gap：8px → 6px；范围输入之间的内部 gap：6px → 4px。
  - 圆角：8px → 6px，使用现有圆角 token。
- 标签、输入值、箭头、后缀和按钮文案不得换行、重叠或裁切。
- 原生 `time` 与 `number` 输入必须保留浏览器原生操作能力、键盘操作、焦点态和可访问名称。
- 日期入口使用相同的 24–26px 高度和 9px 字号；日期弹层本身不缩小、不改定位。
- 1024px 视口下使用 `repeat(2, minmax(0, 1fr))`：第一行 `Dates + Check-in`，第二行 `Length + Check-out`，按钮组第三行跨两列并右对齐。每行内的两个筛选组等宽，不预留空按钮列。

## 风险与约束

- 24–26px 已接近紧凑点击目标下限，因此不得低于 24px。
- Chrome 原生时间输入的内部图标必须在 Playwright 实际页面中验证；若 24–26px 发生裁切，所有四组控件和按钮统一提高到 28px，其他字号、宽度、内边距和间距仍按本设计执行。禁止只放大时间输入。
- 该密度仅限 Pairing Preference Filters，不改变共享日期组件的默认密度，也不扩散到其他页面。

## 验收标准

- 1440×900 真实弹窗中四组筛选和两个按钮完整位于一行。
- 四组筛选列等宽，差异不超过 1px。
- 四组控件和按钮计算高度一致：首选 24–26px；仅当 Chromium 截图证明原生时间输入裁切时统一使用 28px。标签、输入值、箭头、后缀和按钮的计算字号均为 9px。
- 输入框水平内边距为 6px（浏览器原生控件内部不可覆盖区域除外），主要 gap 为 6px，范围内部 gap 为 4px，圆角为 6px；几何断言容差 1px。
- 日期、时间、数字、箭头、`days` 和按钮文案均不裁切、不重叠、不换行。
- 按钮组不拉伸，组宽等于两个按钮各自实际 `bounding width` 与 6px gap 之和（实际宽度已包含文字、padding 和边框）；按钮组右边缘与筛选容器内容区右边缘差异不超过 1px。
- 1024×768 下严格按两列三行顺序布局，无水平溢出，按钮组在第三行右侧且完整可操作。
- Pairing Search 默认密度入口的计算高度保持 40px；弹层打开后视觉宽度保持 `320px × 当前页面 scale`（容差 2px），优先显示在入口下方且垂直间距保持 `6px × scale`（容差 2px），并完成一次范围日期选择。
- Playwright 覆盖 1440 单行、四列等宽、尺寸/间距/圆角、按钮右对齐以及 1024 两列三行布局；通过 Chromium `toHaveScreenshot` 覆盖原生时间图标和全部文本的无裁切视觉回归，并以 `scrollWidth/clientWidth`、`scrollHeight/clientHeight` 补充普通文本裁切断言。focused Vitest 覆盖密度类名和筛选行为不变。
- 运行 `pbs-portal` focused/full test、TypeScript build、lint、根目录 `npm run check:ui` 和相关 Playwright。

## Multi-Agent Parallelism Assessment

- Recommendation: No
- Rationale: 改动集中在一个筛选组件、共享日期入口的局部密度分支及紧密相关测试，拆分会增加同文件冲突。
- Suggested split: 不拆分，由单一实现者完成后统一验证。
- Write boundaries: Pairing Preference picker、日期入口密度分支、相关自动化测试与 QA 用例。
- Conflict risk: 多个 agent 会同时编辑同一组件和同一 Playwright 用例。
- Execution gate: 用户审阅并批准本设计文档后实施。
