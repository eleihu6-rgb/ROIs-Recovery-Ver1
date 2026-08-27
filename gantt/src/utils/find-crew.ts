import { pairingApi } from '@/services/pairing-api'
import { flightApi } from '@/services/flight-api'
import { useCrewStore } from '@/stores/crew-store'
import { useRosterStore } from '@/stores/roster-store'
import { usePaneStore } from '@/stores/pane-store'
import { useLayoutStore } from '@/stores/layout-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { notify } from '@/utils/notify'
import type { PaneType } from '@/types'

type RosterPaneKey = 'main' | 'sub'

/**
 * Fetch the crew assigned to a pairing/flight and bring them to the top of the
 * target roster pane (Main↔Main / Sub↔Sub): added to the shared crew selection
 * if missing, recorded as transient "found" rows (accumulating), selected, and
 * the pane scrolled to top. Other crew keep their existing sort order.
 */
export const findCrewToTop = async (
  kind: 'pairing' | 'flight',
  id: number,
  targetPaneKey: RosterPaneKey,
): Promise<void> => {
  // Local-first: each loaded roster row carries crewId + fltId/pairingId, and Apply
  // background-loads the full roster — so derive the crew from memory and only hit the
  // server when the local set is empty (e.g. roster not loaded yet).
  const rosterItems = useRosterStore.getState()[targetPaneKey].rosterItems
  let crewIds: string[] = [
    ...new Set(
      rosterItems
        .filter((r) => (kind === 'flight' ? r.fltId === id : r.pairingId === id) && r.crewId)
        .map((r) => r.crewId),
    ),
  ]
  if (crewIds.length === 0) {
    try {
      if (kind === 'pairing') {
        crewIds = (await pairingApi.getCrew(id)).crewIds
      } else {
        const res = await flightApi.getCrewList(id)
        crewIds = [...new Set(res.items.map((i) => i.crewId))]
      }
    } catch {
      notify.error('Failed to find crew')
      return
    }
  }

  if (crewIds.length === 0) {
    notify.info('No crew assigned')
    return
  }

  const paneType: PaneType = targetPaneKey === 'main' ? 'roster-main' : 'roster-sub'
  const crewStore = useCrewStore.getState()

  // Add any crew not currently in the shared selection, then load their roster bars.
  // `hadView` distinguishes the first crew load (no notice) from injecting crew into
  // an existing, possibly filtered, roster view.
  const hadView = crewStore.selectedCrewIds.length > 0
  const existing = new Set(crewStore.selectedCrewIds)
  const missing = crewIds.filter((cid) => !existing.has(cid))
  if (missing.length > 0) {
    crewStore.selectCrews([...crewStore.selectedCrewIds, ...missing])
    const dateRange = usePaneStore.getState().dateRange
    // Hydrate the crew objects (Base/SEN/Fleet) AND load their roster bars. Without the
    // first call the roster panel can't resolve these crew in crew-store.items, leaving
    // Base/SEN/Fleet blank.
    await Promise.all([
      crewStore.fetchCrewsByIds(missing),
      useRosterStore.getState().appendRoster(targetPaneKey, missing, dateRange),
    ])
    // The missing crew were hidden by the current filter — tell the user we injected them.
    if (hadView) {
      const noun = missing.length === 1 ? 'Crew' : `${missing.length} crew`
      notify.info(`${noun} not in the current filter — added to the Gantt anyway`)
    }
  }

  // Record found rows (accumulate), select them, scroll target pane to top.
  const paneStore = usePaneStore.getState()
  paneStore.addFoundCrewIds(paneType, crewIds)
  setRowSelection(paneType, crewIds)
  scrollPaneToTop(targetPaneKey)
  useGanttViewStore.getState().markDirty()
}

/** Replace the pane row selection with the given crew IDs. */
const setRowSelection = (paneType: PaneType, crewIds: string[]): void => {
  const store = usePaneStore.getState()
  store.clearRowSelection(paneType)
  for (const cid of crewIds) store.toggleRowSelection(paneType, cid)
}

/** Scroll the roster pane (main/sub) viewport to the top. main = first roster pane in grid order. */
const scrollPaneToTop = (paneKey: RosterPaneKey): void => {
  const layout = useLayoutStore.getState()
  const { grid, panes } = layout
  const rosterPaneIds: string[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const pid = grid[r][c]
      if (pid && panes.get(pid)?.type === 'roster' && !rosterPaneIds.includes(pid)) {
        rosterPaneIds.push(pid)
      }
    }
  }
  const targetId = paneKey === 'main' ? rosterPaneIds[0] : (rosterPaneIds[1] ?? rosterPaneIds[0])
  if (targetId) layout.setViewport(targetId, { scrollY: 0 })
}
