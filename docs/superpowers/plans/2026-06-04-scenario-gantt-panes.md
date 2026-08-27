# Scenario Gantt Multi-Pane System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pairing Pane and Flight Pane to Scenario Gantt with a per-scenario-instance grid layout system matching Live Gantt's visual style, reusing existing `renderPairingTasks` and `renderFlightTasks` renderers.

**Architecture:** Four phases in order — (1) extend data types and live-server parsing, (2) build per-instance ScenarioLayoutStore + grid components, (3) create ScenarioPairingPane using renderPairingTasks with PairingItem[] built from input.gz, (4) create ScenarioFlightPane using renderFlightTasks with FlightItem[] grouped by fleet+register. All panes share pxPerHour/scrollX from per-scenario store.

**Tech Stack:** TypeScript / React 19 / Canvas 2D / Zustand (gantt) · TypeScript / Fastify (live-server) · `renderPairingTasks` + `renderFlightTasks` from existing renderers

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `gantt/src/types/scenario-gantt.ts` | Add `ScenarioGanttFlight`; extend `ScenarioGanttPairingSegment` with missing fields |
| Modify | `live-server/src/services/scenario/scenario-gantt-service.ts` | Extend `parsePairingSegments` + add `parseFlights` |
| **New** | `gantt/src/stores/scenario-layout-store.ts` | Per-instance layout store factory (grid state, pane management) |
| **New** | `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx` | ScenarioLayoutGrid + ScenarioGridRow + ScenarioGridCell + ScenarioPaneWrapper |
| **New** | `gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx` | Compact pane header (title, drag handle, close button) |
| Modify | `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx` | Add [Roster][Pairing][Flight] pane toggle buttons |
| Modify | `gantt/src/components/shell/scenario-gantt-view.tsx` | Replace body with ScenarioLayoutGrid; remove old PanelSplitter |
| **New** | `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx` | Thin wrapper around existing ScenarioGanttCanvas + ScenarioGanttLeftPanel |
| **New** | `gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx` | Pairing pane: buildPairingItems + renderPairingTasks canvas |
| **New** | `gantt/src/components/scenario-gantt/scenario-flight-pane.tsx` | Flight pane: buildFlightItems + renderFlightTasks canvas |

---

## Task 1: Extend type definitions

**Files:**
- Modify: `gantt/src/types/scenario-gantt.ts`

`ScenarioGanttPairingSegment` currently lacks several fields needed to build `PairingSegment` for `renderPairingTasks` (dep/arv airports, duty airports, flight number, airline, assignment, duty times). Also adds `ScenarioGanttFlight` and extends `ScenarioGanttData`.

- [ ] **Step 1: Read current file**

```bash
cat /home/yuan.z/rois/rois-ai/gantt/src/types/scenario-gantt.ts
```

- [ ] **Step 2: Add missing fields to ScenarioGanttPairingSegment and add new types**

Find `ScenarioGanttPairingSegment` and replace it with the extended version. Also add `ScenarioGanttFlight` and the `flights` field to `ScenarioGanttData`.

The final `gantt/src/types/scenario-gantt.ts` should contain:

```typescript
export interface ScenarioGanttCrew {
  crewId: string
  base: string
  division: string
  rank: string
}

export interface ScenarioGanttPairing {
  pairingId: number
  pairingLabel: string | null
  base: string
  schStrDtUtc: string
  schEndDtUtc: string
  assignmentGroup: string
  assignment: string
  division: string
}

export interface ScenarioGanttAssignment {
  crewId: string
  pairingId: number
  source: 'opt' | 'leadin'
}

/** One row from the pairing_segment section of input.gz — extended with all fields needed for renderPairingTasks */
export interface ScenarioGanttPairingSegment {
  pairingId: number
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltDt: string | null
  fltNum: string            // flight number (e.g. 'F81234')
  airline: string
  depArp: string            // departure airport IATA code
  arvArp: string            // arrival airport IATA code
  segAssignment: string     // 'FLT' | 'DH' | etc.
  schStrDtUtc: string       // flight departure UTC
  schEndDtUtc: string       // flight arrival UTC
  // Duty-level fields (same for all segs in same duty)
  dutyStrArp: string
  dutyEndArp: string
  dutySchStrDtUtc: string
  dutySchEndDtUtc: string
  dutySchRestMin: number | null
  dutyActRestMin: number | null
  // Node times
  brief1StartUtc: string
  brief1EndUtc: string
  debrief1StartUtc: string
  debrief1EndUtc: string
  pickup1StartUtc: string
  pickup1EndUtc: string
  dropoff1StartUtc: string
  dropoff1EndUtc: string
}

/** One row from the flight section of input.gz — for Flight Pane aircraft rows */
export interface ScenarioGanttFlight {
  id: number
  fltNum: string
  depArp: string
  arvArp: string
  schDepDtUtc: string
  schArvDtUtc: string
  fleet: string
  register: string | null   // aircraft tail number; null = fleet-grouped row
}

export interface ScenarioGanttData {
  scenarioId: number
  scenarioName: string | null
  strDtLoc: string
  endDtLoc: string
  leadinLive: number
  dataSource: 'live-refresh' | 'snapshot'
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
  assignments: ScenarioGanttAssignment[]
  pairingSegments: ScenarioGanttPairingSegment[]
  flights: ScenarioGanttFlight[]
}

/** A pending edit not yet saved to output.gz */
export interface AssignmentPatch {
  op: 'add' | 'remove' | 'reassign'
  crewId: string
  pairingId: number
  toCrewId?: string
}

export interface LockStatus {
  locked: boolean
  owner: string | null
  ttl: number | null
  isOwner: boolean
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-gantt.ts" | head -10
```

Expected: errors about `flights` missing from callers (normal — will be fixed in Task 2). No syntax errors from this file.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/types/scenario-gantt.ts
git commit -m "feat(gantt): extend ScenarioGanttPairingSegment with full fields + ScenarioGanttFlight type"
```

---

## Task 2: Update live-server — extend parsePairingSegments + add parseFlights

**Files:**
- Modify: `live-server/src/services/scenario/scenario-gantt-service.ts`

- [ ] **Step 1: Read current file**

```bash
cat /home/yuan.z/rois/rois-ai/live-server/src/services/scenario/scenario-gantt-service.ts
```

- [ ] **Step 2: Replace parsePairingSegments with extended version and add parseFlights**

Find `function parsePairingSegments` and replace it. Then add `parseFlights`. Both `buildGanttDataSnapshot` and `buildGanttDataLiveRefresh` must call `parseFlights` and include `flights` in their return.

```typescript
function parsePairingSegments(inputGz: Buffer): ScenarioGanttPairingSegment[] {
  const sections = parseSections(inputGz)
  return (sections['pairing_segment'] ?? []).map((r) => ({
    pairingId:        Number(r['pairing_id']),
    dutySeq:          Number(r['duty_seq']),
    segSeq:           Number(r['seg_seq']),
    fltId:            r['flt_id'] ? Number(r['flt_id']) : null,
    fltDt:            r['flt_dt'] || null,
    fltNum:           r['flt_num'] ?? '',
    airline:          r['airline'] ?? '',
    depArp:           r['dep_arp'] ?? '',
    arvArp:           r['arv_arp'] ?? '',
    segAssignment:    r['seg_assignment'] ?? 'FLT',
    schStrDtUtc:      r['sch_str_dt_utc'] ?? '',
    schEndDtUtc:      r['sch_end_dt_utc'] ?? '',
    dutyStrArp:       r['duty_str_arp'] ?? '',
    dutyEndArp:       r['duty_end_arp'] ?? '',
    dutySchStrDtUtc:  r['duty_sch_str_dt_utc'] ?? '',
    dutySchEndDtUtc:  r['duty_sch_end_dt_utc'] ?? '',
    dutySchRestMin:   r['duty_sch_rest_min'] ? Number(r['duty_sch_rest_min']) : null,
    dutyActRestMin:   r['duty_act_rest_min'] ? Number(r['duty_act_rest_min']) : null,
    brief1StartUtc:   r['brief_1_start_utc'] ?? '',
    brief1EndUtc:     r['brief_1_end_utc'] ?? '',
    debrief1StartUtc: r['debrief_1_start_utc'] ?? '',
    debrief1EndUtc:   r['debrief_1_end_utc'] ?? '',
    pickup1StartUtc:  r['pickup_1_start_utc'] ?? '',
    pickup1EndUtc:    r['pickup_1_end_utc'] ?? '',
    dropoff1StartUtc: r['dropoff_1_start_utc'] ?? '',
    dropoff1EndUtc:   r['dropoff_1_end_utc'] ?? '',
  }))
}

function parseFlights(inputGz: Buffer): ScenarioGanttFlight[] {
  const sections = parseSections(inputGz)
  return (sections['flight'] ?? []).map((r) => ({
    id:          Number(r['id']),
    fltNum:      r['flt_num'] ?? '',
    depArp:      r['dep_arp'] ?? '',
    arvArp:      r['arv_arp'] ?? '',
    schDepDtUtc: r['sch_dep_dt_utc'] ?? '',
    schArvDtUtc: r['sch_arv_dt_utc'] ?? '',
    fleet:       r['fleet'] ?? '',
    register:    r['register'] || null,
  }))
}
```

Add to both `buildGanttDataSnapshot` and `buildGanttDataLiveRefresh`:
```typescript
const flights = parseFlights(inputGz)
```
And include `flights` in both return objects.

Also update the `ScenarioGanttPairingSegment` interface in this file to match the new fields (or remove the local interface and rely on shared types — but since live-server and gantt are separate packages, keep the inline interface here matching the new shape).

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/live-server && npx tsc --noEmit 2>&1 | grep "scenario-gantt-service" | head -10
```

Expected: no errors.

- [ ] **Step 4: Restart live-server**

```bash
~/rois/rois.sh restart live-server
```

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/scenario-gantt-service.ts
git commit -m "feat(live-server): extend parsePairingSegments with full fields + add parseFlights for Flight Pane"
```

---

## Task 3: Create ScenarioLayoutStore

**Files:**
- Create: `gantt/src/stores/scenario-layout-store.ts`

Per-instance layout store (registry pattern identical to `getScenarioGanttStore`). Each scenario tab has its own grid state.

- [ ] **Step 1: Create the store file**

```typescript
// gantt/src/stores/scenario-layout-store.ts
import { create } from 'zustand'

export type ScenarioPaneType = 'roster' | 'pairing' | 'flight'
// Two columns max per row, same as Live Gantt LayoutGrid
export type ScenarioLayoutGrid = [string | null, string | null][]

export interface ScenarioPaneInfo {
  type: ScenarioPaneType
  scrollY: number
  leftPanelWidth: number
}

interface ScenarioLayoutStore {
  grid: ScenarioLayoutGrid
  panes: Map<string, ScenarioPaneInfo>
  rowHeights: number[]   // pixel heights per row; -1 means flex-1 (equal split)
  counters: Record<ScenarioPaneType, number>

  addPane: (type: ScenarioPaneType) => string | null
  closePane: (paneId: string) => void
  movePane: (paneId: string, toRow: number, toCol: number, hint: 'left' | 'right' | 'top' | 'bottom' | 'center') => void
  setScrollY: (paneId: string, y: number) => void
  setLeftPanelWidth: (paneId: string, w: number) => void
  setRowHeight: (row: number, height: number) => void
  reset: () => void
}

const MAX_PER_TYPE: Record<ScenarioPaneType, number> = { roster: 1, pairing: 1, flight: 1 }
const MAX_PANES = 3

const DEFAULT_ROSTER_ID = 'roster-1'

function makeDefault(): Pick<ScenarioLayoutStore, 'grid' | 'panes' | 'rowHeights' | 'counters'> {
  return {
    grid: [[DEFAULT_ROSTER_ID, null]],
    panes: new Map([[DEFAULT_ROSTER_ID, { type: 'roster', scrollY: 0, leftPanelWidth: 200 }]]),
    rowHeights: [-1],
    counters: { roster: 1, pairing: 0, flight: 0 },
  }
}

function createLayoutStore() {
  return create<ScenarioLayoutStore>((set, get) => ({
    ...makeDefault(),

    addPane: (type) => {
      const { grid, panes, counters } = get()
      // Check limits
      const typeCount = [...panes.values()].filter((p) => p.type === type).length
      if (typeCount >= MAX_PER_TYPE[type]) return null
      if (panes.size >= MAX_PANES) return null

      const num = counters[type] + 1
      const paneId = `${type}-${num}`
      const newPane: ScenarioPaneInfo = { type, scrollY: 0, leftPanelWidth: 200 }

      // Add to grid: try to fill existing empty col first, else new row
      const newGrid = grid.map((r) => [...r] as [string | null, string | null])
      let placed = false
      for (const row of newGrid) {
        if (row[1] === null && row[0] !== null) {
          row[1] = paneId
          placed = true
          break
        }
      }
      if (!placed) newGrid.push([paneId, null])

      const newPanes = new Map(panes)
      newPanes.set(paneId, newPane)
      const newHeights = newGrid.map(() => -1)

      set({
        grid: newGrid,
        panes: newPanes,
        rowHeights: newHeights,
        counters: { ...counters, [type]: num },
      })
      return paneId
    },

    closePane: (paneId) => {
      const { grid, panes, rowHeights } = get()
      if (!panes.has(paneId)) return

      const newPanes = new Map(panes)
      newPanes.delete(paneId)

      // Remove from grid
      let newGrid = grid
        .map((row) => row.map((cell) => (cell === paneId ? null : cell)) as [string | null, string | null])
        .filter((row) => row.some(Boolean))
      if (newGrid.length === 0) newGrid = [[DEFAULT_ROSTER_ID, null]]

      set({ grid: newGrid, panes: newPanes, rowHeights: newGrid.map(() => -1) })
    },

    movePane: (paneId, toRow, toCol, hint) => {
      const { grid, panes } = get()
      if (!panes.has(paneId)) return

      // Find source position
      let fromRow = -1, fromCol = -1
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < 2; c++) {
          if (grid[r][c] === paneId) { fromRow = r; fromCol = c }
        }
      }
      if (fromRow === -1) return

      const newGrid = grid.map((r) => [...r] as [string | null, string | null])

      if (hint === 'top') {
        // Insert new row above toRow with paneId; remove from old position
        newGrid[fromRow][fromCol] = null
        newGrid.splice(toRow, 0, [paneId, null])
      } else if (hint === 'bottom') {
        newGrid[fromRow][fromCol] = null
        newGrid.splice(toRow + 1, 0, [paneId, null])
      } else if (hint === 'left' || hint === 'right' || hint === 'center') {
        // Swap within same row or place in target col
        const targetCell = newGrid[toRow][toCol]
        newGrid[fromRow][fromCol] = targetCell
        newGrid[toRow][toCol] = paneId
      }

      // Clean empty rows (but never leave grid empty)
      const cleaned = newGrid.filter((row) => row.some(Boolean))
      set({ grid: cleaned.length > 0 ? cleaned : [[DEFAULT_ROSTER_ID, null]], rowHeights: cleaned.map(() => -1) })
    },

    setScrollY: (paneId, y) => {
      const { panes } = get()
      const pane = panes.get(paneId)
      if (!pane) return
      const newPanes = new Map(panes)
      newPanes.set(paneId, { ...pane, scrollY: Math.max(0, y) })
      set({ panes: newPanes })
    },

    setLeftPanelWidth: (paneId, w) => {
      const { panes } = get()
      const pane = panes.get(paneId)
      if (!pane) return
      const newPanes = new Map(panes)
      newPanes.set(paneId, { ...pane, leftPanelWidth: Math.max(120, Math.min(400, w)) })
      set({ panes: newPanes })
    },

    setRowHeight: (row, height) => {
      const { rowHeights } = get()
      const next = [...rowHeights]
      next[row] = height
      set({ rowHeights: next })
    },

    reset: () => set(makeDefault()),
  }))
}

const registry = new Map<number, ReturnType<typeof createLayoutStore>>()

export function getScenarioLayoutStore(scenarioId: number) {
  if (!registry.has(scenarioId)) registry.set(scenarioId, createLayoutStore())
  return registry.get(scenarioId)!
}

export function destroyScenarioLayoutStore(scenarioId: number) {
  registry.delete(scenarioId)
}

export const PANE_COLORS: Record<ScenarioPaneType, string> = {
  roster:  '#14b8a6',  // teal
  pairing: '#3b82f6',  // blue
  flight:  '#a855f7',  // purple
}

export const PANE_NAMES: Record<ScenarioPaneType, string> = {
  roster:  'Roster',
  pairing: 'Pairing',
  flight:  'Flight',
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-layout-store" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/stores/scenario-layout-store.ts
git commit -m "feat(gantt): ScenarioLayoutStore — per-instance pane grid store with add/close/move"
```

---

## Task 4: Create ScenarioPaneToolbar

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx`

Compact pane header bar (title + color dot + row count + drag handle + close button). Matches Live Gantt's pane toolbar style.

- [ ] **Step 1: Create the component**

```tsx
// gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx
import { X, GripVertical } from 'lucide-react'
import { cn } from '@rois/ui'
import { PANE_COLORS, PANE_NAMES, type ScenarioPaneType } from '@/stores/scenario-layout-store'

interface ScenarioPaneToolbarProps {
  paneId: string
  paneType: ScenarioPaneType
  rowCount: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

export const ScenarioPaneToolbar = ({
  paneId,
  paneType,
  rowCount,
  draggable,
  onDragStart,
  onDragEnd,
  onClose,
}: ScenarioPaneToolbarProps) => {
  return (
    <div
      className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border bg-card px-2"
      data-testid={`sg-pane-toolbar-${paneId}`}
    >
      {/* Drag handle */}
      {draggable && (
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="flex cursor-grab items-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Color dot + pane name */}
      <div className="flex items-center gap-1.5">
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: PANE_COLORS[paneType] }}
        />
        <span className="text-xs font-semibold text-foreground">
          {PANE_NAMES[paneType]}
        </span>
      </div>

      {/* Row count badge */}
      <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-mono text-muted-foreground tabular-nums">
        {rowCount}
      </span>

      <div className="flex-1" />

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-muted-foreground"
          data-testid={`sg-pane-close-${paneId}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-pane-toolbar" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-pane-toolbar.tsx
git commit -m "feat(gantt): ScenarioPaneToolbar — compact pane header with drag + close"
```

---

## Task 5: Create ScenarioLayoutGrid (grid + row + cell + pane wrapper)

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-layout-grid.tsx`

Single file containing all grid layout components. Reuses `DropIndicator` from Live Gantt. Pane rendering delegated to `ScenarioPaneWrapper` which dispatches to the correct pane component.

- [ ] **Step 1: Create the file**

```tsx
// gantt/src/components/scenario-gantt/scenario-layout-grid.tsx
import { useState, useCallback } from 'react'
import { DropIndicator } from '@/components/layout/drop-indicator'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import { getScenarioLayoutStore, type ScenarioPaneType } from '@/stores/scenario-layout-store'

// ── ScenarioPaneWrapper ────────────────────────────────────────────────────────
// Forward-declared: actual pane components imported lazily to avoid circular deps.
// Each pane component file must export a component matching this interface.
interface ScenarioPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

const PANE_REGISTRY: Record<ScenarioPaneType, React.ComponentType<ScenarioPaneProps> | null> = {
  roster: null,
  pairing: null,
  flight: null,
}

/** Register pane component implementations (called from scenario-gantt-view.tsx after all imports) */
export function registerScenarioPaneComponent(type: ScenarioPaneType, Component: React.ComponentType<ScenarioPaneProps>) {
  PANE_REGISTRY[type] = Component
}

interface ScenarioPaneWrapperProps {
  paneId: string
  scenarioId: number
  totalPanes: number
  onClosePane: (paneId: string) => void
  onStartDrag: (paneId: string, e: React.DragEvent) => void
  onEndDrag: () => void
}

const ScenarioPaneWrapper = ({ paneId, scenarioId, totalPanes, onClosePane, onStartDrag, onEndDrag }: ScenarioPaneWrapperProps) => {
  const useStore = getScenarioLayoutStore(scenarioId)
  const paneInfo = useStore((s) => s.panes.get(paneId))
  if (!paneInfo) return null

  const Component = PANE_REGISTRY[paneInfo.type]
  if (!Component) return (
    <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
      {paneInfo.type} pane loading…
    </div>
  )

  const draggable = totalPanes > 1

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      <Component
        paneId={paneId}
        scenarioId={scenarioId}
        draggable={draggable}
        onDragStart={(e) => onStartDrag(paneId, e)}
        onDragEnd={onEndDrag}
        onClose={() => onClosePane(paneId)}
      />
    </div>
  )
}

// ── ScenarioGridCell ──────────────────────────────────────────────────────────
interface ScenarioGridCellProps {
  row: number
  col: number
  paneId: string | null
  scenarioId: number
  totalPanes: number
  rowPaneCount: number
  rowCount: number
  onMovePane: (paneId: string, toRow: number, toCol: number, hint: 'left' | 'right' | 'top' | 'bottom' | 'center') => void
  onClosePane: (paneId: string) => void
  onStartDrag: (paneId: string, e: React.DragEvent) => void
  onEndDrag: () => void
  draggedPaneId: string | null
}

const ScenarioGridCell = ({
  row, col, paneId, scenarioId, totalPanes, rowPaneCount, rowCount,
  onMovePane, onClosePane, onStartDrag, onEndDrag, draggedPaneId,
}: ScenarioGridCellProps) => {
  const [dropIndicator, setDropIndicator] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!paneId || !draggedPaneId || draggedPaneId === paneId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = e.currentTarget.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const relY = e.clientY - rect.top
    const w = rect.width
    const h = rect.height

    let position: typeof dropIndicator = null
    if (rowPaneCount === 1 && totalPanes > 1) {
      if (relY < h * 0.25)       position = row === 0 ? 'left' : 'top'
      else if (relY > h * 0.75)  position = 'bottom'
      else if (relX < w / 2)     position = 'left'
      else                        position = 'right'
    } else if (rowPaneCount === 2) {
      position = relY < h / 2 ? (row === 0 ? null : 'top') : 'bottom'
    }
    setDropIndicator(position)
  }, [paneId, draggedPaneId, row, rowPaneCount, totalPanes])

  const handleDragLeave = useCallback(() => setDropIndicator(null), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!paneId || !draggedPaneId || draggedPaneId === paneId) return
    e.preventDefault()
    if (dropIndicator) {
      onMovePane(draggedPaneId, row, col, dropIndicator)
    }
    setDropIndicator(null)
  }, [paneId, draggedPaneId, dropIndicator, row, col, onMovePane])

  if (!paneId) return null

  return (
    <div
      className="relative flex flex-1 overflow-hidden border-r border-border last:border-r-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropIndicator && <DropIndicator position={dropIndicator} />}
      <ScenarioPaneWrapper
        paneId={paneId}
        scenarioId={scenarioId}
        totalPanes={totalPanes}
        onClosePane={onClosePane}
        onStartDrag={onStartDrag}
        onEndDrag={onEndDrag}
      />
    </div>
  )
}

// ── ScenarioGridRow ───────────────────────────────────────────────────────────
interface ScenarioGridRowProps {
  row: number
  cells: [string | null, string | null]
  scenarioId: number
  totalPanes: number
  rowCount: number
  height: number   // -1 = flex-1
  onMovePane: (paneId: string, toRow: number, toCol: number, hint: 'left'|'right'|'top'|'bottom'|'center') => void
  onClosePane: (paneId: string) => void
  onStartDrag: (paneId: string, e: React.DragEvent) => void
  onEndDrag: () => void
  onResizeRow: (deltaY: number) => void
  isLastRow: boolean
  draggedPaneId: string | null
}

const ScenarioGridRow = ({
  row, cells, scenarioId, totalPanes, rowCount, height,
  onMovePane, onClosePane, onStartDrag, onEndDrag, onResizeRow, isLastRow, draggedPaneId,
}: ScenarioGridRowProps) => {
  const paneCount = cells.filter(Boolean).length
  if (paneCount === 0) return null

  const style = height === -1 ? { flex: 1 } : { height, flexShrink: 0 }

  return (
    <>
      <div
        className="flex overflow-hidden border border-border rounded-md bg-background"
        style={style}
      >
        {cells.map((paneId, colIndex) => {
          if (paneCount === 1 && colIndex === 1) return null
          return (
            <ScenarioGridCell
              key={colIndex}
              row={row}
              col={colIndex}
              paneId={paneId}
              scenarioId={scenarioId}
              totalPanes={totalPanes}
              rowPaneCount={paneCount}
              rowCount={rowCount}
              onMovePane={onMovePane}
              onClosePane={onClosePane}
              onStartDrag={onStartDrag}
              onEndDrag={onEndDrag}
              draggedPaneId={draggedPaneId}
            />
          )
        })}
      </div>
      {/* Horizontal splitter between rows */}
      {!isLastRow && (
        <HorizontalPaneSplitter onDrag={onResizeRow} />
      )}
    </>
  )
}

// Simple horizontal drag splitter between rows
const HorizontalPaneSplitter = ({ onDrag }: { onDrag: (dy: number) => void }) => {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    let lastY = e.clientY
    const onMove = (ev: MouseEvent) => { onDrag(ev.clientY - lastY); lastY = ev.clientY }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onDrag])

  return (
    <div
      className="h-1 shrink-0 cursor-row-resize bg-border/50 hover:bg-primary/30 transition-colors my-0.5"
      onMouseDown={handleMouseDown}
    />
  )
}

// ── ScenarioLayoutGrid (root) ──────────────────────────────────────────────────
interface ScenarioLayoutGridProps {
  scenarioId: number
}

export const ScenarioLayoutGrid = ({ scenarioId }: ScenarioLayoutGridProps) => {
  const useStore = getScenarioLayoutStore(scenarioId)
  const grid       = useStore((s) => s.grid)
  const panes      = useStore((s) => s.panes)
  const rowHeights = useStore((s) => s.rowHeights)
  const movePane   = useStore((s) => s.movePane)
  const closePane  = useStore((s) => s.closePane)
  const setRowHeight = useStore((s) => s.setRowHeight)

  const [draggedPaneId, setDraggedPaneId] = useState<string | null>(null)

  const totalPanes = panes.size
  const nonEmptyRows = grid.filter((row) => row.some(Boolean))
  const rowCount = nonEmptyRows.length

  const handleStartDrag = useCallback((paneId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', paneId)
    setDraggedPaneId(paneId)
  }, [])

  const handleEndDrag = useCallback(() => setDraggedPaneId(null), [])

  const handleResizeRow = useCallback((rowIndex: number, dy: number) => {
    const currentH = rowHeights[rowIndex]
    const newH = Math.max(80, (currentH === -1 ? 200 : currentH) + dy)
    setRowHeight(rowIndex, newH)
  }, [rowHeights, setRowHeight])

  return (
    <div className="flex flex-1 flex-col overflow-hidden gap-0 p-1">
      {nonEmptyRows.map((cells, rowIndex) => (
        <ScenarioGridRow
          key={rowIndex}
          row={rowIndex}
          cells={cells}
          scenarioId={scenarioId}
          totalPanes={totalPanes}
          rowCount={rowCount}
          height={rowHeights[rowIndex] ?? -1}
          onMovePane={movePane}
          onClosePane={closePane}
          onStartDrag={handleStartDrag}
          onEndDrag={handleEndDrag}
          onResizeRow={(dy) => handleResizeRow(rowIndex, dy)}
          isLastRow={rowIndex === rowCount - 1}
          draggedPaneId={draggedPaneId}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-layout-grid" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-layout-grid.tsx
git commit -m "feat(gantt): ScenarioLayoutGrid — grid/row/cell/pane-wrapper with drag-to-reorder"
```

---

## Task 6: Update ScenarioGanttToolbar + ScenarioGanttView

**Files:**
- Modify: `gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx`
- Modify: `gantt/src/components/shell/scenario-gantt-view.tsx`

- [ ] **Step 1: Add pane toggle buttons to toolbar**

Read both files first:
```bash
cat /home/yuan.z/rois/rois-ai/gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx
cat /home/yuan.z/rois/rois-ai/gantt/src/components/shell/scenario-gantt-view.tsx
```

In `scenario-gantt-toolbar.tsx`, add these new props to `ScenarioGanttToolbarProps`:

```typescript
  openPaneTypes: Set<string>
  onAddPane: (type: 'roster' | 'pairing' | 'flight') => void
  onResetLayout: () => void
```

Add `PANE_COLORS` + `PANE_NAMES` imports from `@/stores/scenario-layout-store`.

Before the `<div className="flex-1" />` spacer, insert:

```tsx
      <div className="mx-1 h-3.5 w-px bg-border" />

      {/* Pane toggle buttons — matches Live Gantt pane controls style */}
      <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 p-1">
        {(['roster', 'pairing', 'flight'] as const).map((type) => {
          const isOpen = openPaneTypes.has(type)
          return (
            <button
              key={type}
              className={[
                'flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-all',
                isOpen ? 'opacity-40 pointer-events-none' : 'hover:bg-muted',
              ].join(' ')}
              onClick={() => onAddPane(type)}
              disabled={isOpen}
              data-testid={`sg-add-pane-${type}`}
            >
              <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PANE_COLORS[type] }} />
              {PANE_NAMES[type]}
            </button>
          )
        })}
        <button
          className="px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onResetLayout}
          data-testid="sg-reset-layout"
        >
          Reset
        </button>
      </div>
```

- [ ] **Step 2: Rewrite ScenarioGanttView body to use ScenarioLayoutGrid**

In `scenario-gantt-view.tsx`:

1. Add imports:
```typescript
import { ScenarioLayoutGrid, registerScenarioPaneComponent } from '@/components/scenario-gantt/scenario-layout-grid'
import { getScenarioLayoutStore, destroyScenarioLayoutStore } from '@/stores/scenario-layout-store'
import type { ScenarioPaneType } from '@/stores/scenario-layout-store'
```

2. Remove all the old body content (`ScenarioGanttLeftPanel`, `PanelSplitter`, `ScenarioGanttCanvas` from the view-level rendering). These move into `ScenarioRosterPane` in Task 7.

3. The main component renders:
```tsx
  // --- inside ScenarioGanttView, after loading/error checks ---
  const useLayoutStore = getScenarioLayoutStore(scenarioId)
  const layoutPanes = useLayoutStore((s) => s.panes)
  const addPane     = useLayoutStore((s) => s.addPane)
  const resetLayout = useLayoutStore((s) => s.reset)
  const openPaneTypes = useMemo(() => new Set([...layoutPanes.values()].map((p) => p.type)), [layoutPanes])

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="scenario-gantt-view">
      <ScenarioGanttToolbar
        data={data}
        lockStatus={lockStatus}
        isDirty={isDirty}
        saving={saving}
        acquiringLock={acquiringLock}
        filterText={filterText}
        pxPerHour={pxPerHour}
        openPaneTypes={openPaneTypes}
        onFilterChange={setFilterText}
        onAcquireLock={() => void acquireLock(scenarioId)}
        onReleaseLock={() => void releaseLock(scenarioId)}
        onSave={() => void save(scenarioId)}
        onZoomIn={() => setZoom(pxPerHour * 1.3)}
        onZoomOut={() => setZoom(pxPerHour / 1.3)}
        onAddPane={(type: ScenarioPaneType) => addPane(type)}
        onResetLayout={resetLayout}
      />
      <ScenarioLayoutGrid scenarioId={scenarioId} />
    </div>
  )
```

4. In the `useEffect` cleanup, also call `destroyScenarioLayoutStore(scenarioId)`.

- [ ] **Step 3: TypeScript check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v "pairing-duty-node-service" | head -20
```

Fix any errors found.

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-gantt-toolbar.tsx \
        gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): ScenarioGanttToolbar + ScenarioGanttView — pane toggle buttons + ScenarioLayoutGrid"
```

---

## Task 7: Create ScenarioRosterPane

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-roster-pane.tsx`

Thin wrapper around existing `ScenarioGanttCanvas` + `ScenarioGanttLeftPanel`. Reads data from per-scenario store. Implements `ScenarioPaneProps` interface.

- [ ] **Step 1: Create the file**

```tsx
// gantt/src/components/scenario-gantt/scenario-roster-pane.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { ScenarioGanttCanvas } from './scenario-gantt-canvas'
import { ScenarioGanttLeftPanel } from './scenario-gantt-left-panel'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import type { ScenarioGanttCrew } from '@/types/scenario-gantt'

interface ScenarioRosterPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

function matchesCrew(c: ScenarioGanttCrew, text: string): boolean {
  if (!text) return true
  const q = text.toLowerCase()
  return c.crewId.toLowerCase().includes(q) || c.base.toLowerCase().includes(q) || c.rank.toLowerCase().includes(q)
}

const PanelSplitter = ({ onDrag }: { onDrag: (dx: number) => void }) => {
  const isDragging = useRef(false)
  const startX = useRef(0)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    const onMove = (ev: MouseEvent) => { if (!isDragging.current) return; onDrag(ev.clientX - startX.current); startX.current = ev.clientX }
    const onUp = () => { isDragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [onDrag])
  return <div className="shrink-0 w-0.5 cursor-col-resize bg-border hover:bg-primary/30 transition-colors" onMouseDown={handleMouseDown} />
}

export const ScenarioRosterPane = ({ paneId, scenarioId, draggable, onDragStart, onDragEnd, onClose }: ScenarioRosterPaneProps) => {
  const useStore       = getScenarioGanttStore(scenarioId)
  const useLayoutStore = getScenarioLayoutStore(scenarioId)

  const data           = useStore((s) => s.data)
  const pendingChanges = useStore((s) => s.pendingChanges)
  const pxPerHour      = useStore((s) => s.pxPerHour)
  const scrollX        = useStore((s) => s.scrollX)
  const filterText     = useStore((s) => s.filterText)
  const setZoom        = useStore((s) => s.setZoom)
  const setScrollX     = useStore((s) => s.setScrollX)
  const addPatch       = useStore((s) => s.addPatch)

  const leftPanelWidth    = useLayoutStore((s) => s.panes.get(paneId)?.leftPanelWidth ?? 200)
  const setLeftPanelWidth = useLayoutStore((s) => s.setLeftPanelWidth)
  const timezone          = useTimezoneStore((s) => s.timezone)

  const [scrollY, setScrollY] = useState(0)

  const filteredCrew = useMemo(
    () => (data?.crew ?? []).filter((c) => matchesCrew(c, filterText)),
    [data?.crew, filterText],
  )
  const pairingMap = useMemo(
    () => new Map((data?.pairings ?? []).map((p) => [p.pairingId, p])),
    [data?.pairings],
  )
  const rangeStart = useMemo(() => data ? new Date(data.strDtLoc) : new Date(), [data?.strDtLoc])
  const rangeEnd   = useMemo(() => data ? new Date(data.endDtLoc) : new Date(), [data?.endDtLoc])

  if (!data) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ScenarioPaneToolbar
        paneId={paneId}
        paneType="roster"
        rowCount={filteredCrew.length}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ScenarioGanttLeftPanel
          crew={filteredCrew}
          scrollY={scrollY}
          width={leftPanelWidth}
          onScrollY={setScrollY}
        />
        <PanelSplitter onDrag={(dx) => setLeftPanelWidth(paneId, leftPanelWidth + dx)} />
        <ScenarioGanttCanvas
          crew={filteredCrew}
          pairingMap={pairingMap}
          assignments={data.assignments}
          pairingSegments={data.pairingSegments}
          pendingChanges={pendingChanges}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          pxPerHour={pxPerHour}
          scrollX={scrollX}
          scrollY={scrollY}
          canEdit={false}
          timezone={timezone}
          onScrollY={setScrollY}
          onScrollX={setScrollX}
          onZoom={setZoom}
          onRemove={(pairingId, crewId) => addPatch({ op: 'remove', pairingId, crewId })}
          onScrollYChange={setScrollY}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register the component in scenario-gantt-view.tsx**

In `gantt/src/components/shell/scenario-gantt-view.tsx`, add these imports and a registration call inside the component (after all hook calls, before the JSX return):

```typescript
import { ScenarioRosterPane } from '@/components/scenario-gantt/scenario-roster-pane'
// ... in ScenarioGanttView, before the return:
useEffect(() => {
  registerScenarioPaneComponent('roster', ScenarioRosterPane as never)
}, [])
```

> Note: `registerScenarioPaneComponent` accepts `React.ComponentType<ScenarioPaneProps>`. The `ScenarioRosterPane` matches that interface. Use `as never` to avoid strict prop type mismatch on the internal `scenarioId` prop — the wrapper passes it correctly at runtime.

Actually, a cleaner pattern: register all pane types once at module level (outside component) using `React.lazy` or direct import. Update `scenario-layout-grid.tsx` to import pane components directly instead of using a registry. Replace the `PANE_REGISTRY` + `registerScenarioPaneComponent` with direct imports inside `ScenarioPaneWrapper`:

```tsx
// In scenario-layout-grid.tsx, replace PANE_REGISTRY with:
import { lazy, Suspense } from 'react'
const ScenarioRosterPaneLazy  = lazy(() => import('./scenario-roster-pane').then((m) => ({ default: m.ScenarioRosterPane })))
const ScenarioPairingPaneLazy = lazy(() => import('./scenario-pairing-pane').then((m) => ({ default: m.ScenarioPairingPane })))
const ScenarioFlightPaneLazy  = lazy(() => import('./scenario-flight-pane').then((m) => ({ default: m.ScenarioFlightPane })))

// In ScenarioPaneWrapper:
const PaneComponent = {
  roster:  ScenarioRosterPaneLazy,
  pairing: ScenarioPairingPaneLazy,
  flight:  ScenarioFlightPaneLazy,
}[paneInfo.type]

return (
  <div className="flex flex-col flex-1 overflow-hidden bg-background">
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>}>
      <PaneComponent paneId={paneId} scenarioId={scenarioId} draggable={draggable} onDragStart={...} onDragEnd={...} onClose={...} />
    </Suspense>
  </div>
)
```

Remove the `PANE_REGISTRY`, `registerScenarioPaneComponent` export, and `export function registerScenarioPaneComponent` from the file. Remove the registration call from `scenario-gantt-view.tsx`.

This is cleaner and avoids the registry pattern. Update `scenario-layout-grid.tsx` accordingly before committing.

- [ ] **Step 3: TypeScript check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v "pairing-duty-node-service" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-roster-pane.tsx \
        gantt/src/components/scenario-gantt/scenario-layout-grid.tsx \
        gantt/src/components/shell/scenario-gantt-view.tsx
git commit -m "feat(gantt): ScenarioRosterPane + lazy pane loading in ScenarioLayoutGrid"
```

---

## Task 8: Create ScenarioPairingPane

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx`

Uses `renderPairingTasks` with `PairingItem[]` built from `ScenarioGanttData`. Left panel shows pairing label + base.

Key type mappings from `ScenarioGanttPairingSegment` → `PairingSegment` (from `@/types/pairing`):
- `pairingId` → `pairingId`
- `dutySeq` → `dutySeq`, `segSeq` → `segSeq`
- `fltId` → `fltId`, `fltNum` → `fltNum`, `airline` → `airline`
- `depArp` → `depArp`, `arvArp` → `arvArp`
- `segAssignment` → `segAssignment`
- `schStrDtUtc` → `schStrDtUtc`, `schEndDtUtc` → `schEndDtUtc`
- same for `actStrDtUtc`/`actEndDtUtc` (use scheduled)
- `dutyStrArp` → `dutyStrArp`, `dutyEndArp` → `dutyEndArp`
- `dutySchStrDtUtc` → `dutySchStrDtUtc`, `dutySchEndDtUtc` → `dutySchEndDtUtc`
- `dutySchRestMin` → `dutySchRestMin`, `dutyActRestMin` → `dutyActRestMin`
- `brief1StartUtc` → `briefStartUtc`, `brief1EndUtc` → `briefEndUtc`
- `debrief1StartUtc` → `debriefStartUtc`, `debrief1EndUtc` → `debriefEndUtc`
- `pickup1StartUtc` → `pickupStartUtc`, `pickup1EndUtc` → `pickupEndUtc`
- `dropoff1StartUtc` → `dropoffStartUtc`, `dropoff1EndUtc` → `dropoffEndUtc`
- `briefAirport`, `debriefAirport`, `doublePickup*`, etc. → all `null`
- `id` → counter (unique per item)

- [ ] **Step 1: Create the file**

```tsx
// gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx
import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import {
  renderBase, drawHeaderBand, drawTimelineHeader,
} from '@/components/gantt/renderers/base-renderer'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import { renderPairingTasks } from '@/components/gantt/renderers/pairing-renderer'
import type { PairingRenderContext } from '@/components/gantt/renderers/pairing-renderer'
import type { PairingItem, PairingSegment, PairingFlight } from '@/types/pairing'
import {
  getGanttColors, ROW_HEIGHT, HEADER_HEIGHT, PAIRING_ROW_HEIGHT,
  SCROLLBAR_SIZE, SCROLLBAR_RADIUS, FONT_FAMILY, FONT_SIZE_PANEL,
  FONT_SIZE_PANEL_HEADER,
} from '@/components/gantt/gantt-constants'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import type {
  ScenarioGanttPairing, ScenarioGanttPairingSegment, ScenarioGanttAssignment,
} from '@/types/scenario-gantt'
import type { Pairing } from '@/types/pairing'

interface ScenarioPairingPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

/** Build PairingItem[] from scenario data for renderPairingTasks */
function buildPairingItems(
  pairings: ScenarioGanttPairing[],
  pairingSegments: ScenarioGanttPairingSegment[],
  assignments: ScenarioGanttAssignment[],
): PairingItem[] {
  // Group segments by pairingId
  const segsByPairing = new Map<number, ScenarioGanttPairingSegment[]>()
  for (const seg of pairingSegments) {
    const list = segsByPairing.get(seg.pairingId) ?? []
    list.push(seg)
    segsByPairing.set(seg.pairingId, list)
  }

  // Count crew assigned per pairing (from ASSIGNMENTS)
  const crewCountByPairing = new Map<number, number>()
  for (const a of assignments) {
    crewCountByPairing.set(a.pairingId, (crewCountByPairing.get(a.pairingId) ?? 0) + 1)
  }

  let idCounter = 1

  return pairings
    .sort((a, b) => a.schStrDtUtc.localeCompare(b.schStrDtUtc))
    .map((p) => {
      const segs = (segsByPairing.get(p.pairingId) ?? [])
        .sort((a, b) => a.dutySeq !== b.dutySeq ? a.dutySeq - b.dutySeq : a.segSeq - b.segSeq)

      const crewCount = crewCountByPairing.get(p.pairingId) ?? 0

      const pairing: Pairing = {
        id: p.pairingId,
        pairingLabel: p.pairingLabel,
        filiale: null,
        division: p.division,
        base: p.base,
        fleet: '',
        assignmentGroup: p.assignmentGroup,
        assignment: p.assignment,
        schStrDtUtc: p.schStrDtUtc,
        schEndDtUtc: p.schEndDtUtc,
        actStrDtUtc: p.schStrDtUtc,
        actEndDtUtc: p.schEndDtUtc,
        durationDays: 0,
        tafb: 0,
        dutyCount: new Set(segs.map((s) => s.dutySeq)).size,
        segCount: segs.length,
        blockMinutes: 0,
        ver: 1,
        isDeleted: 0,
        source: null,
        tags: null,
        comments: null,
        composition: [],
        isFull: crewCount > 0,
      }

      const segments: PairingSegment[] = segs.map((seg) => ({
        id: idCounter++,
        pairingId: seg.pairingId,
        dutySeq: seg.dutySeq,
        segSeq: seg.segSeq,
        fltId: seg.fltId,
        fltNum: seg.fltNum,
        airline: seg.airline,
        depArp: seg.depArp,
        arvArp: seg.arvArp,
        schStrDtUtc: seg.schStrDtUtc,
        schEndDtUtc: seg.schEndDtUtc,
        actStrDtUtc: seg.schStrDtUtc,
        actEndDtUtc: seg.schEndDtUtc,
        segAssignment: seg.segAssignment,
        dutyStrArp: seg.dutyStrArp,
        dutyEndArp: seg.dutyEndArp,
        dutySchStrDtUtc: seg.dutySchStrDtUtc,
        dutySchEndDtUtc: seg.dutySchEndDtUtc,
        dutySchRestMin: seg.dutySchRestMin,
        dutyActRestMin: seg.dutyActRestMin,
        pickupStartUtc: seg.pickup1StartUtc || null,
        pickupEndUtc: seg.pickup1EndUtc || null,
        briefAirport: null,
        briefStartUtc: seg.brief1StartUtc || null,
        briefEndUtc: seg.brief1EndUtc || null,
        debriefAirport: null,
        debriefStartUtc: seg.debrief1StartUtc || null,
        debriefEndUtc: seg.debrief1EndUtc || null,
        dropoffStartUtc: seg.dropoff1StartUtc || null,
        dropoffEndUtc: seg.dropoff1EndUtc || null,
        doublePickupStartUtc: null, doublePickupEndUtc: null,
        doubleBriefAirport: null, doubleBriefStartUtc: null, doubleBriefEndUtc: null,
        doubleDebriefAirport: null, doubleDebriefStartUtc: null, doubleDebriefEndUtc: null,
        doubleDropoffStartUtc: null, doubleDropoffEndUtc: null,
      }))

      const flights: PairingFlight[] = segs
        .filter((s) => s.fltId !== null)
        .map((s) => ({
          fltId: s.fltId!,
          fltNum: s.fltNum,
          depArp: s.depArp,
          arvArp: s.arvArp,
          schDepDtUtc: s.schStrDtUtc,
          schArvDtUtc: s.schEndDtUtc,
        }))

      return { pairing, segments, flights, sessionTags: [0] }
    })
}

// ── Left Panel Canvas ──────────────────────────────────────────────────────────
const PairingLeftPanel = ({
  items, scrollY, width, onScrollY,
}: {
  items: PairingItem[]
  scrollY: number
  width: number
  onScrollY: (y: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })
  const propsRef     = useRef({ items, scrollY, width })
  useEffect(() => { propsRef.current = { items, scrollY, width } })

  useEffect(() => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return
    const update = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      dprRef.current = dpr; sizeRef.current = { width: w, height: h }
      draw()
    }
    const ro = new ResizeObserver(update)
    ro.observe(container)
    update()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current
    const { width, height } = sizeRef.current
    const p = propsRef.current
    const colors = getGanttColors()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    // Header
    ctx.fillStyle = colors.bgColorPanelHeader
    ctx.fillRect(0, 0, width, HEADER_HEIGHT)
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `bold ${FONT_SIZE_PANEL_HEADER}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    ctx.fillText('Pairing', 12, HEADER_HEIGHT / 2)
    ctx.fillStyle = colors.gridColor
    ctx.fillRect(0, HEADER_HEIGHT - 1, width, 1)
    // Rows
    const ROW_H = PAIRING_ROW_HEIGHT
    const startRow = Math.max(0, Math.floor(p.scrollY / ROW_H))
    const endRow = Math.min(p.items.length - 1, Math.ceil((p.scrollY + height - HEADER_HEIGHT) / ROW_H))
    for (let i = startRow; i <= endRow; i++) {
      const item = p.items[i]; if (!item) continue
      const y = HEADER_HEIGHT + i * ROW_H - p.scrollY
      ctx.fillStyle = i % 2 === 0 ? colors.bgColor : colors.bgColorAlt
      ctx.fillRect(0, y, width, ROW_H)
      ctx.fillStyle = colors.gridColor
      ctx.fillRect(0, y + ROW_H - 1, width, 1)
      ctx.fillStyle = colors.textColor
      ctx.font = `bold ${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'
      ctx.fillText(item.pairing.pairingLabel ?? `P${item.pairing.id}`, 12, y + 6, width - 24)
      ctx.fillStyle = colors.textColorSecondary
      ctx.font = `${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
      ctx.fillText(`${item.pairing.base}`, 12, y + 20, width - 24)
    }
    ctx.fillStyle = colors.gridColor
    ctx.fillRect(width - 1, 0, 1, height)
  }, [])

  useEffect(() => { draw() })

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const maxY = Math.max(0, propsRef.current.items.length * PAIRING_ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
    onScrollY(Math.max(0, Math.min(maxY, propsRef.current.scrollY + e.deltaY)))
  }, [onScrollY])

  return (
    <div ref={containerRef} className="relative shrink-0 overflow-hidden" style={{ width }} data-testid="sg-pairing-left-panel">
      <canvas ref={canvasRef} className="block" onWheel={handleWheel} />
    </div>
  )
}

// ── Main Canvas ────────────────────────────────────────────────────────────────
const PairingCanvas = ({
  items, rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, timezone, onScrollY, onScrollX, onZoom, onScrollYChange,
}: {
  items: PairingItem[]
  rangeStart: Date; rangeEnd: Date
  pxPerHour: number; scrollX: number; scrollY: number
  timezone: string
  onScrollY: (y: number) => void; onScrollX: (x: number) => void
  onZoom: (px: number) => void; onScrollYChange?: (y: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })
  const propsRef     = useRef({ items, rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, timezone })
  useEffect(() => { propsRef.current = { items, rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, timezone } })

  useEffect(() => {
    const container = containerRef.current; const canvas = canvasRef.current
    if (!container || !canvas) return
    const update = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.floor(rect.width); const h = Math.floor(rect.height)
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      dprRef.current = dpr; sizeRef.current = { width: w, height: h }
      drawFrame()
    }
    const ro = new ResizeObserver(update); ro.observe(container); update()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current; const { width, height } = sizeRef.current
    const p = propsRef.current; const colors = getGanttColors()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const totalRows = p.items.length
    const rc: BaseRenderContext = {
      ctx, dpr: 1, canvasWidth: width, canvasHeight: height,
      scrollX: p.scrollX, scrollY: p.scrollY, pxPerHour: p.pxPerHour,
      rangeStart: p.rangeStart, rangeEnd: p.rangeEnd,
      totalRows, dropTargetRow: -1, frozenRowCount: 0,
      selectedRowIndices: new Set(), timezone: p.timezone,
    }
    renderBase(rc); drawHeaderBand(rc); drawTimelineHeader(rc, [])
    const prc: PairingRenderContext = {
      ...rc, items: p.items,
      selectedPairingIds: new Set(), hoveredPairingId: null,
      timezone: p.timezone, showSessionTags: false,
    }
    renderPairingTasks(prc)
    // Vertical scrollbar
    if (totalRows * PAIRING_ROW_HEIGHT > height - HEADER_HEIGHT) {
      const trackH = height - HEADER_HEIGHT
      const thumbH = Math.max(20, (trackH / (totalRows * PAIRING_ROW_HEIGHT)) * trackH)
      const thumbY = HEADER_HEIGHT + (p.scrollY / Math.max(1, totalRows * PAIRING_ROW_HEIGHT - trackH)) * (trackH - thumbH)
      ctx.fillStyle = colors.scrollbarColor; ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(width - SCROLLBAR_SIZE - 2, thumbY, SCROLLBAR_SIZE, thumbH, SCROLLBAR_RADIUS)
      else ctx.rect(width - SCROLLBAR_SIZE - 2, thumbY, SCROLLBAR_SIZE, thumbH)
      ctx.fill()
    }
  }, [])

  useEffect(() => { drawFrame() })

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      onZoom(propsRef.current.pxPerHour * (e.deltaY > 0 ? 0.9 : 1.1))
    } else if (e.shiftKey) {
      onScrollX(propsRef.current.scrollX + e.deltaY)
    } else {
      const maxY = Math.max(0, propsRef.current.items.length * PAIRING_ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
      const nextY = Math.max(0, Math.min(maxY, propsRef.current.scrollY + e.deltaY))
      onScrollY(nextY); onScrollYChange?.(nextY)
    }
  }, [onScrollX, onScrollY, onZoom, onScrollYChange])

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden" data-testid="sg-pairing-canvas">
      <canvas ref={canvasRef} className="block" onWheel={handleWheel} />
    </div>
  )
}

// ── ScenarioPairingPane (top-level) ───────────────────────────────────────────
export const ScenarioPairingPane = ({ paneId, scenarioId, draggable, onDragStart, onDragEnd, onClose }: ScenarioPairingPaneProps) => {
  const useStore       = getScenarioGanttStore(scenarioId)
  const useLayoutStore = getScenarioLayoutStore(scenarioId)

  const data           = useStore((s) => s.data)
  const pxPerHour      = useStore((s) => s.pxPerHour)
  const scrollX        = useStore((s) => s.scrollX)
  const setZoom        = useStore((s) => s.setZoom)
  const setScrollX     = useStore((s) => s.setScrollX)

  const leftPanelWidth    = useLayoutStore((s) => s.panes.get(paneId)?.leftPanelWidth ?? 200)
  const setLeftPanelWidth = useLayoutStore((s) => s.setLeftPanelWidth)
  const timezone          = useTimezoneStore((s) => s.timezone)

  const [scrollY, setScrollY] = useState(0)

  const pairingItems = useMemo(() => {
    if (!data) return []
    return buildPairingItems(data.pairings, data.pairingSegments, data.assignments)
  }, [data?.pairings, data?.pairingSegments, data?.assignments])

  const rangeStart = useMemo(() => data ? new Date(data.strDtLoc) : new Date(), [data?.strDtLoc])
  const rangeEnd   = useMemo(() => data ? new Date(data.endDtLoc) : new Date(), [data?.endDtLoc])

  if (!data) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ScenarioPaneToolbar
        paneId={paneId} paneType="pairing"
        rowCount={pairingItems.length}
        draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PairingLeftPanel
          items={pairingItems} scrollY={scrollY} width={leftPanelWidth}
          onScrollY={setScrollY}
        />
        <div className="shrink-0 w-0.5 bg-border" />
        <PairingCanvas
          items={pairingItems} rangeStart={rangeStart} rangeEnd={rangeEnd}
          pxPerHour={pxPerHour} scrollX={scrollX} scrollY={scrollY} timezone={timezone}
          onScrollY={setScrollY} onScrollX={setScrollX} onZoom={setZoom}
          onScrollYChange={setScrollY}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-pairing-pane" | head -10
```

Expected: no errors. If `PairingSegment` has additional required fields not covered above, add them with `null` defaults.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-pairing-pane.tsx
git commit -m "feat(gantt): ScenarioPairingPane — renderPairingTasks with PairingItem[] from input.gz"
```

---

## Task 9: Create ScenarioFlightPane

**Files:**
- Create: `gantt/src/components/scenario-gantt/scenario-flight-pane.tsx`

Uses `renderFlightTasks` with `FlightItem[]` grouped by fleet+register from input.gz `flight` section. Also shows crew assignment status via `compositionStatusMap`.

Key type mapping `ScenarioGanttFlight` → `Flight` (from `@/types/flight`):
- `id` → `id`; `fltNum` → `fltNum`; `depArp` → `depArp`; `arvArp` → `arvArp`
- `schDepDtUtc` → `schDepDtUtc`; `schArvDtUtc` → `schArvDtUtc`
- `fleet` → `fleet`; `register` → `register ?? ''`
- Remaining `Flight` fields: `airline: ''`, `fltDt: ''`, `actDepDtUtc: schDepDtUtc`, `actArvDtUtc: schArvDtUtc`, `actDepArp: depArp`, `actArvArp: arvArp`, `flightFlag: 'S'`, `blkMin: 0`, `fltType: 'PAX'`, `fltSts: null`, `isDeleted: 0`, `isCancelled: false`

- [ ] **Step 1: Create the file**

```tsx
// gantt/src/components/scenario-gantt/scenario-flight-pane.tsx
import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import {
  renderBase, drawHeaderBand, drawTimelineHeader,
} from '@/components/gantt/renderers/base-renderer'
import type { BaseRenderContext } from '@/components/gantt/renderers/base-renderer'
import { renderFlightTasks } from '@/components/gantt/renderers/flight-renderer'
import type { FlightRenderContext } from '@/components/gantt/renderers/flight-renderer'
import type { FlightItem, Flight, FlightCompositionStatus } from '@/types/flight'
import {
  getGanttColors, ROW_HEIGHT, HEADER_HEIGHT,
  SCROLLBAR_SIZE, SCROLLBAR_RADIUS, FONT_FAMILY, FONT_SIZE_PANEL,
  FONT_SIZE_PANEL_HEADER,
} from '@/components/gantt/gantt-constants'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { ScenarioPaneToolbar } from './scenario-pane-toolbar'
import type {
  ScenarioGanttFlight, ScenarioGanttAssignment, ScenarioGanttPairingSegment,
} from '@/types/scenario-gantt'

interface ScenarioFlightPaneProps {
  paneId: string
  scenarioId: number
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onClose?: () => void
}

function buildFlightItems(
  flights: ScenarioGanttFlight[],
  pairingSegments: ScenarioGanttPairingSegment[],
  assignments: ScenarioGanttAssignment[],
): { flightRows: FlightItem[]; compositionStatusMap: Map<number, FlightCompositionStatus> } {
  // Build set of flight IDs that have crew assignments
  // ASSIGNMENTS → pairingId → find pairingSegments with that pairingId → collect flt_ids
  const assignedPairingIds = new Set(assignments.map((a) => a.pairingId))
  const assignedFlightIds = new Set(
    pairingSegments
      .filter((s) => s.fltId !== null && assignedPairingIds.has(s.pairingId))
      .map((s) => s.fltId!)
  )

  const compositionStatusMap = new Map<number, FlightCompositionStatus>()
  for (const f of flights) {
    compositionStatusMap.set(f.id, assignedFlightIds.has(f.id) ? 'full' : 'partial')
  }

  // Convert ScenarioGanttFlight → Flight
  const toFlight = (f: ScenarioGanttFlight): Flight => ({
    id: f.id,
    airline: '',
    fltDt: '',
    fltNum: f.fltNum,
    depArp: f.depArp,
    arvArp: f.arvArp,
    schDepDtUtc: f.schDepDtUtc,
    schArvDtUtc: f.schArvDtUtc,
    actDepDtUtc: f.schDepDtUtc,
    actArvDtUtc: f.schArvDtUtc,
    actDepArp: f.depArp,
    actArvArp: f.arvArp,
    flightFlag: 'S',
    flightAssignment: null,
    blkMin: 0,
    fleet: f.fleet,
    register: f.register ?? '',
    fltType: 'PAX',
    fltSts: null,
    isDeleted: 0,
    isCancelled: false,
  })

  // Group by (fleet, register) key
  const groups = new Map<string, ScenarioGanttFlight[]>()
  for (const f of flights) {
    const key = `${f.fleet}__${f.register ?? '__fleet__'}`
    const list = groups.get(key) ?? []
    list.push(f)
    groups.set(key, list)
  }

  // Build FlightItem[] sorted by fleet then registration
  const flightRows: FlightItem[] = [...groups.entries()]
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([_, groupFlights]) => {
      const first = groupFlights[0]
      return {
        registration: first.register ?? first.fleet,
        fleet: first.fleet,
        flights: groupFlights.sort((a, b) => a.schDepDtUtc.localeCompare(b.schDepDtUtc)).map(toFlight),
        isFleetGrouped: first.register === null,
        sessionTags: [0],
      }
    })

  return { flightRows, compositionStatusMap }
}

// ── Left Panel Canvas ──────────────────────────────────────────────────────────
const FlightLeftPanel = ({
  flightRows, scrollY, width, onScrollY,
}: {
  flightRows: FlightItem[]
  scrollY: number
  width: number
  onScrollY: (y: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })
  const propsRef     = useRef({ flightRows, scrollY, width })
  useEffect(() => { propsRef.current = { flightRows, scrollY, width } })

  useEffect(() => {
    const container = containerRef.current; const canvas = canvasRef.current
    if (!container || !canvas) return
    const update = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.floor(rect.width); const h = Math.floor(rect.height)
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      dprRef.current = dpr; sizeRef.current = { width: w, height: h }
      draw()
    }
    const ro = new ResizeObserver(update); ro.observe(container); update()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current; const { width, height } = sizeRef.current
    const p = propsRef.current; const colors = getGanttColors()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = colors.bgColorPanelHeader
    ctx.fillRect(0, 0, width, HEADER_HEIGHT)
    ctx.fillStyle = colors.textColorSecondary
    ctx.font = `bold ${FONT_SIZE_PANEL_HEADER}px ${FONT_FAMILY}`
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
    ctx.fillText('Aircraft', 12, HEADER_HEIGHT / 2)
    ctx.fillStyle = colors.gridColor; ctx.fillRect(0, HEADER_HEIGHT - 1, width, 1)
    const startRow = Math.max(0, Math.floor(p.scrollY / ROW_HEIGHT))
    const endRow = Math.min(p.flightRows.length - 1, Math.ceil((p.scrollY + height - HEADER_HEIGHT) / ROW_HEIGHT))
    for (let i = startRow; i <= endRow; i++) {
      const row = p.flightRows[i]; if (!row) continue
      const y = HEADER_HEIGHT + i * ROW_HEIGHT - p.scrollY
      ctx.fillStyle = i % 2 === 0 ? colors.bgColor : colors.bgColorAlt
      ctx.fillRect(0, y, width, ROW_HEIGHT)
      ctx.fillStyle = colors.gridColor; ctx.fillRect(0, y + ROW_HEIGHT - 1, width, 1)
      ctx.fillStyle = colors.textColor
      ctx.font = `bold ${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'
      ctx.fillText(row.registration, 12, y + 6, width - 24)
      ctx.fillStyle = colors.textColorSecondary
      ctx.font = `${FONT_SIZE_PANEL}px ${FONT_FAMILY}`
      ctx.fillText(row.fleet, 12, y + 20, width - 24)
    }
    ctx.fillStyle = colors.gridColor; ctx.fillRect(width - 1, 0, 1, height)
  }, [])

  useEffect(() => { draw() })

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const maxY = Math.max(0, propsRef.current.flightRows.length * ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
    onScrollY(Math.max(0, Math.min(maxY, propsRef.current.scrollY + e.deltaY)))
  }, [onScrollY])

  return (
    <div ref={containerRef} className="relative shrink-0 overflow-hidden" style={{ width }} data-testid="sg-flight-left-panel">
      <canvas ref={canvasRef} className="block" onWheel={handleWheel} />
    </div>
  )
}

// ── Main Canvas ────────────────────────────────────────────────────────────────
const FlightCanvas = ({
  flightRows, compositionStatusMap, rangeStart, rangeEnd,
  pxPerHour, scrollX, scrollY, timezone,
  onScrollY, onScrollX, onZoom, onScrollYChange,
}: {
  flightRows: FlightItem[]
  compositionStatusMap: Map<number, FlightCompositionStatus>
  rangeStart: Date; rangeEnd: Date
  pxPerHour: number; scrollX: number; scrollY: number; timezone: string
  onScrollY: (y: number) => void; onScrollX: (x: number) => void
  onZoom: (px: number) => void; onScrollYChange?: (y: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const dprRef       = useRef(1)
  const sizeRef      = useRef({ width: 0, height: 0 })
  const propsRef = useRef({ flightRows, compositionStatusMap, rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, timezone })
  useEffect(() => { propsRef.current = { flightRows, compositionStatusMap, rangeStart, rangeEnd, pxPerHour, scrollX, scrollY, timezone } })

  useEffect(() => {
    const container = containerRef.current; const canvas = canvasRef.current
    if (!container || !canvas) return
    const update = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      const w = Math.floor(rect.width); const h = Math.floor(rect.height)
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
      dprRef.current = dpr; sizeRef.current = { width: w, height: h }
      drawFrame()
    }
    const ro = new ResizeObserver(update); ro.observe(container); update()
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = dprRef.current; const { width, height } = sizeRef.current
    const p = propsRef.current; const colors = getGanttColors()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const totalRows = p.flightRows.length
    const rc: BaseRenderContext = {
      ctx, dpr: 1, canvasWidth: width, canvasHeight: height,
      scrollX: p.scrollX, scrollY: p.scrollY, pxPerHour: p.pxPerHour,
      rangeStart: p.rangeStart, rangeEnd: p.rangeEnd,
      totalRows, dropTargetRow: -1, frozenRowCount: 0,
      selectedRowIndices: new Set(), timezone: p.timezone,
    }
    renderBase(rc); drawHeaderBand(rc); drawTimelineHeader(rc, [])
    const frc: FlightRenderContext = {
      ...rc,
      flightRows: p.flightRows,
      selectedFlightIds: new Set(),
      hoveredFlightId: null,
      compositionStatusMap: p.compositionStatusMap,
      timezone: p.timezone,
    }
    renderFlightTasks(frc)
    if (totalRows * ROW_HEIGHT > height - HEADER_HEIGHT) {
      const trackH = height - HEADER_HEIGHT
      const thumbH = Math.max(20, (trackH / (totalRows * ROW_HEIGHT)) * trackH)
      const thumbY = HEADER_HEIGHT + (p.scrollY / Math.max(1, totalRows * ROW_HEIGHT - trackH)) * (trackH - thumbH)
      ctx.fillStyle = colors.scrollbarColor; ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(width - SCROLLBAR_SIZE - 2, thumbY, SCROLLBAR_SIZE, thumbH, SCROLLBAR_RADIUS)
      else ctx.rect(width - SCROLLBAR_SIZE - 2, thumbY, SCROLLBAR_SIZE, thumbH)
      ctx.fill()
    }
  }, [])

  useEffect(() => { drawFrame() })

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      onZoom(propsRef.current.pxPerHour * (e.deltaY > 0 ? 0.9 : 1.1))
    } else if (e.shiftKey) {
      onScrollX(propsRef.current.scrollX + e.deltaY)
    } else {
      const maxY = Math.max(0, propsRef.current.flightRows.length * ROW_HEIGHT - (sizeRef.current.height - HEADER_HEIGHT))
      const nextY = Math.max(0, Math.min(maxY, propsRef.current.scrollY + e.deltaY))
      onScrollY(nextY); onScrollYChange?.(nextY)
    }
  }, [onScrollX, onScrollY, onZoom, onScrollYChange])

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden" data-testid="sg-flight-canvas">
      <canvas ref={canvasRef} className="block" onWheel={handleWheel} />
    </div>
  )
}

// ── ScenarioFlightPane (top-level) ────────────────────────────────────────────
export const ScenarioFlightPane = ({ paneId, scenarioId, draggable, onDragStart, onDragEnd, onClose }: ScenarioFlightPaneProps) => {
  const useStore       = getScenarioGanttStore(scenarioId)
  const useLayoutStore = getScenarioLayoutStore(scenarioId)

  const data       = useStore((s) => s.data)
  const pxPerHour  = useStore((s) => s.pxPerHour)
  const scrollX    = useStore((s) => s.scrollX)
  const setZoom    = useStore((s) => s.setZoom)
  const setScrollX = useStore((s) => s.setScrollX)

  const leftPanelWidth    = useLayoutStore((s) => s.panes.get(paneId)?.leftPanelWidth ?? 200)
  const setLeftPanelWidth = useLayoutStore((s) => s.setLeftPanelWidth)
  const timezone          = useTimezoneStore((s) => s.timezone)

  const [scrollY, setScrollY] = useState(0)

  const { flightRows, compositionStatusMap } = useMemo(() => {
    if (!data) return { flightRows: [], compositionStatusMap: new Map() }
    return buildFlightItems(data.flights ?? [], data.pairingSegments, data.assignments)
  }, [data?.flights, data?.pairingSegments, data?.assignments])

  const rangeStart = useMemo(() => data ? new Date(data.strDtLoc) : new Date(), [data?.strDtLoc])
  const rangeEnd   = useMemo(() => data ? new Date(data.endDtLoc) : new Date(), [data?.endDtLoc])

  if (!data) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading…</div>

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ScenarioPaneToolbar
        paneId={paneId} paneType="flight"
        rowCount={flightRows.length}
        draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <FlightLeftPanel
          flightRows={flightRows} scrollY={scrollY} width={leftPanelWidth}
          onScrollY={setScrollY}
        />
        <div className="shrink-0 w-0.5 bg-border" />
        <FlightCanvas
          flightRows={flightRows} compositionStatusMap={compositionStatusMap}
          rangeStart={rangeStart} rangeEnd={rangeEnd}
          pxPerHour={pxPerHour} scrollX={scrollX} scrollY={scrollY} timezone={timezone}
          onScrollY={setScrollY} onScrollX={setScrollX} onZoom={setZoom}
          onScrollYChange={setScrollY}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep "scenario-flight-pane\|FlightItem\|FlightRenderContext" | head -10
```

Expected: no errors. If `Flight` has additional required fields not covered above, add them with safe defaults.

- [ ] **Step 3: Commit**

```bash
git add gantt/src/components/scenario-gantt/scenario-flight-pane.tsx
git commit -m "feat(gantt): ScenarioFlightPane — renderFlightTasks grouped by fleet+register"
```

---

## Task 10: Build + version bump

- [ ] **Step 1: Full TypeScript check**

```bash
cd /home/yuan.z/rois/rois-ai/gantt && npx tsc --noEmit 2>&1 | grep -v "pairing-duty-node-service" | head -30
```

Expected: no errors from scenario-gantt files. Fix any that appear before proceeding.

- [ ] **Step 2: Production build**

```bash
~/rois/rois.sh build gantt 2>&1 | tail -8
```

Expected: `✓ [gantt] 完成`.

- [ ] **Step 3: Increment FRONTEND_VERSION**

```bash
cat /home/yuan.z/rois/rois-ai/gantt/src/version.ts
# Edit to increment FRONTEND_VERSION by 1
```

- [ ] **Step 4: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version (scenario-gantt multi-pane: Roster + Pairing + Flight)"
```
