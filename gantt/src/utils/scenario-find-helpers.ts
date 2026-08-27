// gantt/src/utils/scenario-find-helpers.ts
//
// Cross-pane "find / locate" mechanism for the Scenario Gantt — the local-first analogue of
// Live's pane-store foundCrewIds navigation. Each helper resolves target ids ENTIRELY from the
// loaded scenario data (NO API): scenario `data.assignments` / `data.pairingSegments` already
// carry every crew↔pairing↔flight link. The helper then locates the target pane in this
// scenario's layout, floats the matched rows to the top (setFoundCrewIds) and scrolls the pane
// to the top (setScrollY 0). Canvas content reads rows through refs, so helpers also bump the
// scenario render signal to repaint immediately when row order changes without a scroll change.
//
// foundCrewIds is used generically (mirroring Live's pane-store): crewIds for the roster pane,
// pairingId-strings for the pairing pane, flightId-strings for the flight pane. If the target
// pane is not in the layout, OR nothing resolves, the helper is a no-op and returns false
// (so the menu can hide the action).

import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { getScenarioLayoutStore } from '@/stores/scenario-layout-store'
import { getScenarioFlightSelectionStore } from '@/stores/scenario-flight-selection-store'
import { timeToX } from '@/components/gantt/gantt-utils'
import type { ScenarioPaneType } from '@/stores/scenario-layout-store'

/** Predicate the menu uses to gate visibility BEFORE click: does this scenario's layout
 *  currently contain a pane of the given type? */
export function scenarioHasPaneType(scenarioId: number, type: ScenarioPaneType): boolean {
  return getScenarioLayoutStore(scenarioId).getState().findPaneIdByType(type) !== null
}

/** Shared tail: set found ids on the target pane + scroll it to the top. Returns false (no-op)
 *  when the target pane is absent or there are no resolved ids. */
function applyFound(scenarioId: number, type: ScenarioPaneType, ids: string[]): boolean {
  if (ids.length === 0) return false
  const layout = getScenarioLayoutStore(scenarioId).getState()
  const paneId = layout.findPaneIdByType(type)
  if (!paneId) return false
  layout.setFoundCrewIds(paneId, ids)
  layout.setScrollY(paneId, 0)
  getScenarioGanttStore(scenarioId).getState().markDirty()
  return true
}

/** roster pane → locate the pairing in the Pairing pane (float pairing to top). */
export function scenarioLocatePairing(scenarioId: number, pairingId: number): boolean {
  return applyFound(scenarioId, 'pairing', [String(pairingId)])
}

/** pairing pane → find the crew assigned to that pairing in the Roster pane (float crew to top). */
export function scenarioFindCrewByPairing(scenarioId: number, pairingId: number): boolean {
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return false
  const crewIds = [...new Set(
    data.assignments.filter((a) => a.pairingId === pairingId).map((a) => a.crewId),
  )]
  return applyFound(scenarioId, 'roster', crewIds)
}

/** flight pane → find crew on that flight (flight→segments→pairingIds→assignments→crewIds)
 *  in the Roster pane (float crew to top). */
export function scenarioFindCrewByFlight(scenarioId: number, flightId: number): boolean {
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return false
  const pairingIds = new Set(
    data.pairingSegments.filter((s) => s.fltId === flightId).map((s) => s.pairingId),
  )
  if (pairingIds.size === 0) return false
  const crewIds = [...new Set(
    data.assignments.filter((a) => pairingIds.has(a.pairingId)).map((a) => a.crewId),
  )]
  return applyFound(scenarioId, 'roster', crewIds)
}

/** flight pane → locate that flight (float its registration row to top). */
export function scenarioLocateFlight(scenarioId: number, flightId: number): boolean {
  const ok = applyFound(scenarioId, 'flight', [String(flightId)])
  if (!ok) return false
  getScenarioFlightSelectionStore(scenarioId).getState().selectMany([flightId])

  const data = getScenarioGanttStore(scenarioId).getState().data
  const flight = data?.flights?.find((f) => f.id === flightId)
  if (flight?.schDepDtUtc) {
    const startMs = Date.parse(flight.schDepDtUtc)
    if (!Number.isNaN(startMs)) {
      const store = getScenarioGanttStore(scenarioId).getState()
      const rangeStart = data ? new Date(data.strDtLoc) : new Date()
      const absX = timeToX(new Date(startMs), rangeStart, store.pxPerHour)
      const canvasW = typeof window !== 'undefined' ? Math.max(400, window.innerWidth - 320) : 1200
      if (absX < store.scrollX || absX > store.scrollX + canvasW) {
        const anchorMs = startMs - 2 * 24 * 60 * 60 * 1000
        store.setScrollX(Math.max(0, timeToX(new Date(anchorMs), rangeStart, store.pxPerHour)))
      }
    }
  }
  return true
}

/** flight pane → find the pairing(s) containing that flight in the Pairing pane
 *  (float pairing(s) to top). */
export function scenarioFindPairingByFlight(scenarioId: number, flightId: number): boolean {
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return false
  const pairingIds = [...new Set(
    data.pairingSegments.filter((s) => s.fltId === flightId).map((s) => s.pairingId),
  )]
  return applyFound(scenarioId, 'pairing', pairingIds.map(String))
}
