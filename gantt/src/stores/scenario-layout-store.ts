// gantt/src/stores/scenario-layout-store.ts
import { create } from 'zustand'

export type ScenarioPaneType = 'roster' | 'pairing' | 'flight'
export type ScenarioLayoutGrid = [string | null, string | null][]

export interface ScenarioPaneInfo {
  type: ScenarioPaneType
  scrollY: number
  frozenCrewIds: string[]
  /** Cross-pane "find/locate" matches floated to the top of this pane. Used generically:
   *  crewIds for the roster pane, pairingId strings for the pairing pane (mirrors Live's
   *  pane-store foundCrewIds convention). Cleared on sort change in the consuming pane. */
  foundCrewIds: string[]
}

interface ScenarioLayoutStore {
  grid: ScenarioLayoutGrid
  panes: Map<string, ScenarioPaneInfo>
  rowHeights: number[]
  counters: Record<ScenarioPaneType, number>
  leftPanelWidth: number
  /** Whether applyCapabilityDefaults has performed its first-time rebuild. Once true, later
   *  applications only enforce the allowed set and never clobber the user's customized layout. */
  capabilitiesApplied: boolean
  /** Last allowed pane set applied (used to gate addPane). null = no capabilities applied yet. */
  allowedPanes: ScenarioPaneType[] | null

  addPane: (type: ScenarioPaneType) => string | null
  closePane: (paneId: string) => void
  movePane: (paneId: string, toRow: number, toCol: number, hint: 'left' | 'right' | 'top' | 'bottom' | 'center') => void
  applyCapabilityDefaults: (caps: { panes: ScenarioPaneType[]; defaultPanes: ScenarioPaneType[] }) => void
  setScrollY: (paneId: string, y: number) => void
  setLeftPanelWidth: (w: number) => void
  setFrozenCrewIds: (paneId: string, ids: string[]) => void
  setFoundCrewIds: (paneId: string, ids: string[]) => void
  clearFoundCrewIds: (paneId: string) => void
  /** First pane id whose type matches, or null. Used by find-helpers to resolve the
   *  target roster/pairing pane id in this scenario's layout. */
  findPaneIdByType: (type: ScenarioPaneType) => string | null
  setRowHeight: (row: number, height: number) => void
  setRowHeights: (heights: number[]) => void
  reset: () => void
}

const MAX_PER_TYPE: Record<ScenarioPaneType, number> = { roster: 1, pairing: 1, flight: 1 }
const MAX_PANES = 3
const DEFAULT_ROSTER_ID = 'roster-1'
const DEFAULT_PAIRING_ID = 'pairing-1'
const ALL_PANE_TYPES: ScenarioPaneType[] = ['roster', 'pairing', 'flight']
const EMPTY_GRID_ROW: [string | null, string | null] = [null, null]
const PANE_ORDER: Record<ScenarioPaneType, number> = { roster: 0, pairing: 1, flight: 2 }

const buildCanonicalGrid = (panes: Map<string, ScenarioPaneInfo>): ScenarioLayoutGrid => {
  const ordered = [...panes.entries()]
    .sort(([, a], [, b]) => PANE_ORDER[a.type] - PANE_ORDER[b.type])
    .map(([id]) => [id, null] as [string | null, string | null])
  return ordered.length > 0 ? ordered : [EMPTY_GRID_ROW]
}

function makeDefault(): Pick<
  ScenarioLayoutStore,
  'grid' | 'panes' | 'rowHeights' | 'counters' | 'leftPanelWidth' | 'capabilitiesApplied' | 'allowedPanes'
> {
  return {
    grid: [
      [DEFAULT_ROSTER_ID, null],
      [DEFAULT_PAIRING_ID, null],
    ],
    panes: new Map([
      [DEFAULT_ROSTER_ID,  { type: 'roster',  scrollY: 0, frozenCrewIds: [], foundCrewIds: [] }],
      [DEFAULT_PAIRING_ID, { type: 'pairing', scrollY: 0, frozenCrewIds: [], foundCrewIds: [] }],
    ]),
    rowHeights: [-1, -1],
    counters: { roster: 1, pairing: 1, flight: 0 },
    leftPanelWidth: 260,
    capabilitiesApplied: false,
    allowedPanes: null,
  }
}

function createLayoutStore() {
  return create<ScenarioLayoutStore>((set, get) => ({
    ...makeDefault(),

    addPane: (type) => {
      const { grid, panes, counters, allowedPanes } = get()
      // Once capabilities have been applied, reject pane types outside the allowed set.
      if (allowedPanes && !allowedPanes.includes(type)) return null
      const typeCount = [...panes.values()].filter((p) => p.type === type).length
      if (typeCount >= MAX_PER_TYPE[type]) return null
      if (panes.size >= MAX_PANES) return null

      const num = counters[type] + 1
      const paneId = `${type}-${num}`
      const newPane: ScenarioPaneInfo = { type, scrollY: 0, frozenCrewIds: [], foundCrewIds: [] }

      const newGrid = grid.map((r) => [...r] as [string | null, string | null])
      const hasOnlyEmptyPlaceholder =
        panes.size === 0 &&
        newGrid.length === 1 &&
        !newGrid[0][0] &&
        !newGrid[0][1]

      if (hasOnlyEmptyPlaceholder) {
        newGrid[0] = [paneId, null]
      } else {
        // Always add as a new row (matching Live Gantt where panes span full width)
        newGrid.push([paneId, null])
      }

      const newPanes = new Map(panes)
      newPanes.set(paneId, newPane)
      const finalGrid = buildCanonicalGrid(newPanes)

      set({
        grid: finalGrid,
        panes: newPanes,
        rowHeights: finalGrid.map(() => -1),
        counters: { ...counters, [type]: num },
      })
      return paneId
    },

    closePane: (paneId) => {
      const { grid, panes } = get()
      if (!panes.has(paneId)) return

      const newPanes = new Map(panes)
      newPanes.delete(paneId)
      const finalGrid = buildCanonicalGrid(newPanes)
      set({ grid: finalGrid, panes: newPanes, rowHeights: finalGrid.map(() => -1) })
    },

    movePane: (paneId, toRow, toCol, hint) => {
      const { grid, panes } = get()
      if (!panes.has(paneId)) return

      let fromRow = -1, fromCol = -1
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < 2; c++) {
          if (grid[r][c] === paneId) { fromRow = r; fromCol = c }
        }
      }
      if (fromRow === -1) return

      const newGrid = grid.map((r) => [...r] as [string | null, string | null])

      if (hint === 'top') {
        newGrid[fromRow][fromCol] = null
        newGrid.splice(toRow, 0, [paneId, null])
      } else if (hint === 'bottom') {
        newGrid[fromRow][fromCol] = null
        newGrid.splice(toRow + 1, 0, [paneId, null])
      } else {
        const targetCell = newGrid[toRow][toCol]
        newGrid[fromRow][fromCol] = targetCell
        newGrid[toRow][toCol] = paneId
      }

      const finalGrid = buildCanonicalGrid(panes)
      set({ grid: finalGrid, rowHeights: finalGrid.map(() => -1) })
    },

    applyCapabilityDefaults: (caps) => {
      const { capabilitiesApplied } = get()

      // First application: rebuild grid+panes to exactly caps.defaultPanes (in order),
      // one pane per row — mirroring makeDefault's layout. Stable ids per type keep
      // scrollY/source keys consistent with makeDefault/addPane (`<type>-1`).
      if (!capabilitiesApplied) {
        const seen = new Set<ScenarioPaneType>()
        const seededTypes: ScenarioPaneType[] = []
        for (const type of caps.defaultPanes) {
          if (!ALL_PANE_TYPES.includes(type) || seen.has(type)) continue
          seen.add(type)
          seededTypes.push(type)
        }

        const panes = new Map<string, ScenarioPaneInfo>(
          seededTypes.map((type) => [`${type}-1`, { type, scrollY: 0, frozenCrewIds: [], foundCrewIds: [] }]),
        )
        const counters: Record<ScenarioPaneType, number> = { roster: 0, pairing: 0, flight: 0 }
        for (const type of seededTypes) counters[type] = 1

        const finalGrid = buildCanonicalGrid(panes)

        set({
          grid: finalGrid,
          panes,
          rowHeights: finalGrid.map(() => -1),
          counters,
          capabilitiesApplied: true,
          allowedPanes: [...caps.panes],
        })
        return
      }

      // Subsequent applications: respect the user's customized layout. Only ENFORCE the
      // allowed set — close any open pane whose type is not in caps.panes.
      const { grid, panes } = get()
      const allowed = new Set(caps.panes)
      const disallowedIds = [...panes.entries()]
        .filter(([, info]) => !allowed.has(info.type))
        .map(([id]) => id)

      if (disallowedIds.length === 0) {
        // Idempotent: nothing to enforce, just refresh the allowed-set snapshot.
        set({ allowedPanes: [...caps.panes] })
        return
      }

      const removed = new Set(disallowedIds)
      const newPanes = new Map(panes)
      for (const id of removed) newPanes.delete(id)
      const finalGrid = buildCanonicalGrid(newPanes)

      set({
        grid: finalGrid,
        panes: newPanes,
        rowHeights: finalGrid.map(() => -1),
        allowedPanes: [...caps.panes],
      })
    },

    setScrollY: (paneId, y) => {
      const { panes } = get()
      const pane = panes.get(paneId)
      if (!pane) return
      const newPanes = new Map(panes)
      newPanes.set(paneId, { ...pane, scrollY: Math.max(0, y) })
      set({ panes: newPanes })
    },

    setLeftPanelWidth: (w) => {
      set({ leftPanelWidth: Math.max(120, Math.min(400, w)) })
    },

    setFrozenCrewIds: (paneId, ids) => {
      const { panes } = get()
      const pane = panes.get(paneId)
      if (!pane) return
      const newPanes = new Map(panes)
      newPanes.set(paneId, { ...pane, frozenCrewIds: ids })
      set({ panes: newPanes })
    },

    setFoundCrewIds: (paneId, ids) => {
      const { panes } = get()
      const pane = panes.get(paneId)
      if (!pane) return
      const newPanes = new Map(panes)
      newPanes.set(paneId, { ...pane, foundCrewIds: ids })
      set({ panes: newPanes })
    },

    clearFoundCrewIds: (paneId) => {
      const { panes } = get()
      const pane = panes.get(paneId)
      if (!pane || pane.foundCrewIds.length === 0) return
      const newPanes = new Map(panes)
      newPanes.set(paneId, { ...pane, foundCrewIds: [] })
      set({ panes: newPanes })
    },

    findPaneIdByType: (type) => {
      for (const [id, info] of get().panes) {
        if (info.type === type) return id
      }
      return null
    },

    setRowHeight: (row, height) => {
      const { rowHeights } = get()
      const next = [...rowHeights]
      next[row] = height
      set({ rowHeights: next })
    },

    setRowHeights: (heights) => {
      set({ rowHeights: [...heights] })
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
  roster:  '#14b8a6',
  pairing: '#3b82f6',
  flight:  '#a855f7',
}

export const PANE_NAMES: Record<ScenarioPaneType, string> = {
  roster:  'Roster',
  pairing: 'Pairing',
  flight:  'Flight',
}
