import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import type { RosterItem } from '@/types/roster'

export const selectedRosterTaskIdsForDialog = (
  items: readonly RosterItem[],
  taskId: number,
): number[] => {
  const item = items.find((candidate) => candidate.id === taskId)
  if (!item) return []
  if (item.pairingId == null) return [item.id]
  return items
    .filter((candidate) => candidate.crewId === item.crewId && candidate.pairingId === item.pairingId)
    .map((candidate) => candidate.id)
}

export const selectRosterTaskFromDialog = (
  items: readonly RosterItem[],
  taskId: number,
  scenarioId?: number | null,
): number[] => {
  const ids = selectedRosterTaskIdsForDialog(items, taskId)
  if (ids.length === 0) return []

  if (scenarioId != null) {
    getScenarioRosterSelectionStore(scenarioId).getState().setTasks(new Set(ids), (taskIds) => {
      const crewIds = new Set<string>()
      for (const item of items) {
        if (taskIds.has(item.id)) crewIds.add(item.crewId)
      }
      return crewIds
    })
  } else if (ids.length === 1) {
    useGanttViewStore.getState().selectTask(ids[0])
  } else {
    useGanttViewStore.getState().selectTasks(ids)
  }

  return ids
}
