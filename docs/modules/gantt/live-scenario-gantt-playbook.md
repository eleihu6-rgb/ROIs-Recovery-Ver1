# Live / Scenario Gantt Playbook

> **Canonical, long-lived reference for the ROIS Gantt.** Read this ONE document before starting any
> Live or Scenario gantt feature, or before debugging any gantt bug. It accumulates architecture, the
> shared source-abstraction layer, stores, panes, the canvas/renderer/interaction pipeline, the data
> model, backend endpoints, filters/sort/coverage, capabilities, testing, conventions, and hard-won
> gotchas. Everything here is cited to `file:line` against the code as of 2026-06-22.
>
> Module: `gantt/` (React 19 + Vite + TS, port 5173) · App base path: `/altair/`
> Companion docs: design `docs/superpowers/specs/2026-06-15-unify-live-scenario-gantt-design.md`,
> plan `docs/superpowers/plans/2026-06-15-unify-live-scenario-gantt.md`,
> roster study `docs/dev-context/2026-06-16-live-scenario-roster-unification-study.md`,
> tracker `docs/architecture/live-scenario-code-sharing-tracker.md`.

**Mirror-process lesson (why Live's exact function was missed):** when aligning Live and Scenario,
start from the existing working function, not from the missing side. Trace the exact Live chain:
user entry point → selection state → state mutation → renderer effect → E2E gesture. For roster
pin, Live already had the correct function chain: left roster row selection → Live context-menu
pin action → pane row-freeze state → shared frozen-row rendering. The failure was skipping that
trace and designing a parallel Scenario interpretation. The unification rule is: mirror the
working chain through the shared source/pane seam, and adapt only the storage/adapter boundary
that is genuinely different. If a step cannot be mirrored, document the business reason before
coding. Otherwise, do not create a second interpretation of the same user function.

**Scenario keyboard context lesson (2026-07-30):** `ScenarioGanttView` calls
`useKeyboard` before returning its nested `GanttContextProvider`, so a hook
that reads `useGanttContextId()` there receives the default `'live'` context.
Scenario-specific global shortcuts must receive the Scenario id explicitly (or
be mounted below the provider); otherwise `Delete` silently executes the Live
selection path and cannot create Scenario patches.

**RuleConfirmDialog shell hoist (2026-08-03):** Draft-assign legality confirm
(`RuleConfirmDialog` / `useRuleCheckStore.showConfirmDialog`) must live on
`AppShell`, not `AppLayout`. Scenario tabs never mount `AppLayout`; an inactive
Live keep-alive tab is `invisible pointer-events-none`. A Live-only mount made
Scenario assign either hang (no dialog component) or show nothing (dialog under
the hidden Live tab). Same pattern as the shell `Toaster` hoist.

**8030 preview grouping (2026-08-15):** preview-draft emits one 8030 finding per
affected crew member. `RuleConfirmDialog` groups pairing-targeted 8030 findings
by rule instance + pairing + parameter-row prefix, shows the shared flight
condition once, and lists each crew id/age underneath. Summary badges count
groups, not raw member findings; other rules keep message-level deduplication.

**Pairing drag-start lesson (2026-08-02):** Pairing pane `mousedown` selects the
segment before a drag crosses `DRAG_THRESHOLD`. Do not let that selection render
destroy/recreate the canvas interaction handler, or its pending `dragStartHit`
state is lost and Scenario pairing-to-roster assignment never starts. Keep the
attached handler stable and route events through a latest-callback ref; read
Scenario edit capabilities fresh at event time after lock ownership changes.
Also keep the pending drag tracked at document level from `mousedown` to
`mouseup`: planners often drag a Pairing puck straight out of the source canvas
into the Roster pane, and waiting for an in-canvas `mousemove` before starting
cross-pane drag makes that real gesture fail.

---

## 1. Purpose & how to use this playbook

The gantt has **two views that are meant to be mirrors**: **Live** (the real roster) and **Scenario**
(an optimizer output, opened read-only / edit-locked). Historically Scenario was a fork under
`gantt/src/components/scenario-gantt/*`; the team is collapsing both onto one shared code path so a
feature built once appears in both.

Use this playbook as the starting map:

- **Adding a gantt feature?** → Section 2 (the §Gantt-Unify rule), Section 3 (where things live),
  Section 4 (the source interface you extend), Section 10 (decide if it's truly Live/Scenario-only).
- **Debugging?** → Section 13 (gotchas) first, then Section 7 (data model traps) and Section 8 (backend).
- **Writing tests?** → Section 11 (e2e harness, auth, `__ganttTest`, IDs).
- **About to commit?** → Section 12 (version bump, `npm run check:ui`, First-Paint, English UI).

> A skill `115-gantt-playbook` exists in `~/.claude/skills/` that loads this doc. Invoke it (or read
> this file) before gantt work so you operate from accumulated knowledge instead of re-deriving it.

---

## 2. The §Gantt-Unify principle

From root `CLAUDE.md` §Gantt-Unify (a **product-consistency requirement**, not just code hygiene):

> **One shared Gantt code path for Live and Scenario wherever the user-facing function is the same.**
> Differences in data source / capabilities are hidden behind an adapter "source" capability — never
> duplicated as parallel UI files.

The target shape is fixed and singular:

```
one shared functional / rendering / interaction layer
  + a thin Live data adapter   (live-gantt-source.ts,    useLiveGanttSource)
  + a thin Scenario data adapter (scenario-gantt-source.ts, useScenarioGanttSource)
```

**The iron rule.** Before touching any gantt feature, ask: *"Can I add this once in the shared layer so
Live and Scenario both benefit?"* Any gantt feature/bugfix must consider **both** contexts. The shared
layer holds only behavior that is identical for both; source differences live **behind a `GanttPaneSource`
capability**, never as scattered `if (live) … else …` UI branches. Live-only / Scenario-only code is
allowed **only** when a real business difference is written down in a spec/PR.

**Counts as a violation (must fix):**
- Rebuilding Live and Scenario as two independent UI forks.
- Adding a *common* feature to only one side without a written business reason (common features must
  reach both automatically — never implement the same function twice).
- Scattering `if (live) … else …` source branches inside shared UI instead of folding the difference
  into a `GanttPaneSource` capability.

**Not a violation (keep doing):**
- Pushing **confirmed-common** behavior down into the shared layer / source abstraction.
- Exposing source differences via adapter capability (Live reads live data, Scenario reads scenario data;
  the shared layer consumes the abstraction).
- A spec/PR-documented Live-only or Scenario-only branch.

> §Gantt-Unify does **not** license over-abstraction. Per §Minimal-First / §Surgical: only sink
> **confirmed** common behavior; do not pre-build speculative shared abstractions for "both might need it
> later," and only touch the pane/source you must.

---

## 3. Architecture overview

### 3.1 The render pipeline

```
                        ┌────────────────────────────────────────────────────────┐
   Live tree            │  <GanttContextProvider contextId="live">                │
   (app-layout.tsx)     │     <GanttSourceProvider value={useLiveGanttSource()}>  │
                        │        Live pane wrapper  (panes/roster-pane.tsx …)     │
                        └──────────────────────────┬─────────────────────────────┘
                                                   │
                                                   ▼
                        ┌──────────────────────────────────────────────────────────┐
   Scenario tree        │  <GanttContextProvider contextId={scenarioId}>            │
   (scenario-gantt-view)│     <GanttSourceProvider value={useScenarioGanttSource(id)}>│
                        │        Scenario wrapper (scenario-gantt/scenario-*-pane)  │
                        └──────────────────────────┬───────────────────────────────┘
                                                   │  both wrappers mount the SAME ↓
                                                   ▼
   shared pane          SharedRosterPane / SharedFlightPane / SharedPairingPane
   (panes/shared/*)        reads EVERYTHING via  useGanttSource()  → GanttPaneSource
                                                   │
                 ┌─────────────────────────────────┼─────────────────────────────────┐
                 ▼                                  ▼                                  ▼
   PaneHeaderCanvas (left columns)      PaneCanvas (the gantt canvas)      PaneConditionStrip / chrome
   draws PanelRowData[].values          renderers/*  +  interactions/*     filter dialog / sort dialog / quick-filter
```

- **Context id** is `'live' | number` (`gantt/src/types/gantt-context.ts:1`). Live's `app-layout` mounts
  `'live'`; each scenario view mounts its `scenarioId`.
- **Two providers, nested.** `GanttContextProvider` (the store-context id) and `GanttSourceProvider`
  (the data/interaction adapter). Shared components throw if no `GanttSourceProvider` is present
  (`gantt-source-context.tsx:22-28`).
- **The seam is `GanttPaneSource`** (`gantt/src/components/gantt/source/gantt-pane-source.ts`). Shared
  components read viewport, timezone, rows, selection, interaction callbacks, and capabilities through it
  and import **no** Live/Scenario data stores. (Enforced by `no-store-imports.guard.test.ts`, which scans
  `components/gantt/`; the shared panes live under `components/panes/shared/` instead, so they may import
  context-agnostic chrome stores — see `roster-pane.tsx:1-23`.)

### 3.2 Directory map (verified)

```
gantt/src/components/
├── gantt/                     # SHARED layer (counts toward "Shared %")
│   ├── source/                # the abstraction seam
│   │   ├── gantt-pane-source.ts        # GanttPaneSource + Roster/Flight/PairingPaneSource interfaces
│   │   ├── gantt-source-context.tsx     # GanttSourceProvider + useGanttSource()
│   │   ├── live-gantt-source.ts          # useLiveGanttSource()  (Live adapter)
│   │   ├── scenario-gantt-source.ts      # useScenarioGanttSource(scenarioId)  (Scenario adapter)
│   │   ├── scenario-edit-controller.ts   # scenario GanttEditController
│   │   └── scenario-violation-source.ts  # scenario GanttViolationSource
│   ├── renderers/             # base / roster / pairing / flight / summary / timeline-labels
│   ├── interactions/          # base-interaction / drag-handler / selection-handler
│   ├── pane-canvas.tsx        # the canvas (reads useGanttSource)
│   ├── pane-header-canvas.tsx # left-column panel canvas (PanelRowData)
│   ├── time-axis.tsx / time-axis-menu.tsx
│   ├── *-overlay.ts           # lock / memo / violation overlays
│   └── drag-context.tsx       # useCrossPaneDrag()
├── panes/                     # LIVE pane wrappers + SHARED panes
│   ├── roster-pane.tsx        # Live roster wrapper
│   ├── pairing-pane.tsx       # Live pairing wrapper
│   ├── flight-pane.tsx        # Live flight wrapper
│   ├── pane-toolbar.tsx / pane-condition-strip.tsx / pane-quick-filter.tsx / sort-dialog.tsx
│   ├── violation-list-dialog.tsx / quality-analysis-dialog.tsx
│   └── shared/                # ← the unified panes
│       ├── roster-pane.tsx    # SharedRosterPane
│       ├── pairing-pane.tsx   # SharedPairingPane
│       └── flight-pane.tsx    # SharedFlightPane
├── scenario-gantt/            # SCENARIO wrappers (+ genuinely scenario-only bits)
│   ├── scenario-roster-pane.tsx / scenario-pairing-pane.tsx / scenario-flight-pane.tsx  (thin wrappers)
│   ├── scenario-gantt-toolbar.tsx / scenario-pane-toolbar.tsx
│   ├── scenario-layout-grid.tsx / scenario-panel-splitter.tsx
│   ├── scenario-context-menu.tsx / scenario-drag-provider.tsx / scenario-status-bar.tsx
│   ├── build-scenario-roster-items.ts / quality-analysis.ts
│   └── scenario-time-axis.tsx / scenario-time-axis-menu.tsx
└── layout/                    # LIVE layout grid (LayoutGrid → GridRow → GridCell → PaneWrapper)
    ├── app-layout.tsx / layout-grid.tsx / grid-row.tsx / grid-cell.tsx / pane-wrapper.tsx
    ├── filter-dialog.tsx      # the SHARED filter dialog (both views, contextId-driven)
    ├── vertical-splitter.tsx / pane-splitter.tsx / status-bar.tsx / summary-bar.tsx
    └── pane-container.tsx     # LEGACY / unused for docked panes (see gotcha §13b)
```

---

## 4. The source abstraction layer (full interface reference)

File: `gantt/src/components/gantt/source/gantt-pane-source.ts`.

### 4.1 `GanttPaneSource` (the top-level seam)

```ts
export interface GanttPaneSource {
  mode: 'live' | 'scenario'
  // viewport (按需订阅 selector hooks — ref-based RAF render, avoid over-render)
  useScrollX(): number
  useScrollY(paneId): number;  setScrollY(paneId, n): void
  getScrollX(): number          // sync fresh read at event/RAF time — NOT a hook
  getScrollY(paneId): number    // sync fresh read — NOT a hook
  usePxPerHour(): number
  useRange(): { start: Date; end: Date }
  useTimezone(): string
  useDirtySignal(): number;  markClean(): void   // redraw signal (Live: global dirty count; Scenario: self-incrementing)
  capabilities: GanttCapabilities
  // optional capabilities (P3-wired)
  edit?: GanttEditController
  violations?: GanttViolationSource
  // per-pane accessors (presence is the mount gate for each shared pane)
  flight?: FlightPaneSource
  pairing?: PairingPaneSource
  roster?: RosterPaneSource
}
```
(`gantt-pane-source.ts:67-94`.) `GanttCapabilities` is `{ panes, defaultPanes, roster:{canAssign,canRemove,canReassign}, pairing:{canEditSegments} }` (`:13-18`). `READ_ONLY_CAPABILITIES` is the Live default (`:31-36`). Frozen empty singletons `EMPTY_LOCK_MAP` / `EMPTY_SESSION_TAGS` keep canvas inputs ref-stable (`:27-28`).

**Mount invariant:** a shared pane is mounted **only** where its accessor is defined — `SharedRosterPane`
asserts `source.roster!.*` (`panes/shared/roster-pane.tsx:13-15`). This keeps hook order stable while
gating the pane on the source.

### 4.2 `RosterPaneSource` (`:132-206`)

The roster source builds the **`RosterModel`** once per dependency change (one `useMemo`) — the unified
model replacing the old `useRows`/`usePanelRows`/`useViolationMap` trio:

```ts
interface RosterModel {                       // :113-130
  crewIds: string[]                            // ordered: frozen → found → rest
  items: RosterItem[]
  itemsByCrew: Map<string, RosterItem[]>       // canvas render buckets + crew-scoped lookups
  panelRows: PanelRowData[]                    // left-panel rows incl. maxViolationSeverity (+ optional lockStatus)
  violationMap: Map<number, number>            // taskId → max severity (canvas puck badges)
  frozenRowCount: number
  taskById: Map<number, RosterItem>            // O(1) hit-test / click / hover
  itemsByPairingId: Map<number, RosterItem[]>  // O(1) pairing-violation expansion + group selection
}
```

| Member | Kind | Live | Scenario | Notes |
|---|---|:--:|:--:|---|
| `useRosterModel()` | hook | ✅ | ✅ | the single roster-data hook the shared pane calls |
| `useColumns()` | hook | ✅ | ✅ | context-keyed column store |
| `capabilities` | value | ✅ | ✅ | `{canAssign,canRemove,canReassign}` |
| `useSelectedCrewIds()` / `useSelectedTaskIds()` | hook | ✅ | ✅ | drive row + puck highlight |
| `selectCrewRow(id, mode, orderedIds)` | imperative | ✅ | ✅ | single / toggle / range |
| `bringCrewToTop(crewId)` | imperative | ✅ | ✅ | float one crew to the pane top + scroll into view. Backs the **Alert Center row click** ("click any cell → bring that crew up") and the scenario Quality dialog `onCrewClick`. Live → `bringCrewIdsToTop([id],'main')` (pane-store found tier); Scenario → scenario-layout `setFoundCrewIds`+`setScrollY 0`. Shared UI never branches live-vs-scenario (§Gantt-Unify) |
| `getHitTest()` | imperative | ✅ | ✅ | fresh scroll/zoom/range at event time |
| `useInteractionCallbacks()` | hook | ✅ | ✅ | click/hover/drag/scroll/zoom |
| `useAlertCenter?()` | hook (optional) | ✅ | ✅ | bell + ViolationListDialog; **both** supply rows (Live: session/rule; Scenario: persisted Rust). Same code path, one placement |
| `useQualityAnalysis?()` | hook (optional) | — | ✅ | **Scenario-only** Quality Analyzer button + dialog (Live leaves undefined → no button) |
| `useLockMap?()` | hook (optional) | ✅ | — | taskId → lock state (Live overlay) |
| `useSessionTags?()` + `showSessionTags?` | hook (optional) | ✅ | — | Live session-edit colouring |
| `registerPane?` / `unregisterPane?` | imperative (optional) | ✅ | ✅* | cross-pane drop registration when a DragProvider is present |
| `setRenderedRows?` | imperative (optional) | ✅ | — | **Live-only**: feed back final order after the component's client-side quick-filter, so event-time hit-test refs stay aligned |

### 4.3 `FlightPaneSource` (`:218-298`)

`useRows()` returns `{ rows: FlightItem[]; compositionStatusMap }` (shared FlightFilter applied,
quick-search NOT applied). `capabilities = { canDrag, canRubberBand, tracksHover, lazyLoads }`.

| Member | Live | Scenario |
|---|:--:|:--:|
| `useRows`, `useSelectedIds`, `select`, `selectMany`, `useHoveredId`, `setHovered`, `getPxPerHour`, `getRangeStart` | ✅ | ✅ (hover always null / no-op) |
| `startDragToRoster?`, `loadMore?`, `scrollByX?`, `zoomIn?`, `zoomOut?`, `formatStatusLine?`, `registerPane?`/`unregisterPane?`, `useSelectedRowIds?`, `applyFilterChange?` | ✅ | — |

Scenario flight rows are built by `buildScenarioFlightItems(flights, pairingSegments, assignments)`
(`scenario-gantt-source.ts:57-`), a flight is `'full'` iff it's on an assigned pairing else `'partial'`.

### 4.4 `PairingPaneSource` (`:311-393`)

`useRows()` returns `{ rows: PairingItem[] }` (PairingFilter applied + found-floated + **sorted**;
quick-search NOT applied). **Selection ids are SEGMENT ids** (a pairing's dashed box lights when any
segment is selected). Sort is exposed via `useSortColumn()` / `useSortDirection()` / `setSort(column)`
for header-click toggle in **both** contexts.

| Member | Live | Scenario |
|---|:--:|:--:|
| `useRows`, selection (segment ids), hover, geometry, sort (`useSortColumn`/`useSortDirection`/`setSort`) | ✅ | ✅ |
| `startDrag?` (assign-pairing → roster) | ✅ (Phase 5B-2) | ✅ (when DragProvider present) |
| `loadMore?`, `scrollByX?`, `zoomIn?`, `zoomOut?`, `formatStatusLine?`, `registerPane?`, `applyFilterChange?`, `useSelectedRowIds?`, `useFrozenRowCount?`, `selectRow?`, `toggleRowSelection?`, `selectRowRange?`, `unfreezeRow?`, `markDirty?` | ✅ | — |

### 4.5 Optional / wired-later members

- `GanttEditController.execute(op)` (`:39-48`) — `roster-assign|remove|reassign`, `pairing-add|remove-segment`.
- `GanttViolationSource.useViolations(...)` / `runPreCheck(...)` (`:51-60`).
- Adapters: Live = `useLiveGanttSource()` in `live-gantt-source.ts` (acquires `useCrossPaneDrag` then
  builds the flight/pairing/roster sub-sources); Scenario = `useScenarioGanttSource(scenarioId)` in
  `scenario-gantt-source.ts` (reads the per-scenario registry stores, `build-scenario-roster-items`,
  `useScenarioViolationSource`, `useScenarioEditController`).

---

## 5. Stores & the per-context registry

### 5.1 The registry factory + 'live' shim

`gantt/src/stores/create-context-store.ts:4-23`:

```ts
export function createContextStoreRegistry<S>(factory: (id: GanttContextId) => S) {
  const registry = new Map<GanttContextId, S>()
  const get = (id) => { let i = registry.get(id); if (!i) { i = factory(id); registry.set(id, i) } return i }
  const destroy = (id) => { registry.delete(id) }
  return { get, destroy }
}
```

The **compatibility shim** (decision 4 of the design): each context-store keeps its old singleton export
aliased to the `'live'` instance, so untouched Live code compiles unchanged, while shared wrappers use the
context-resolved hook. Pattern (filter-store, `:276-286`):

```ts
const registry = createContextStoreRegistry<…>(makeFilterStore)
export const getFilterStore = (id: GanttContextId) => registry.get(id)
export const destroyFilterStore = (id) => registry.destroy(id)
export const useFilterStore = getFilterStore('live')                  // ← 'live' alias (back-compat)
export const useFilterStoreForContext = () => getFilterStore(useGanttContextId())  // shared wrappers
```

`usePaneStore` follows the same shim (`pane-store.ts:478-488`).

### 5.2 Store classification

| Store | File | Pattern | Per-context? | 'live' alias |
|---|---|---|:--:|---|
| **filter-store** | `filter-store.ts` | `createContextStoreRegistry` | yes (`'live'` \| scenarioId) | `useFilterStore` |
| **pane-store** | `pane-store.ts` | `createContextStoreRegistry` | yes | `usePaneStore` |
| **column-store** | `column-store.ts` | plain `create()` | **no — true singleton** | `useColumnStore` |
| **timezone-store** | `timezone-store.ts` | plain `create()` | **singleton** (+ per-scenario override map) | `useTimezoneStore` |
| **ui-store** | `ui-store.ts` | plain `create()` | **singleton** (dialogs carry `*ScenarioId` fields) | `useUiStore` |
| **scenario-gantt-store** | `scenario-gantt-store.ts` | direct `Map<number>` | scenarioId only | — |
| **scenario-layout-store** | `scenario-layout-store.ts` | direct `Map<number>` | scenarioId only | — |
| **scenario-{roster,pairing,flight}-selection-store** | resp. files | `createContextStoreRegistry` | scenarioId only | — |
| reference-store, lock-store, draft-store | — | singleton / not converted | n/a | (edit/lock stays mode-specific by design) |

Two registry patterns coexist: the generic `createContextStoreRegistry` (filter/pane/selection — supports
both `'live'` and scenarioId) and a direct `Map<number>` (scenario-gantt / scenario-layout — scenario-only,
no `'live'` needed). The split is intentional and noted in the design (decision 4 + store-conversion scope).

### 5.3 filter-store shapes & defaults

`filter-store.ts:31-67` (one unified `CrewFilter`, plus `PairingFilter` / `FlightFilter`):

```ts
interface CrewFilter    { divisions: string[]; bases: string[]; ranks: string[]; fleets: string[]; crewIds: string[] }
interface PairingFilter { bases: string[]; fleets: string[]; divisions: string[]; depArps: string[];
                          coverage: CoverageState[]; assignments: string[]; label: string }
interface FlightFilter  { depArps: string[]; arvArps: string[]; fltNums: string[]; fleets: string[];
                          statuses: string[]; register?: string[] }
```

Defaults: all arrays empty **except** `PairingFilter.coverage = ['open', 'partial']` (`filter-store.ts:66`,
`DEFAULT_PAIRING_FILTER`) — i.e. the pairing pane opens **narrowed to the uncovered pairings** (matches the
product screenshot's active "Open, Partial" chip). ⚠️ This contradicts older specs/notes that assume the
default is `[...ALL_COVERAGE]` (see §13a); the code default is open+partial. `crewIds`, `label`, `coverage`,
`register` are **overlays**
(bring-to-top / float-to-top), not facet filters. `FilterStore` also holds `dateRange`, `ruleSetCode`, and
`appliedFilters` (snapshot of last successfully-applied filters; drives global filter chips). The default
`dateRange` is computed **in the display timezone** (current calendar month + next month), not UTC month
boundaries (`:20-29`).

### 5.4 pane-store sort & interactive state

`pane-store.ts`: `SortCriterion = { column; direction:'asc'|'desc' }` (`:9-12`), ordered (`[0]` = primary).
Per-pane `PaneInteractiveState` holds `scrollY`, `sortCriteria[]`, `dropTargetRow`, `frozenRowIds[]`
(pinned-to-top), `foundCrewIds[]` (find-matches floated to top; cleared on re-sort), `selectedRowIds[]`,
`lastSelectedRowId` (`:65-88`). Header-click sort (`setSortColumn`) replaces criteria with a single toggled
key; the multi-key `SortDialog` writes the full `sortCriteria[]` (`:269-304`).

### 5.5 column-store

True singleton (`column-store.ts:98`). Per-pane column defaults: roster has `crewId/rank/base/seniority/
mcred/mdo` visible by default (`ybh/fleet/mbh/yal/mal/ydo` hidden) (`:15-28`); pairing has
`pairingId/type/fleet/cred` visible, `blh` hidden (`:32-38`). `ColumnConfig = { key, label, width, visible,
order, row: 1|2 }` (`types/column.ts`). The left panel renders each row's `PanelRowData.values[column.key]`.
Pairing's visible `Tp` column is the `type` key and displays `pairing.assignmentGroup` (backend
`pairing.assignment_group`), not `pairing.assignment`.

### 5.6 scenario layout

`scenario-layout-store.ts` is a **2-column grid** of pane ids: default `[[roster-1, null], [pairing-1, null]]`
(`:51-70`); `applyCapabilityDefaults` gates the allowed pane set without clobbering a user-customized layout
once `capabilitiesApplied` is true. Live's docked layout is the separate `layout-store` (LayoutGrid path —
see §13b).

---

## 6. Shared pane components & the column system

### 6.1 SharedRosterPane (`panes/shared/roster-pane.tsx`)

- Placed under `components/panes/` (not `components/gantt/`) **on purpose** so it may import context-agnostic
  chrome stores (timezone, column, the per-context filter/pane/layout stores) while keeping the
  `no-store-imports` guard green (`:1-23`). All roster **data + interaction** flows through `source.roster`.
- Left panel: `PaneHeaderCanvas` fed by `RosterModel.panelRows` (carry `maxViolationSeverity` → gutter bell;
  optional `lockStatus`).
- Canvas: `PaneCanvas` + `renderRosterTasks` fed by `RosterModel.items`/`itemsByCrew`/`violationMap` +
  optional `useLockMap`/`useSessionTags`.
- Interaction: `getHitTest()` + `useInteractionCallbacks()` (selection/drag/context-menu).
- **Chrome split:** the toolbar + splitter are injected by the wrapper as render-props; the quick-filter /
  condition-strip / filter-dialog / sort-dialog chrome lives in the shared pane. Live-only chrome (session
  filter chips, query-mode toggle, loading bar) is an optional `LiveRosterChrome` prop — Scenario passes
  none, so the scenario render path is byte-identical to before (`:58-70`).

### 6.2 The column system

`PanelRowData` (`pane-header-canvas.tsx:26-43`):

```ts
interface PanelRowData {
  rowId: string
  values: Record<string, string>          // keyed by ColumnConfig.key — what the left panel paints
  colors?: Record<string, string>
  maxViolationSeverity?: number            // 0 = none → drives the gutter alert bell
  lockStatus?: 'mine' | 'other'; lockOwner?: string
  isFull?: boolean                          // pairing coverage indicator
  compositionSegments?: Array<{ text: string; isRed: boolean }>
}
```

`ColumnConfig.row` is `1 | 2` — a dual-row left panel (top/bottom line). The source's `useColumns()`
returns the **visible** columns; `PanelRowData.values[column.key]` provides the cell text. Sorting by a
column reads `panelRows[*].values[key]` via the shared `sortPanelRowsByValues` util (used by both adapters —
`live-gantt-source.ts:26`, `scenario-gantt-source.ts:34`).

### 6.3 Renderers & interactions

- `renderers/`: `base-renderer.ts`, `roster-renderer.ts` (`renderRosterTasks`, `buildRosterRenderBuckets`),
  `pairing-renderer.ts`, `flight-renderer.ts`, `summary-renderer.ts`, `timeline-labels.ts`. Overlays:
  `lock-overlay.ts`, `memo-overlay.ts`, `violation-overlay.ts`.
- `interactions/`: `base-interaction.ts` (`createPaneInteractionHandler`, `HitTestFn`,
  `PaneInteractionCallbacks`, `RubberBandRect`), `drag-handler.ts` (`PaneRegistration`, `DragSource`,
  cross-pane drag), `selection-handler.ts`.

---

## 7. Data model for gantt

Authoritative map: `docs/architecture/data-model.md` (read before reasoning about joins);
table↔entity↔route index: `docs/architecture/codebase-index.md`.

### 7.1 High-frequency traps (memorize)

1. **`pairing` does NOT link `flight` directly.** Pairing→flight is N:M, materialized on
   `pairing_segment`: `pairing → pairing_segment.flt_id → flight` (FK `fk_ps_flight`). There is **no**
   `pairing.flight_id` (data-model.md:56, 66, 89-92).
2. **`roster_flight` granularity = crew × segment.** Assigning a pairing to a crew explodes into one
   `roster_flight` row per segment (+ ground-task rows). Crew×flight execution-level info (acting rank /
   seat / times / credit) lives **only** here (data-model.md:59, 72-78).
3. **`roster_flight.flt_id → flight` is by value, NO FK.** Only `fk_rf_crew` / `fk_rf_pairing` are
   declared — don't assume DB-enforced referential integrity on `flt_id` (data-model.md:69, 93).
4. **Crew Base = `crew_base` (effective at the relevant date), NOT `roster_flight.base`.** The latter is
   blank on engine/scenario rosters (data-model.md:124; memory `live-server-hot-reload...`).
5. **Ground task = `roster_flight.pairing_id IS NULL`** (training/standby/leave) — `flt_id` is also null.
   (A stale schema comment says `0=地面任务`; trust `NULL` — `0` can't satisfy the FK.) Querying flying
   tasks needs explicit `WHERE pairing_id IS NOT NULL` (data-model.md:95-96).
   Ground-task UI location fields are `dep_arp` / `arv_arp` (camelCase `depArp` / `arvArp` in Gantt DTOs).
   `base` remains a compatibility persistence field and follows `dep_arp` on create/update; do not show it as
   the planner-facing ground-task location in the Status Bar or Ground Editor.
6. **`division` is a varchar code** on crew/pairing: `P` = pilot, `C` = cabin, `A` = ATC.
7. The `scenario` schema (`sql/schema/scenario/01-scenario-tables.sql`) mirrors live `flight` / `pairing` /
   `pairing_segment` / `roster_flight` / `crew_manday_*` per scenario; relationships are identical to live.

### 7.2 Gantt type shapes (the frontend DTOs)

- **`types/pairing.ts`**: `Pairing` (`id, pairingLabel, division, base, fleet, assignmentGroup, assignment,
  schStrDtUtc, schEndDtUtc, durationDays, tafb, dutyCount, segCount, blockMinutes, composition[], isFull,
  segments?`); `PairingItem = { pairing, flights[], segments[], sessionTags[] }`; `CompositionSlot =
  { rank, plan, fill }`. ⚠️ Live `pairingApi.list` may omit `flights[]`/`segments[]` (see §13d).
- **`types/flight.ts`**: `Flight` (`id, fltNum, depArp, arvArp, schDepDtUtc, schArvDtUtc, fleet, register,
  isCancelled, …`); `FlightItem = { registration, fleet, flights[], isFleetGrouped?, sessionTags[] }`
  (grouped by registration); `FlightCompositionStatus = 'full' | 'partial' | 'cancelled'`.
- **`types/roster.ts`**: `RosterItem` — `id, crewId, pairingId|null, assignmentGroup, assignment|null,
  schStrDtUtc/EndDtUtc, fltId|null, dutySeq|segSeq, division|null, dutyActCreditedMinutes (the only populated
  credit source — roster_flight's own credit cols are null), ybh/mbh/yal/mal/ydo`. **`fltId` is null in
  many roster DTOs** even though the DB column has values for flying tasks (§13d).
  Roster REST rendering must use the same duty-level fallback as Pairing: `actRestMin ??
  dutyActRestMin ?? dutySchRestMin ?? 0`. Optimizer/imported Live rows can carry rest on the joined
  `pairing_segment` fields while `roster_flight.act_rest_min` is null; using only `actRestMin` hides the
  REST bar in the Roster pane even though Pairing pane shows it.
- **`types/scenario-gantt.ts`** (server `ScenarioGanttData` shape mirrored client-side): `crew[]`,
  `pairings[]`, `assignments[]` (`{crewId, pairingId, source:'CR'|'leadin'}`), `pairingSegments[]`,
  `flights[]`, `groundItems[]`, `crewStats` (per-crew per-roster-period `{credit, dayOffCount, alCount, leaveCount}`),
  plus `capabilities`, canvas range (`strDtLoc/endDtLoc` incl. lead-in/out vs official `scenarioStrDt/EndDt`),
  `fileType:'PO'|'RO'|'TO'`, `dataSource`, `readOnly?`.
  **Current RP KPI contract:** `crewStats` is keyed by roster-period key (`YYYYRPnn`), not `YYYY-MM`.
  Scenario RpCred/RpDO must match Live: resolve the viewport-left date through `roster_period`, then read
  period manday stats (`credit`, `dayOffCount`, `alCount`, `leaveCount`) from that key.

---

## 8. Backend endpoints

### 8.1 Live gantt data routes (live-server)

| Endpoint | Method | Path | Returns | Cache |
|---|---|---|---|---|
| Gantt bootstrap | GET | `/api/gantt/bootstrap` | slim crew list + first-window roster + actual `rosterWindow` (First-Paint optimization: one request avoids serial crew→roster) | ETag SHA1, `private,no-cache` (`routes/gantt/gantt.ts:9, 31-36`) |
| Crew list | GET | `/api/crew` (`view=gantt-panel` slim) | crew w/ latest-effective rank/base/division/seniority | Redis (query-keyed) (`routes/crew/crew.ts:98`) |
| Roster | GET | `/api/roster?crewIds=…&startDate&endDate` | roster entries (assignments + ground tasks) for those crew (`routes/roster/roster.ts:9-10`) | Redis (crew-keyed) |
| Pairing list | GET | `/api/pairing` (sortBy/coverage/assignments/label/fleet/base/division/page) | pairings + segments + compositions | Redis `pairing:list:*` (`routes/pairing/pairing.ts:31-62`) |
| Pairing crew detail | GET | `/api/pairing/:id/crew-detail` | rostered crew (Pairing Info popup; Base from `crew_base` at `sch_dep_dt_utc`) | Redis `pairing:crewdetail:{id}` TTL 600s (`routes/pairing/pairing.ts:104-118`; invalidate on roster mutation) |
| Flight list | GET | `/api/flight` (depArp/arvArp/fltNum/fleet/status/page) | grouped `FlightItem` w/ composition | Redis (`routes/flight/flight.ts:8-28`) |

### 8.2 Scenario gantt data

- `GET /api/scenario/:id/gantt-data` (`routes/scenario/scenario.ts:577-660`) returns `ScenarioGanttData`.
- **Source switch:** `SCENARIO_GANTT_SOURCE` env, `z.enum(['gz','db']).default('db')`
  (`config/env.ts:39-42`). `'db'` reads the partition-backed `scenario` schema via
  `scenario-gantt-db-service.ts` (`buildGanttDataFromDb`, assembles crew from live `f8.*`, assignments from
  `scenario.roster_flight`, ground items where `pairing_id IS NULL`, flights from live/scenario partition,
  manday from `scenario.crew_manday_*_period` keyed by live-style `roster_period`); `'gz'` parses the optimizer gz CSV — the frontend can't tell
  which produced the payload. The env is read at `scenario.ts:465` (roster) and `:590` (gantt-data). DB is
  the proven default; keep `gz` as the escape hatch.

### 8.3 ⚠️ The division-scoping asymmetry (known gotcha)

In `services/scenario/scenario-export-service.ts`, the scenario's crew vs pairing scope are built
asymmetrically:

- **`crewIdSet(s)` (`:46-73`) applies a division filter** — `if (division) parts.push(sql\` AND division =
  ${division}\`)` at `:56` (plus base/fleet).
- **`pairingIdSet(s)` (`:79-97`) does NOT extract or apply division** — only `bases` and `fleets` are
  filtered; there is no division clause.

**Consequence:** a scenario scoped to, say, pilots (`division='P'`) limits the *crew* set but **not** the
*pairing* set — pairings of all divisions in the date/base/fleet window are included. If you implement a
per-division scenario feature, do the division narrowing for pairings yourself (or fix the export service);
do not assume the pairing list is division-scoped.

### 8.4 Live Publish Roster 与 PBS Award 发布事实

Scenario Publish 只把优化结果导回 `live.roster_flight`；真正对 Crew 发布发生在 Live 的
`POST /api/roster-publish/apply`。该事务同时更新 `roster_publish`、写 `roster_publish_adjust`，并为每个
完整发布的 Crew 写一条 `schedule_publish_record.published=1`。当前采用 record-only 契约：不生成
`.schedule.gz`，也不需要快照目录环境变量；PBS Award 明细始终只读 `roster_publish`，而
`schedule_publish_record` 只负责 Period/Crew/division/base/fleet/batch 发布门禁与追踪。

---

## 9. Filters, sort, coverage, and the two crew-filter mechanisms

- **Filter dialog** (`layout/filter-dialog.tsx`) is **shared** by both views, driven by `contextId`
  (Phase 3 collapse). Scenario gained Live's full filter set (Rank/Base/Division/Fleet/Crew ID + pairing/
  flight fields) by construction.
- **Sort** is unified in the context `pane-store` (`sortCriteria[]`) — this fixed the scenario regression
  where header-click sort lived in component-local state and was **lost on tab suspend**. Multi-key
  `SortDialog` + sort chips + header-click all write the same store.
- **PRODUCT PRINCIPLE — the planner's focus is always UNCOVERED work (open + partial pairings).** The whole
  pairing board exists to answer "what still needs crew, and how do I cover it?" A *full* / *over* pairing is
  already done and is noise for that job. So the product is deliberately biased toward open+partial: the
  Coverage filter **defaults to `['open','partial']`**, and the open-credit badge sums **only** those trips.
  Do **not** "helpfully" show all-pairings totals or default to all-states — covered trips are not what the
  planner is deciding about. When adding any pairing aggregate/summary, scope it to the uncovered set unless a
  spec explicitly says otherwise.
- **Coverage** (`PairingFilter.coverage`), classified by `classifyCoverage` / `ALL_COVERAGE`
  (`utils/pairing-coverage`). **Default = `['open', 'partial']`** (the uncovered states — see the product
  principle above). In **Live** coverage
  is an *overlay* (floats matching pairings to the top; `pairingFilterToListParams` does not send it to the
  server). In **Scenario** it's a *hard filter* (`pairingMatchesSharedFilter` → `coverageMatches` drops
  non-matching rows), **except** found (`Locate Pairing` / label float) and frozen row ids, which bypass
  coverage via `pairingMatchesSharedFilterWithOverlays` — same Live shared-source rule so a fully-crewed
  located pairing still appears at the top under the default open+partial filter. ⚠️ Old specs assuming an all-states default are stale (e.g. `pairing-coverage-badge`
  Live-1111/1112 expect a plain-total default badge; `scenario-pairing-filter` Scen-2017/2018 expect 3 rows
  but the open+partial hard filter yields 2 — both pre-existing-red against the current default).
- **Open/partial coverage total credit badge (F316).** Next to the pairing count badge, when coverage is a
  non-empty subset of `{open, partial}` (`isOpenPartialCoverage`, `utils/pairing-credit.ts`), a `Clock` badge
  shows the **summed credit (HH:MM)** of those still-uncovered pairings — i.e. *how much flying still needs to
  be crewed*, the workload the planner is sizing up (per the product principle above). It is intentionally NOT
  a total over all pairings (`sumCoverageCredit` over loaded/filtered
  rows; credit per pairing = `pairingCreditedMinutes`, deduped by dutySeq = the "Cred" column). Wired in **both**
  contexts: Live legacy `pairing-pane.tsx` → `PaneToolbar`; Scenario `SharedPairingPane` → toolbar render-prop
  → `ScenarioPaneToolbar` (`pane-open-credit` testid; hook `__ganttTest.pairingOpenCredit()`). Because Live
  pairing is still the legacy fork (5B-2 pending), the gate+sum is called in both panes but the math lives once
  in `utils/pairing-credit.ts`. Pane titles also dropped the redundant **"Main"** ("Roster Main"→"Roster",
  "Pairing Main"→"Pairing") to save space.
- **Pairing ID filter (multi-value HARD filter, unified Live + Scenario).** Filter dialog › Pairing tab ›
  "Pairing ID" (`filter-pairing-id`, a `TextChipField`, comma/period/space-split) narrows the pane to the
  pairings whose numeric `pairing.id` is in `PairingFilter.pairingIds` — distinct from the **Label** field
  (which matches `pairingLabel`). It is a **hard filter in BOTH views** (shows only matches, never floats),
  which is why it's the clean unified choice. The predicate lives **once** in
  `filter-store.matchesPairingIdFilter(pairingId, ids)` (empty list = no filter) and is called from both
  render paths: Live legacy `pairing-pane.tsx` (`idFilteredItems` memo, applied before coverage/label floats)
  and Scenario `pairingMatchesSharedFilter` / `hasActivePairingFilter`. All pairings are already loaded in
  both contexts (Live `fetchPairings` pageSize 0 = all; Scenario builds from `ScenarioGanttData`), so the
  client-side filter is complete — no server param needed. In `apply-filters.ts` it's tracked as
  `pairingIdsChanged` (overlay-style, like label/coverage) so it re-runs `markApplied` **without** forcing a
  ~46 MB pairing reload. A `pairingIds` chip appears in both panes' condition strips (added to the
  `buildGlobalFilterChips` dims). E2E `pairing-id-filter.spec.ts` (Live-1180/1289, Scen-2440/2441) proves
  exact narrowing + 0-rows-on-unknown-id via `paneRenderStat('pairing').totalRows` and `pairingPanelOrder`;
  to make the order hook work for Scenario too, `SharedPairingPane` now also calls `publishPairingOrder`.
- **Pairing Rank filter (multi-rank HARD filter, unified Live + Scenario).** Filter dialog › Pairing tab ›
  "Rank" (`filter-pairing-rank`) lists all crew ranks and filters pairings by `pairing.composition[].rank`.
  The predicate lives in `filter-store.pairingCompositionMatchesRank(composition, ranks)` and is consumed by
  Live legacy pairing rows, Live source rows, and Scenario `pairingMatchesSharedFilter`. Rank combines with
  Division and Coverage as AND; Coverage remains whole-pairing coverage, not rank-scoped. Invalid combinations
  are intentionally allowed and explain themselves: `Division=C + Rank=CA` or `Division=P + Rank=FA/IFD`
  keeps the selection, shows a short warning motion (`filter-pairing-rank-warning`), and can return zero rows.
  E2E `filter-pairing-rank.spec.ts` covers Live multi-rank CA+IFD with Open/Partial coverage, invalid C+CA
  warning, and a DONE Scenario optimization-result filter dialog.
- **Two crew-filter mechanisms in Live (don't confuse them):**
  1. The **global Filter dialog** writes to `crew-store.activeGlobalFilter` (base/rank/fleet/division), NOT
     to `sessions[].filters` (which stays `{}`). Apply it via `applyGanttFilters()`
     (`utils/apply-filters.ts`). Roster condition chips must read `activeGlobalFilter`.
  2. **In-pane search sessions** populate `crew-store.sessions[].filters` via `crewStore.search()`.
- **Roster bulk-delete filters.** Live roster bulk-delete review is backed by
  `/api/roster/bulk-delete/candidates`; Scenario bulk-delete is client-side over loaded
  `ScenarioGanttData`. For Live RP windows, filter by the displayed crew/base-local start date, not only
  `roster_flight.sch_str_dt_utc`, otherwise UTC midnight rows can appear as the previous local calendar day
  (e.g. RP07 showing `2026-06-30`). Keep a padded UTC prefilter for index narrowing, then apply exact local
  date bounds. Live supports CrewId + `roster_flight.source` candidate filters; Scenario intentionally has
  only CrewId search/Refresh and keeps source as the existing grouping/read-only rule (`CR/MA` deletable,
  `PA/IMP` read-only).

---

## 10. Capabilities & what is genuinely Live-only / Scenario-only

The unification collapsed Flight, Pairing, and Roster panes onto shared components; the remaining forks are
the toolbar and layout grid (deferred until a concrete shared feature appears). Differences are expressed as
**capabilities/optional source members**, not files:

**Genuinely Live-only** (gated, not duplicated): crew locks + session-edit tags; undo/redo draft; cross-pane
drag-to-assign (`startDragToRoster`); lazy-load (`loadMore`); rich hover status lines; flight/pairing row
selection in the left panel; `setRenderedRows` quick-filter feedback; date-range / refresh / rule-group /
ground-task / keyboard-shortcuts / selection-count toolbar controls; Live's `/api/flight/navi-counts`-backed
Flight Navi.

**Genuinely Scenario-only** (mounted via capability/source, not forked panes): edit-lock Save/Acquire/Release
toolbar section + scenario/type/snapshot badges; the **Roster Quality Analyzer** (`useQualityAnalysis`,
Live leaves it undefined → no button); `scenario-context-menu.tsx`, `scenario-drag-provider.tsx`,
`scenario-status-bar.tsx`, `scenario-edit-controller.ts`, `scenario-violation-source.ts`,
`build-scenario-roster-items.ts`, `scenario-time-axis-menu.tsx`; Scenario's client-derived Flight Navi
(counts from loaded `ScenarioGanttData`).

**Default capability** for Live is `READ_ONLY_CAPABILITIES`; scenario capabilities come from
`data.capabilities` (pane visibility + edit gates), with `canReassign` additionally gated by lock ownership.

---

## 11. Testing the gantt (e2e harness)

### 11.1 The harness facts

- **App base path is `/altair/`** (vite `base`). Old specs pointing at `/fpqe/portal/` or `/fpqe/gantt/` 404. The
  Playwright web-server health check must target `/altair/`.
- **There is no `playwright.config.ts` at `e2e/` root.** Always pass
  `--config=config/playwright.config.ts` (or use `npm run test:gantt`); bare `npx playwright test` fails
  with "Cannot navigate to invalid URL" (no baseURL).
- **Auth is per-tab `sessionStorage` key `rois-auth`** (`{user, token}`), NOT Playwright `storageState`.
  Seed via `page.addInitScript` (runs on every navigation/reload). Login `POST /api/auth/login {userCode,
  password}` → enveloped `{ code, data: { token, … }, message }` — read `body.data.token`. Helpers:
  `ganttApiLogin` / `seedGanttAuth` in `e2e/utils/gantt-hook.ts`.
- **Credentials:** admin `Ryan` / `Our2027` (`isAdmin=1`, needed for `/api/admin/*` like violations-init);
  non-admin `Jen` / `Our2027`. Default `admin`/`123456` is rejected by the remote demo DB. Pass via
  `GANTT_TEST_USER` / `GANTT_TEST_PASS`.
- **Navigating `/altair/` lands on the Dashboard**, not the Live pane view. Roster/pairing/flight panes
  mount **after clicking `module-nav-live`**. Use the `gotoGantt()` helper (`e2e/utils/gantt-hook.ts`).

### 11.2 The `window.__ganttTest` introspection hook

`gantt/src/utils/gantt-test-hook.ts` (dev-only; gated behind `import.meta.env.PROD`, never ships):
`counts()`, `render()` (per-pane canvas `height`/`totalRows`/`renders`), `ready()`,
`roster()`/`pairings()`/`flights()`, `zoom()`; filter: `applyCrewFilter()` / `activeCrewFilter()`; rule
groups: `ruleGroupCodes()` / `setRuleConfigGroupCode()`; violations: `liveViolations()` /
`scenarioCrewViolationSeverities()`. Use it for canvas assertions instead of pixel-reading.

### 11.3 Scenario test pattern & running tips

- Scenario flow: login → `/altair/` → search → select by **#id** → open `scenario-gantt-view`.
  Fixtures: **scenario 6** (live-backed RO, ~14–26 crew, MCred present) and **scenario 460** (copy-backed,
  FAILED-but-loaded — proves the read-only render gate). Slow remote DB makes the open step flaky — see
  skill `gantt-scenario-open-e2e`.
- **Run a gantt spec when pbs-server (:3002) is down:** `cd e2e && npx playwright test
  --config=config/playwright.config.ts --project=gantt --no-deps <spec>.spec.ts --reporter=list`. `--no-deps`
  skips the pbs auth.setup; specs re-seed gantt auth per-test anyway.
- **Concurrent sessions / worktree isolation:** the repo may be shared by two sessions editing the same
  working tree → vite HMR fires mid-run → flaky tests. Isolate in a `git worktree`, symlink `node_modules`
  for gantt/e2e/packages/ui, start the worktree's own vite on a free port (`VITE_PORT=5273 npx vite --port
  5273`), and run `GANTT_BASE_URL=http://localhost:5273 npx playwright test … --project=gantt`. (Note: the
  worktree's `node_modules/@rois/ui` resolves to the ORIGINAL `packages/ui`; new exports are invisible until
  merged.)
- **Test ID scheme** (per `docs/test-cases/e2e/README.md`): prefix by tab — Live = 1xxx, Scenario = 2xxx,
  PBS = 3xxx, Perf = 4xxx, Data = 5xxx. IDs are globally unique, never reused. Data cell testid:
  `data-cell-<entity>-<col>`.
- Examples to copy: `e2e/tests/gantt/` (`filter-bring-to-top.spec.ts`, `find-crew.spec.ts`,
  `flight-navi.spec.ts`, `alert-center-8002.spec.ts`, `first-paint-phases.spec.ts`, the
  `scenario-539/540-rust-solver-run.spec.ts` runs).

### 11.4 Canvas right-click reliability

Flight and Roster canvas right-click is **reliable**; **pairing-canvas right-click is flaky** in current
demo data (segment geometry unreliable) — don't trust it in e2e, use roster/flight, or unit-test the
orchestration logic (`findCrewToTop`, `findPairingsByFlight`) with Vitest instead.

Scenario Roster row pinning mirrors Live as a view-only row-freeze aid: selected crew rows can be pinned
from `ScenarioContextMenu`, persisted only in `scenario-layout-store.frozenCrewIds`, and cleared by
`Unpin All` or the shared pin icon. Scenario roster task right-click selects the crew row before opening
the menu so the same real puck right-click path can expose `Pin N Selected Row(s)`; header-row right-click
is also wired through `SharedRosterPane` for crew-background rows. E2E guard:
`scenario-context-menu.spec.ts` Scen-2033.

**F386 mirror lesson supersedes the puck-entry wording above:** roster pin is a crew-row action,
not a duty-puck action. The canonical pin entry point is the left roster detail row
(`PaneHeaderCanvas` → `SharedRosterPane`) in both Live and Scenario, because a crew can have no
roster duty/puck and still must be pinnable. Scenario's menu must read the source-backed roster
selection (`scenario-roster-selection-store`), not generic `pane-store` row selection, otherwise
the left-row context menu opens with no selected crew and no pin action. Right-clicking a roster
duty may still expose pairing/detail actions, but pin/unpin parity must be validated from the
left row. The right-canvas frozen overlay must also stay non-destructive: tint/separate the
pinned row, but do not blank it or draw a centered "Pinned" label over roster content. Duties
remain visible while pinned. Current E2E guards: Scen-2033 (left-row pin/unpin + duty remains
visible while pinned) and Scen-2034 (no-duty row can pin).

---

## 12. Conventions

- **Version bump (mandatory):** runtime counters live in ignored `live-server/version.tmp`, managed by
  `scripts/version-state.mjs`. Module `dev` / `build` scripts bump the relevant counter automatically
  (gantt/Vite → frontend, live-server/connector-server → backend, pbs-server → PBS backend,
  pbs-portal → PBS frontend), and Vite HMR bumps frontend after hot updates. Do not edit or recreate
  `gantt/src/version.ts`; it was removed. The gantt UI still displays `Ver:B{n}/F{n}/R{n}` in the top nav
  and ThemeSwitcher dropdown.
- **UI-standard gate:** run `npm run check:ui` (root) before committing UI changes — **hard violations must
  be 0** (magic font sizes `text-[Npx]`, over-weight `font-extrabold/black`, hardcoded radius `rounded-[Npx]`,
  arbitrary `font-[…]`). Paste the PASS result per §No-Illusion. A pre-push git hook enforces it; the
  `e2e/tests/perf/ui-standard.spec.ts` spec reuses the same checker.
- **§First-Paint is the #1 priority:** the first batch of crew/pairings must paint in 1–2s. Violations
  (bells), KPI, credits, stats load **after** first paint, asynchronously, and only for already-loaded crew.
  New data sources must not block first paint (use pagination / lazy-load / virtualization). A first-paint
  regression (>2s) is a bug (`Perf-4xxx` baselines).
- **UI language = English** by default (buttons, labels, placeholders, empty states). Chinese only when the
  user explicitly asks or i18n is set to Chinese. Comments/commits/docs may be Chinese; UI strings may not.
- **Pop-ups:** all dialogs use `@rois/ui` `AppDialog` (blue title bar, left icon, draggable, footer-right
  buttons). Don't hand-roll bare `Dialog`.
- **§Pane-Toolbar-Home — data/action buttons live in the pane toolbar, never in their own band**
  (`gantt/CLAUDE.md`): pane-level data/action controls (Recheck, alert bell, quality Gauge, Filter, Sort,
  Settings) belong in the **pane toolbar's right icon cluster** — i.e. `pane-condition-strip.tsx`, the row
  holding bell/gauge/filter/sort/settings (shared by Live & Scenario). A new pane action (e.g. Recheck) goes
  on that row next to its semantic sibling (Recheck next to the alert bell). The **top** toolbars
  (`gantt-sub-toolbar.tsx` / `scenario-gantt-toolbar.tsx`) hold only **view-level chrome** (zoom, timezone,
  save, lock, pane toggles, reset) — don't push pane data-actions up there. **Never insert a horizontal
  `<div>` band between toolbar and grid just to hold one button** — it wastes a whole vertical strip (violates
  §First-Paint density). A status/warning (e.g. param-stale "Legality may be outdated") is **not** a reason
  for a permanent row: make it a badge/tint/tooltip on the button (like the bell's count badge), or inline it
  only while the state is active. Test: *if the warning is absent, does the band collapse to a lone
  right-aligned button?* If yes, it shouldn't exist. Per §Gantt-Unify, Live & Scenario put the same button in
  the same `pane-condition-strip` slot. **Buttons added to the cluster must match its existing form** —
  icon-only square buttons (`h-5 w-5`, icon `h-3 w-3`, `text-muted-foreground` + `hover:bg-accent/60`),
  NO text label; put the label in a `title` tooltip and any count/status in an absolute corner badge (like
  the bell's count). A text-labelled button wedged into the icon cluster reads as out of place. (Lesson
  2026-06-22: Scenario Recheck was wrongly given a dedicated `scenario-legality-bar` band, then first ported
  as a text button; correct home is an icon-only button in the pane toolbar next to the alert bell.)

---

## 13. Gotchas & hard-won knowledge

### (a) Filters & stores
- **Two crew-filter mechanisms** — global Filter dialog → `crew-store.activeGlobalFilter`; in-pane search →
  `sessions[].filters`. Reading only `session.filters` shows nothing for a global filter. Apply via
  `applyGanttFilters()`.
- **`PairingFilter.coverage` default is `['open', 'partial']`, not empty and not all-states**
  (`filter-store.ts:66`). Verified 2026-06-23 against the running app and the product screenshot. A Phase-3
  regression once came from treating it as empty; some specs/comments (and an earlier version of this playbook)
  wrongly claim the default is `[...ALL_COVERAGE]` — that is stale. Open+partial is the live default, so the
  pairing pane opens narrowed (and the open-credit badge shows out of the box).
- **Scenario Locate Pairing vs coverage (2026-08-03):** `scenarioLocatePairing` only sets found ids + scroll.
  If the pairing is already full/over, the default open+partial hard filter used to drop it before the float
  tier ran → "Locate Pairing does nothing." Fix: `pairingMatchesSharedFilterWithOverlays` keeps found/frozen
  ids visible through coverage (Live `makeLivePairingPaneSource` already did). Non-coverage hard filters
  (base/fleet/label/…) still apply to overlays.
- **Persisted-violation rule-group divergence** — the 8002 bell + Alert Center read `useRuleCheckStore.
  ruleGroupCode` (toolbar selector, default `pbs_solver_ruleset`). The Rule-management page uses a *different*
  store (`useRuleConfigStore.selectedGroupCode`, default `ccar121_pbs`). When they diverge the fetch hits the
  wrong group → empty results. Always resolve via `useRuleCheckStore.ruleGroupCode || 'pbs_solver_ruleset'`.
  E2E won't catch it (it skips the Rule-management mount).
- **8002 rolling-window anchor vs effective window** — Live and Scenario 8002 findings keep
  `pairing_id`/`start_dt`/`end_dt` as the physical anchor for canvas puck badges, but store
  `window_start_dt`/`window_end_dt` for the actual rolling window. `/api/violations` includes a
  row when the effective window overlaps the opened Gantt range, even if the anchor pairing is
  outside that range. The roster source builds a separate `crewViolationSeverityMap` for crew
  bells; `violationMap` remains task-id based so no fake puck is drawn in the earlier month.
  This is what makes crew 2380's YYC-local `2026-06-16..2026-07-13` 8002 visible in the June
  bell while keeping the July 13 pairing as the physical anchor.
  **Tooltip trap:** row-bell hover must also aggregate `displayViolations` by owner `crewId`;
  scanning only visible roster items / pairing ids misses cross-window 8002 rows whose anchor
  pairing is outside the opened month. Scenario row-bell hover uses the same tooltip component,
  but the scenario view must mount it with `scenarioId` and the shared roster header must wire
  `onViolationHover`; otherwise the bell still draws/clicks while hover never opens. Task-puck
  hover stays task/pairing-scoped. Scenario roster puck hover still must mirror Live's event chain:
  the adapter's `onItemHover` writes `useGanttViewStore.setHoveredTask(...)`, and `ViolationTooltip`
  resolves the hovered task from Scenario roster items instead of Live `useRosterStore`. Do not
  use a broad `v.crewId === task.crewId` match in task-puck mode; that belongs to crew-header bell
  hover and causes a puck to show unrelated violations from the same crew.
- **Zustand v5 fresh-snapshot trap** — a selector that builds a new array/object every call makes
  `useSyncExternalStore` see a new snapshot every render → `Maximum update depth exceeded` (manifests as
  "scenario-gantt-view never visible," not an obvious loop). Wrap such selectors in `useShallow`
  (`zustand/react/shallow`). Scenario pairing hit this via a found-ids union.
- **Scenario/live Pairing ids are not globally unique.** A PO-backed RO can display `scenario.pairing`
  rows and Live pre-assignment rows in the same Scenario Gantt payload; the same numeric `id` can mean
  different segments in each source. Backend payloads must carry `(pairingSource, sourcePairingId)` and
  rewrite `pairingId` to a payload-unique display id for pairings, segments, and assignments. PA roster
  rows are Live-owned, so do not add their ids to a scenario partition `WHERE id IN (...)`; append their
  geometry via the Live merge. See spec
  `docs/superpowers/specs/2026-07-23-ro-scenario-pairing-source-scope.md`.
- **Crew Bids Viewer period identity (2026-08-19):** Scenario > Crew Bids Viewer must query Current bids
  by `rosterPeriodId` (`pbs_bid.roster_period_id`), not by `periodCode` / `pbs_period_code`. The PBS
  period code is only a display label; relying on it caused RP06 to fall back to `May 2026` when
  `GET /api/roster-periods` omitted `pbsPeriodCode`. Base/rank filters also come from Live effective
  `crew_base` / `crew_rank`, not `pbs_user`.

### (b) Layout / rendering
- **Live docked layout uses the LayoutGrid path** — `LayoutGrid → GridRow → GridCell → PaneWrapper → pane`,
  with the grid model in `layout-store.ts`. `layout/pane-container.tsx` and `pane-store.ts`'s `DEFAULT_PANES`
  are **legacy and unused** for docked panes — editing them has no visible effect.
- **Gantt entry = Dashboard, not Live** — panes mount only after `module-nav-live`.
- **Shell-hoisted dialogs (Toaster, RuleConfirmDialog, PairingInfo, …)** — mount once on `AppShell`.
  Anything that only lives under Live `AppLayout` is invisible on Scenario, or trapped under an
  inactive keep-alive Live tab (`invisible pointer-events-none`). Draft assign legality confirm
  must stay on the shell.
- **Scenario tab memory suspension** — hidden scenario tabs suspend (canvas/grid → placeholder, polling
  paused). Reactivation re-renders from store data with NO `/gantt-data` refetch; edits/locks survive. The
  per-tab savings (canvas backing store) scale at 300+ crew; measured on scenario 6 (14 crew = ~1.38 MB) it's
  small — **re-measure before shipping any idle data-release (Phase 4/5 TODO).**
- **Scenario top-nav trigger** — when an open Scenario Gantt is active, clicking the top-level Scenario
  trigger only opens its dropdown. It must not call `setModule('scenario')` before selection; the explicit
  **Scenarios** menu item performs the list navigation, while an opened Scenario row restores the keep-alive
  Gantt tab without another `/gantt-data` load.

### (c) Canvas interactions
- **Right-click reliability varies by pane** (flight/roster reliable, pairing flaky) — see §11.4.
- Canvas testids: `flight-canvas`, `pairing-canvas`, roster canvas — verify the current testid in the
  component before asserting; introspect counts via `__ganttTest.render()`.
- **Daily Gantt Statistics assignment semantics** — `No Assignment` excludes a crew when either a
  roster task or an assigned pairing's inter-duty layover intersects the selected calendar day.
  Layover rows come only from the scheduled gap between adjacent `dutySeq` values in the same
  pairing; the final duty's trailing rest is not a pairing layover. Clicking a statistic with Crew
  targets the Roster pane; a Crew-less Layover or Open Pairing targets the Pairing pane.

- **Pinned roster rows must not blank the right canvas.** `drawFrozenOverlay()` is shared by Live
and Scenario. It may apply frozen-row tint and separator lines, but must not clear the frozen zone
or draw a centered `Pinned` label over row content. Roster renderer must still draw duties for
`rowIndex < frozenRowCount`; otherwise a pinned crew appears to lose/block its roster line.
- **Pinned Pairing/Flight rows use the same invariant.** The right canvas must draw frozen rows
before scrollable rows, then let `drawFrozenOverlay()` add only tint/separators. Do not leave
`renderPairingTasks` / `renderFlightTasks` in a "non-frozen rows only" mode; that makes Pin look
successful in the left header while the actual pairing/flight block disappears on the right. Pairing
also has a taller header (`PAIRING_HEADER_HEIGHT`), so shared frozen separator math must read
`BaseRenderContext.headerHeight` instead of hard-coded `HEADER_HEIGHT`.
- **Scrollable task content must be clipped below the frozen zone.** Re-tinting pinned rows after
task rendering is not enough: while scrolling, unpinned task blocks can otherwise bleed upward into
the last pinned row until the overlay covers only part of them. Pane renderers must draw frozen rows
normally, then wrap scrollable row content in a canvas clip beginning at
`headerHeight + frozenRowCount * rowHeight` (`PAIRING_HEADER_HEIGHT` / `PAIRING_ROW_HEIGHT` for
Pairing). This applies to Roster duties/session tags and Pairing/Flight blocks in both Live and
Scenario.

### (d) HTTP / data
- **`http-client` unwraps any `{code}` envelope** — `services/http-client.ts` (`createHttpClient`)
  automatically treats any response body with a top-level `code` field as a wrapped envelope, silently
  breaking endpoints whose legitimate payload *contains* `code`. Use a dedicated plain `axios.create()` for
  such services (e.g. `regression-api.ts` vs the shared client).
- **Flight→pairing/crew linkage is server-only** — the pairing list omits `flights[]`/`segments[]`, and
  roster DTOs carry `fltId = null`. The join exists only in the DB (`pairing_segment.flt_id`,
  `roster_flight.flt_id`). Any per-flight count feature must hit the backend (batched
  `GET /api/flight/navi-counts`, not N+1).
- **Live-server runs against a REMOTE Postgres** (the demo DB), not localhost; the local `f8` schema is
  empty. Inspect via the API (Bearer token) or node `pg` with `DATABASE_URL` from `live-server/.env` (no
  psql).
- **Hot reload + Redis cache** — live-server runs under `tsx watch` (auto-reload ~2s). Responses are
  Redis-cached (~10 min TTL); after a code change bust the relevant key (e.g. `pairing:crewdetail:*`) or you
  read stale data.
- **Import PBS Material progress is cross-process SSE history, not a single latest event.** Connector-side
  fetch/transform/enqueue stages are published by `connector-server/src/utils/import-progress-bus.ts`; DB write
  stages are published by `live-server/src/utils/import-progress-bus.ts`; the browser subscribes through
  `GET /api/scenario/import-pbs-material/:importId/events`. A late SSE subscription must receive the full Redis
  history list (`import:history:<id>`) before live channel events, otherwise the frontend reducer cannot
  reconstruct completed fetch/transform/enqueue stages and the progress bar appears stuck or jumps straight to
  complete. Regression coverage must drive the real Import PBS Material dialog + SSE endpoint
  (`e2e/tests/gantt/scenario-import-pbs-material-progress.spec.ts`), not only inject a mocked `progress` prop.
  Two follow-on traps are pinned by 2026-07-17 tests: selected materials with no first stage event yet still
  render as `Fetching data...` while the import is running (so `RosterGround` does not look stuck at `Waiting`),
  and final Added/Updated/Deleted numbers must come from live-server worker return values. The frontend must not
  infer those counts from `imported`.
- **Scenario import-to-live roster timestamps may be strings in SIT.** `GET /api/scenario/:id/roster` maps
  `scenario.roster_flight.sch_str_dt_utc/sch_end_dt_utc` into frontend `RosterAssignment` ISO strings. Do not
  assume the DB row values are always `Date` objects and call `.toISOString()` directly; normalize
  `Date | string | null` first. This avoids the SIT dialog failure
  `Failed to load result: r.sch_str_dt_utc?.toISOString is not a function`.
- **Drizzle array trap in import fill refresh.** Do not write `ANY(${ids})` for JS arrays in raw Drizzle SQL.
  It can render as `ANY(($2, $3, ...))`, a PostgreSQL row expression rather than an array, and fail large
  Import PBS Material runs during `pairing_composition.fill` refresh. Use the pattern in
  `live-server/src/utils/composition-fill.ts`:
  ```ts
  sql`ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::bigint[])`
  ```

### (e) E2E testing & auth
- Auth via `sessionStorage` + `addInitScript`; login envelope is `body.data.token`; admin `Ryan/Our2027`;
  `--no-deps` to run without pbs; always pass `--config=config/playwright.config.ts`; worktree + alt-port
  vite for concurrent-session validity. (Full detail in §11.)

### (f) Live-server / DB runtime quirks
- Crew **Base** in Pairing Info comes from `crew_base` (effective at pairing start), not
  `roster_flight.base`. Engine/scenario rosters have blank `roster_flight.base`.
- `dutyActCreditedMinutes` is the only populated credit source on roster rows; `roster_flight`'s own credit
  columns are null in the dataset.
- **Non-flying (ground) puck text = `buildGroundTaskPuckLabel(task)`** (`roster-renderer.ts`, exported &
  unit-tested in `__tests__/ground-task-puck-label.test.ts`). Rule (F314): prefer the specific
  `roster_flight.label` over the generic `assignment`, falling back `label → assignment → assignmentGroup`.
  **Why:** ground `assignment` has only ~8 generic codes (DO/VAC/RES/GRD/ILL/DHD/SIM/SFT) while `label` has
  ~309 specific reasons (DO→GDO/MLOA/VGDO/MATL/LEAVE…, GRD→FAIT/CGS/CRM…, RES→CRAM/CRPM…). **Trap:** for
  `assignment='DHD'` (deadhead) the `label` holds a *flight number* (F8606, AC178…), so DHD is the one
  exception that keeps its code instead of the label. ~269 ground rows have null `label` → fall back to
  `assignment` (regression-guarded). Shared renderer → applies to Live AND Scenario.
- **Scenario Zoom to Month must use the measured TimeAxis width, same as Live.** Live passes the clicked
  axis `rect.width` into `zoomToMonth`; Scenario previously estimated `window.innerWidth - leftPanelWidth - 14`,
  which was wrong when the scenario pane was not full-width (multi-pane/grid layout). Keep
  `ScenarioTimeAxis` and `ScenarioTimeAxisMenu` passing the measured viewport width into
  `scenario-gantt-store.zoomToMonth`; unit coverage lives in `scenario-gantt-store.test.ts`.
- **RPDate zoom is viewport-only and keeps the complete loaded range scrollable.** Live and Scenario can
  include lead-in/out days before and after the selected RP. After `zoomToRp`, the viewport shows the
  intersection of the selected RP and the already-loaded range, while `scrollWindowStartX` /
  `scrollWindowEndX` represent the complete loaded range. For a loaded range of
  `2026-06-24` through `2026-08-07`, GO TO RP06 shows `2026-06-24` through `2026-06-30`, RP07 shows
  `2026-07-01` through `2026-07-31`, and RP08 shows `2026-08-01` through `2026-08-07`; the thumb must
  remain draggable back to `2026-06-24`. The time-axis **GO TO RPDate** menu must not call `setDateRange` or
  `applyGanttFilters`; backend loads happen only when the user changes the selected RP range or applies
  query filters. After a query-filter Apply, a multi-RP selection restores the viewport to the full
  selected RP union (for example `2026-07-01` through `2026-08-31` for RP07+RP08), while the loaded
  date range keeps its surrounding 7-day buffer. Manual Timeline drag-to-zoom is a normal viewport action in
  both Live and Scenario: after changing `pxPerHour`, clear the old RP pixel window
  (`scrollWindowStartX=0`, `scrollWindowEndX=null`) so the horizontal scrollbar geometry is computed from the
  new zoom scale instead of stale RP-sized coordinates.
- **Scenario canvas lead-in/out is fixed to the official scenario calendar.** `strDtLoc/endDtLoc`
  must be exactly the official scenario start/end dates padded by 7 calendar days, normalized to
  `00:00:00` at the start and `23:59:59.999` at the end. Pairings outside that display window must
  not widen the Scenario Gantt range; the scenario dates are the source of truth.
- **RP calendar boundaries must be display-timezone midnights.** `roster_period.rp_start/rp_end` are
  calendar dates; never parse them as UTC midnight for axis/zoom. Use `calendarDateToUtcMidnight` and
  `endOfCalendarDayUtc` with `useTimezoneStore.timezone`. The symptom of doing this wrong is a west-shifted
  left edge such as `2026-06-23 17:00` instead of the intended `2026-06-24 00:00`.
- **Ground-task Status Bar times are Base-local, not UTC slices and not the selected display timezone.**
  Ground tasks (`pairingId == null`) carry their own `base`; `formatGroundTaskStatusLine` resolves that Base
  through `airport-tz-store.zoneIdFor(base)` and formats with the cached `timezone-store` helpers. If the Base
  timezone is unknown, fall back to UTC. Live and Scenario roster hover both pass the resolver into the shared
  formatter, so do not reintroduce direct `schStrDtUtc.slice(...)` for ground-task status text.
- **Scenario Crew rows are filter-scoped, not result-scoped.** DB-backed Scenario Gantt must load crew from the
  Scenario Crew Filter scope (`division`, `bases`, `ranks`, `fleets`, seniority, birthday, effective dates).
  Do not derive the crew list from `scenario.roster_flight` assignments or ground rows; a filtered crew with no
  optimizer task is still a visible empty crew row. KPI `Crew Utilized`, Credit Hours, and Distribution crew
  denominators must use the same filter scope, while FLY Pairing Lines stay limited to Gantt-visible FLY
  pairings.

### (i) Realtime data synchronization boundary

See [`docs/architecture/gantt-realtime-data-sync-standard.md`](../../architecture/gantt-realtime-data-sync-standard.md).

### (h) MCred / RpCred / RpDO — server value + live draft delta
- **MCred/RpCred/RpDO are server aggregates, not roster sums.** Live panel cells come from
  `crew-store.crewStatsMap`. For RP-oriented values, key stats by `crewId:rosterPeriodKey` (`YYYYRPnn`)
  and fetch `crew_manday_{fd|cc_am}_period` (`crew-stats-service.ts`) — NOT summed from
  `roster_flight`. Scenario must use the same roster-period key and period tables, including when seeding
  DB/gz scenario payloads. These aggregates do **not** recompute on de-assign by themselves.
- **Live optimistic delta (shipped 2026-06-22, F308):** the Live adapter now shows
  `mcred = stats.mcred + (credit(virtual roster) − credit(base roster))` for the displayed month, via
  `sumCrewCreditMinutes` (`utils/format-credit.ts`, deduped by `(pairingId,dutySeq)` mirroring the backend
  `MAX(duty_act_credited_minutes)` model) and `draftCreditDeltaByCrew` in `live-gantt-source.ts`
  (`useRosterModel` memo, deps include `baseItems`+`items`). De-assign/add moves MCred before Save and reverts
  on undo. **Live-only** (Scenario is edit-locked); the delta util is shared.
- **Cross-user live update (shipped 2026-06-22, B161/F310):** when A saves, B sees the new roster AND updated
  MCred with no refresh. `/api/draft/commit` recomputes crew manday credit **synchronously** (`recalcMandayCredit`,
  windowed around each edited duty's date) *before* `wsBroadcastAll('roster-updated', crewIds)`, so the one WS
  event carries fresh credit (the async `manday:recalc` queue is best-effort and was unreliable — phantom
  consumers on the shared `rule-check-realtime` queue + jobId dedup; don't rely on it for correctness). The gantt
  `lock-store` `roster-updated` handler (`refreshCrewsFromBroadcast`) refetches roster + crew-stats for the
  broadcast crews **this user has loaded** (§First-Paint scope), keyed to the current viewport period
  (`getLiveViewportRosterPeriod()` for RP-backed fields; keep `getLiveViewportYearMonth()` only for true
  calendar-month fields) (display-tz). Was a `markDirty()` stub. Phase B (authoritative
  `POST /api/draft/preview-stats` reconcile for
  guarantee-band exactness) is still designed-but-not-built — see
  `docs/superpowers/plans/2026-06-22-live-mcred-realtime-recompute.md`.
- **Save redraw invariant:** Scenario replaces its entire `data` object after `patch-output`; the
  source `dirtySignal` must advance with that replacement so Header Canvas repaints immediately. Do not
  require a horizontal scroll event to reveal newly loaded `RpCred/RpDO` values.
- **⚠️ Optimistic delta ≠ authoritative credit on guarantee-band crews.** Phase A naively subtracts the pairing
  credit; the server's 8002 model has a 75/65h monthly floor. For a floored crew, A's optimistic drop is wrong
  and reverts after save (server value). Pick crews above the floor when testing a *visible* MCred change
  (`rosterProbeWithCredit` requires `dutyActCreditedMinutes>0` on the pairing AND crew mcred>0). Phase B will
  reconcile this.
- **`viewportYearMonth` is read in the DISPLAY tz (fixed F309).** It must match the dates the user sees on the
  axis (rendered in the display timezone), not the host/OS tz. Originally it used
  `new Date(viewportLeftDayMs).getMonth()` (host LOCAL tz) while items match by UTC `schStrDtUtc.slice(0,7)`; a
  planner whose OS tz is **west** of the display tz (e.g. Pacific OS + Toronto display) viewing June resolved the
  viewport to **May**, so the crew-stats request `yearMonth=` **and** the credit delta both keyed to May and a
  June de-assign changed nothing visible. Fix: `yearMonthInTimeZone(utc, tz)` (`gantt-utils.ts`, cached tz
  formatter) reads the left-edge instant's month in `useTimezoneStore.timezone`. Whenever you need a "viewport
  month," use this — never `Date#getMonth()`. `Live-1310` pins a **Pacific** browser tz as the regression guard.
  Test introspection: `window.__ganttTest.rosterMcred()` returns the rendered `{crewId, mcred}` panel text;
  `rosterProbe()` + the `roster-box-delete.spec.ts` puck-click geometry is the canonical de-assign harness.
  (De-assign path is e2e-proven; the add-pairing credit wiring on assign-pairing placeholders is unit-covered but
  has no reliable cross-pane-drag e2e yet.)

### (g) Unification status & the asymmetry bugs
- **Sharing baseline 45.3%** (2026-06-15, `live-scenario-code-sharing-tracker.md`). Flight, Pairing, and
  Roster panes are now collapsed onto shared components; toolbar + layout grid remain forked. Re-measure with
  `scripts/measure-gantt-sharing.sh` and append a tracker row after any view-layer change. The unification
  work lives on local `main` (deliberately merged, may be unpushed) — commit locally, don't push without
  asking.
- **The division-scoping asymmetry** (§8.3): scenario crew scope is division-filtered, pairing scope is not.
- **Roster sort was a scenario NO-OP** before unification (MCred/MDO didn't sort in scenario); now both use
  the shared `sortPanelRowsByValues` path.

---

## 14. File / code index

| Concern | Primary file(s) |
|---|---|
| §Gantt-Unify rule | root `CLAUDE.md` §Gantt-Unify; `gantt/CLAUDE.md` |
| Unification design / plan / study | `docs/superpowers/specs/2026-06-15-unify-live-scenario-gantt-design.md`; `…/plans/2026-06-15-unify-live-scenario-gantt.md`; `…/specs/2026-06-16-unify-roster-pane-toolbar-design.md`; `docs/dev-context/2026-06-16-live-scenario-roster-unification-study.md` |
| Sharing tracker | `docs/architecture/live-scenario-code-sharing-tracker.md`; `scripts/measure-gantt-sharing.sh` |
| Source seam | `gantt/src/components/gantt/source/gantt-pane-source.ts`; `gantt-source-context.tsx` |
| Live / Scenario adapters | `…/source/live-gantt-source.ts`; `…/source/scenario-gantt-source.ts`; `scenario-edit-controller.ts`; `scenario-violation-source.ts` |
| Shared panes | `gantt/src/components/panes/shared/{roster,pairing,flight}-pane.tsx` |
| Live wrappers | `gantt/src/components/panes/{roster,pairing,flight}-pane.tsx` |
| Scenario wrappers | `gantt/src/components/scenario-gantt/scenario-{roster,pairing,flight}-pane.tsx` |
| Canvas / renderers / interactions | `gantt/src/components/gantt/{pane-canvas,pane-header-canvas}.tsx`; `renderers/*`; `interactions/*` |
| Context-store factory | `gantt/src/stores/create-context-store.ts`; `gantt/src/types/gantt-context.ts` |
| Stores | `filter-store.ts`, `pane-store.ts`, `column-store.ts`, `timezone-store.ts`, `ui-store.ts`, `scenario-gantt-store.ts`, `scenario-layout-store.ts`, `scenario-{roster,pairing,flight}-selection-store.ts` |
| Live layout grid | `gantt/src/components/layout/{layout-grid,grid-row,grid-cell,pane-wrapper}.tsx`; `layout-store.ts` |
| Shared filter dialog | `gantt/src/components/layout/filter-dialog.tsx` |
| Gantt type shapes | `gantt/src/types/{pairing,flight,roster,scenario-gantt,column}.ts` |
| Live backend routes | `live-server/src/routes/{gantt,crew,roster,pairing,flight}/*.ts` |
| Scenario backend | `live-server/src/routes/scenario/scenario.ts`; `services/scenario/{scenario-export-service,scenario-gantt-db-service,scenario-gantt-service}.ts`; `config/env.ts` |
| Data model | `docs/architecture/data-model.md`; `docs/architecture/codebase-index.md` |
| Test hook | `gantt/src/utils/gantt-test-hook.ts` |
| E2E helpers / specs | `e2e/utils/gantt-hook.ts`; `e2e/tests/gantt/*.spec.ts`; `e2e/config/playwright.config.ts` |
| Version / UI gate | `live-server/version.tmp` via `scripts/version-state.mjs`; `scripts/check-ui-standard.mjs` (`npm run check:ui`) |

---

## 15. Open / known issues & follow-ups

1. **Toolbar + layout-grid forks remain** (Phase 4/5 of the plan). The shared `GanttToolbarControls`
   (ZoomControl + TimezoneSwitcher + pane toggles + AlertCenter) and a unified per-pane toolbar are designed
   but not fully landed; the layout grid is still per-view. Collapse them only when a concrete shared feature
   needs it (§Minimal-First).
2. **Pairing scope not division-filtered server-side** (§8.3) — fix in `scenario-export-service.ts`
   `pairingIdSet` if/when scenarios must be division-scoped.
3. **Scenario memory-suspension idle data-release** (Phase 4/5 TODO) — current suspension drops canvas
   backing store and pauses polling but keeps store data resident; revisit idle data-release at 300+ crew
   scale, and re-measure before shipping (scenario 6 = 14 crew is too small to show benefit).
4. **Re-measure sharing %** after the next view-layer change and append to the tracker; the baseline 45.3%
   predates the Roster/Pairing/Flight collapses, so the current figure is higher — capture it.
5. **Deferred drizzle-orm SQLi upgrade** (`<0.45.2`, breaking) is an open security follow-up touching
   live-server query building; relevant to gantt only via the backend data routes it shares.

### Scenario result SVG charts

Scenario result charts use a fixed-height SVG. Do not combine a fixed `viewBox` width with
`preserveAspectRatio="none"`: a wide result panel then applies a different horizontal scale to the
SVG text and bars, making the chart look stretched. The Distribution charts instead measure their
content width with `ResizeObserver`, use that width in the `viewBox`, and keep
`preserveAspectRatio="xMidYMid meet"`. Keep the E2E assertion that the measured `viewBox` width and
rendered SVG width stay within 2 CSS pixels.

---

## 16. RES Pairing Creator (Live-only)

> Full reference: skill `~/.claude/skills/128-res-pairing-management/SKILL.md`.
> Spec: `docs/superpowers/specs/2026-06-23-res-pairing-creator-design.md`.
> Branch: `feat/gantt/res-pairing-creator`.

### What it does

Lets a planner **define, generate, and manage reserve (RES) pairings** — AM/PM standby coverage
per base × rank × date — directly from the Live Gantt, replacing hand-written SQL inserts. The
feature is **Live-only** (a business-level rule; Scenario never generates reserve duties) and is
enforced by the source capability flag, not a UI fork.

### Entry point

`pane-condition-strip.tsx` action cluster (the same row as Filter/Sort/bell), ShieldPlus icon,
`data-testid="res-pairing-button"`. Rendered only when `source.pairing.capabilities.canCreateRes`
is true. Live adapter sets it true; Scenario adapter omits it → no button. Prop passed as
`onResPairingClick` from `SharedPairingPane` to `PaneConditionStrip`.

### Dialog & store

- `gantt/src/components/res-pairing/res-pairing-planner-dialog.tsx` — `AppDialog`, Calendar icon,
  title "RES Pairing Planner", `data-testid="res-planner-dialog"`, `sm:max-w-[1100px]`.
  Mounted once in `AppLayout`. Three tab panels: **Define / Review & Generate / Manage existing**.
- `gantt/src/stores/res-planner-store.ts` — Zustand; owns `isOpen`, `tab`, `division`, `focusBase`,
  `selMode`, `dow`, `cells: ResPlannerCell[]`, `brush`, `amWindow`, `pmWindow`, `lastResult`.
  `mergeCells(incoming)` is idempotent — upserts by `date+base+timing`.

### Sub-components

| File | Role |
|---|---|
| `res-pairing/define-workspace.tsx` | Scope toolbar + calendar host + entry panel |
| `res-pairing/res-calendar.tsx` | Month grid calendar; cells `res-cell-<YYYY-MM-DD>` |
| `res-pairing/res-entry-panel.tsx` | Base × rank × AM/PM matrix + window editor; Apply writes cells |
| `res-pairing/review-generate.tsx` | Summary table + conflict policy + Generate; post-success sets PairingFilter + `applyGanttFilters()` |
| `res-pairing/manage-existing.tsx` | Filterable list; batch Modify plan/window; batch Delete with 409 surface |

### API client

`gantt/src/services/res-api.ts` — **dedicated `axios.create()` instance** (not the shared `http-client`;
the shared one auto-unwraps `{ code }` bodies and making the dependency explicit was a hard requirement).
Auth Bearer copied from `api.defaults.headers.common` via request interceptor.

### Backend

`live-server/src/services/res-pairing/res-pairing-service.ts` + `routes/res-pairing/res-pairing.ts`.

| Endpoint | Body → Response |
|---|---|
| `POST /api/res-pairing/generate` | `{ division, conflictPolicy, cells, dryRun? }` → `{ created, skipped, summary }` |
| `PATCH /api/res-pairing/batch` | `{ ids, plan?, window? }` → `{ updated }` |
| `POST /api/res-pairing/batch-delete` | `{ ids }` → `{ deleted, blocked:[{id,reason}] }` |

Cell shape: `{ date:'YYYY-MM-DD', base, timing:'AM'|'PM', window?:{start,end}, composition:[{rank,plan}] }`.

Conflict policy: `skip` / `overwrite` (replace composition) / `add` (duplicate). Keyed on civil
`pairing_dt + base + assignment`. Conflict rows are **batch-prefetched** before the transaction loop
(one query → O(1) Map lookup per cell — never per-cell SELECT inside the transaction).

Time util: `live-server/src/utils/zoned-time.ts` `localWallTimeToUtc(y,mo,d,hh,mm,zoneId)` —
DST-correct via `Intl.DateTimeFormat` probe-and-correct, no deps. PM windows cross midnight when
`end ≤ start` in clock minutes → `endDate = date + 1`.

Cache invalidation: `invalidatePattern(fastify.redis, 'pairing:list:*')` after each write.

### Dictionary parameters

`sql/seed/30-res-pairing-config.sql` (idempotent via `WHERE NOT EXISTS`):

- `RES_CALL_TYPE`: 4 rows; `code_value = '<callCode>|<start>|<end>|<crossesMidnight>'`
  — `P_AM→PRAM|10:00|22:00|0`, `P_PM→PRPM|20:00|05:59|1`, `C_AM→CRAM|…|0`, `C_PM→CRPM|…|1`.
- `RES_DEFAULTS`: `ASSIGNMENT_GROUP=RES`, `DEFAULT_FLEET=737`, `CONFLICT_POLICY=skip`.

### Key testids

`res-pairing-button`, `res-planner-dialog`, `res-tab-define/review/manage`,
`res-base-<CODE>`, `res-div-P/C`, `res-mode-day/range/dow`, `res-dow-<n>` (data-active),
`res-cell-<YYYY-MM-DD>`, `res-plan-<BASE>-<RANK>-<am|pm>`, `res-apply`,
`res-generate`, `res-generate-result`, `pairing-filter-chip-PRAM/PRPM/CRAM/CRPM`, `pairing-pane`.

### Acceptance tests

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps \
  tests/gantt/res-pairing-yvr-acceptance.spec.ts \
  tests/gantt/res-pairing-yyz-cabin-acceptance.spec.ts \
  --reporter=list
```

- **Live-1410** (`res-pairing-yvr-acceptance.spec.ts`): YVR pilot, Jun 2026 range, CA/FO=10 AM+PM,
  60 pairings, `PRAM-1000-2200`/`PRPM-2000-0559` labels, `__ganttTest.pairings().length === 60`.
  (No historical YVR reserve data in demo DB → agreed fallback 1 AM+1 PM/day.)
- **Live-1411** (`res-pairing-yyz-cabin-acceptance.spec.ts`): YYZ cabin, weekend IFD/FA 15 /
  weekday IFD/FA 14 (two DOW batches), 60 pairings, composition split verified via
  `res-pairing-comp-<date>-<code>-<rank>` testids in Manage tab.

Both tests pre-clean the demo DB via API before generating (§Simulate-User: API use is permitted
for pre-condition seeding; the user Generate action is clicked via the UI only).
</content>
</invoke>
