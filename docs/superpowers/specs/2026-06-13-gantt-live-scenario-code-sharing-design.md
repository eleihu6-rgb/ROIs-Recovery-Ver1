# Gantt Live ↔ Scenario Code Sharing Architecture

**Date:** 2026-06-13  
**Status:** Draft — pending review  
**Scope:** `gantt/src/components/panes/` · `gantt/src/components/gantt/` · `gantt/src/components/scenario-gantt/`

---

## Problem

Any feature added to the live gantt (new toolbar button, new context menu item, new canvas indicator, new keyboard shortcut) must also be manually replicated in the scenario gantt. The three pane pairs are near-identical in logic but wired to completely different stores:

| Pair | Live file | Scenario file |
|------|-----------|---------------|
| Roster pane | `panes/roster-pane.tsx` | `scenario-gantt/scenario-roster-pane.tsx` |
| Pairing pane | `panes/pairing-pane.tsx` | `scenario-gantt/scenario-pairing-pane.tsx` |
| Canvas | `gantt/pane-canvas.tsx` | `scenario-gantt/scenario-gantt-canvas.tsx` |

### What is already shared (no change needed)

| Layer | Shared? |
|-------|---------|
| `renderers/base-renderer.ts`, `renderers/roster-renderer.ts` | ✅ 100% |
| `gantt-constants.ts`, `gantt-utils.ts` | ✅ 100% |
| `interactions/base-interaction.ts`, `drag-context.tsx` | ✅ 100% |
| `panes/pane-toolbar.tsx`, `panes/pane-condition-strip.tsx` | ✅ Partial |
| `stores/timezone-store`, `column-store`, `reference-store` | ✅ 3 of 15 |

### What is duplicated (root cause)

The pane components import directly from view-specific stores:

```
roster-pane.tsx imports:
  useRosterStore · useCrewStore · useGanttViewStore · usePaneStore
  useFlightStore · useFlightCompositionStore · useAirportTzStore
  useLockStore · useRuleCheckStore · useFilterStore · ...

scenario-roster-pane.tsx imports:
  getScenarioGanttStore(scenarioId) · getScenarioLayoutStore(scenarioId)
  + 12 local useState hooks (scrollY, selectedCrewIds, sortColumn, ...)
```

Because the stores are imported directly, the pane component **is** the store wiring. Every UI feature embedded in the component is duplicated.

---

## Goal

> Feature changes to pane UI (toolbar, context menu, canvas, keyboard) happen **once** and are automatically reflected in both live and scenario gantt.

---

## Architecture: Three-Layer Adapter Pattern

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1 — Adapters  (thin, boring; one per pane × view)     │
│                                                              │
│  useLiveRosterAdapter(paneId)   useScenarioRosterAdapter(id) │
│  useLivePairingAdapter(paneId)  useScenarioPairingAdapter(id)│
│  useLiveFlightAdapter(paneId)   useScenarioFlightAdapter(id) │
│                                                              │
│  Each adapter maps its native store(s) → GanttPaneAdapter    │
└──────────────────┬───────────────────────┬───────────────────┘
                   │ same interface        │ same interface
┌──────────────────▼───────────────────────▼───────────────────┐
│  Layer 2 — Shared Pane Shell  (all UI features live here)    │
│                                                              │
│  <RosterPaneShell adapter={…} />                             │
│  <PairingPaneShell adapter={…} />                            │
│  <FlightPaneShell adapter={…} />                             │
│                                                              │
│  toolbar · quick-filter · sort · context menu                │
│  condition strip · keyboard shortcuts · row selection        │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│  Layer 3 — Unified Canvas  (pane-canvas.tsx with overrides)  │
│                                                              │
│  Already has: scrollXOverride, scrollYOverride,              │
│  pxPerHourOverride, rangeStartOverride, dirtySignal,         │
│  onScrollYChange                                             │
│  → scenario-gantt-canvas becomes a ~40-line wrapper          │
└──────────────────────────────────────────────────────────────┘
```

---

## Layer 1 — GanttPaneAdapter Interface

```typescript
// gantt/src/adapters/gantt-pane-adapter.ts

export interface GanttPaneAdapter {
  // ── Data ──────────────────────────────────────────────────
  rows: RosterRow[]           // normalized, same shape in both views
  totalCount: number
  loading: boolean

  // ── Viewport ──────────────────────────────────────────────
  zoom: number                // pxPerHour
  scrollX: number
  scrollY: number
  rangeStart: Date
  rangeEnd: Date
  timezone: string

  // ── Sort / Filter ─────────────────────────────────────────
  sortColumn: string | null
  sortDir: 'asc' | 'desc'
  quickFilter: QuickFilterState
  activeFilter: ActiveFilterSummary | null

  // ── Row state ─────────────────────────────────────────────
  frozenRowIds: Set<string>
  selectedRowIds: Set<string>
  foundRowIds: Set<string>    // label search results

  // ── Canvas overlays (optional — undefined in scenario) ───
  violations?: ViolationMap
  locks?: LockMap
  crewStats?: CrewStatsMap

  // ── Actions ──────────────────────────────────────────────
  setSort(col: string, dir: 'asc' | 'desc'): void
  setScrollY(y: number): void
  setScrollX(x: number): void
  setZoom(pxPerHour: number): void
  freezeRow(id: string): void
  unfreezeRow(id: string): void
  toggleRowSelection(id: string): void
  selectRowRange(fromId: string, toId: string): void
  openFilter(): void
  openTaskDetail(taskId: number): void
  openContextMenu(event: MouseEvent, payload: ContextMenuPayload): void
}
```

**Why `violations?` and `locks?` are optional rather than excluded:** scenario panes can render them as empty maps and the canvas renderers already handle missing values gracefully. This avoids a conditional branch in the shell.

---

## Layer 1 — Adapter Implementations

### Live Roster Adapter (maps ~20 store hooks → GanttPaneAdapter)

```typescript
// gantt/src/adapters/live-roster-adapter.ts

export function useLiveRosterAdapter(paneId: string): GanttPaneAdapter {
  const rosterItems   = useRosterStore(s => s[paneId].rosterItems)
  const loading       = useRosterStore(s => s[paneId].loading)
  const pxPerHour     = useGanttViewStore(s => s.pxPerHour)
  const scrollX       = useGanttViewStore(s => s.scrollX)
  const scrollY       = useLayoutStore(s => s.panes.get(paneId)?.viewport?.scrollY ?? 0)
  const frozenRowIds  = usePaneStore(s => s.getFrozenRowIds(paneId))
  const selectedRowIds = usePaneStore(s => s.getSelectedRowIds(paneId))
  const violations    = useRuleCheckStore(s => s.violations)
  const locks         = useLockStore(s => s.locks)
  // ... rest of mapping

  return useMemo(() => ({
    rows: rosterItems,
    loading,
    zoom: pxPerHour,
    scrollX,
    scrollY,
    frozenRowIds,
    selectedRowIds,
    violations,
    locks,
    setScrollY: (y) => useLayoutStore.getState().setScrollY(paneId, y),
    toggleRowSelection: (id) => usePaneStore.getState().toggleRowSelection(paneId, id),
    // ...
  }), [/* deps */])
}
```

### Scenario Roster Adapter (maps scenario store + local state → GanttPaneAdapter)

```typescript
// gantt/src/adapters/scenario-roster-adapter.ts

export function useScenarioRosterAdapter(
  scenarioId: number,
  // local state passed in from the thin wrapper component
  localState: ScenarioLocalState,
  localActions: ScenarioLocalActions,
): GanttPaneAdapter {
  const store    = getScenarioGanttStore(scenarioId)
  const data     = store(s => s.data)
  const pxPerHour = store(s => s.pxPerHour)
  const scrollX  = store(s => s.scrollX)
  const layout   = getScenarioLayoutStore(scenarioId)

  return useMemo(() => ({
    rows: data?.crew ?? [],
    loading: !data,
    zoom: pxPerHour,
    scrollX,
    scrollY: localState.scrollY,
    frozenRowIds: layout(s => s.panes.get(localState.paneId)?.frozenCrewIds ?? new Set()),
    selectedRowIds: localState.selectedCrewIds,
    violations: undefined,
    locks: undefined,
    setScrollY: localActions.setScrollY,
    toggleRowSelection: localActions.toggleCrewSelection,
    // ...
  }), [/* deps */])
}
```

---

## Layer 2 — Shared Pane Shell

The shell receives only the adapter and renders all UI. Feature additions happen here once.

```typescript
// gantt/src/components/panes/roster-pane-shell.tsx

interface RosterPaneShellProps {
  paneId: string
  adapter: GanttPaneAdapter
  canvasTestId?: string
}

export function RosterPaneShell({ paneId, adapter, canvasTestId }: RosterPaneShellProps) {
  return (
    <div className="flex flex-col h-full">
      <PaneToolbar
        sortColumn={adapter.sortColumn}
        sortDir={adapter.sortDir}
        onSort={adapter.setSort}
        onOpenFilter={adapter.openFilter}
      />
      <PaneConditionStrip activeFilter={adapter.activeFilter} />
      <PaneCanvas
        paneId={paneId}
        paneType="roster"
        canvasTestId={canvasTestId}
        totalRows={adapter.rows.length}
        frozenRowCount={adapter.frozenRowIds.size}
        selectedRowIndices={rowIdsToIndices(adapter.selectedRowIds, adapter.rows)}
        dropTargetRow={-1}
        scrollXOverride={adapter.scrollX}
        scrollYOverride={adapter.scrollY}
        pxPerHourOverride={adapter.zoom}
        rangeStartOverride={adapter.rangeStart}
        rangeEndOverride={adapter.rangeEnd}
        onScrollYChange={adapter.setScrollY}
        renderContent={(ctx, base) =>
          renderRoster(ctx, base, {
            rows: adapter.rows,
            violations: adapter.violations,
            locks: adapter.locks,
          })
        }
      />
    </div>
  )
}
```

### Resulting thin wrappers (what pane files become)

```typescript
// panes/roster-pane.tsx — after refactor (~15 lines)
export function RosterPane({ paneId }: { paneId: string }) {
  const adapter = useLiveRosterAdapter(paneId)
  return <RosterPaneShell paneId={paneId} adapter={adapter} canvasTestId="roster-canvas" />
}

// scenario-gantt/scenario-roster-pane.tsx — after refactor (~25 lines)
export function ScenarioRosterPane({ scenarioId, paneId }: Props) {
  const [localState, localActions] = useScenarioLocalState()
  const adapter = useScenarioRosterAdapter(scenarioId, localState, localActions)
  return <RosterPaneShell paneId={paneId} adapter={adapter} canvasTestId="scenario-roster-canvas" />
}
```

---

## Layer 3 — Canvas Convergence

`pane-canvas.tsx` already has all the override props needed for scenario mode. The only work is to replace `scenario-gantt-canvas.tsx` with a thin wrapper that delegates to `pane-canvas.tsx`:

```typescript
// scenario-gantt/scenario-gantt-canvas.tsx — after refactor (~40 lines)
export function ScenarioGanttCanvas(props: ScenarioGanttCanvasProps) {
  const { pxPerHour, scrollX, scrollY, rangeStart, rangeEnd, crew, assignments, ... } = props

  const renderContent = useCallback((ctx: CanvasRenderingContext2D, base: BaseRenderContext) => {
    const rosterItems = buildRosterItems(assignments, props.pairingMap, props.pairingSegments, props.pendingChanges, props.groundItems)
    renderRoster(ctx, base, { rows: rosterItems, violations: undefined, locks: undefined })
  }, [assignments, props.pairingMap, props.pairingSegments, props.pendingChanges, props.groundItems])

  return (
    <PaneCanvas
      paneId={`scenario-${props.scenarioId}`}
      paneType="roster"
      totalRows={crew.length}
      frozenRowCount={0}
      dropTargetRow={-1}
      selectedRowIndices={new Set()}
      scrollXOverride={scrollX}
      scrollYOverride={scrollY}
      pxPerHourOverride={pxPerHour}
      rangeStartOverride={rangeStart}
      rangeEndOverride={rangeEnd}
      onScrollYChange={props.onScrollY}
      renderContent={renderContent}
    />
  )
}
```

**What this deletes:** the duplicated RAF loop, DPR detection, scrollbar painting, and resize observer in `scenario-gantt-canvas.tsx` (~250 lines removed).

---

## Divergence Points to Accept (do not force into the adapter)

Some live-only concerns should stay separate rather than being forced into the shared interface:

| Feature | Live only | Decision |
|---------|-----------|----------|
| Pagination / load-more | `useRosterStore` paginated fetch | Keep in live adapter; adapter exposes `loading` only |
| Server-side sort keys | `usePairingStore.applySort({ sortBy: 'schStrDtUtc' })` | Keep in live adapter; shell calls `adapter.setSort(col, dir)` and adapter maps to enum key |
| Rule violations | `useRuleCheckStore` | Optional field on adapter (`violations?: ViolationMap`) |
| Edit locks | `useLockStore` | Optional field on adapter (`locks?: LockMap`) |
| Pending patches overlay | Scenario only | Scenario adapter computes effective rows before exposing `rows` |
| Multi-scenario layout grid | `getScenarioLayoutStore(id)` | Stays in scenario adapter only |

---

## Execution Plan

| Step | Work | Files touched | Risk |
|------|------|---------------|------|
| **1 — Canvas** | Replace `scenario-gantt-canvas.tsx` body to call `pane-canvas.tsx` with overrides | `scenario-gantt-canvas.tsx` (rewrite), `pane-canvas.tsx` (read-only) | Low — override props already exist |
| **2 — Interface** | Define `GanttPaneAdapter` and `RosterRow` normalized types | New `adapters/gantt-pane-adapter.ts` | Low — no rendering change |
| **3 — Live adapter** | Extract `useLiveRosterAdapter`, test live pane still works | New `adapters/live-roster-adapter.ts` | Medium — many hook deps to map |
| **4 — Shell** | Extract `RosterPaneShell` from live `roster-pane.tsx` | New `panes/roster-pane-shell.tsx` | Medium — shell must be prop-complete |
| **5 — Scenario adapter** | Implement `useScenarioRosterAdapter`, reuse `RosterPaneShell` | New `adapters/scenario-roster-adapter.ts`, rewrite `scenario-roster-pane.tsx` | Low — shell already proven |
| **6 — Pairing panes** | Repeat steps 3–5 for pairing | Pairing adapter + shell | Low — same pattern |
| **7 — Flight panes** | Repeat steps 3–5 for flight | Flight adapter + shell | Low |

Start with **Step 1** (canvas) — smallest change, immediate payoff, no adapter work needed.

---

## Outcome

| Metric | Before | After |
|--------|--------|-------|
| Code shared between live and scenario | ~15% | ~70% |
| Files to update for a pane UI feature | 2–3 | 1 |
| Files to update for a canvas feature | 2 | 1 |
| `scenario-roster-pane.tsx` size | ~330 lines | ~25 lines |
| `scenario-gantt-canvas.tsx` size | ~400 lines | ~40 lines |

The adapter layer is ~100–150 lines per pane view (6 adapters total ≈ 900 lines added), but removes ~1,500 lines of duplicated pane/canvas logic. Net: **−600 lines, ÷2 maintenance surface**.

---

## Regression Quality Analysis

### How the current architecture creates regression blind spots

Each pane pair is a **separate code path**. A Playwright test for live gantt exercises:

```
roster-pane.tsx → pane-canvas.tsx → roster-renderer.ts
```

A test for scenario gantt exercises:

```
scenario-roster-pane.tsx → scenario-gantt-canvas.tsx → roster-renderer.ts
```

The renderers are shared so a renderer bug is caught by both test paths. But every bug in the **UI layer** (toolbar, context menu, sort, keyboard, quick filter) lives in the pane component — and a test written for one path is **completely blind to the other**.

Concrete failure modes that are currently undetectable without explicit dual coverage:

| Scenario | Caught by current tests? |
|----------|--------------------------|
| Context menu item added to live pane, forgotten in scenario | ❌ Only if scenario test explicitly exercises that menu item |
| Sort direction bug introduced in pane shell | ❌ Live test finds it; scenario test misses it (different code) |
| Keyboard shortcut (e.g. Ctrl+F) broken in refactor | ❌ Whichever path wasn't tested that sprint |
| Canvas DPR/resize bug in `pane-canvas.tsx` | ✅ Caught by live test, scenario has its own canvas so also isolated |
| Canvas DPR/resize bug in `scenario-gantt-canvas.tsx` | ❌ Only caught if scenario-specific canvas test exists |
| Condition strip renders wrong filter label | ❌ Two separate components, need two tests |

### How the adapter pattern closes the gaps

After refactoring, both views pass through the **same `RosterPaneShell`**. A single Playwright test of the shell implicitly covers both live and scenario at the component level:

```
Test: "Sort by crew ID ascending works"
  → Exercises RosterPaneShell.setSort()
  → Both useLiveRosterAdapter and useScenarioRosterAdapter receive the same sorted rows
  → One test, two views covered
```

The same applies to context menu, keyboard shortcuts, quick filter, and condition strip — all of which live in the shell.

Canvas unification means a single `pane-canvas.tsx` fix/feature/bug covers both views automatically, with no scenario-specific canvas test needed for rendering logic.

### New regression risk introduced: adapter normalization

The adapter is a new code path that can silently drop or mis-map data. If `useLiveRosterAdapter` returns `frozenRowIds: new Set()` when rows are actually frozen, the shell's frozen-row indicator disappears — but shell tests with a mock adapter would not catch this.

**Required: adapter contract tests.**

```typescript
// e2e/gantt/adapter-contract.spec.ts  (or Vitest unit test)

test('live roster adapter: frozenRowIds reflects pane store frozen state', () => {
  // seed pane store with frozenCrewIds = ['C001', 'C002']
  // render useLiveRosterAdapter('pane-main')
  // assert adapter.frozenRowIds equals Set(['C001', 'C002'])
})

test('scenario roster adapter: rows contain all crew from gantt-data', () => {
  // seed getScenarioGanttStore(1) with data.crew (3 items)
  // render useScenarioRosterAdapter(1, ...)
  // assert adapter.rows.length === 3
})

test('scenario roster adapter: pending patch removals are reflected in rows', () => {
  // assign crew C001 to pairing P10, then add RemovePatch
  // assert adapter.rows for C001 does not contain P10 block
})
```

### TypeScript as a first-line regression guard

The `GanttPaneAdapter` interface acts as a **compile-time regression gate**. If a future feature adds a required field to the interface (e.g., `highlightedRowIds` for a Find Crew result), TypeScript will refuse to build until both `useLiveRosterAdapter` and `useScenarioRosterAdapter` implement it. This catches structural mismatches before any test runs.

This is a stronger guarantee than test coverage alone — the architecture enforces parity at the type level.

### Regression testing strategy by layer

| Layer | Test type | What it catches | What it misses |
|-------|-----------|-----------------|----------------|
| **Adapter** | Vitest unit test | Data mapping bugs, normalization errors, missing fields | Real store side-effects |
| **Shell** | Playwright (with mock adapter via `window.__ganttTest`) | UI logic: toolbar, context menu, keyboard, condition strip, sort | Adapter ↔ shell data-flow bugs |
| **Canvas** | Playwright `window.__ganttTest.canvas` pixel/structure asserts | Rendering: block positions, colors, DPR, scrollbar | Data transformation before canvas |
| **Integration** | Playwright E2E (full live or full scenario path) | All layers together, real store wiring | Performance, pagination edge cases |

### How many tests to maintain after vs. before

| Test category | Before | After |
|---------------|--------|-------|
| Shell UI tests (toolbar, sort, filter, context menu) | 2× (live + scenario) | 1× (shared shell) |
| Canvas rendering tests | 2× (`pane-canvas` + `scenario-gantt-canvas`) | 1× (`pane-canvas`) |
| Adapter contract tests | — (didn't exist as a concept) | 2× per pane (live + scenario) |
| Integration E2E (full path) | 2× | 2× (unchanged — still need live + scenario smoke tests) |

**Net:** the adapter contract tests are new, but shell + canvas tests halve. Total test count is roughly the same, but coverage is significantly higher because shell tests now cover both views simultaneously.

### Recommended test additions at each execution step

| Step | Test to write immediately after |
|------|---------------------------------|
| Step 1 — Canvas convergence | One Playwright test: `scenario-gantt-canvas renders N rows after data load` (exercises unified canvas) |
| Step 2 — Interface definition | TypeScript: confirm both adapters satisfy `GanttPaneAdapter` (compile check) |
| Step 3 — Live adapter | Vitest: `useLiveRosterAdapter maps frozenRowIds, selectedRowIds, violations correctly` |
| Step 4 — Shell extraction | Playwright: `RosterPaneShell sort + context menu work with mock adapter` |
| Step 5 — Scenario adapter | Vitest: `useScenarioRosterAdapter reflects pending patches in rows` |
| Steps 6–7 — Pairing / flight | Same pattern repeated |
