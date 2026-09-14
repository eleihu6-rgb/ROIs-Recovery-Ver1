import { useShellStore } from '@/stores/shell-store'
import { useFilterStore } from '@/stores/filter-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { applyGanttFilters } from '@/utils/apply-filters'
import { bringPairingIdToTop, bringFlightIdToTop } from '@/utils/bring-matches-to-top'
import type { RecoveryCase } from '@/config/recovery-cases'

/** Resolve after the next two animation frames (lets a just-switched view mount). */
const nextFrames = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

/**
 * Wait until the Live gantt has mounted its pane grid (roster/pairing panes
 * register in layout-store), so applyGanttFilters has visible panes to load.
 */
const waitForLivePanes = async (timeoutMs = 2500): Promise<void> => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const types = new Set([...useLayoutStore.getState().panes.values()].map((p) => p.type))
    if (types.has('roster') || types.has('pairing')) return
    await nextFrames()
  }
}

/**
 * Dashboard quick-link: open the Live gantt already scoped to a recovery case.
 *
 * Drives the EXISTING global Filters (no new filter is introduced):
 *   - pairing:id  → the case pairing (hard filter)
 *   - crew:id     → the concerned crew (floated to top)
 *   - flight:fltNum → the case flights
 *   - crew/pairing base narrows the load to the case base
 * then centers + zooms the timeline onto the case window so the controller sees
 * the disruption immediately and can decide.
 */
export const openRecoveryCaseInLive = async (rc: RecoveryCase): Promise<void> => {
  // 1. Switch to the Live module (opens/activates the tab; view is kept alive).
  useShellStore.getState().setModule('live')
  await nextFrames()
  await waitForLivePanes()

  if (rc.anchorFlightId != null && ![...useLayoutStore.getState().panes.values()].some(p => p.type === 'flight')) {
    if (!useLayoutStore.getState().addPane('flight')) throw new Error('Open a Flight pane to view this recovery case')
    await nextFrames()
  }
  const filterStore = useFilterStore.getState()

  // 2. Extend the loaded date range only if the case window falls outside it
  //    (the default range already covers the current + next month).
  const winStartMs = Date.parse(rc.windowStartIso)
  const winEndMs = Date.parse(rc.windowEndIso)
  const dr = filterStore.dateRange
  if (winStartMs < dr.start.getTime() || winEndMs > dr.end.getTime()) {
    const newStart = winStartMs < dr.start.getTime() ? new Date(winStartMs) : dr.start
    const newEnd = winEndMs > dr.end.getTime() ? new Date(winEndMs) : dr.end
    filterStore.setDateRange(newStart, newEnd)
  }

  // 3. Populate the existing filters for this case.
  const crewIds = rc.candidateCrewIds ?? rc.sourceCrew.map((c) => c.crewId)
  filterStore.setCrewFilter({ bases: [rc.base], crewIds })
  filterStore.setPairingFilter({ bases: [rc.base], pairingIds: rc.pairingId == null ? [] : [String(rc.pairingId)] })
  filterStore.setFlightFilter({ fltNums: rc.flights, fleets: rc.anchorFlightId != null ? [rc.fleet] : [] })
  if (rc.anchorFlightId != null) {
    filterStore.setCrewFilter({ divisions: ['P'] })
  }

  // 4. Apply — reloads the panes whose query changed and floats crew to top.
  await applyGanttFilters({ forcePairingReload: true })

  // 5. Float the case pairing into the pairing pane's "found" tier + scroll to top.
  if (rc.pairingId != null) await bringPairingIdToTop(rc.pairingId)
  else if (rc.anchorFlightId != null) await bringFlightIdToTop(rc.anchorFlightId)

  // 6. Zoom + scroll the timeline onto the case window to highlight it.
  const rangeStart = useFilterStore.getState().dateRange.start
  useGanttViewStore.getState().zoomToRp(winStartMs, winEndMs, rangeStart)
  useGanttViewStore.getState().markDirty()
}
