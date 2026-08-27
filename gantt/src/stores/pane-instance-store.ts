// gantt/src/stores/pane-instance-store.ts

import { useLayoutStore } from './layout-store'
import type { PaneViewport, PaneSelection } from '@/types/layout'

/**
 * Convenience accessor for per-pane state.
 * Delegates to layout-store internally.
 */
export const usePaneInstanceStore = {
  // Viewport operations
  getViewport: (paneId: string): PaneViewport | undefined => {
    return useLayoutStore.getState().getViewport(paneId)
  },

  setScrollX: (paneId: string, value: number) => {
    useLayoutStore.getState().setViewport(paneId, { scrollX: Math.max(0, Math.min(100, value)) })
  },

  setScrollY: (paneId: string, value: number) => {
    useLayoutStore.getState().setViewport(paneId, { scrollY: Math.max(0, value) })
  },

  setZoom: (paneId: string, value: number) => {
    useLayoutStore.getState().setViewport(paneId, { zoom: Math.max(20, Math.min(100, value)) })
  },

  // Selection operations
  getSelection: (paneId: string): PaneSelection | undefined => {
    const pane = useLayoutStore.getState().getPane(paneId)
    return pane?.selection
  },

  setSelectedRows: (paneId: string, ids: string[]) => {
    useLayoutStore.getState().setSelection(paneId, { selectedRowIds: ids })
  },

  toggleSelectedRow: (paneId: string, id: string) => {
    const selection = usePaneInstanceStore.getSelection(paneId)
    if (!selection) return

    const has = selection.selectedRowIds.includes(id)
    const newIds = has
      ? selection.selectedRowIds.filter(r => r !== id)
      : [...selection.selectedRowIds, id]

    useLayoutStore.getState().setSelection(paneId, { selectedRowIds: newIds })
  },

  freezeRows: (paneId: string, ids: string[]) => {
    const selection = usePaneInstanceStore.getSelection(paneId)
    if (!selection) return

    const existing = new Set(selection.frozenRowIds)
    const newFrozen = [...selection.frozenRowIds, ...ids.filter(id => !existing.has(id))]
    useLayoutStore.getState().setSelection(paneId, { frozenRowIds: newFrozen })
  },

  unfreezeRow: (paneId: string, id: string) => {
    const selection = usePaneInstanceStore.getSelection(paneId)
    if (!selection) return

    const newFrozen = selection.frozenRowIds.filter(r => r !== id)
    useLayoutStore.getState().setSelection(paneId, { frozenRowIds: newFrozen })
  },

  setSortColumn: (paneId: string, column: string | null) => {
    const selection = usePaneInstanceStore.getSelection(paneId)
    if (!selection) return

    const newDirection = selection.sortColumn === column && selection.sortDirection === 'asc'
      ? 'desc'
      : 'asc'

    useLayoutStore.getState().setSelection(paneId, {
      sortColumn: column,
      sortDirection: newDirection
    })
  },

  // Task selection (using arrays instead of Sets)
  getSelectedTasks: (paneId: string): string[] => {
    const pane = useLayoutStore.getState().getPane(paneId)
    return pane?.selectedTaskIds ?? []
  },

  isTaskSelected: (paneId: string, taskId: string): boolean => {
    const pane = useLayoutStore.getState().getPane(paneId)
    return pane?.selectedTaskIds.includes(taskId) ?? false
  },

  selectTask: (paneId: string, taskId: string) => {
    useLayoutStore.getState().selectTask(paneId, taskId)
  },

  toggleTaskSelection: (paneId: string, taskId: string) => {
    useLayoutStore.getState().toggleTaskSelection(paneId, taskId)
  },

  clearTaskSelection: (paneId: string) => {
    useLayoutStore.getState().clearTaskSelection(paneId)
  }
}