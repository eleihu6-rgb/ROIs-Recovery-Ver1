// gantt/src/stores/layout-store.ts

import { create } from 'zustand'
import type { PaneInstance, PaneType, GridPosition, LayoutGrid, DragState } from '@/types/layout'
import { PANE_NAMES, MAX_PANES, MAX_PANES_PER_TYPE, MAX_ROWS, MAX_COLS_PER_ROW } from '@/types/layout'

interface LayoutStore {
  // State
  grid: LayoutGrid
  panes: Map<string, PaneInstance>
  dragState: DragState | null
  /** Per-row height in px; `-1` = flex fill (equal share). Parallel to `grid`. */
  rowHeights: number[]

  // Pane counters (for generating unique IDs)
  paneCounters: Record<PaneType, number>

  // Actions
  addPane: (type: PaneType, row?: number, col?: number) => string | null
  closePane: (paneId: string) => void
  movePane: (paneId: string, toRow: number, toCol: number, dropHint: 'left' | 'right' | 'center' | 'top' | 'bottom') => void
  getRowPaneCount: (row: number) => number
  getPane: (paneId: string) => PaneInstance | undefined
  getTotalPaneCount: () => number
  getRowCount: () => number
  setRowHeight: (row: number, height: number) => void
  setRowHeights: (heights: number[]) => void

  // Drag actions
  startDrag: (paneId: string, event: DragEvent) => void
  endDrag: () => void

  // Consolidation
  consolidateRow: (row: number) => void
  consolidateGrid: () => void

  // Reset
  resetLayout: () => void

  // Viewport per pane
  setViewport: (paneId: string, viewport: Partial<PaneInstance['viewport']>) => void
  getViewport: (paneId: string) => PaneInstance['viewport'] | undefined

  // Selection per pane
  setSelection: (paneId: string, selection: Partial<PaneInstance['selection']>) => void

  // Task selection per pane
  selectTask: (paneId: string, taskId: string) => void
  toggleTaskSelection: (paneId: string, taskId: string) => void
  clearTaskSelection: (paneId: string) => void
}

// Default layout: Roster (row 0), Pairing (row 1)
const DEFAULT_GRID: LayoutGrid = [
  ['roster-1', null],
  ['pairing-1', null]
]

const createDefaultPane = (id: string, type: PaneType, num: number): PaneInstance => ({
  id,
  type,
  title: `${PANE_NAMES[type]} #${num}`,
  viewport: { scrollX: 0, scrollY: 0, zoom: 40 },
  selection: { selectedRowIds: [], frozenRowIds: [], sortColumn: null, sortDirection: 'asc' },
  selectedTaskIds: []
})

const DEFAULT_PANES: Map<string, PaneInstance> = new Map([
  ['roster-1', createDefaultPane('roster-1', 'roster', 1)],
  ['pairing-1', createDefaultPane('pairing-1', 'pairing', 1)]
])

const DEFAULT_COUNTERS: Record<PaneType, number> = {
  roster: 2,
  pairing: 2,
  flight: 1
}

/** Find pane position in grid */
const findPanePosition = (grid: LayoutGrid, paneId: string): { row: number; col: number } | null => {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < MAX_COLS_PER_ROW; c++) {
      if (grid[r]?.[c] === paneId) {
        return { row: r, col: c }
      }
    }
  }
  return null
}

/** Count non-empty rows in grid */
const countNonEmptyRows = (grid: LayoutGrid): number => {
  return grid.filter(row => row.some(Boolean)).length
}

/** Create empty row */
const createEmptyRow = (): [string | null, string | null] => [null, null]

/** Flex-fill heights aligned to grid length (reset after layout mutations). */
const flexRowHeights = (grid: LayoutGrid): number[] => grid.map(() => -1)

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  grid: DEFAULT_GRID,
  panes: DEFAULT_PANES,
  dragState: null,
  rowHeights: flexRowHeights(DEFAULT_GRID),
  paneCounters: DEFAULT_COUNTERS,

  addPane: (type, row, col) => {
    const { panes, grid, paneCounters } = get()
    if (panes.size >= MAX_PANES) return null

    // Per-type cap (e.g. at most 2 roster panes and 2 pairing panes)
    const typeCount = [...panes.values()].filter(p => p.type === type).length
    if (typeCount >= MAX_PANES_PER_TYPE[type]) return null

    // Find target position if not specified
    let targetRow = row
    let targetCol = col

    if (targetRow === undefined || targetCol === undefined) {
      // Always stack new sub-panes vertically below the existing panes — never
      // fill the right column. A new pane appears under the current panes, not beside them.
      let lastNonEmptyRow = -1
      for (let r = 0; r < grid.length; r++) {
        if (grid[r]?.some(Boolean)) lastNonEmptyRow = r
      }
      const nextRow = lastNonEmptyRow + 1
      if (nextRow < MAX_ROWS) {
        targetRow = nextRow
        targetCol = 0
      }
    }

    if (targetRow === undefined || targetCol === undefined) return null

    // Generate new pane ID
    const num = paneCounters[type]
    const paneId = `${type}-${num}`
    const newPane = createDefaultPane(paneId, type, num)

    set(state => {
      // Ensure grid has enough rows
      const newGrid = [...state.grid]
      while (newGrid.length <= targetRow) {
        newGrid.push(createEmptyRow())
      }

      // Clone the target row to update
      const newRow = [...newGrid[targetRow]] as [string | null, string | null]
      newRow[targetCol] = paneId
      newGrid[targetRow] = newRow

      const newPanes = new Map(state.panes)
      newPanes.set(paneId, newPane)

      const newCounters = { ...state.paneCounters }
      newCounters[type] = num + 1

      return { grid: newGrid, panes: newPanes, paneCounters: newCounters, rowHeights: flexRowHeights(newGrid) }
    })

    return paneId
  },

  closePane: (paneId) => {
    const { grid, panes } = get()

    // Find and remove from grid
    const pos = findPanePosition(grid, paneId)
    if (!pos) return

    set(state => {
      const newGrid = state.grid.map((row, ri) => {
        if (ri !== pos.row) return row
        const newRow = [...row] as [string | null, string | null]
        newRow[pos.col] = null
        return newRow
      })

      const newPanes = new Map(state.panes)
      newPanes.delete(paneId)

      return { grid: newGrid, panes: newPanes, rowHeights: flexRowHeights(newGrid) }
    })

    // Consolidate row (move remaining pane to col 0)
    get().consolidateRow(pos.row)
    // Consolidate grid (remove empty rows)
    get().consolidateGrid()
  },

  movePane: (paneId, toRow, toCol, dropHint) => {
    const { grid, panes } = get()

    // Find source position
    const fromPos = findPanePosition(grid, paneId)
    if (!fromPos) return

    const sourceRowPanes = grid[fromPos.row]?.filter(Boolean).length ?? 0
    const targetRowExists = toRow < grid.length
    const targetRowPanes = targetRowExists ? grid[toRow]?.filter(Boolean).length ?? 0 : 0

    // Handle 'top' drop hint - insert above current row
    if (dropHint === 'top') {
      // Can't insert above row 0
      if (toRow === 0 && grid.length === 1) {
        // Just swap if possible
        if (grid[0]?.[0] === null) {
          set(state => {
            const newGrid = [...state.grid]
            const newRow = [...newGrid[0]] as [string | null, string | null]
            newRow[0] = paneId
            newGrid[0] = newRow

            // Remove from source
            if (fromPos.row < newGrid.length) {
              const srcRow = [...newGrid[fromPos.row]] as [string | null, string | null]
              srcRow[fromPos.col] = null
              newGrid[fromPos.row] = srcRow
            }

            return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
          })
          get().consolidateRow(fromPos.row)
          get().consolidateGrid()
          return
        }
      }
      return
    }

    // Handle 'bottom' drop hint - insert below current row (create new row)
    if (dropHint === 'bottom') {
      // Check if we can add a new row
      const currentRows = countNonEmptyRows(grid)
      if (currentRows >= MAX_ROWS && panes.size >= MAX_PANES) return

      set(state => {
        const newGrid = [...state.grid]

        // Remove pane from source
        if (fromPos.row < newGrid.length) {
          const srcRow = [...newGrid[fromPos.row]] as [string | null, string | null]
          srcRow[fromPos.col] = null
          newGrid[fromPos.row] = srcRow
        }

        // Insert new row below target row
        const insertRow = toRow + 1
        const newRow: [string | null, string | null] = [paneId, null]
        newGrid.splice(insertRow, 0, newRow)

        // Ensure max rows
        while (newGrid.length > MAX_ROWS) {
          const lastRow = newGrid[newGrid.length - 1]
          if (lastRow.every(c => c === null)) {
            newGrid.pop()
          } else {
            break
          }
        }

        return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
      })
      // Important: consolidate source row after removing pane
      get().consolidateRow(fromPos.row)
      get().consolidateGrid()
      return
    }

    // Handle left/right/center drop hints
    const targetPane = targetRowExists ? grid[toRow]?.[toCol] : null

    // Scenario 1: Empty target cell - simple move
    if (!targetPane || !targetRowExists) {
      set(state => {
        const newGrid = [...state.grid]

        // Ensure target row exists
        while (newGrid.length <= toRow) {
          newGrid.push(createEmptyRow())
        }

        // Place pane in target
        const targetRow = [...newGrid[toRow]] as [string | null, string | null]
        targetRow[toCol] = paneId
        newGrid[toRow] = targetRow

        // Remove from source
        if (fromPos.row < newGrid.length) {
          const srcRow = [...newGrid[fromPos.row]] as [string | null, string | null]
          srcRow[fromPos.col] = null
          newGrid[fromPos.row] = srcRow
        }

        return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
      })
      get().consolidateRow(fromPos.row)
      get().consolidateGrid()
      return
    }

    // Scenario 2: Same pane - no action
    if (targetPane === paneId) return

    // Scenario 3: Split (drop on single-pane row with left/right hint)
    if (targetRowPanes === 1 && (dropHint === 'left' || dropHint === 'right')) {
      const newCol = dropHint === 'left' ? 0 : 1
      const otherCol = dropHint === 'left' ? 1 : 0

      set(state => {
        const newGrid = [...state.grid]

        // Target row: place dragged pane and move existing
        const targetRow = [...newGrid[toRow]] as [string | null, string | null]
        targetRow[newCol] = paneId
        targetRow[otherCol] = targetPane
        newGrid[toRow] = targetRow

        // Remove from source
        if (fromPos.row < newGrid.length && fromPos.row !== toRow) {
          const srcRow = [...newGrid[fromPos.row]] as [string | null, string | null]
          srcRow[fromPos.col] = null
          newGrid[fromPos.row] = srcRow
        }

        return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
      })
      get().consolidateRow(fromPos.row)
      get().consolidateGrid()
      return
    }

    // Scenario 4: Swap (same row, both have 2 panes)
    if (fromPos.row === toRow && sourceRowPanes === 2 && targetRowPanes === 2) {
      set(state => {
        const newGrid = [...state.grid]
        const targetRow = [...newGrid[toRow]] as [string | null, string | null]
        targetRow[fromPos.col] = targetPane
        targetRow[toCol] = paneId
        newGrid[toRow] = targetRow
        return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
      })
      return
    }

    // Scenario 5: Cross-row swap
    set(state => {
      const newGrid = [...state.grid]

      // Target row
      const targetRow = [...newGrid[toRow]] as [string | null, string | null]
      targetRow[toCol] = paneId
      newGrid[toRow] = targetRow

      // Source row
      const srcRow = [...newGrid[fromPos.row]] as [string | null, string | null]
      srcRow[fromPos.col] = targetPane
      newGrid[fromPos.row] = srcRow

      return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
    })
    get().consolidateGrid()
  },

  getRowPaneCount: (row) => {
    const grid = get().grid
    if (row >= grid.length) return 0
    return grid[row]?.filter(Boolean).length ?? 0
  },

  getPane: (paneId) => {
    return get().panes.get(paneId)
  },

  getTotalPaneCount: () => {
    return get().panes.size
  },

  getRowCount: () => {
    return countNonEmptyRows(get().grid)
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

  startDrag: (paneId, event) => {
    const { grid } = get()

    const fromPosition = findPanePosition(grid, paneId)
    if (!fromPosition) return

    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', paneId)
      event.dataTransfer.effectAllowed = 'move'
    }

    set({ dragState: { paneId, fromPosition, dropPosition: 'center' } })
  },

  endDrag: () => {
    set({ dragState: null })
  },

  consolidateRow: (row) => {
    const { grid } = get()
    if (row >= grid.length) return

    const rowPanes = grid[row]?.filter(Boolean).length ?? 0

    // If single pane at col 1, move to col 0
    if (rowPanes === 1 && grid[row]?.[1] !== null) {
      set(state => {
        const newGrid = [...state.grid]
        const newRow = [...newGrid[row]] as [string | null, string | null]
        newRow[0] = newRow[1]
        newRow[1] = null
        newGrid[row] = newRow
        return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
      })
    }
  },

  consolidateGrid: () => {
    set(state => {
      // Remove empty rows and shift non-empty rows up
      const newGrid = state.grid
        .filter(row => row.some(Boolean))
        .slice(0, MAX_ROWS)

      // Ensure at least 1 row
      if (newGrid.length === 0) {
        newGrid.push(createEmptyRow())
      }

      return { grid: newGrid, rowHeights: flexRowHeights(newGrid) }
    })
  },

  resetLayout: () => {
    set({
      grid: DEFAULT_GRID,
      panes: DEFAULT_PANES,
      paneCounters: DEFAULT_COUNTERS,
      dragState: null,
      rowHeights: flexRowHeights(DEFAULT_GRID),
    })
  },

  setViewport: (paneId, viewport) => {
    set(state => {
      const pane = state.panes.get(paneId)
      if (!pane) return state

      // F54-P03: no-op guard — skip the immutable rebuild when nothing changes,
      // otherwise every wheel tick (incl. clamped/zero deltas) creates a new pane
      // object and re-renders every subscriber of this pane.
      const keys = Object.keys(viewport) as Array<keyof PaneInstance['viewport']>
      if (keys.every((k) => viewport[k] === pane.viewport[k])) return state

      const newPanes = new Map(state.panes)
      newPanes.set(paneId, {
        ...pane,
        viewport: { ...pane.viewport, ...viewport }
      })
      return { panes: newPanes }
    })
  },

  getViewport: (paneId) => {
    return get().panes.get(paneId)?.viewport
  },

  setSelection: (paneId, selection) => {
    set(state => {
      const pane = state.panes.get(paneId)
      if (!pane) return state

      const newPanes = new Map(state.panes)
      newPanes.set(paneId, {
        ...pane,
        selection: { ...pane.selection, ...selection }
      })
      return { panes: newPanes }
    })
  },

  selectTask: (paneId, taskId) => {
    set(state => {
      const pane = state.panes.get(paneId)
      if (!pane) return state

      const newPanes = new Map(state.panes)
      newPanes.set(paneId, {
        ...pane,
        selectedTaskIds: [taskId]
      })
      return { panes: newPanes }
    })
  },

  toggleTaskSelection: (paneId, taskId) => {
    set(state => {
      const pane = state.panes.get(paneId)
      if (!pane) return state

      const isSelected = pane.selectedTaskIds.includes(taskId)
      const newSelected = isSelected
        ? pane.selectedTaskIds.filter(id => id !== taskId)
        : [...pane.selectedTaskIds, taskId]

      const newPanes = new Map(state.panes)
      newPanes.set(paneId, {
        ...pane,
        selectedTaskIds: newSelected
      })
      return { panes: newPanes }
    })
  },

  clearTaskSelection: (paneId) => {
    set(state => {
      const pane = state.panes.get(paneId)
      if (!pane) return state

      const newPanes = new Map(state.panes)
      newPanes.set(paneId, {
        ...pane,
        selectedTaskIds: []
      })
      return { panes: newPanes }
    })
  }
}))
