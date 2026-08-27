// gantt/src/stores/scenario-pairing-selection-store.ts
//
// Per-scenario pairing selection registry.
// Owns the selectedIds Set<number> (SEGMENT ids) for the pairing pane in each
// scenario tab, replacing the component-local useState that lived in
// ScenarioPairingPane. The renderer lights a pairing's dashed box when any of
// its segment ids is in this set.
// Uses the same createContextStoreRegistry pattern as scenario-flight-selection-store.
import { create } from 'zustand'
import { createContextStoreRegistry } from './create-context-store'
import type { GanttContextId } from '@/types/gantt-context'

interface ScenarioPairingSelectionState {
  selectedIds: Set<number>
  /** Replace selection with a single id, or clear if already the only selection. */
  set: (id: number) => void
  /** Toggle id in/out of the selection set. */
  toggle: (id: number) => void
  /** Clear all selections. */
  clear: () => void
  /** Replace selection with a batch of ids. */
  selectMany: (ids: number[]) => void
}

function createStore() {
  return create<ScenarioPairingSelectionState>((set) => ({
    selectedIds: new Set<number>(),
    set: (id) =>
      set((s) => {
        if (s.selectedIds.has(id) && s.selectedIds.size === 1) return { selectedIds: new Set() }
        return { selectedIds: new Set([id]) }
      }),
    toggle: (id) =>
      set((s) => {
        const next = new Set(s.selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selectedIds: next }
      }),
    clear: () => set({ selectedIds: new Set() }),
    selectMany: (ids) => set({ selectedIds: new Set(ids) }),
  }))
}

const registry = createContextStoreRegistry<ReturnType<typeof createStore>>((_id: GanttContextId) => createStore())

/** Get (or lazily create) the pairing selection store for a given scenarioId. */
export const getScenarioPairingSelectionStore = (scenarioId: number) => registry.get(scenarioId)
