# UI Standards — full rule text

> Detail for §First-Paint, §Gantt-Unify, pop-up window standard, style/typography standard and §UI-Standard-Gate summarised in root `CLAUDE.md`. Moved here 2026-09-12.

## §First-Paint — 1-2 秒首屏是第一优先级（强制，全员遵守）

> **数据加载与 Gantt 渲染的第一目标：把「第一批 X 条机组/航班（pairing）」在 1-2 秒内呈现到用户视口。** 这是所有团队成员、所有相关代码（前端渲染 + 后端数据接口）的最高优先级，优先于功能完整性、统计准确性、附加信息加载。

铁律：

- **首屏只加载视口需要的第一批数据**（first X crew / pairings），其余分页 / 滚动 / 后台懒加载（`loadMore`、虚拟化）。禁止首屏全量加载阻塞渲染。
- **任何附加数据都不得拖慢首屏**——法规违规（violation / 告警铃铛）、KPI、积分、统计、资质等一律在首屏渲染**之后**异步加载，且只为「已加载进视口的机组」加载（与机组加载同一批次、同一集合）。违规加载严禁阻塞或延迟机组/航班首帧。
- **违规数据加载范围 = 已加载机组集合**：接口/前端按 `selectedCrewIds`（已加载机组）拉取，不得因后端 cap（如 `MAX_CREWS`）小于已加载机组数而静默丢弃后段机组的告警。
- 新功能、新数据源接入前自问：**它会不会让首屏变慢？** 若会，改成异步/懒加载。
- 性能回归（首屏 > 2 秒）视同 bug，必须修复。E2E 应有首屏耗时基准（见 `Perf-4xxx`）。

## §Gantt-Unify — Live 与 Scenario 共用一套 Gantt 代码路径（强制执行）

**One shared Gantt code path for Live and Scenario wherever the user-facing function is the same.** 用户看来是同一张甘特图，分叉成两套 UI 会导致重复实现和「Live 能用、Scenario 不能用」的体验差异。动任何 gantt 功能前先自问：能否一次加到 shared 层让两边同时受益？来源差异（Live vs Scenario 的数据来源、能力开关）一律藏进适配器 capability，禁止散落成 `if (live) … else …` 或重复实现同一功能。只有业务差异**真实存在且已在 spec/PR 中写明**时，才允许 Live-only / Scenario-only 代码。

架构落点（改前核对）：共享层 `gantt/src/components/panes/shared/`（`SharedRosterPane`/`SharedFlightPane`/`SharedPairingPane`）；数据抽象 `gantt/src/components/gantt/source/gantt-pane-source.ts` 的 `GanttPaneSource`；两个薄适配器 `live-gantt-source.ts` / `scenario-gantt-source.ts`；上下文包装 `GanttSourceProvider`。

与 §Minimal-First / §Surgical 不冲突：只下沉**已确认**的共同行为，不预埋投机性抽象，也不顺手重构无关分叉。

---

## 前端语言规范

- **UI 默认语言为英文**：所有按钮、标签、占位符、提示文字、空态文案、弹框内容等，默认一律使用英文
- 中文仅在用户明确要求「显示中文」或配置了 i18n 语言为中文时才出现
- 代码注释、commit message、文档可以用中文；用户界面文字不行
- 违反此规范的中文 UI 字符串视同 bug，必须还原为英文

## 弹窗窗口标准（Pop-up Window Standard，强制执行）

> 全平台所有弹窗（gantt / pbs-portal / pbs-app）必须共用同一套窗口外观，参考 `image/pop-up-window-template.png`。

唯一实现组件：`@rois/ui` 的 **`AppDialog`**（`packages/ui/src/composites/app-dialog.tsx`，基于 Radix Dialog 原语）。**禁止**再直接用裸 `Dialog`/`DialogContent` 拼装业务弹窗，也禁止用 Modal/Drawer/Popover 代替弹窗。

标准外观（六条，缺一不可，具体 prop 见组件源码）：左上角图标（`icon`）、蓝色标题栏+白色标题（`bg-primary`/`text-primary-foreground`，禁止硬编码颜色）、右上角关闭按钮（`showClose`）、右下角按钮区（`footer`，取消在左主操作在右）、可拖拽（`draggable`）、可关闭性由 `dismissable` 控制（执行中操作应临时设为 `false`）。

新增弹窗或改造旧弹窗一律走 `AppDialog`；若标准本身需要扩展，改 `AppDialog` 而非在业务侧另起炉灶。

## 样式与排版标准（CSS / Typography Standard，强制执行）

> 适用于所有前端模块（gantt / pbs-portal / pbs-app / packages/ui）。本系统是高密度航空运行界面（Jeppesen / Bloomberg 风格），所有视觉量纲必须 **token 驱动**，禁止散落的魔法值。Token 的唯一来源是 `packages/ui/src/styles/globals.css` 的 `@theme`。

### 字体（Font family）

- **正文 / UI 文本**：`font-sans`（`--font-sans`，系统字体栈），是默认值，一般无需显式写
- **数字 / 代码 / ID**：`font-mono`（`--font-mono`），机组号、时间、航班号等**成列数字**必须配 `tabular-nums`（等宽数字对齐），例：`className="font-mono tabular-nums"`
- **禁止**引入自定义 Web 字体或在组件里写死 `font-family`

### 字号（Font size）— 唯一标准刻度

全平台只用下面这 **8 级** 命名 token，**禁止** 再写任意 `text-[Npx]`（如 `text-[11px]`、`text-[13px]`）。`xs`–`2xl` 沿用 Tailwind 默认值，`2xs`/`3xs` 由本项目 `@theme` 扩展：

| Token | px | 典型用途 |
|-------|----|---------|
| `text-3xs` | 9  | 大写微标签（配 `uppercase tracking-wide`）|
| `text-2xs` | 10 | 徽章、chip、表格微信息、表单字段标签 |
| `text-xs`  | 12 | **正文默认**、次级文本、提示 |
| `text-sm`  | 14 | 强调正文、输入框、小节标题 |
| `text-base`| 16 | 面板 / 弹窗标题 |
| `text-lg`  | 18 | 页面标题 |
| `text-xl`  | 20 | 大标题 |
| `text-2xl` | 24 | Hero / 极少数场景 |

> 历史代码里的 `text-[Npx]` 仍可渲染，但**新代码禁止新增**；改动到的文件就近迁移。迁移映射表见 `docs/superpowers/specs/2026-06-15-rois-ui-standard-for-ai-agents-design.md`。

### 字重（Font weight）

只用 4 档：`font-normal`(400) 正文 · `font-medium`(500) 标签/次强调 · `font-semibold`(600) 标题/强调 · `font-bold`(700) 关键数据。**禁止** `font-extrabold` 及更重档位。

### 间距 / 圆角（Spacing / Radius）

- 间距走 Tailwind 4px 基准刻度（`gap-1`/`p-2`/`mt-1.5` 等），**禁止**任意 `m-[Npx]`/`p-[Npx]`；确需精确像素（如 Canvas 定位）才用动态 inline style
- 圆角统一用 `rounded-sm/md/lg/xl`（映射 `--radius`，默认 2px 紧凑风格），禁止写死圆角像素

### 颜色

- 见 `@rois/ui` 规范：一律用语义化 token（`bg-primary`/`text-muted-foreground` 等），**禁止**硬编码颜色值（Canvas 的 `--gantt-*` 变量除外）

### 对齐（Alignment）

图标 + 文字（标题、按钮、列表项、徽章）必须严格对齐，新组件要和现有组件视觉一致：

- **图标与文字同行必须用 `flex items-center`** 做垂直居中，**禁止**用 `mt-*`/`-translate-y-*` 等手动微调图标位置（拖拽指示器等动态定位除外）
- **间距按文字大小取标准 `gap`**：紧凑行（`text-2xs`/`text-xs`）用 `gap-1.5`；标题/标准行（`text-sm`/`text-base`）用 `gap-2`；**禁止** `gap-3` 及以上的过宽图标-文字间距和任意 `gap-[Npx]`
- **前导图标尺寸跟随文字**：配 `text-xs` 用 `h-3.5 w-3.5`，配 `text-sm`/`text-base` 用 `h-4 w-4`；图标一律加 `shrink-0`，避免文字 `truncate` 时挤压图标
- **装饰性前导图标默认 `text-muted-foreground`**，需要强调才用 `text-primary`；**禁止**用 `text-sidebar-primary` 给内容区图标上色（该 token 仅用于侧栏表面）
- **纯图标按钮**用 `inline-flex items-center justify-center` + 方形点击区（如 `h-7 w-7 p-0`）
- **内容面板/区块标题栏统一形态**：`flex h-10 shrink-0 items-center gap-2 border-b border-border px-4` + 前导图标 `h-4 w-4 shrink-0 text-muted-foreground` + 标题 `text-sm font-semibold text-foreground`（参照 `scenario-detail-panel` / `crew-bids-view`）

违反以上（魔法字号、写死字体/颜色/圆角、超档字重、图标错位/间距不一致）视同样式 bug，改到的地方必须顺手修正。

### §UI-Standard-Gate — 自动门禁（强制执行，团队 + AI agent 全员）

> 上述样式标准由 `scripts/check-ui-standard.mjs` 守护，**禁止靠自觉**。全文见 `docs/superpowers/specs/2026-06-15-rois-ui-standard-for-ai-agents-design.md`。

提交/推送前必跑 `npm run check:ui`，**硬违规必须为 0**：魔法字号 `text-[Npx]`、超档字重、写死圆角 `rounded-[Npx]`、任意字体族 `font-[...]`（扫描 `gantt/src` + `packages/ui/src`）。像素间距/内联 `fontFamily` 仅 WARN 不阻断（1px 边框补偿等合法例外）。豁免写 `ui-standard-ignore` / `ui-standard-ignore-next-line`，滥用视同违规。`.githooks/pre-push` 拦截硬违规推送；改动前端样式后必须运行 `npm run check:ui` 并在完成消息贴出 PASS 结果（§No-Illusion）。

