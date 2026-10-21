# UI Standards — full rule text

> Detail for §First-Paint, §Gantt-Unify, pop-up window standard, style/typography standard and §UI-Standard-Gate summarised in root `CLAUDE.md`. Moved here 2026-09-12.
> Full text refreshed 2026-10-22 from the pre-router root `CLAUDE.md`; edit rules here, not in a second copy.

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

## 前端语言规范

- **UI 默认语言为英文**：所有按钮、标签、占位符、提示文字、空态文案、弹框内容等，默认一律使用英文
- 中文仅在用户明确要求「显示中文」或配置了 i18n 语言为中文时才出现
- 代码注释、commit message、文档可以用中文；用户界面文字不行
- 违反此规范的中文 UI 字符串视同 bug，必须还原为英文

## 弹窗窗口标准（Pop-up Window Standard，强制执行）

> 全平台所有弹窗（gantt / pbs-portal / pbs-app / crew-app）共用同一套 Status-Card 外观，参考 `image/pop-up-window-template.png` 与 2026-09-13 的 status-card 设计稿。
> 完整规格见 `docs/superpowers/specs/2026-09-13-app-popup-standard-status-card-Ver1.md`。

唯一实现组件：

- Web（gantt / pbs-portal）：`@rois/ui` 的 **`AppDialog`**（`packages/ui/src/composites/app-dialog.tsx`，基于 Radix Dialog 原语）。**禁止**再直接用裸 `Dialog`/`AlertDialog` 拼装业务弹窗，也禁止用 Modal/Drawer/Popover/`createPortal` 自建弹窗框架（含模块内自研 frame；发现即改为委托 AppDialog）。
- crew-app（React Native）：**`components/v2/AppDialog.tsx`**。产品级提示/确认一律用它；`Alert.alert` 仅保留给 OS 级系统提示（钥匙串/权限等原生 sheet 才是正确交互的场景），且必须写明理由。

标准外观（必须齐备，具体 prop 见组件源码）：

1. **Tone 色带**置顶：`tone` 决定语义色，一律取主题 token，禁止硬编码颜色 —— `neutral`=`primary`、`success`=`success`（新增 token）、`warning`=`warning`（新增 token）、`destructive`=`destructive`。
2. **描边圆形图标**：`status` 变体居中大圆、`panel` 变体在色带左侧小圆 + 行内标题（数据录入类弹窗保持信息密度）。
3. **动作按钮在 body 内、居中 pill 排布**（不再有独立 footer 条）：取消为描边 pill、主操作为实心 pill；危险操作才用 `destructive`。
4. **右上角圆形关闭按钮**，骑跨卡片边角（白色圆盘 + 深色 ✕）。
5. 可拖拽（色带即拖拽把手）；`dismissable=false` 用于执行中的操作。
6. `variant`：消息/结果/确认类弹窗必须用 `variant="status"` + 对应 `tone`；仅数据表格/表单类弹窗保持 `panel`（可省略该 prop）。

新增弹窗一律走上述两个组件；若标准本身需要扩展，改组件而非在业务侧另起炉灶。


## 样式与排版标准（CSS / Typography Standard，强制执行）

> 适用于所有前端模块（gantt / pbs-portal / pbs-app / packages/ui）。改前端样式前**必读完整规范** `docs/architecture/ui-style-typography-standard.md`（字号刻度表、字重、间距、圆角、颜色、图标-文字对齐、面板标题栏形态）。Token 唯一来源：`packages/ui/src/styles/globals.css` 的 `@theme`。

强制要点：
- 字号只用 8 级 token（`text-3xs`/`2xs`/`xs`/`sm`/`base`/`lg`/`xl`/`2xl`），**禁止** `text-[Npx]`；成列数字用 `font-mono tabular-nums`；禁止自定义字体/写死 `font-family`。
- 字重只用 `font-normal`/`medium`/`semibold`/`bold`；间距走 Tailwind 刻度，圆角用 `rounded-sm/md/lg/xl`；颜色只用语义 token（Canvas `--gantt-*` 除外）。
- 图标+文字用 `flex items-center` + 标准 `gap`（`gap-1.5`/`gap-2`），图标 `shrink-0`，禁止手动微调位置。
- 违反即样式 bug；改到的地方必须顺手修正。

### §UI-Standard-Gate — 自动门禁（强制执行，团队 + AI agent 全员）

> 上述样式标准由 `scripts/check-ui-standard.mjs` 守护，**禁止靠自觉**。全文见 `docs/superpowers/specs/2026-06-15-rois-ui-standard-for-ai-agents-design.md`。

提交/推送前必跑 `npm run check:ui`，**硬违规必须为 0**：魔法字号 `text-[Npx]`、超档字重、写死圆角 `rounded-[Npx]`、任意字体族 `font-[...]`（扫描 `gantt/src` + `packages/ui/src`）。像素间距/内联 `fontFamily` 仅 WARN 不阻断（1px 边框补偿等合法例外）。豁免写 `ui-standard-ignore` / `ui-standard-ignore-next-line`，滥用视同违规。`.githooks/pre-push` 拦截硬违规推送；改动前端样式后必须运行 `npm run check:ui` 并在完成消息贴出 PASS 结果（§No-Illusion）。
