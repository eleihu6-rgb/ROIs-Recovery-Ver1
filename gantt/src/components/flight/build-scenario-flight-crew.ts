import type { FlightCrewItem, FlightCrewResponse, FlightComposition } from '@/types'
import type { ScenarioGanttData } from '@/types/scenario-gantt'

const isDeadheadSegAssignment = (segAssignment: string | null | undefined): boolean => {
  const code = String(segAssignment ?? '').trim().toUpperCase()
  return code === 'DHD' || code === 'DH'
}

const mapScenarioSource = (source: string): FlightCrewItem['source'] => {
  if (source === 'IMP') return 'IMPORT'
  if (source === 'CR') return 'SYSTEM'
  return 'MANUAL'
}

/**
 * Build Flight Detail Crew Assignment from scenario gantt store data.
 * Operating crew only: segments on this fltId that are not DHD/DH.
 */
export const buildScenarioFlightCrew = (
  data: ScenarioGanttData,
  flightId: number,
): FlightCrewResponse => {
  const operatingSegs = data.pairingSegments.filter(
    (s) => s.fltId === flightId && !isDeadheadSegAssignment(s.segAssignment),
  )
  const pairingIds = new Set(operatingSegs.map((s) => s.pairingId))

  const crewById = new Map(data.crew.map((c) => [c.crewId, c]))
  const seen = new Set<string>()
  const items: FlightCrewItem[] = []

  for (const a of data.assignments) {
    if (!pairingIds.has(a.pairingId)) continue
    if (seen.has(a.crewId)) continue
    seen.add(a.crewId)
    const crew = crewById.get(a.crewId)
    const crewRank = a.crewRank ?? a.rank ?? crew?.crewRank ?? crew?.rank ?? ''
    // Empty flightActingRank must fall through — MA Save historically wrote ''.
    const actingRank = a.flightActingRank || a.rosterActingRank || a.rank || crewRank
    items.push({
      seqOrder: items.length + 1,
      crewId: a.crewId,
      crewName: crew?.crewName ?? '',
      base: crew?.base ?? null,
      seniorityNum: crew?.seniorityNum ?? null,
      crewRank,
      actingRank: actingRank || '',
      label: '',
      source: mapScenarioSource(a.source),
      mbh: '0:00',
      mfdp: null,
    })
  }

  const composition: FlightComposition = {}
  for (const pairing of data.pairings) {
    if (!pairingIds.has(pairing.pairingId)) continue
    for (const slot of pairing.compositions ?? []) {
      if (!slot.rank) continue
      if (!composition[slot.rank]) composition[slot.rank] = { plan: 0, actual: 0 }
      composition[slot.rank].plan += slot.plan ?? 0
    }
  }
  for (const item of items) {
    const rank = item.actingRank
    if (!rank) continue
    if (!composition[rank]) composition[rank] = { plan: 0, actual: 0 }
    composition[rank].actual++
  }

  const values = Object.values(composition)
  const isFull = values.length > 0 && values.every((c) => c.actual >= c.plan)
  const isPartial = values.some((c) => c.actual < c.plan && c.plan > 0)
  const status: FlightCrewResponse['status'] = isFull ? 'full' : isPartial ? 'partial' : 'cancelled'

  return { items, composition, status }
}

const recomputeStatus = (
  composition: FlightComposition,
): FlightCrewResponse['status'] => {
  const values = Object.values(composition)
  const isFull = values.length > 0 && values.every((c) => c.actual >= c.plan)
  const isPartial = values.some((c) => c.actual < c.plan && c.plan > 0)
  return isFull ? 'full' : isPartial ? 'partial' : 'cancelled'
}

/**
 * Merge scenario-store assignees with Live GET /api/flight/:id/crew.
 * Scenario rows win on crewId collision (optimizer / in-scope ranks).
 * Live-only mates (e.g. out-of-scope base on the same physical flt_id) are appended.
 * Live composition is always kept when present — even if Live has zero assignees —
 * so cabin ranks (FA/IFD) from Live plan still appear on Pilot-only scenarios.
 */
export const mergeScenarioAndLiveFlightCrew = (
  scenario: FlightCrewResponse,
  live: FlightCrewResponse | null | undefined,
): FlightCrewResponse => {
  if (!live) return scenario

  const byId = new Map<string, FlightCrewItem>()
  for (const item of live.items ?? []) byId.set(item.crewId, item)
  for (const item of scenario.items) byId.set(item.crewId, item)

  const items = [...byId.values()]
  const liveComposition = live.composition ?? {}
  const hasLiveComposition = Object.keys(liveComposition).length > 0
  const composition: FlightComposition = hasLiveComposition
    ? { ...liveComposition }
    : { ...scenario.composition }

  for (const [rank, counts] of Object.entries(scenario.composition)) {
    if (!composition[rank]) composition[rank] = { plan: 0, actual: 0 }
    composition[rank].plan = Math.max(composition[rank].plan, counts.plan)
  }
  for (const rank of Object.keys(composition)) {
    composition[rank] = { ...composition[rank], actual: 0 }
  }
  for (const item of items) {
    const rank = item.actingRank
    if (!rank) continue
    if (!composition[rank]) composition[rank] = { plan: 0, actual: 0 }
    composition[rank].actual++
  }

  return { items, composition, status: recomputeStatus(composition) }
}
