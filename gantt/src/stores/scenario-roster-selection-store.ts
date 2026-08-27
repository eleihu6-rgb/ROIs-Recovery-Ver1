// gantt/src/stores/scenario-roster-selection-store.ts
//
// Per-scenario roster selection registry.
// Owns the selectedTaskIds (Set<number>) + selectedCrewIds (Set<string>) for the
// roster pane in each scenario tab, replacing the component-local useState that
// lived in ScenarioRosterPane. The two sets stay coupled exactly as the old pane:
//  - selecting tasks inverts to the crews owning those tasks (setTasks)
//  - clicking a left-panel crew row replaces/extends the crew set (selectCrewRow)
// Uses the same createContextStoreRegistry pattern as the flight/pairing stores.
import { create } from 'zustand'
import { createContextStoreRegistry } from './create-context-store'
import type { GanttContextId } from '@/types/gantt-context'

interface ScenarioRosterSelectionState {
  selectedTaskIds: Set<number>
  selectedCrewIds: Set<string>
  /**
   * Quick-filter text search for the roster pane. Lives here (not component-local)
   * so the source's useRows/usePanelRows/useViolationMap can apply the same crew
   * filter the canvas renders — the roster items derive from the filtered crew,
   * so search must feed the source, not be applied after the build.
   */
  search: string
  /** Set the quick-filter search text. */
  setSearch: (search: string) => void
  /**
   * Replace the selected task set and re-derive the owning crews from a
   * taskId → crewIds inversion supplied by the caller (the built itemsByCrew map).
   * Empty ids ⇒ clears both sets (mirrors handleSelectTasks).
   */
  setTasks: (ids: Set<number>, crewIdsForTasks: (ids: Set<number>) => Set<string>) => void
  /**
   * Ctrl+click a single task puck: add it to the selection, or remove it if
   * already selected. Re-derives the owning crews (and clears both sets when the
   * last task is toggled off) exactly like setTasks.
   */
  toggleTask: (id: number, crewIdsForTasks: (ids: Set<number>) => Set<string>) => void
  /**
   * Left-panel crew row click. mode:
   *  - 'single': replace with just this crew
   *  - 'toggle': ctrl-toggle this crew in/out
   *  - 'range': shift-extend from the last selected crew over orderedIds
   */
  selectCrewRow: (crewId: string, mode: 'single' | 'toggle' | 'range', orderedIds: string[]) => void
  /** Clear both task and crew-row selections. */
  clear: () => void
}

function createStore() {
  return create<ScenarioRosterSelectionState>((set) => ({
    selectedTaskIds: new Set<number>(),
    selectedCrewIds: new Set<string>(),
    search: '',
    setSearch: (search) => set({ search }),
    setTasks: (ids, crewIdsForTasks) =>
      set(() => {
        if (ids.size === 0) return { selectedTaskIds: new Set<number>(), selectedCrewIds: new Set<string>() }
        return { selectedTaskIds: ids, selectedCrewIds: crewIdsForTasks(ids) }
      }),
    toggleTask: (id, crewIdsForTasks) =>
      set((s) => {
        const next = new Set(s.selectedTaskIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        if (next.size === 0) return { selectedTaskIds: next, selectedCrewIds: new Set<string>() }
        return { selectedTaskIds: next, selectedCrewIds: crewIdsForTasks(next) }
      }),
    selectCrewRow: (crewId, mode, orderedIds) =>
      set((s) => {
        if (mode === 'toggle') {
          const next = new Set(s.selectedCrewIds)
          if (next.has(crewId)) next.delete(crewId)
          else next.add(crewId)
          return { selectedCrewIds: next }
        }
        if (mode === 'range' && s.selectedCrewIds.size > 0) {
          const clickIdx = orderedIds.indexOf(crewId)
          const lastSelected = [...s.selectedCrewIds].at(-1)
          const lastIdx = lastSelected ? orderedIds.indexOf(lastSelected) : -1
          if (lastIdx >= 0 && clickIdx >= 0) {
            const [lo, hi] = [Math.min(lastIdx, clickIdx), Math.max(lastIdx, clickIdx)]
            return { selectedCrewIds: new Set(orderedIds.slice(lo, hi + 1)) }
          }
        }
        return { selectedCrewIds: new Set([crewId]) }
      }),
    clear: () => set({ selectedTaskIds: new Set<number>(), selectedCrewIds: new Set<string>() }),
  }))
}

const registry = createContextStoreRegistry<ReturnType<typeof createStore>>((_id: GanttContextId) => createStore())

/** Get (or lazily create) the roster selection store for a given scenarioId. */
export const getScenarioRosterSelectionStore = (scenarioId: number) => registry.get(scenarioId)
