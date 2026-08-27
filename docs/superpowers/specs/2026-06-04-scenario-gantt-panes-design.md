# Scenario Gantt — Multi-Pane System Design Spec

**Date:** 2026-06-04
**Status:** Approved
**Scope:** Frontend (gantt) + live-server data layer. No new API endpoints.

---

## Goal

Add Pairing Pane and Flight Pane to Scenario Gantt, with a per-scenario-instance pane layout system that matches Live Gantt's visual style and interaction model (drag-to-reorder, add/remove pane buttons, grid layout).

---

## Architecture Overview

Four independent subsystems, implemented in order:

| Subsystem | Scope | Key Files |
|-----------|-------|-----------|
| ① Data Layer | Parse `flight` section from input.gz; build `PairingItem[]` / `FlightItem[]` | `scenario-gantt-service.ts` |
| ② Layout System | Per-instance `ScenarioLayoutStore` + grid components | 6 new files |
| ③ Pairing Pane | Reuse `renderPairingTasks` with PairingItem[] from input.gz | 2 new files |
| ④ Flight Pane | Reuse `renderFlightTasks` with FlightItem[] from input.gz `flight` section | 2 new files |

---

## Section 1: Data Layer

### New data parsed from input.gz

**`flight` section** (not yet parsed) — needed for Flight Pane aircraft rows:

```typescript
// Added to ScenarioGanttData
flights: ScenarioGanttFlight[]

export interface ScenarioGanttFlight {
  id: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string   // ISO UTC string
  schArvDtUtc: string
  fleet: string
  register: string | null  // aircraft tail number; null = fleet-grouped row
}
```

CSV key mapping from `flight` section: `id` → `id`, `flt_num` → `fltNum`, `dep_arp` → `depArp`, `arv_arp` → `arvArp`, `sch_dep_dt_utc` → `schDepDtUtc`, `sch_arv_dt_utc` → `schArvDtUtc`, `fleet` → `fleet`, `register` → `register`.

### Data transformations (frontend only)

**For Pairing Pane** — build `PairingItem[]` from existing `ScenarioGanttData`:

```typescript
// pairing[] → Pairing (live Gantt type)
// pairingSegments[] → PairingSegment[] (field mapping)
// pairingSegments where fltId != null → PairingFlight[]
// output.gz ASSIGNMENTS → Pairing.isFull / composition slot count
PairingItem = { pairing, segments, flights, sessionTags: [0] }
```

Statistical fields on `Pairing` that aren't in input.gz (`durationDays`, `tafb`, `blockMinutes`, etc.) are computed from `pairing_segment` data or set to 0.

**For Flight Pane** — build `FlightItem[]` from `ScenarioGanttFlight[]`:

```typescript
// Group by (fleet, register) → FlightItem[]
// compositionStatusMap: flightId → 'full'|'partial'
//   from: ASSIGNMENTS → pairingId → pairing_segment.flt_id → flight.id
FlightItem = { registration, fleet, flights: Flight[], isFleetGrouped, sessionTags: [0] }
```

### Changes to live-server

`scenario-gantt-service.ts` — add `parseFlights(inputGz)` function and include `flights: ScenarioGanttFlight[]` in both `buildGanttDataSnapshot` and `buildGanttDataLiveRefresh` return objects.

---

## Section 2: Layout System

### Per-instance ScenarioLayoutStore

Factory pattern identical to `getScenarioGanttStore`. Each scenario tab has independent layout state.

```typescript
type ScenarioPaneType = 'roster' | 'pairing' | 'flight'
type ScenarioLayoutGrid = [string | null, string | null][]  // same as Live Gantt LayoutGrid

interface ScenarioLayoutStore {
  grid: ScenarioLayoutGrid        // e.g. [['roster-1', null]] initially
  rowHeights: number[]            // per-row height fraction [0..1], sums to 1
  panes: Map<string, { type: ScenarioPaneType; num: number }>

  addPane: (type: ScenarioPaneType) => string | null  // returns paneId or null if maxed
  closePane: (paneId: string) => void
  movePane: (paneId: string, toRow: number, toCol: number, hint: 'left'|'right'|'top'|'bottom'|'center') => void
  setRowHeight: (row: number, height: number) => void
}
```

**Limits:** max 1 Roster, 1 Pairing, 1 Flight (same as Live Gantt `MAX_PANES_PER_TYPE`). Max 3 panes total.

**Default grid:** `[['roster-1', null]]` — Roster fills the full width.

**Adding a second pane:** goes to a new row → `[['roster-1', null], ['pairing-1', null]]`.

**Adding a third pane:** splits the second row → `[['roster-1', null], ['pairing-1', 'flight-1']]`.

### Grid components (matches Live Gantt structure)

```
ScenarioGanttView
  ├── ScenarioGanttToolbar           (existing — adds [Roster][Pairing][Flight] buttons)
  └── ScenarioLayoutContainer        (new — replaces current flex body)
        ├── ScenarioLayoutGrid       (new — reads ScenarioLayoutStore.grid)
        │     └── ScenarioGridRow    (new — row with horizontal PaneSplitter between rows)
        │           └── ScenarioGridCell (new — handles drag-over/drop, renders pane)
        │                 └── ScenarioPaneWrapper (new — renders correct pane by type)
        └── SharedTimeAxis           (existing shared horizontal scroll)
```

**`ScenarioGridCell`** — identical drag logic to Live Gantt `GridCell`:
- `onDragOver`: compute drop position (top 25% / bottom 25% / left half / right half)
- Show `DropIndicator` overlay (reuse existing `drop-indicator.tsx`)
- `onDrop`: call `ScenarioLayoutStore.movePane`

**`ScenarioPaneWrapper`** — renders pane by type:
```typescript
switch (paneType) {
  case 'roster':  return <ScenarioRosterPane  paneId={paneId} ... />
  case 'pairing': return <ScenarioPairingPane paneId={paneId} ... />
  case 'flight':  return <ScenarioFlightPane  paneId={paneId} ... />
}
```

**Row height splitter:** Between rows, a horizontal `PaneSplitter` (`pane-splitter.tsx` — already exists) allows dragging to adjust `rowHeights`.

### Toolbar pane buttons

Right-aligned group matching Live Gantt's pane toggle area:

```
[● Roster] [● Pairing] [● Flight]   Reset
```

- Colored dot per type (teal=Roster, blue=Pairing, amber=Flight — matching `PANE_COLORS` style)
- Button disabled when pane type already open
- "Reset" closes all and restores default single-Roster layout

### Pane toolbar (PaneToolbar)

Each Scenario pane has a compact header bar:
- Title: `Roster` / `Pairing` / `Flight`
- Row count badge (e.g., `142 crew`)
- Drag handle (makes pane draggable for grid reorder)
- Close button (`×`)
- No filter/sort controls in V1

---

## Section 3: Pairing Pane

### Component: `ScenarioPairingPane`

Mirrors `ScenarioGanttCanvas` architecture but uses `renderPairingTasks` instead of `renderRosterTasks`.

**Left panel (`ScenarioPairingLeftPanel`):**
- Each row (42px `PAIRING_ROW_HEIGHT`): pairing label (primary, font-mono) + base · fleet (secondary, muted)
- Below label: crew assignment count badge from output.gz (e.g., `2 crew`)
- Shares `scrollY` with main canvas

**Main canvas:**
```typescript
const prc: PairingRenderContext = {
  ...rc,                           // BaseRenderContext
  items: pairingItems,             // PairingItem[] built from input.gz
  selectedPairingIds: new Set(),
  hoveredPairingId: null,
  timezone,
  showSessionTags: false,
}
renderPairingTasks(prc)
```

**`PairingItem[]` construction:**
- `pairing.id` → pairingId; `pairing.composition` → fill from ASSIGNMENTS count (slots = composition size from `pairing_composition` section if available, else assume 2)
- `segments`: map `ScenarioGanttPairingSegment` → `PairingSegment` (field rename, same data)
- `flights`: filter segments where `fltId != null` → `PairingFlight[]`

**Local filter:** `filterText` matches pairingLabel or base (same as Roster Pane).

---

## Section 4: Flight Pane

### Component: `ScenarioFlightPane`

Uses `renderFlightTasks` directly.

**Left panel (`ScenarioFlightLeftPanel`):**
- Each row (42px): `registration` (primary, font-mono) + `fleet` (secondary, muted)
- Rows sorted: by fleet code then by registration number

**Main canvas:**
```typescript
const frc: FlightRenderContext = {
  ...rc,
  flightRows: flightItems,         // FlightItem[] built from input.gz 'flight' section
  selectedFlightIds: new Set(),
  hoveredFlightId: null,
  compositionStatusMap,            // flightId → 'full'|'partial' from ASSIGNMENTS
  timezone,
}
renderFlightTasks(frc)
```

**`FlightItem[]` construction from `ScenarioGanttFlight[]`:**
- Group by `(fleet, register)` key; `register === null` → single `isFleetGrouped: true` row per fleet
- Sort groups: by fleet alphabetically, then by registration
- `compositionStatusMap`: traverse ASSIGNMENTS → pairingId → matching pairingSegments → flt_id → mark as 'full' if at least one crew assigned

**Local filter:** `filterText` matches registration or fleet code.

---

## Shared State

All panes share from per-scenario store:
- `pxPerHour` — horizontal zoom
- `scrollX` — horizontal scroll offset
- `rangeStart` / `rangeEnd` — date range from scenario data
- `filterText` — crew/pairing/flight text search (each pane uses it against its own row type)
- `timezone` — from `useTimezoneStore` (global)

Each pane has its own:
- `scrollY` — local React `useState`
- `leftPanelWidth` — per-pane, in `ScenarioLayoutStore.panes[paneId]`

---

## File Map

| Action | File |
|--------|------|
| Modify | `live-server/src/services/scenario/scenario-gantt-service.ts` — parse `flight` section |
| Modify | `gantt/src/types/scenario-gantt.ts` — add `ScenarioGanttFlight` + `flights` to `ScenarioGanttData` |
| **New** | `gantt/src/stores/scenario-layout-store.ts` — per-instance layout store factory |
| **New** | `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx` — grid + row + cell + pane wrapper |
| **New** | `gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx` — compact pane header bar |
| Modify | `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` — add [Roster][Pairing][Flight] buttons |
| Modify | `gantt/src/components/shell/scenario-gantt-view.tsx` — replace body with ScenarioLayoutContainer |
| **New** | `gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx` — canvas + left panel |
| **New** | `gantt/src/components/scenario-gantt/scenario-flight-pane.tsx` — canvas + left panel |
| **New** | `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` — thin wrapper around existing canvas |

---

## Out of Scope (V1)

- Floating panes (detached overlay)
- Pane-level sort/filter controls (Live Gantt has per-pane sort dialogs)
- Cross-pane drag-and-drop for task reassignment
- Summary bar / status bar below panes
- Pairing Pane: rule violation indicators
- Flight Pane: crewing composition detail dialog
