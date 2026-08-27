import { useGanttViewStore } from '@/stores/gantt-view-store'
import { getPaneStore } from '@/stores/pane-store'
import { useShellStore } from '@/stores/shell-store'
import { getScenarioRosterSelectionStore } from '@/stores/scenario-roster-selection-store'
import { getScenarioFlightSelectionStore } from '@/stores/scenario-flight-selection-store'
import { getScenarioPairingSelectionStore } from '@/stores/scenario-pairing-selection-store'

/**
 * Clear all gantt pane selection state across Live and every open Scenario tab.
 * Called by the ESC keyboard handler.
 *
 * Live: clears useGanttViewStore.selectedTaskIds (shared by all Live panes) and
 *       usePaneStore('live') roster row selection (crew-header highlight).
 * Scenario: for each open 'scenario-gantt:{id}' tab, clears the per-scenario
 *           roster/flight/pairing selection stores.
 */
export function clearAllGanttSelections(): void {
  // Live task puck selection (shared by all three Live panes)
  useGanttViewStore.getState().clearSelection()
  // Live row selection for all four pane types
  getPaneStore('live').getState().clearRowSelection('roster-main')
  getPaneStore('live').getState().clearRowSelection('roster-sub')
  getPaneStore('live').getState().clearRowSelection('pairing')
  getPaneStore('live').getState().clearRowSelection('flight')

  // Scenario: iterate all open scenario tabs
  const openTabs = useShellStore.getState().openTabs
  for (const tab of openTabs) {
    if (!tab.startsWith('scenario-gantt:')) continue
    const id = parseInt(tab.split(':')[1], 10)
    // Task-puck selections
    getScenarioRosterSelectionStore(id).getState().clear()
    getScenarioFlightSelectionStore(id).getState().clear()
    getScenarioPairingSelectionStore(id).getState().clear()
    // Pairing pane row (header) selection
    getPaneStore(id).getState().clearRowSelection('scenario-pairing')
  }
}
