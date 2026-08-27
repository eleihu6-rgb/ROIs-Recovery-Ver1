# Scenario Gantt Left Panel — Feature Parity Design

**Date:** 2026-06-09  
**Status:** Approved  
**Scope:** Enhance `ScenarioGanttLeftPanel` to match Live Gantt left panel capabilities, without touching `PaneHeaderCanvas` (full component reuse deferred to post-live-refactor).

---

## Background

The Scenario Gantt left panel (`ScenarioGanttLeftPanel`) currently has a hardcoded 4-column layout with basic sort. The Live Gantt left panel (`PaneHeaderCanvas`) has full column resize, sort indicators, row selection, frozen rows, column visibility control, and violation/lock badges.

The goal is functional parity for Scenario Gantt, reusing data types (`PanelRowData`, `ColumnConfig`) and column-store infrastructure, while keeping the component separate until a planned live data-loading refactor enables clean full reuse.

---

## Approach: In-Place Enhancement (Plan A)

Enhance `ScenarioGanttLeftPanel` directly. No changes to `PaneHeaderCanvas` or live roster panes. The `PanelRowData` adapter layer serves as the interface contract for future full reuse.

---

## Features

| Feature | Description |
|---------|-------------|
| A. Column resize | Drag column boundary in header area, min 30px, persisted to column-store |
| B. Sort indicators | Column header click toggles asc/desc, arrow rendered in header, stored in column-store |
| C. Row selection (bidirectional) | Click row → highlight row + select crew's tasks in canvas; click canvas task → highlight crew row |
| D. Frozen rows | Pin crew to top, persisted in scenario layout store, pin icon on hover |
| E. Column visibility | Right-click header → checkbox list; crewId always visible; ybh/mcred hidden by default |

---

## Data & State Layer

### New PaneType: `'scenario-roster'`

Add to `column-store.ts`:

```typescript
'scenario-roster': [
  { key: 'crewId',    label: 'CrewId',  width: 70, visible: true,  order: 1, row: 1 },
  { key: 'rank',      label: 'Rank',    width: 45, visible: true,  order: 2, row: 1 },
  { key: 'base',      label: 'Base',    width: 45, visible: true,  order: 3, row: 1 },
  { key: 'seniority', label: 'Sen',     width: 50, visible: true,  order: 4, row: 1 },
  { key: 'mcred',     label: 'MCred',   width: 55, visible: false, order: 5, row: 1 },
  { key: 'ybh',       label: 'YBH',     width: 55, visible: false, order: 6, row: 1 },
]
```

Statistics columns (mcred, ybh) default to `visible: false` — scenario data has no stats. User can enable them; they show as empty string.

### `ScenarioGanttCrew[]` → `PanelRowData[]` Adapter

Computed in `scenario-roster-pane.tsx` via `useMemo`:

```typescript
const panelRows = useMemo((): PanelRowData[] =>
  filteredCrew.map((c) => ({
    rowId: c.crewId,
    values: {
      crewId:    c.crewId,
      rank:      c.rank,
      base:      c.base,
      seniority: c.seniorityNum ?? '',
      mcred:     '',
      ybh:       '',
      crewName:  c.crewName ?? '',
    },
  })),
[filteredCrew])
```

### Selection State (Bidirectional, Option 3)

Managed in `scenario-roster-pane.tsx`:

```typescript
const [selectedCrewIds, setSelectedCrewIds] = useState<Set<string>>(new Set())
const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set())
```

**Left panel → Canvas:**
- Row click → update `selectedCrewIds` → find all task IDs for those crew → update `selectedTaskIds`
- Ctrl/Shift for multi-select (same UX as live)

**Canvas → Left panel:**
- Task click → `ScenarioGanttCanvas.onSelectTasks` → update `selectedTaskIds` + reverse-lookup crewIds from `rosterCacheRef` → update `selectedCrewIds`

### Frozen Rows

`frozenCrewIds: string[]` (ordered) stored in `getScenarioLayoutStore(scenarioId)` for cross-refresh persistence. Frozen rows rendered at top of list, unaffected by `scrollY`.

---

## Component Layer

### `ScenarioGanttLeftPanel` — Updated Props

```typescript
interface ScenarioGanttLeftPanelProps {
  crew: ScenarioGanttCrew[]
  rows: PanelRowData[]             // pre-computed by parent
  columns: ColumnConfig[]          // from column-store 'scenario-roster'
  scrollY: number
  frozenCrewIds: string[]
  selectedCrewIds: Set<string>
  width: number
  onScrollY: (y: number) => void
  onColumnWidthChange: (key: string, width: number) => void
  onColumnHeaderClick: (key: string) => void
  onRowClick: (crewId: string, ctrlKey: boolean, shiftKey: boolean) => void
  onFreezeRow: (crewId: string) => void
  onUnfreezeRow: (crewId: string) => void
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
}
```

### `ScenarioGanttLeftPanel` — Rendering

Canvas rendering logic mirrors `PaneHeaderCanvas`'s `drawSingleRow`/`drawDataRows` — written independently in this file (not extracted from live, to avoid coupling before planned refactor). Visual output must be identical.

**Header area (HEADER_HEIGHT = 30px):**
- Column labels with sort arrow (↑/↓) on active sort column
- Drag resize: `mousemove` detects ±4px hotzone at column boundaries; `cursor: col-resize`; on mouseup calls `onColumnWidthChange`
- Right-click: native context menu listing columns with checkboxes (crewId non-removable)

**Data rows (ROW_HEIGHT = 36px):**
- Alternating row background (bgColor / bgColorAlt)
- Selected row: `rowSelectedColor` highlight + left accent bar
- Bottom span row: `crewName` in 9px secondary color
- Frozen rows: `rowFrozenColor` tint, fixed at top (no scrollY offset)
- Pin icon: appears on hover, filled pin for frozen rows (click to unfreeze), outline pin for unfrozen (click to freeze)
- Hover tracking: `onMouseMove` updates `hoverRowIndex` ref (no React state, triggers canvas redraw via RAF)

**Wheel & RAF:** Already implemented (native `{ passive: false }` + RAF-merged rendering).

### `ScenarioGanttCanvas` — Small Change

Add `selectedCrewIds: Set<string>` prop. Rows whose crewId is in this set get a 10% primary-color row background tint (same as live canvas row selection visual).

### `scenario-roster-pane.tsx` — Coordinator

Owns all state, wires everything:
- Reads `columns` from `useColumnStore('scenario-roster')`
- Reads/writes `frozenCrewIds` from `getScenarioLayoutStore`
- Manages `selectedCrewIds` + `selectedTaskIds` with bidirectional sync
- Applies sort: client-side sort of `filteredCrew` by `sortColumn`/`sortDirection` (same as current logic, extended to all column keys)
- Passes `panelRows`, `columns`, `frozenCrewIds`, `selectedCrewIds` down to `ScenarioGanttLeftPanel`

---

## Boundary Rules

| Rule | Detail |
|------|--------|
| Min column width | 30px — drag stops at boundary |
| crewId column | Always visible, no hide option in context menu |
| Frozen row limit | No limit (same as live) |
| Stats columns default | `visible: false` in scenario-roster initial config |
| scrollY storage | Keep local `useState` + RAF (migrate to layout-store post-refactor) |
| No changes to PaneHeaderCanvas | Zero coupling with live panel until full reuse phase |

---

## Files Changed

| File | Change |
|------|--------|
| `gantt/src/stores/column-store.ts` | Add `'scenario-roster'` PaneType + initial columns |
| `gantt/src/types/index.ts` or `column.ts` | Add `'scenario-roster'` to `PaneType` union |
| `gantt/src/stores/scenario-layout-store.ts` | Add `frozenCrewIds: string[]` per pane |
| `gantt/src/components/scenario-gantt/scenario-gantt-left-panel.tsx` | Full rewrite with A–E features |
| `gantt/src/components/scenario-gantt/scenario-gantt-canvas.tsx` | Add `selectedCrewIds` prop + row tint |
| `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` | Add coordinator state + wire new props |

---

## Out of Scope

- Violation / lock badges (scenario has no rule-check data)
- Rubber-band multi-select on canvas rows
- Full `PaneHeaderCanvas` component reuse (post-live-refactor)
- Server-side sort (all sorting is client-side on loaded crew list)
