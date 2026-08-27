// gantt/src/utils/scroll-pairing-row.ts
//
// "Jump to this day's pairing" dispatcher: apply a pre-computed scrollY to the
// Pairing Pane's vertical scrollbar. Pure setter — no other state is touched
// (no horizontal scroll, no zoom, no date range, no row selection).
//
// The right-click handler in SharedPairingPane computes the target scrollY
// (clamped to the loaded item count + canvas height) and stashes it on
// ui-store.contextMenuJumpToDayScrollY. The context-menu onClick just dispatches
// this helper with the right context label.

import { useLayoutStore } from '@/stores/layout-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'

/**
 * Apply a pre-computed pairing-pane scrollY to the correct store.
 *
 * @param context - 'live' writes to useLayoutStore; 'scenario' writes to the
 *   per-scenario layout store keyed by scenarioId.
 * @param scrollY - the clamped vertical scroll offset (already ≥ 0).
 * @param scenarioId - required when context === 'scenario'.
 *
 * No-ops when the pairing pane is not present in the current layout.
 */
export const applyPairingPaneScrollY = (
  context: 'live' | 'scenario',
  scrollY: number,
  scenarioId?: number,
): void => {
  if (context === 'live') {
    const layoutStore = useLayoutStore.getState()
    for (const [id, pane] of layoutStore.panes) {
      if (pane.type === 'pairing') {
        layoutStore.setViewport(id, { scrollY })
        return
      }
    }
    return
  }
  if (scenarioId == null) return
  const layoutStore = getScenarioLayoutStore(scenarioId).getState()
  const paneId = layoutStore.findPaneIdByType('pairing')
  if (paneId) layoutStore.setScrollY(paneId, scrollY)
}