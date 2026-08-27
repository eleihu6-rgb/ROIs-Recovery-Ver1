/**
 * Selection handler for managing selected items across panes.
 * Supports single-select and multi-select (Ctrl+Click / Shift+Click).
 *
 * Each pane type has its own selection set. Only one pane can have
 * an active selection at a time (selecting in one pane clears others).
 */

import type { PaneType } from '@/types/pane'

export interface SelectionState {
  /** Which pane currently owns the selection */
  activePaneType: PaneType | null
  /** Selected item IDs in the active pane */
  selectedIds: Set<number>
}

export interface SelectionCallbacks {
  onSelectionChange: (paneType: PaneType | null, selectedIds: Set<number>) => void
}

export const createSelectionHandler = (callbacks: SelectionCallbacks) => {
  let state: SelectionState = {
    activePaneType: null,
    selectedIds: new Set(),
  }

  const notify = (): void => {
    callbacks.onSelectionChange(state.activePaneType, new Set(state.selectedIds))
  }

  /** Select a single item, clearing previous selection */
  const select = (paneType: PaneType, itemId: number): void => {
    state = {
      activePaneType: paneType,
      selectedIds: new Set([itemId]),
    }
    notify()
  }

  /** Toggle selection (for Ctrl+Click) */
  const toggleSelect = (paneType: PaneType, itemId: number): void => {
    // If switching panes, start fresh
    if (state.activePaneType !== paneType) {
      state = {
        activePaneType: paneType,
        selectedIds: new Set([itemId]),
      }
    } else {
      const newIds = new Set(state.selectedIds)
      if (newIds.has(itemId)) {
        newIds.delete(itemId)
      } else {
        newIds.add(itemId)
      }
      state = {
        activePaneType: paneType,
        selectedIds: newIds,
      }
    }
    notify()
  }

  /** Clear all selection */
  const clearSelection = (): void => {
    state = {
      activePaneType: null,
      selectedIds: new Set(),
    }
    notify()
  }

  /** Get current selection state */
  const getState = (): SelectionState => ({ ...state, selectedIds: new Set(state.selectedIds) })

  return { select, toggleSelect, clearSelection, getState }
}

export type SelectionHandler = ReturnType<typeof createSelectionHandler>
