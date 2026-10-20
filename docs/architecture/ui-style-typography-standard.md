# 样式与排版标准（CSS / Typography Standard）

> 从根 `CLAUDE.md` 移出的完整规范（强制执行）；根指南保留强制要点摘要，由 `npm run check:ui`（§UI-Standard-Gate）守护。

> 适用于所有前端模块（gantt / pbs-portal / pbs-app / packages/ui）。本系统是高密度航空运行界面（Jeppesen / Bloomberg 风格），所有视觉量纲必须 **token 驱动**，禁止散落的魔法值。Token 的唯一来源是 `packages/ui/src/styles/globals.css` 的 `@theme`。

## 字体（Font family）

- **正文 / UI 文本**：`font-sans`（`--font-sans`，系统字体栈），是默认值，一般无需显式写
- **数字 / 代码 / ID**：`font-mono`（`--font-mono`），机组号、时间、航班号等**成列数字**必须配 `tabular-nums`（等宽数字对齐），例：`className="font-mono tabular-nums"`
- **禁止**引入自定义 Web 字体或在组件里写死 `font-family`

## 字号（Font size）— 唯一标准刻度

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

## 字重（Font weight）

只用 4 档：`font-normal`(400) 正文 · `font-medium`(500) 标签/次强调 · `font-semibold`(600) 标题/强调 · `font-bold`(700) 关键数据。**禁止** `font-extrabold` 及更重档位。

## 间距 / 圆角（Spacing / Radius）

- 间距走 Tailwind 4px 基准刻度（`gap-1`/`p-2`/`mt-1.5` 等），**禁止**任意 `m-[Npx]`/`p-[Npx]`；确需精确像素（如 Canvas 定位）才用动态 inline style
- 圆角统一用 `rounded-sm/md/lg/xl`（映射 `--radius`，默认 2px 紧凑风格），禁止写死圆角像素

## 颜色

- 见 `@rois/ui` 规范：一律用语义化 token（`bg-primary`/`text-muted-foreground` 等），**禁止**硬编码颜色值（Canvas 的 `--gantt-*` 变量除外）

## 对齐（Alignment）

图标 + 文字（标题、按钮、列表项、徽章）必须严格对齐，新组件要和现有组件视觉一致：

- **图标与文字同行必须用 `flex items-center`** 做垂直居中，**禁止**用 `mt-*`/`-translate-y-*` 等手动微调图标位置（拖拽指示器等动态定位除外）
- **间距按文字大小取标准 `gap`**：紧凑行（`text-2xs`/`text-xs`）用 `gap-1.5`；标题/标准行（`text-sm`/`text-base`）用 `gap-2`；**禁止** `gap-3` 及以上的过宽图标-文字间距和任意 `gap-[Npx]`
- **前导图标尺寸跟随文字**：配 `text-xs` 用 `h-3.5 w-3.5`，配 `text-sm`/`text-base` 用 `h-4 w-4`；图标一律加 `shrink-0`，避免文字 `truncate` 时挤压图标
- **装饰性前导图标默认 `text-muted-foreground`**，需要强调才用 `text-primary`；**禁止**用 `text-sidebar-primary` 给内容区图标上色（该 token 仅用于侧栏表面）
- **纯图标按钮**用 `inline-flex items-center justify-center` + 方形点击区（如 `h-7 w-7 p-0`）
- **内容面板/区块标题栏统一形态**：`flex h-10 shrink-0 items-center gap-2 border-b border-border px-4` + 前导图标 `h-4 w-4 shrink-0 text-muted-foreground` + 标题 `text-sm font-semibold text-foreground`（参照 `scenario-detail-panel` / `crew-bids-view`）

违反以上（魔法字号、写死字体/颜色/圆角、超档字重、图标错位/间距不一致）视同样式 bug，改到的地方必须顺手修正。

