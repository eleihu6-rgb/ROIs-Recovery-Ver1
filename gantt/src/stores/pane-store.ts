import { create } from 'zustand'
import type { PaneType, PaneConfig, DateRange, FloatGeometry } from '@/types'
import { startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { LEFT_PANEL_WIDTH, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH } from '@/components/gantt/gantt-constants'
import { createContextStoreRegistry, type GanttContextId } from './create-context-store'
import { useGanttContextId } from '@/components/gantt/context/gantt-context'

/** One sort key; priority is the array index in PaneInteractiveState.sortCriteria. */
export interface SortCriterion {
  column: string
  direction: 'asc' | 'desc'
}

// === Legacy Adapter Layer ===
// Maps old PaneType ('roster-main', 'roster-sub', 'pairing', 'flight')
// to new PaneType ('roster', 'pairing', 'flight') in layout-store.
// This adapter will be deprecated after migration complete.

import { useLayoutStore } from './layout-store'
import type { PaneType as NewPaneType } from '@/types/layout'

/** Legacy to new type mapping */
const LEGACY_TO_NEW_PANE_TYPE: Record<string, NewPaneType> = {
  'roster-main': 'roster',
  'roster-sub': 'roster',
  'pairing': 'pairing',
  'flight': 'flight'
}

/** Get pane ID from legacy type (finds first matching pane in layout-store) */
const getPaneIdFromLegacyType = (legacyType: string): string | null => {
  const newType = LEGACY_TO_NEW_PANE_TYPE[legacyType]
  if (!newType) return null

  const { panes } = useLayoutStore.getState()
  for (const [id, pane] of panes) {
    if (pane.type === newType) return id
  }
  return null
}

/** Adapter helper: delegate scrollY to layout-store if pane found */
const delegateScrollYToLayoutStore = (legacyType: string, y: number): boolean => {
  const paneId = getPaneIdFromLegacyType(legacyType)
  if (paneId) {
    useLayoutStore.getState().setViewport(paneId, { scrollY: Math.max(0, y) })
    return true
  }
  return false
}
// === End Legacy Adapter Layer ===

const today = new Date()
const defaultStart = startOfMonth(subMonths(today, 1))
const defaultEnd = endOfMonth(addMonths(today, 1))

const DEFAULT_PANES: PaneConfig[] = [
  { type: 'roster-main', visible: true, height: 300, minHeight: 150, floating: false },
  { type: 'roster-sub', visible: false, height: 250, minHeight: 150, floating: false },
  { type: 'pairing', visible: true, height: 250, minHeight: 120, floating: false },
  { type: 'flight', visible: false, height: 250, minHeight: 120, floating: false },
]

/** Per-pane interactive state */
interface PaneInteractiveState {
  scrollY: number
  /** Ordered sort keys (index 0 = primary). Empty = no sort. */
  sortCriteria: SortCriterion[]
  dropTargetRow: number
  /** IDs of rows pinned to the top (order preserved) */
  frozenRowIds: string[]
  /** IDs of "found crew" rows moved to top (transient; cleared on re-sort/refresh, accumulates) */
  foundCrewIds: string[]
  /** IDs of currently selected rows */
  selectedRowIds: string[]
  /** Last clicked row ID for Shift-range selection */
  lastSelectedRowId: string | null
}

const createDefaultInteractiveState = (): PaneInteractiveState => ({
  scrollY: 0,
  sortCriteria: [],
  dropTargetRow: -1,
  frozenRowIds: [],
  foundCrewIds: [],
  selectedRowIds: [],
  lastSelectedRowId: null,
})

interface PaneStore {
  /** Panes in top-to-bottom order */
  panes: PaneConfig[]

  /** Shared date range (legacy compat — prefer filter-store) */
  dateRange: DateRange

  /** Per-pane interactive state */
  interactiveState: Record<PaneType, PaneInteractiveState>

  /** Left panel width (shared by all panes) */
  leftPanelWidth: number

  /** Set left panel width (clamped to min/max) */
  setLeftPanelWidth: (width: number) => void

  /** Toggle visibility of a pane */
  togglePane: (type: PaneType) => void

  /** Set visibility explicitly */
  setVisible: (type: PaneType, visible: boolean) => void

  /** Resize a pane (height in pixels) */
  resizePane: (type: PaneType, height: number) => void

  /** Get visible panes only */
  visiblePanes: () => PaneConfig[]

  /** Reset to default layout */
  resetLayout: () => void

  /** Per-pane scroll Y */
  getScrollY: (paneType: PaneType) => number
  setScrollY: (paneType: PaneType, y: number, maxScrollY?: number) => void

  /** Per-pane sort (multi-key with priority) */
  getSortColumn: (paneType: PaneType) => string | null
  getSortDirection: (paneType: PaneType) => 'asc' | 'desc'
  getSortCriteria: (paneType: PaneType) => SortCriterion[]
  /** Header-click sort: replace criteria with a single toggled key */
  setSortColumn: (paneType: PaneType, column: string) => void
  /** Dialog Apply: replace the full criteria list */
  setSortCriteria: (paneType: PaneType, criteria: SortCriterion[]) => void
  /** Chip ×: drop one key */
  removeSortCriterion: (paneType: PaneType, column: string) => void

  /** Per-pane drop target */
  getDropTargetRow: (paneType: PaneType) => number
  setDropTargetRow: (paneType: PaneType, row: number) => void

  /** Per-pane frozen rows (by ID) */
  getFrozenRowIds: (paneType: PaneType) => string[]
  getFrozenRowCount: (paneType: PaneType) => number
  freezeSelectedRows: (paneType: PaneType) => void
  unfreezeRow: (paneType: PaneType, rowId: string) => void
  unfreezeAll: (paneType: PaneType) => void

  /** Per-pane "found crew" rows (transient, accumulating; cleared on re-sort/refresh) */
  getFoundCrewIds: (paneType: PaneType) => string[]
  addFoundCrewIds: (paneType: PaneType, crewIds: string[]) => void
  setFoundCrewIds: (paneType: PaneType, crewIds: string[]) => void
  clearFoundCrewIds: (paneType: PaneType) => void

  /** Per-pane row selection */
  getSelectedRowIds: (paneType: PaneType) => string[]
  selectRow: (paneType: PaneType, rowId: string) => void
  toggleRowSelection: (paneType: PaneType, rowId: string) => void
  selectRowRange: (paneType: PaneType, toRowId: string, allRowIds: string[]) => void
  clearRowSelection: (paneType: PaneType) => void

  /** Set date range */
  setDateRange: (start: Date, end: Date) => void

  /** Detach a pane into a floating window */
  floatPane: (type: PaneType, geometry: FloatGeometry) => void

  /** Re-dock a floating pane back into the stack */
  dockPane: (type: PaneType) => void

  /** Update floating window geometry (called during drag/resize) */
  setFloatGeometry: (type: PaneType, geometry: Partial<FloatGeometry>) => void
}

const makePaneStore = () => create<PaneStore>((set, get) => ({
  panes: [...DEFAULT_PANES],
  dateRange: { start: defaultStart, end: defaultEnd },
  leftPanelWidth: LEFT_PANEL_WIDTH,
  interactiveState: {
    'roster-main':     createDefaultInteractiveState(),
    'roster-sub':      createDefaultInteractiveState(),
    'pairing':         createDefaultInteractiveState(),
    'flight':           createDefaultInteractiveState(),
    'scenario-roster':  createDefaultInteractiveState(),
    'scenario-pairing': createDefaultInteractiveState(),
    'scenario-flight':  createDefaultInteractiveState(),
  },

  setLeftPanelWidth: (width) => {
    set({ leftPanelWidth: Math.min(LEFT_PANEL_MAX_WIDTH, Math.max(LEFT_PANEL_MIN_WIDTH, width)) })
  },

  togglePane: (type) => {
    set((state) => ({
      panes: state.panes.map((p) =>
        p.type === type ? { ...p, visible: !p.visible } : p,
      ),
    }))
  },

  setVisible: (type, visible) => {
    set((state) => ({
      panes: state.panes.map((p) =>
        p.type === type ? { ...p, visible } : p,
      ),
    }))
  },

  resizePane: (type, height) => {
    set((state) => ({
      panes: state.panes.map((p) =>
        p.type === type
          ? { ...p, height: Math.max(p.minHeight, height) }
          : p,
      ),
    }))
  },

  visiblePanes: () => get().panes.filter((p) => p.visible && !p.floating),

  resetLayout: () => {
    set({ panes: [...DEFAULT_PANES] })
  },

  floatPane: (type, geometry) => {
    set((state) => ({
      panes: state.panes.map((p) =>
        p.type === type
          ? { ...p, visible: true, floating: true, floatGeometry: geometry }
          : p,
      ),
    }))
  },

  dockPane: (type) => {
    set((state) => ({
      panes: state.panes.map((p) =>
        p.type === type
          ? { ...p, floating: false, floatGeometry: undefined }
          : p,
      ),
    }))
  },

  setFloatGeometry: (type, geometry) => {
    set((state) => ({
      panes: state.panes.map((p) =>
        p.type === type && p.floatGeometry
          ? { ...p, floatGeometry: { ...p.floatGeometry, ...geometry } }
          : p,
      ),
    }))
  },

  getScrollY: (paneType) => get().interactiveState[paneType].scrollY,

  setScrollY: (paneType, y, maxScrollY) => {
    let clamped = Math.max(0, y)
    if (maxScrollY !== undefined && maxScrollY >= 0) {
      clamped = Math.min(clamped, maxScrollY)
    }
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          scrollY: clamped,
        },
      },
    }))
  },

  getSortColumn: (paneType) => get().interactiveState[paneType].sortCriteria[0]?.column ?? null,

  getSortDirection: (paneType) => get().interactiveState[paneType].sortCriteria[0]?.direction ?? 'asc',

  getSortCriteria: (paneType) => get().interactiveState[paneType].sortCriteria,

  setSortColumn: (paneType, column) => {
    set((state) => {
      const primary = state.interactiveState[paneType].sortCriteria[0]
      const newDirection: 'asc' | 'desc' =
        primary && primary.column === column && primary.direction === 'asc' ? 'desc' : 'asc'
      return {
        interactiveState: {
          ...state.interactiveState,
          [paneType]: {
            ...state.interactiveState[paneType],
            sortCriteria: [{ column, direction: newDirection }],
            foundCrewIds: [],
          },
        },
      }
    })
  },

  setSortCriteria: (paneType, criteria) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          sortCriteria: criteria,
          foundCrewIds: [],
        },
      },
    }))
  },

  removeSortCriterion: (paneType, column) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          sortCriteria: state.interactiveState[paneType].sortCriteria.filter((c) => c.column !== column),
        },
      },
    }))
  },

  getDropTargetRow: (paneType) => get().interactiveState[paneType].dropTargetRow,

  setDropTargetRow: (paneType, row) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          dropTargetRow: row,
        },
      },
    }))
  },

  getFrozenRowIds: (paneType) => get().interactiveState[paneType].frozenRowIds,

  getFrozenRowCount: (paneType) => get().interactiveState[paneType].frozenRowIds.length,

  freezeSelectedRows: (paneType) => {
    const { selectedRowIds, frozenRowIds } = get().interactiveState[paneType]
    if (selectedRowIds.length === 0) return
    // Add selected rows to frozen (avoid duplicates), then clear selection
    const existing = new Set(frozenRowIds)
    const newFrozen = [...frozenRowIds, ...selectedRowIds.filter((id) => !existing.has(id))]
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          frozenRowIds: newFrozen,
          selectedRowIds: [],
          lastSelectedRowId: null,
        },
      },
    }))
  },

  unfreezeRow: (paneType, rowId) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          frozenRowIds: state.interactiveState[paneType].frozenRowIds.filter((id) => id !== rowId),
        },
      },
    }))
  },

  unfreezeAll: (paneType) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          frozenRowIds: [],
        },
      },
    }))
  },

  getFoundCrewIds: (paneType) => get().interactiveState[paneType].foundCrewIds,

  addFoundCrewIds: (paneType, crewIds) => {
    set((state) => {
      const existing = state.interactiveState[paneType].foundCrewIds
      const seen = new Set(existing)
      const merged = [...existing, ...crewIds.filter((id) => !seen.has(id))]
      return {
        interactiveState: {
          ...state.interactiveState,
          [paneType]: { ...state.interactiveState[paneType], foundCrewIds: merged },
        },
      }
    })
  },

  setFoundCrewIds: (paneType, crewIds) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          foundCrewIds: [...new Set(crewIds)],
        },
      },
    }))
  },

  clearFoundCrewIds: (paneType) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: { ...state.interactiveState[paneType], foundCrewIds: [] },
      },
    }))
  },

  getSelectedRowIds: (paneType) => get().interactiveState[paneType].selectedRowIds,

  selectRow: (paneType, rowId) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          selectedRowIds: [rowId],
          lastSelectedRowId: rowId,
        },
      },
    }))
  },

  toggleRowSelection: (paneType, rowId) => {
    set((state) => {
      const current = state.interactiveState[paneType].selectedRowIds
      const has = current.includes(rowId)
      return {
        interactiveState: {
          ...state.interactiveState,
          [paneType]: {
            ...state.interactiveState[paneType],
            selectedRowIds: has ? current.filter((id) => id !== rowId) : [...current, rowId],
            lastSelectedRowId: rowId,
          },
        },
      }
    })
  },

  selectRowRange: (paneType, toRowId, allRowIds) => {
    const lastId = get().interactiveState[paneType].lastSelectedRowId
    if (!lastId) {
      // No anchor — just select this one
      get().selectRow(paneType, toRowId)
      return
    }
    const fromIdx = allRowIds.indexOf(lastId)
    const toIdx = allRowIds.indexOf(toRowId)
    if (fromIdx === -1 || toIdx === -1) return
    const start = Math.min(fromIdx, toIdx)
    const end = Math.max(fromIdx, toIdx)
    const rangeIds = allRowIds.slice(start, end + 1)
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          selectedRowIds: rangeIds,
        },
      },
    }))
  },

  clearRowSelection: (paneType) => {
    set((state) => ({
      interactiveState: {
        ...state.interactiveState,
        [paneType]: {
          ...state.interactiveState[paneType],
          selectedRowIds: [],
          lastSelectedRowId: null,
        },
      },
    }))
  },

  setDateRange: (start, end) => {
    set({ dateRange: { start, end } })
  },
}))

const registry = createContextStoreRegistry<ReturnType<typeof makePaneStore>>(() => makePaneStore())

export const getPaneStore = (id: GanttContextId) => registry.get(id)
export const destroyPaneStore = (id: GanttContextId) => registry.destroy(id)

/** Compat shim — existing Live imports keep working unchanged. */
export const usePaneStore = getPaneStore('live')

/** For shared/scenario consumers: resolves the right instance from <GanttContextProvider>. */
export const usePaneStoreForContext = () => getPaneStore(useGanttContextId())
