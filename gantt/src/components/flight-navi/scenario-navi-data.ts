// gantt/src/components/flight-navi/scenario-navi-data.ts
//
// Client-side Flight Navi rows for the Scenario Gantt — NO backend API needed.
//
// Live needs the `/api/flight/navi-counts` endpoint because the flight→pairing link
// (pairing_segment.flt_id) and flight→crew link (roster_flight.flt_id) are NOT shipped to the
// Live client. A SCENARIO's gantt-data payload, however, already carries both links explicitly
// (`pairingSegments[].fltId/pairingId`, `assignments[].crewId/pairingId`), so per-flight pairing
// and crew counts are derivable entirely in the browser — the same join scenario-find-helpers.ts
// already uses for flight→pairing / flight→crew navigation. One pure pass; no store, no fetch.

import { differenceInMinutes, parseISO } from 'date-fns'
import type { Flight } from '@/types'
import type { ScenarioGanttData } from '@/types/scenario-gantt'
import type { NaviRow } from './flight-navi-filters'

/** Build flat per-flight Navi rows (flight + pairingCount + crewCount) from loaded scenario data. */
export function buildScenarioNaviRows(data: ScenarioGanttData): NaviRow[] {
  // flight id → distinct pairing ids on that flight (via pairing segments)
  const pairingIdsByFlight = new Map<number, Set<number>>()
  for (const seg of data.pairingSegments) {
    if (seg.fltId == null) continue
    let set = pairingIdsByFlight.get(seg.fltId)
    if (!set) { set = new Set<number>(); pairingIdsByFlight.set(seg.fltId, set) }
    set.add(seg.pairingId)
  }
  // pairing id → distinct crew ids assigned to that pairing (via assignments)
  const crewIdsByPairing = new Map<number, Set<string>>()
  for (const a of data.assignments) {
    let set = crewIdsByPairing.get(a.pairingId)
    if (!set) { set = new Set<string>(); crewIdsByPairing.set(a.pairingId, set) }
    set.add(a.crewId)
  }

  return (data.flights ?? []).map((f) => {
    const pairingIds = pairingIdsByFlight.get(f.id) ?? new Set<number>()
    const crewIds = new Set<string>()
    for (const pid of pairingIds) {
      for (const cid of crewIdsByPairing.get(pid) ?? []) crewIds.add(cid)
    }
    // Mirror buildScenarioFlightItems' toFlight, but populate fltDt (the navi date filter reads it)
    // and a real blkMin from the scheduled times (the min-block filter reads it).
    const flight: Flight = {
      id: f.id,
      airline: '',
      fltDt: f.schDepDtUtc.slice(0, 10),
      fltNum: f.fltNum,
      depArp: f.depArp,
      arvArp: f.arvArp,
      schDepDtUtc: f.schDepDtUtc,
      schArvDtUtc: f.schArvDtUtc,
      actDepDtUtc: f.schDepDtUtc,
      actArvDtUtc: f.schArvDtUtc,
      actDepArp: f.depArp,
      actArvArp: f.arvArp,
      flightFlag: 'S',
      blkMin: Math.max(0, differenceInMinutes(parseISO(f.schArvDtUtc), parseISO(f.schDepDtUtc))),
      fleet: f.fleet,
      register: f.register,
      fltType: 'PAX',
      fltSts: null,
      isDeleted: 0,
      isCancelled: false,
    }
    return { flight, pairingCount: pairingIds.size, crewCount: crewIds.size }
  })
}
