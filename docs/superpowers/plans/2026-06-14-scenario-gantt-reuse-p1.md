# Scenario Gantt 复用架构 — P1 实施计划（Roster 收敛到共享 PaneCanvas）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Scenario Roster pane 从 fork 的 `ScenarioGanttCanvas` + `ScenarioGanttLeftPanel` 收敛到共享 `PaneCanvas` + `PaneHeaderCanvas` + `renderRosterTasks` + `createPaneInteractionHandler`，与 Live roster 走同一套；废弃两个 fork 组件；roster item 构建提取为可复用 builder。**只读行为零变更**（scenario roster 当前 `canEdit=false`，无编辑路径）。

**Architecture:** 沿用 P0 的 `GanttPaneSource` 抽象。Scenario Roster pane 改为：① 用 `useScenarioGanttSource(scenarioId)` 包 `<GanttSourceProvider>`；② 用一个 memoized builder（提取自 `scenario-gantt-canvas.tsx` 的 `buildEffectiveAssignments`+`buildRosterItems`）产出 `RosterItem[]` + `itemsByCrew`，喂给 `<PaneCanvas>` 的 `renderContent` 回调（内部调 `renderRosterTasks`）；③ 左面板换成 `<PaneHeaderCanvas>`（pairing/flight pane 已用）；④ 交互用 `createPaneInteractionHandler`（只读 hover/select 回调，无 drag / 无 edit context-menu）。

**Tech Stack:** React 19 + Vite + TS + Zustand；Vitest；Playwright e2e。

**上游 spec:** `docs/superpowers/specs/2026-06-14-scenario-gantt-reuse-design.md` §8 phase P1。**前置:** P0 已合并（source 抽象 + scenario pairing/flight 已迁移 + scenario-layout-store per-pane scrollY + 守卫测试）。

## 两个关键设计决策（已定，计划据此实施）

1. **Item-ID 稳定性**：当前 `buildRosterItems` 用递增 `idCounter`，patch 变化时 id 漂移 → 选中态错乱、hit-test 不稳。**改为确定性复合 id**：`item.id = stableRosterItemId(crewId, pairingId, dutySeq, segSeq, groundKey)`，用一个稳定的数值哈希（同一逻辑项跨帧/跨 patch 恒定）。这样 `selectedTaskIds`（Set<number>）和 `hitTestTask` 在 patch 变化后仍正确。
2. **Hit-test 边界**：当前 scenario `hitPairing` 用**整环 bounds**（覆盖 layover 间隙）；Live 用 `hitTestTask` 的 **item bounds**。P1 **收敛到 Live 的 `hitTestTask`**（一致性优先；layover 间隙不再命中是可接受的细微变化，且与 Live 一致）。read-only 下仅影响"点空隙是否选中环"，无功能损失。

## 文件结构（本计划新增/修改/删除）

新增：
- `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts` — 提取 `buildEffectiveAssignments` + `buildRosterItems` + `stableRosterItemId`（纯函数，可单测、可复用）
- `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts` — builder 单测（含 id 稳定性、patch 应用）

修改：
- `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` — 改用 PaneCanvas + PaneHeaderCanvas + GanttSourceProvider + createPaneInteractionHandler；scrollY 入 layout-store；用提取的 builder
- `gantt/src/components/gantt/source/__tests__/no-store-imports.guard.test.ts` — 从 allowlist 移除 `roster-renderer.ts`?（不——roster-renderer 仍被 Live 用且仍直连 store？核对：若 roster-renderer 不 import store 则它本就不在 allowlist；本计划不动它）

删除（P1-c，全部引用切走后）：
- `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx`
- `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx`

---

## Task 1: 提取确定性 roster-item builder（纯函数 + 单测）

把 `scenario-gantt-canvas.tsx` 内的 `buildEffectiveAssignments` 和 `buildRosterItems` 提取为独立纯函数文件，并把 item id 改为确定性复合哈希。

**Files:**
- Create: `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`
- Create: `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts`

- [ ] **Step 1: 先读现有实现**

Read `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` 的 `buildEffectiveAssignments`（约 57–74 行）与 `buildRosterItems`（约 76–210 行）完整实现，以及 `gantt/src/types/roster.ts` 的 `RosterItem` 与 `gantt/src/types/scenario-gantt.ts` 的 `ScenarioGanttAssignment`/`ScenarioGanttPairing`/`ScenarioGanttPairingSegment`/`ScenarioGanttGroundItem`。提取时**逐字段保持**现有 RosterItem 构建逻辑，唯一改动是 id 生成。

- [ ] **Step 2: 写 builder 文件（含确定性 id）**

把两个函数原样搬入新文件并导出；新增 `stableRosterItemId`。`buildRosterItems` 内每处 `id: idCounter++` 改为 `id: stableRosterItemId(...)`。确定性 id 用 32-bit FNV-1a 哈希一个唯一键：

```ts
// gantt/src/components/scenario-gantt/build-scenario-roster-items.ts
import type { RosterItem } from '@/types/roster'
import type {
  ScenarioGanttAssignment, ScenarioGanttPairing,
  ScenarioGanttPairingSegment, ScenarioGanttGroundItem,
} from '@/types/scenario-gantt'
import type { AssignmentPatch } from '@/types/scenario-gantt'

/** 同一逻辑 roster 项跨帧/跨 patch 恒定的数值 id（FNV-1a 32-bit）。
 *  键唯一标识一个项：crewId + pairingId(或 'G') + dutySeq + segSeq + fltId。 */
export function stableRosterItemId(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // 取正整数（>>> 0），避免负数 id 干扰 Set<number> 语义
  return h >>> 0
}

export function buildEffectiveAssignments(
  assignments: ScenarioGanttAssignment[],
  pendingChanges: AssignmentPatch[],
): ScenarioGanttAssignment[] {
  // …逐字段照搬 scenario-gantt-canvas.tsx 现有实现（remove/add/reassign）…
}

export interface BuiltRosterItems {
  items: RosterItem[]
  itemsByCrew: Map<string, RosterItem[]>
}

export function buildScenarioRosterItems(args: {
  crew: { crewId: string }[]
  pairingMap: Map<number, ScenarioGanttPairing>
  assignments: ScenarioGanttAssignment[]
  pairingSegments: ScenarioGanttPairingSegment[]
  groundItems: ScenarioGanttGroundItem[]
  pendingChanges: AssignmentPatch[]
}): BuiltRosterItems {
  // …照搬 buildRosterItems，但每个 item 的 id 用 stableRosterItemId(key)：
  //   - 航段项 key = `${crewId}|${pairingId}|${dutySeq}|${segSeq}|${fltId ?? ''}`
  //   - 无段环项 key = `${crewId}|${pairingId}|whole`
  //   - 地面项   key = `${crewId}|G|${groundItem 的唯一字段，如 assignmentGroup+schStrDtUtc}`
  // itemsByCrew 同步分桶。
}
```
> 提取时务必把现有 buildRosterItems 的全部分支（有段/无段/地面）和全部 RosterItem 字段原样保留——只换 id。若现有实现引用了模块内 helper（如 `parseIsoCached`），一并 import。

- [ ] **Step 3: 写单测**

```ts
// __tests__/build-scenario-roster-items.test.ts
import { describe, it, expect } from 'vitest'
import { buildEffectiveAssignments, buildScenarioRosterItems, stableRosterItemId } from '../build-scenario-roster-items'

describe('stableRosterItemId', () => {
  it('is deterministic and non-negative', () => {
    const a = stableRosterItemId('C1|100|1|1|500')
    const b = stableRosterItemId('C1|100|1|1|500')
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(stableRosterItemId('C1|100|1|1|500')).not.toBe(stableRosterItemId('C1|100|1|2|501'))
  })
})

describe('buildEffectiveAssignments', () => {
  const base = [{ crewId: 'C1', pairingId: 100, source: 'OPT' }] as never[]
  it('applies remove', () => {
    expect(buildEffectiveAssignments(base, [{ op: 'remove', crewId: 'C1', pairingId: 100 }] as never)).toHaveLength(0)
  })
  it('applies reassign', () => {
    const r = buildEffectiveAssignments(base, [{ op: 'reassign', crewId: 'C1', pairingId: 100, toCrewId: 'C2' }] as never)
    expect(r[0].crewId).toBe('C2')
  })
})

describe('buildScenarioRosterItems — id stability across pending changes', () => {
  // 构造最小 fixture：1 crew、1 pairing（带 1 段）。
  // 断言：同一项在 pendingChanges 为 [] 与为 [无关 add] 两种情况下 id 相同
  //（证明 id 不随 patch 集合漂移——回归当前 idCounter 漂移 bug 的根因）。
  it('keeps the same item id when an unrelated pending change is added', () => {
    // …构造 fixture，调用两次 buildScenarioRosterItems，比对目标项 id 相等…
    expect(true).toBe(true) // 占位：实现时替换为真实 fixture 断言（禁止保留此行）
  })
})
```
> 实现者：第三个测试必须用真实最小 fixture 比对 id，删除占位行（§No-Illusion）。

- [ ] **Step 4: 跑测试**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx vitest run src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts`
Expected: 全绿。

- [ ] **Step 5: 类型检查**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep build-scenario-roster-items`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/scenario-gantt/build-scenario-roster-items.ts gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts
git commit -m "feat(gantt): 提取 scenario roster item builder + 确定性 stableRosterItemId"
```

---

## Task 2: Scenario Roster pane 左面板换 PaneHeaderCanvas

先迁移**低风险**的一半：左面板从 `ScenarioGanttLeftPanel` 换成共享 `PaneHeaderCanvas`（scenario pairing/flight pane 已用同一组件，有成熟范式可抄）。canvas 暂时仍用 `ScenarioGanttCanvas`（Task 3 再换），所以本步**先包 GanttSourceProvider**（PaneHeaderCanvas 需要 source）。

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`

- [ ] **Step 1: 读范式**

Read `gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx`（P0 已迁移，看它如何用 `useScenarioGanttSource` + `<GanttSourceProvider>` + `<PaneHeaderCanvas leftPanelWidth=... paneId={paneId} onWheel=...>`），以及 `gantt/src/components/panes/roster-pane.tsx` 的 `<PaneHeaderCanvas>` 用法（roster 列、`onRowClick` 用 rowIndex、`onUnfreezeRow`、`bottomRowKey="crewName"`）。Read 当前 `scenario-roster-pane.tsx` 全文。

- [ ] **Step 2: 引入 source + Provider；scrollY 入 store**

- 新增 import：`GanttSourceProvider` / `useScenarioGanttSource`。
- 组件体顶部加 `const source = useScenarioGanttSource(scenarioId)`（在 `if (!data) return` 之前，hook 顺序稳定）。
- 删除局部 `const [scrollY, setScrollY] = useState(0)`；scrollY 改由 layout-store 经 source 管：订阅值 `const scrollY = source.useScrollY(paneId)`；写入用 `source.setScrollY(paneId, n)`。
- 把含左面板 + canvas 的 JSX 子树用 `<GanttSourceProvider value={source}>…</GanttSourceProvider>` 包裹。

- [ ] **Step 3: PaneHeaderCanvas 替换 ScenarioGanttLeftPanel**

把 `<ScenarioGanttLeftPanel .../>` 换成：
```tsx
<PaneHeaderCanvas
  paneId={paneId}
  paneType="scenario-roster"
  columns={visibleColumns}
  rows={panelRows}
  frozenRowCount={frozenRowCount}
  selectedRowIndices={selectedRowIndices}   // ← 见 Step 4：从 selectedCrewIds 映射成行索引 Set<number>
  sortColumn={sortColumn}
  sortDirection={sortDirection}
  leftPanelWidth={leftPanelWidth}
  bottomRowKey="crewName"
  onColumnHeaderClick={handleSort}
  onColumnWidthChange={handleColumnWidthChange}
  onWheel={(deltaY) => {
    const cur = source.getScrollY(paneId)
    const maxY = Math.max(0, panelRows.length * ROW_HEIGHT - (/* canvas 高度，复用现有计算 */ 0))
    source.setScrollY(paneId, Math.max(0, cur + deltaY)) // clamp 同 pairing pane 范式
  }}
  onRowClick={(rowIndex, ctrlKey, shiftKey) => handleRowClickByIndex(rowIndex, ctrlKey, shiftKey)}
  onUnfreezeRow={(rowId) => handleUnfreezeRow(rowId)}
/>
```
注意：`PaneHeaderCanvas.onRowClick` 给的是 **rowIndex**（不是 crewId）。现有 `handleRowClick(crewId, …)` 需包一层 `handleRowClickByIndex`：`const crewId = panelRows[rowIndex]?.rowId; if (crewId) handleRowClick(crewId, ctrlKey, shiftKey)`。`PaneHeaderCanvas` 不暴露 `onFreezeRow`/`onColumnVisibilityChange`/`onScrollY`（它内部经 source 管 scrollY；freeze 通过 pin-click→`onUnfreezeRow`，新增 freeze 入口若现有 UI 需要则保留在别处——核对当前 freeze 触发点，若仅靠 pin 图标 unfreeze 则 freeze 入口在右键或别处，保持现状）。`ROW_HEIGHT` 从 `gantt-constants` import。

- [ ] **Step 4: selectedRowIndices 映射**

`PaneHeaderCanvas` 高亮用 `selectedRowIndices: Set<number>`（行索引），而 scenario roster 现有 `selectedCrewIds: Set<string>`。新增 memo：
```ts
const selectedRowIndices = useMemo(() => {
  const s = new Set<number>()
  panelRows.forEach((r, i) => { if (selectedCrewIds.has(r.rowId)) s.add(i) })
  return s
}, [panelRows, selectedCrewIds])
```

- [ ] **Step 5: 类型检查（canvas 仍是旧的，预期它现在拿 scrollY 的方式要兼容）**

`ScenarioGanttCanvas` 仍在用，且它接收 `scrollY` prop。本步 scrollY 来源已改为 `source.useScrollY(paneId)`，把这个 `scrollY` 继续传给 `<ScenarioGanttCanvas scrollY={scrollY} onScrollY={(y)=>source.setScrollY(paneId,y)} onScrollYChange={(y)=>source.setScrollY(paneId,y)} />`。其余 ScenarioGanttCanvas props 不变。
Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep scenario-roster-pane`
Expected: 无错误。

- [ ] **Step 6: e2e 冒烟（左面板渲染正确）**

Run: `cd /home/yuan.z/rois/rois-ai && GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-source-geometry --reporter=line`（若该 spec 不覆盖 roster pane，本步先靠 tsc + 构建；roster 专项 e2e 在 Task 4 加）
Expected: 现有绿（不回归）。

- [ ] **Step 7: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-roster-pane.tsx
git commit -m "refactor(gantt): Scenario Roster 左面板换共享 PaneHeaderCanvas + GanttSourceProvider，scrollY 入 layout-store"
```

---

## Task 3: Scenario Roster canvas 换 PaneCanvas + renderRosterTasks + base-interaction

替换核心 canvas。这是 P1 最大风险步。

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`

- [ ] **Step 1: 读目标范式**

Read `gantt/src/components/panes/roster-pane.tsx` 的：`renderContent`（构建 `RosterRenderContext` + `renderRosterTasks`）、`getHitTest`（`hitTestTask`）、`interactionCallbacks`（onItemClick/onItemHover/onBackgroundClick/onScroll/onZoom；scenario 不要 onDragStart/右键编辑）、`handleCanvasReady`（`createPaneInteractionHandler` + attach；scenario 不要 crossPaneDrag.registerPane）。Read `gantt/src/components/gantt/renderers/roster-renderer.ts` 的 `RosterRenderContext` 与 `buildRosterRenderBuckets`（若存在，scenario 也用以提速）。Read `gantt/src/components/gantt/interactions/base-interaction.ts` 的 `createPaneInteractionHandler` / `PaneInteractionCallbacks` / `HitTestResult`。

- [ ] **Step 2: 用 builder 产出 items（memoized）**

在 pane 内：
```ts
const built = useMemo(() => buildScenarioRosterItems({
  crew: orderedCrew, pairingMap, assignments: data.assignments,
  pairingSegments: data.pairingSegments, groundItems: data.groundItems,
  pendingChanges,
}), [orderedCrew, pairingMap, data.assignments, data.pairingSegments, data.groundItems, pendingChanges])
const crewIds = useMemo(() => orderedCrew.map((c) => c.crewId), [orderedCrew])
// itemsByCrewRef 仍供选中反查（task→crew）；用 built.itemsByCrew 填充
itemsByCrewRef.current = built.itemsByCrew
```

- [ ] **Step 3: renderContent 回调**

```ts
const renderContent = useCallback((ctx: CanvasRenderingContext2D, base: BaseRenderContext) => {
  const rc: RosterRenderContext = {
    ...base,
    crewIds,
    items: built.items,
    itemsByCrew: built.itemsByCrew,
    selectedTaskIds,
    hoveredTaskId: null,
    violationMap: EMPTY_VIOLATION_MAP,   // 只读 P1：空（P3 接 rule-check）
    lockMap: EMPTY_LOCK_MAP,             // 空
    timezone,
    crewSessionTags: EMPTY_SESSION_TAGS, // 空
    showSessionTags: false,
  }
  renderRosterTasks(rc)
}, [crewIds, built, selectedTaskIds, timezone])
```
模块顶部定义稳定空常量：`const EMPTY_VIOLATION_MAP = new Map<number, number>()` 等（避免每帧新建 Map churn render 身份）。

- [ ] **Step 4: hit-test（收敛到 hitTestTask）**

```ts
const getHitTest = useCallback(() => (cx: number, cy: number): HitTestResult | null => {
  const sX = source.getScrollX()
  const sY = source.getScrollY(paneId)
  const pph = source.usePxPerHour ? /* 用 getState 等价 */ getScenarioGanttStore(scenarioId).getState().pxPerHour : 0
  // 复用 Live 的 hitTestTask(items, crewIds, rangeStart, pxPerHour, frozenRowCount, itemsByCrew, sX, sY)
  // —— 参照 roster-pane.tsx getHitTest 的参数顺序逐一对齐。
  return hitTestTask(/* … */)
}, [source, paneId, scenarioId, /* rangeStart 等 */])
```
> 实现者：严格对照 `roster-pane.tsx` 的 `getHitTest` 参数与 `gantt-utils.hitTestTask` 签名；用 `source.getScrollX()/getScrollY(paneId)` 取即时滚动值，`pxPerHour`/`rangeStart` 取自 scenario store（getState）。

- [ ] **Step 5: 只读交互回调 + attach**

```ts
const interactionCallbacks = useMemo((): PaneInteractionCallbacks => ({
  onItemClick: (hit, ctrlKey) => { /* toggle/single select hit.itemId → setSelectedTaskIds + 反查 crew */ handleSelectTasksFromHit(hit, ctrlKey) },
  onItemDoubleClick: () => {},          // 只读：无 pairing-info 弹窗（或保留打开 pairing-info，按现状决定）
  onItemRightClick: () => {},           // 只读：无编辑菜单（P3 接 capability-gated 菜单）
  onItemHover: (hit) => { /* setStatusBarText，参照现有 scenario-pairing-pane onItemHover */ },
  onDragStart: () => {}, onDragMove: () => {}, onDragEnd: () => {},
  onBackgroundClick: () => { setSelectedTaskIds(new Set()); setSelectedCrewIds(new Set()) },
  onScroll: (dx, dy) => {
    if (dx !== 0) getScenarioGanttStore(scenarioId).getState().setScrollX(/* clamp */ )
    if (dy !== 0) { const cur = source.getScrollY(paneId); source.setScrollY(paneId, Math.max(0, cur + dy)) } // clamp 同范式
  },
  onZoom: (dir) => { const st = getScenarioGanttStore(scenarioId).getState(); st.setZoom(st.pxPerHour * (dir === 'in' ? 1.1 : 0.9)) },
}), [scenarioId, paneId, source /* + 选中/状态栏依赖 */])
```
`handleCanvasReady`：`const handler = createPaneInteractionHandler('scenario-roster', getHitTest, interactionCallbacks); handler.attach(canvas)`。**不** registerPane（无 cross-pane drag）。`handleCanvasDestroy`：`handler.detach()`。

- [ ] **Step 6: 替换 JSX — ScenarioGanttCanvas → PaneCanvas**

```tsx
<PaneCanvas
  paneId={paneId}
  paneType="scenario-roster"
  canvasTestId="scenario-roster-canvas"
  totalRows={crewIds.length}
  frozenRowCount={frozenRowCount}
  dropTargetRow={-1}
  selectedRowIndices={selectedRowIndices}
  renderContent={renderContent}
  onCanvasReady={handleCanvasReady}
  onCanvasDestroy={handleCanvasDestroy}
/>
```
（viewport 全由 `<GanttSourceProvider>` 注入的 scenario source 提供；不再传任何 scrollX/scrollY/pxPerHour。）确认 `'scenario-roster'` 是 `PaneType` 合法值；若不是，在 `@/types/pane` 增加该枚举值，并确认 PaneCanvas/PaneHeaderCanvas 的 headerHeight/rowHeight 对 `scenario-roster` 走默认（28/40），与原 ScenarioGanttCanvas 行高一致（核对原行高常量）。

- [ ] **Step 7: 类型检查 + 单测 + 守卫**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -vE "node:fs|node:path|node:url"` → 干净。
Run: `npx vitest run src/components/gantt/source/ src/components/scenario-gantt/` → 全绿（guard 测试仍过；scenario-roster-pane 不直连 store——它在 `components/scenario-gantt/`，不受 guard 约束，但仍应整洁）。

- [ ] **Step 8: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-roster-pane.tsx
git commit -m "refactor(gantt): Scenario Roster canvas 换共享 PaneCanvas + renderRosterTasks + base-interaction（只读）"
```

---

## Task 4: 删除 fork 组件 + roster 收敛回归 e2e

**Files:**
- Delete: `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx`
- Delete: `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx`
- Create: `e2e/tests/gantt/scenario-roster-shared-canvas.spec.ts`

- [ ] **Step 1: 确认无残留引用**

Run: `cd /home/yuan.z/rois/rois-ai && grep -rn "ScenarioGanttCanvas\|ScenarioGanttLeftPanel\|scenario-gantt-canvas\|scenario-gantt-left-panel" gantt/src` → 仅应剩将删的两文件自身（及可能的 index 导出）。把任何残留 import 清掉。

- [ ] **Step 2: 删除两个 fork 文件**

```bash
git rm gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx
```

- [ ] **Step 3: tsc + build 全绿**

Run: `cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -vE "node:fs|node:path|node:url"` → 干净。
Run: `npm run build 2>&1 | tail -4` → 成功。

- [ ] **Step 4: 写 roster 收敛回归 e2e**

```ts
// e2e/tests/gantt/scenario-roster-shared-canvas.spec.ts
// 断言 Scenario Roster pane 经共享 PaneCanvas 渲染（render-stats paneType 'scenario-roster' 非零行），
// 且默认布局打开 scenario id 6（RO DONE 'RO-2026-06 YEG Test---'）后 roster pane 出现。
// 参照 scenario-source-geometry.spec.ts 的 mock + 导航范式（GANTT_TEST_PASS=admin123）。
// 标题用 main 新约定 Scen-2xxx 前缀。
// 断言具体值：scenario-roster-canvas 可见 + render-stats 'scenario-roster' totalRows > 0；
// 选中一行后 selectedRowIndices 生效（行高亮）——用一个可断言的 UI 信号。
```
> 实现者：照 `scenario-source-geometry.spec.ts` 的 helper/mock/导航；mock 的 gantt-data 要含 crew + assignments + 至少 1 个带段 pairing，使 roster 渲染非零行。断言具体计数（§No-Illusion / CLAUDE.md 反模式）。

- [ ] **Step 5: 跑 e2e（需 stack + admin123）**

Run: `cd /home/yuan.z/rois/rois-ai && GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-roster-shared-canvas --reporter=line`
Expected: PASS。粘贴汇总（§No-Illusion）。同时跑 `scenario-source-geometry pane-scoped-render pairing-pane.spec` 确认零回归。

- [ ] **Step 6: 版本号 + Commit**

`gantt/src/version.ts` `FRONTEND_VERSION` +1（纯前端）。
```bash
git add gantt/src/version.ts e2e/tests/gantt/scenario-roster-shared-canvas.spec.ts
git commit -m "refactor(gantt): 删除 fork 的 ScenarioGanttCanvas/LeftPanel；roster 收敛回归 e2e；FRONTEND_VERSION +1"
```

---

## 收尾验证（全计划完成后）

- [ ] `cd gantt && npx tsc --noEmit` → 干净
- [ ] `cd gantt && npx vitest run` → 全绿
- [ ] `cd gantt && npm run build` → 成功
- [ ] `GANTT_TEST_PASS=admin123 npm --prefix e2e run test:gantt -- scenario-roster-shared-canvas scenario-source-geometry pane-scoped-render --reporter=line` → 全绿
- [ ] `grep -rn "ScenarioGanttCanvas\|ScenarioGanttLeftPanel" gantt/src` → 无结果（fork 已彻底移除）
- [ ] 粘贴上述 PASS 汇总

## 风险与回滚

- **最大风险**：item-id 稳定性 / hit-test 收敛导致选中或 hover 行为细微变化。缓解：Task 1 单测锁 id 稳定性；Task 3 后用 e2e 验证选中高亮；逐 Task commit 可回滚。
- **行高/headerHeight**：`scenario-roster` paneType 必须映射到与原 ScenarioGanttCanvas 一致的 ROW_HEIGHT(28)/HEADER_HEIGHT(40)；Task 3 Step 6 已要求核对。
- **scenario roster 的 onDoubleClick/onRightClick**：P1 设为只读 no-op；若产品当前依赖双击打开 pairing-info，则在 onItemDoubleClick 保留 `useUiStore.getState().openPairingInfo(pairingId)`（核对现状再定）。

## 后续（不在本计划）

- **P2**：live-server `gantt-data` 下发 `capabilities`，前端 pane 可见性/编辑门控读 capabilities。
- **P3**：编辑 + rule-check 接线（含 `violations` 接入 renderContext 的 violationMap/lockMap；注意 `violations?.useViolations` 是 hook，不能条件调用——设计成恒存在+空默认或无条件调用）。
