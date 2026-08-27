# Scenario Gantt 复用架构设计

> Spec — 2026-06-14
> 目标：Scenario Gantt 最大幅度复用 Live Gantt，且后续 Live 新增功能能被 Scenario **编译期强制**复用；同时按场景类型（PO/RO/TO）门控可见 pane 与可编辑内容。

## 1. 背景与问题

当前 Scenario Gantt 与 Live Gantt 的复用状态（代码审查结论）：

**已复用 ✅**
- `PaneCanvas` / `PaneHeaderCanvas`（Pairing/Flight pane，commit `ffd7c4a1` 消除 ~900 行重复）
- `renderers/*`（base/roster/pairing/flight）、`base-interaction.ts`、`gantt-utils`、`gantt-constants`
- `timezone-store` / `column-store` / `ui-store`

**阻碍"自动复用"的三个结构性问题 ❌**

1. **override-props 是漏洞型抽象（最致命）**。`pane-canvas.tsx` 内部同时直接订阅 Live store（`useGanttViewStore`、`useTimezoneStore` 等）并接收 `scrollXOverride`/`scrollYOverride`/… 一组 override，用三元回退 `override ?? store`。每当 Live 给 `PaneCanvas` 加一个从 Live store 读的新特性，Scenario 会**静默拿到错误值**，除非有人记得新增 override prop 并在 3 个 scenario pane 逐个透传。TypeScript 不报错——这正是"后续加功能 Scenario 不会自动复用"的根因。
2. **Scenario Roster 整套 fork**。`scenario-roster-pane.tsx` 用自有的 `ScenarioGanttCanvas` + `ScenarioGanttLeftPanel`，完全不走共享组件；Live Roster 的 cross-pane 拖拽指派、右键菜单、违规 overlay、锁 overlay 完全不流到 Scenario；selection/排序/filter 逻辑重写了一遍。
3. **两套平行 store + fork 的外围件**。Live 单例 vs Scenario per-scenario 注册表；`ScenarioTimeAxis`/`ScenarioHorizontalScrollbar`/`ScenarioPaneToolbar`/`ScenarioLayoutGrid`/`ScenarioPanelSplitter` 均从 Live 复制改写，排序/筛选/freeze 逻辑两份实现。

## 2. 目标与范围

**目标**
- 展示/交互层（`gantt/src/components/gantt/**`）与具体数据来源彻底解耦，只读统一抽象 `GanttPaneSource`。
- 复用变成**编译期保证**：接口加字段 → Live 与 Scenario 两边都必须实现。
- 按场景类型门控可见 pane 与可编辑内容（本次实施 PO / RO；TO 仅在能力模型预留取值，不实施），业务规则**后端下发**，前端零硬编码。
- Scenario 支持编辑（RO 改派 Roster、PO 增删航段），**复用 Live 的 rule-check + 违规 overlay**。

**范围内**
- 前端复用架构（source 抽象 + Context 注入 + ESLint 守卫）。
- 能力模型（live-server `gantt-data` 下发 `capabilities`，由 `fileType` + `dictionary` 派生）。
- 编辑 UI + rule-check 接线；patch 模型扩展（roster + segment）。

**范围外（拆为协调的第二个 spec）**
- Scenario 优化班表"文件 → schema 入库"的后端数据模型设计。本 spec 在 API 边界**持久化无关**：交付到"前端产出 patch + live-server 接受契约 + 落盘桩（明确 TODO 指向第二个 spec）"为止。

**关键约束确认（来自需求澄清）**
- 计划范围：架构地基 + RO + PO 全部编辑。
- 能力源：后端下发（随 `gantt-data` 返回 `capabilities`）。
- 编辑时法规：复用 Live rule-check + 违规 overlay。
- 存储：拆为协调的第二个 spec，本 spec 不碰编辑真正落盘。

## 3. 架构总览（方案 A：单一 source 接口 + Context 注入）

```
        ┌─────────────────────────────────────────────┐
        │   Shared Gantt Components (presentation)       │
        │  PaneCanvas · PaneHeaderCanvas · base-          │
        │  interaction · time-axis · scrollbar · toolbar  │
        │  · renderers · drag-handler · context-menu ·    │
        │  violation-overlay                              │
        │  ── 只读 useGanttSource()，禁止 import 任何 store ──│
        └───────────────────────▲─────────────────────────┘
                                │ <GanttSourceProvider value={source}>
              ┌─────────────────┴──────────────────┐
       ┌──────┴───────┐                     ┌────────┴─────────┐
       │ LiveGanttSource │                  │ ScenarioGanttSource │
       │ 适配 zustand 单例 │                  │ 适配 per-scenario 注册表 │
       └──────┬───────┘                     └────────┬─────────┘
        Live stores                       scenario-gantt-store / layout-store
   (gantt-view/pane/roster/               + capabilities(后端下发) + patch model
    rule-check/draft/lock)
```

**铁律**：`gantt/src/components/gantt/**` 展示层组件禁止 import 任何具体 store，只能 `useGanttSource()`。由 ESLint `no-restricted-imports` 机器强制——这是"Live 加功能不会偷偷漏掉 Scenario"的根本保障。

候选方案对比与取舍：
- **方案 A（采纳）**：单一 `GanttPaneSource` + Context。编译期强制完整性 + 能力一等公民。一次性改动面大，用细粒度 selector hook 解决渲染性能。
- 方案 B（弃）：保留 store + 适配 hook（`usePaneViewport` 等按 mode 切换）。渐进但弱了完整性强制，仍可能漏 scenario 分支。
- 方案 C（弃）：统一 store 本身（Live 当 scenarioId=null 特例）。风险最高，Live 单例与 per-scenario 注册表生命周期本质不同。

## 4. `GanttPaneSource` 接口

```ts
interface GanttPaneSource {
  mode: 'live' | 'scenario'
  // ── viewport（细粒度 selector hook，避免 canvas 过度重渲染，契合 ref-based RAF）──
  useScrollX(): number
  useScrollY(paneId: string): number
  setScrollY(paneId: string, n: number): void
  usePxPerHour(): number
  useRange(): { start: Date; end: Date }
  useTimezone(): string
  useDirtySignal(): number
  markClean(): void
  // ── data ──
  useRows(paneId: string): PanelRowData[]
  useTasks(paneId: string): RenderableTask[]
  useFrozenRowCount(paneId: string): number
  useColumns(paneId: string): ColumnConfig[]
  // ── capabilities（后端下发，见 §5）──
  capabilities: GanttCapabilities
  // ── edit（能力门控；不可编辑场景为 undefined）──
  edit?: GanttEditController
  // ── violations（复用 Live rule-check；无则 undefined）──
  violations?: GanttViolationSource
}
```

要点：viewport/data 用按需订阅的 selector hook（非一次性大对象）；`edit`/`violations` 是可选能力——能力缺失时整段为 `undefined`，而不是散落的 `canEdit={false}` 与到处的兜底。

## 5. 能力模型（后端下发，门控 pane + 编辑）

`gantt-data` 返回体新增 `capabilities`，live-server 由 `fileType`（已存在：`'PO' | 'RO' | 'TO'`，`gantt-data` 顶层已返回）派生，阈值/映射走 `dictionary` 表（符合参数化规范）。

```ts
interface GanttCapabilities {
  panes: Array<'roster' | 'pairing' | 'flight'>     // 该场景允许出现的 pane
  roster: { canAssign: boolean; canRemove: boolean; canReassign: boolean }
  pairing: { canEditSegments: boolean }              // 增删航段
}
```

| 场景 (`fileType`) | panes | roster 编辑 | pairing 编辑 |
|---|---|---|---|
| **RO** | roster, pairing, flight | assign ✓ / remove ✓（删已优化）/ reassign ✓ | ✗（pairing 只读）|
| **PO** | **仅 pairing, flight** | —（无 roster pane）| canEditSegments ✓ |
| **TO** | **仅预留，本次不实施** | — | — |

**TO 范围说明**：本次 F8 项目不涉及 TO 的优化算法内容，TO 仅在能力模型里保留 `fileType` 取值与一份只读的最小默认（全 `false`），**不作为本 spec 的实施目标，也不写 TO 专属 e2e**。能力模型由 `dictionary` 配置驱动，将来接入 TO 优化时只需补配置 + 对应 e2e，无需改前端门控代码。

前端 `ScenarioLayoutStore.panes` 增删、pane 的 `canEdit`、context-menu 可用项、drag-handler 是否接受 drop —— 全部读 `capabilities`，前端零硬编码业务规则。PO 场景因 `panes` 不含 roster，roster pane 根本不渲染。

向后兼容：旧响应无 `capabilities` 时，前端按 `fileType` 用一份保守默认兜底（仅 fallback，不写业务规则分支）。

## 6. 编辑 + rule-check 接线

**`GanttEditController`（drag + context-menu 的统一出口）**
```ts
interface GanttEditController {
  execute(op: GanttEditOp): Promise<void>            // drag-handler.onDragComplete 转调；非法 op 在命中测试阶段拒绝 drop
  getContextActions(target: ContextTarget): ContextAction[]  // context-menu 不写死菜单项，向 source 要"当前允许的动作"
}

type GanttEditOp =
  | { type: 'roster-assign';   pairingId: number; toCrewId: string }
  | { type: 'roster-remove';   pairingId: number; crewId: string }
  | { type: 'roster-reassign'; pairingId: number; fromCrewId: string; toCrewId: string }
  | { type: 'pairing-add-segment';    pairingId: number; segment: SegmentInput }
  | { type: 'pairing-remove-segment'; pairingId: number; segmentId: number }
```

- **Live 实现**：`execute()` 走现有 `roster-store.moveTask` / `draft-store.addOp`，照旧。
- **Scenario 实现**：`execute()` → `scenarioGanttStore.addPatch()`（乐观更新 `pendingChanges`），op 映射到扩展后的 patch 模型（§7）。能力门控：`capabilities.roster.canReassign === false` 时 `execute` 拒绝，且 drag-handler 在 `onDropTargetChange` 阶段不高亮非法目标。

**rule-check 复用**——抽出 `GanttViolationSource`：
```ts
interface GanttViolationSource {
  useViolations(targetType: 'roster' | 'pairing' | 'crew', targetId: string): RuleViolation[]
  runPreCheck(affectedCrewIds: string[], simulated: RosterItem[], current?: RosterItem[]): Promise<PreCheckResult>
}
```
- `violation-overlay.ts` 的 `drawViolationBadge` / `drawCrewViolationIndicator` 改为从 `source.violations?.useViolations(...)` 取数。Live 接 `rule-check-store`；Scenario 接一个新的 per-scenario violation store，但**复用同一个** `ruleApi.batchCheck()` → 规则引擎 `POST /check/batch`（引擎侧零改动）。
- 编辑提交前，`execute()` 内部调 `source.violations?.runPreCheck(...)`，与 Live `pane-container.tsx` 现有时序一致。Scenario 的 `ruleSetId` 沿用用户选中的法规集合。

净效果：`drag-handler`、`context-menu`、`violation-overlay` 变成纯展示/交互层，编辑与校验差异全部落到两个 source 实现里。

## 7. 持久化无关的 API 边界

本 spec 只定 API 契约，不规定文件 vs DB。

**(a) `gantt-data` 返回体扩展**：顶层加 `capabilities: GanttCapabilities`。前端 `ScenarioGanttData` 类型同步加。向后兼容见 §5。

**(b) patch 模型扩展**——当前 `AssignmentPatch`（`op: 'add' | 'remove' | 'reassign'`，roster 级）升级为判别联合以容纳 PO 航段编辑：

```ts
type ScenarioPatch =
  | { kind: 'roster';  op: 'add' | 'remove' | 'reassign'; crewId: string; pairingId: number; toCrewId?: string }
  | { kind: 'segment'; op: 'add' | 'remove'; pairingId: number; segmentId?: number; segment?: SegmentInput }
```

- 向后兼容：`patch-output` body 仍是 `{ patches: ScenarioPatch[] }`；`kind` 缺省视为 `'roster'`，旧前端/旧数据不受影响。
- `segment` 类型的**服务端落盘逻辑属于第二个 spec**。本 spec 交付前端产出 `segment` patch + live-server 接受并校验该 op 的契约层，落盘以接口桩 + 明确 TODO 标注边界。

**(c) save 语义不变**：`scenarioGanttStore.save()` 仍是"提交 pendingChanges → 重拉 gantt-data"，`pendingChanges` 类型变为 `ScenarioPatch[]`。

## 8. 分阶段实施

单一 spec，拆成可独立验收、可分别合并的 5 个 phase。每 phase 必须带 Playwright/E2E 回执（§No-Illusion / §Playwright-Required）。

| Phase | 内容 | 验收点 |
|---|---|---|
| **P0-a 接口与守卫** | 定义 `GanttPaneSource` / `GanttCapabilities` / `GanttEditController` / `GanttViolationSource`；落 `LiveGanttSource`；加 ESLint `no-restricted-imports` 禁止展示层直连 store | Live Gantt 零回归（现有 e2e 全绿）；lint 规则生效 |
| **P0-b Pairing/Flight 迁移** | 两个已共享 canvas 的 pane 改走 source，删除 override props 透传 | 同一数据 Live/Scenario 渲染几何一致 e2e |
| **P1 Roster 收敛** | Scenario Roster 改用 `PaneCanvas`+`PaneHeaderCanvas`+`renderRosterTasks`；废弃 `ScenarioGanttCanvas`/`ScenarioGanttLeftPanel`；roster 排序/filter 去重 | 收敛前后行为像素级一致回归（selection/freeze/sort/列宽）|
| **P2 能力模型** | live-server `gantt-data` 下发 `capabilities`；前端 pane 可见性/编辑门控读 capabilities；PO 仅显示 pairing+flight | PO 场景无 roster pane、RO 有；门控 e2e |
| **P3 编辑 + rule-check** | `GanttEditController` 两实现；drag/context-menu/violation-overlay 经 source；patch 模型扩展；RO roster 改派 + PO 航段增删 + pre-check 违规 | RO 改派触发违规 badge、PO 增删航段、save 闭环（segment 落盘桩）e2e |

**依赖**：P3 的 segment 真正落盘依赖第二个 spec（scenario 入库）；本 spec 的 P3 交付到"前端产出 + live-server 接受契约 + 落盘桩"为止。P0/P1 与第二个 spec 完全解耦，可立即推进。

## 9. 测试策略

- **回归基线（防 fork 复发）**：新增 e2e —— 同一份 fixture 数据分别在 Live 与 Scenario 渲染，断言行高/条形 X 几何/列头一致（复用 `pane-canvas.tsx:235` 的 `publishRenderStats` 自省回执）。长期守卫，阻止"未来再次各写一套"。
- **每 phase 专属**：
  - P0：Live 全量 e2e 跑通（零回归证明）+ lint 规则单测。
  - P1：Scenario roster 收敛前后行为对照。
  - P2：`fileType=PO` → 断言 roster pane **不存在**且 pairing/flight 存在；`fileType=RO` → roster 存在；不可编辑场景右键无"删除"项。
  - P3：RO 拖拽改派 → 违规 badge 出现（一个"修复前会漏"的回归）；PO 航段增删 → 条形变化 + pending 计数；save → 重拉数据闭环。
- **单测**：能力派生（`fileType` → `capabilities`）在 live-server 用 Vitest；`GanttEditOp` → `ScenarioPatch` 映射纯函数单测。
- 遵守 CLAUDE.md 反模式：禁止只断言 `toBeVisible()`，必须断言具体数据/计数/几何。

## 10. 受影响文件（导航，非详尽）

- 新增：`gantt/src/components/gantt/source/` —— `gantt-pane-source.ts`(接口)、`live-gantt-source.ts`、`scenario-gantt-source.ts`、`gantt-source-context.tsx`
- 改造（去 store 直连）：`pane-canvas.tsx`、`pane-header-canvas.tsx`、`interactions/base-interaction.ts`、`interactions/drag-handler.ts`、`time-axis.tsx`、`violation-overlay.ts`、`roster/context-menu.tsx`
- 收敛/废弃：`scenario-gantt/scenario-gantt-canvas.tsx`、`scenario-gantt-left-panel.tsx`（P1 废弃）；`scenario-roster-pane.tsx` 改用共享件
- 后端：`live-server/src/services/scenario/scenario-gantt-service.ts`（capabilities 派生）、`scenario-patch-service.ts`（segment op）、`routes/scenario/scenario.ts`
- 类型：`gantt/src/types/scenario-gantt.ts`（capabilities、`ScenarioPatch`）

## 11. 版本号

按 CLAUDE.md 版本规则：前后端均改动 → 实现各 phase 时 `FRONTEND_VERSION` 与 `BACKEND_VERSION` 各 +1（纯 spec 文档本身不递增）。
