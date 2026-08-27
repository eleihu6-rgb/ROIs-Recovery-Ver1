// gantt/src/utils/scenario-pairing-adapter.ts
//
// Shared adapter: scenario gantt data (ScenarioGanttPairing / ...Segment /
// ...Assignment / ...Crew) → the Live-shaped types the pairing UI consumes
// (PairingItem for the pane canvas, PairingInfoBundle for the Pairing-Info dialog).
//
// Extracted from scenario-pairing-pane.tsx so the pane AND the dialog share ONE
// segment field-rename mapping (brief1*→brief*, debrief1*→debrief*, pickup1*→
// pickup*, dropoff1*→dropoff*; actuals absent → mirror sched). Keeping it in one
// place avoids the two diverging.
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'
import { buildEffectiveAssignments } from '@/components/scenario-gantt/build-scenario-roster-items'
import { computeScenarioPairingCompositions } from './scenario-composition-fill'
import type {
  ScenarioGanttPairing, ScenarioGanttPairingSegment, ScenarioGanttAssignment,
  ScenarioGanttCompositionSlot, ScenarioGanttFlight, ScenarioGanttCrew, AssignmentPatch,
} from '@/types/scenario-gantt'
import type { PairingItem, PairingSegment, PairingFlight, Pairing } from '@/types/pairing'
import type { PairingInfoBundle } from '@/services/pairing-detail-cache'
import type { PairingCompositionRow, PairingDetailResponse, PairingCrewDetail, PairingDutyRef } from '@/services/pairing-api'

type CoverageState = 'full' | 'partial' | 'open'

const pairingCreditMin = (segments: ReadonlyArray<PairingSegment>): number | null => {
  const byDuty = new Map<number, number>()
  for (const s of segments) {
    if (s.dutyActCreditedMinutes == null) continue
    const minutes = Math.round(Number(s.dutyActCreditedMinutes))
    if (Number.isFinite(minutes) && minutes > 0) byDuty.set(s.dutySeq, minutes)
  }
  const total = [...byDuty.values()].reduce((sum, minutes) => sum + minutes, 0)
  return total > 0 ? total : null
}

export function computeScenarioCoverage(p: ScenarioGanttPairing): CoverageState {
  const comp = p.compositions ?? []
  if (comp.length === 0) return 'full'
  let fill = 0
  for (const s of comp) fill += s.fill ?? 0
  if (fill === 0) return 'open'
  const isFull = comp.every((c) => c.fill === c.plan)
  return isFull ? 'full' : 'partial'
}

/**
 * Map ONE scenario pairing segment → the Live `PairingSegment` shape.
 *
 * Field renames: brief1*→brief*, debrief1*→debrief*, pickup1*→pickup*,
 * dropoff1*→dropoff*. Empty strings normalize to null. The `id` is supplied by
 * the caller (a stable per-build counter) because scenario segments have no PK.
 */
export function scenarioSegmentToPairingSegment(
  seg: ScenarioGanttPairingSegment,
  id: number,
): PairingSegment {
  return {
    id,
    pairingId: seg.pairingId,
    dutySeq: seg.dutySeq,
    segSeq: seg.segSeq,
    fltId: seg.fltId,
    fltNum: seg.fltNum,
    airline: seg.airline,
    depArp: seg.depArp,
    arvArp: seg.arvArp,
    schStrDtUtc: seg.schStrDtUtc,
    schEndDtUtc: seg.schEndDtUtc,
    actStrDtUtc: seg.actStrDtUtc || seg.schStrDtUtc,
    actEndDtUtc: seg.actEndDtUtc || seg.schEndDtUtc,
    segAssignment: seg.segAssignment,
    dutyStrArp: seg.dutyStrArp,
    dutyEndArp: seg.dutyEndArp,
    dutySchStrDtUtc: seg.dutySchStrDtUtc,
    dutySchEndDtUtc: seg.dutySchEndDtUtc,
    dutySchRestMin: seg.dutySchRestMin,
    dutyActRestMin: seg.dutyActRestMin,
    dutyActCreditedMinutes: seg.dutyActCreditedMinutes != null ? String(seg.dutyActCreditedMinutes) : null,
    dutyRefTz: seg.dutyRefTz ?? null,
    pickupStartUtc: seg.pickup1StartUtc || null,
    pickupEndUtc: seg.pickup1EndUtc || null,
    briefAirport: null,
    briefStartUtc: seg.brief1StartUtc || null,
    briefEndUtc: seg.brief1EndUtc || null,
    debriefAirport: null,
    debriefStartUtc: seg.debrief1StartUtc || null,
    debriefEndUtc: seg.debrief1EndUtc || null,
    dropoffStartUtc: seg.dropoff1StartUtc || null,
    dropoffEndUtc: seg.dropoff1EndUtc || null,
    doublePickupStartUtc: null, doublePickupEndUtc: null,
    doubleBriefAirport: null, doubleBriefStartUtc: null, doubleBriefEndUtc: null,
    doubleDebriefAirport: null, doubleDebriefStartUtc: null, doubleDebriefEndUtc: null,
    doubleDropoffStartUtc: null, doubleDropoffEndUtc: null,
  }
}

/**
 * Build the pane's PairingItem[] from scenario data. Moved verbatim out of
 * scenario-pairing-pane.tsx; segment mapping now goes through the shared
 * scenarioSegmentToPairingSegment.
 *
 * When `crew` AND `pendingChanges` are supplied, composition fills are derived locally
 * from the effective assignments (base + pending) so the pane reflects roster edits in
 * real time. Without them (e.g. day-statistics dialog), the server snapshot `c.fill` is
 * used unchanged.
 */
export function buildPairingItems(
  pairings: ScenarioGanttPairing[],
  pairingSegments: ScenarioGanttPairingSegment[],
  assignments: ScenarioGanttAssignment[],
  flights: ScenarioGanttFlight[],
  crew?: ScenarioGanttCrew[],
  pendingChanges?: AssignmentPatch[],
): PairingItem[] {
  const useLocalFill = crew !== undefined && pendingChanges !== undefined
  const effectiveAssignments = useLocalFill ? buildEffectiveAssignments(assignments, pendingChanges) : assignments
  const fillByPairing = useLocalFill ? computeScenarioPairingCompositions(effectiveAssignments, crew, pairings) : null

  const segsByPairing = new Map<number, ScenarioGanttPairingSegment[]>()
  for (const seg of pairingSegments) {
    const list = segsByPairing.get(seg.pairingId) ?? []
    list.push(seg)
    segsByPairing.set(seg.pairingId, list)
  }

  const flightById = new Map<number, ScenarioGanttFlight>()
  for (const f of flights) {
    flightById.set(f.id, f)
  }

  let idCounter = 1

  return pairings
    .slice()
    .sort((a, b) => a.schStrDtUtc.localeCompare(b.schStrDtUtc))
    .map((p) => {
      const segs = (segsByPairing.get(p.pairingId) ?? [])
        .sort((a, b) => a.dutySeq !== b.dutySeq ? a.dutySeq - b.dutySeq : a.segSeq - b.segSeq)

      const derivedFleet = segs.length > 0 && segs[0].fltId != null
        ? flightById.get(segs[0].fltId)?.fleet ?? ''
        : ''

      const pairing: Pairing = {
        id: p.pairingId,
        sourcePairingId: p.sourcePairingId,
        pairingSource: p.pairingSource,
        pairingLabel: p.pairingLabel,
        filiale: null,
        division: p.division,
        base: p.base,
        fleet: p.fleet || derivedFleet,
        assignmentGroup: p.assignmentGroup,
        assignment: p.assignment,
        schStrDtUtc: p.schStrDtUtc,
        schEndDtUtc: p.schEndDtUtc,
        actStrDtUtc: p.actStrDtUtc || p.schStrDtUtc,
        actEndDtUtc: p.actEndDtUtc || p.schEndDtUtc,
        durationDays: 0,
        tafb: Math.max(1, Math.ceil((new Date(p.schEndDtUtc).getTime() - new Date(p.schStrDtUtc).getTime()) / 86_400_000)),
        dutyCount: new Set(segs.map((s) => s.dutySeq)).size,
        segCount: segs.length,
        blockMinutes: 0,
        ver: 1,
        isDeleted: 0,
        source: null,
        tags: null,
        comments: null,
        pairingDt: null,
        composition: p.compositions.map((c: ScenarioGanttCompositionSlot, i: number) => ({
          rank: c.rank,
          plan: c.plan,
          fill: fillByPairing?.get(p.pairingId)?.[i]?.fill ?? c.fill,
        })),
        isFull: fillByPairing
          ? (fillByPairing.get(p.pairingId) ?? []).every((s) => s.fill >= s.plan)
          : computeScenarioCoverage(p) !== 'open',
      }

      const segments: PairingSegment[] = segs.map((seg) => scenarioSegmentToPairingSegment(seg, idCounter++))

      const pairingFlights: PairingFlight[] = segs
        .filter((s) => s.fltId !== null)
        .map((s) => ({
          fltId: s.fltId!,
          fltNum: s.fltNum,
          depArp: s.depArp,
          arvArp: s.arvArp,
          schDepDtUtc: s.schStrDtUtc,
          schArvDtUtc: s.schEndDtUtc,
        }))

      return { pairing, segments, flights: pairingFlights, sessionTags: [0] }
    })
}

/**
 * Build a PairingInfoBundle (the exact shape getPairingInfoWithLocalFirst returns)
 * for ONE pairing from a scenario's in-memory data — NO Live `/api/pairing` call.
 *
 * Why: scenario pairing IDs come from the optimization snapshot and many do not
 * exist in the Live pairing table, so the Live path 404s → "Pairing not found".
 * Returns null when the pairing isn't in the scenario store (should not happen,
 * since the id originated there).
 *
 * Degradation vs Live: scenario carries no actuals (act* mirror sched*, so ATD/
 * ATA/FT render "—"), no crew MBH (mbhMin → null), no crew position/source
 * (→ null). Pairing-level acting rank comes from assignment.rosterActingRank.
 * An unassigned pairing yields an empty crew[] (a valid state, NOT an error).
 */
export function buildScenarioPairingInfo(
  scenarioId: number,
  pairingId: number,
): PairingInfoBundle | null {
  const data = getScenarioGanttStore(scenarioId).getState().data
  if (!data) return null

  const p = data.pairings.find((x) => x.pairingId === pairingId)
  if (!p) return null

  let idCounter = 1
  const segments: PairingSegment[] = data.pairingSegments
    .filter((s) => s.pairingId === pairingId)
    .sort((a, b) => a.dutySeq !== b.dutySeq ? a.dutySeq - b.dutySeq : a.segSeq - b.segSeq)
    .map((seg) => scenarioSegmentToPairingSegment(seg, idCounter++))

  const compositions: PairingCompositionRow[] = (p.compositions ?? []).map((c) => ({
    actingRank: c.rank,
    plan: c.plan,
    fill: c.fill,
    open: c.plan - c.fill,
  }))

  const derivedFleet = (() => {
    const first = segments.find((s) => s.fltId != null)
    if (!first || first.fltId == null) return ''
    return data.flights.find((f) => f.id === first.fltId)?.fleet ?? ''
  })()

  const pairing: Pairing = {
    id: p.pairingId,
    sourcePairingId: p.sourcePairingId,
    pairingSource: p.pairingSource,
    pairingLabel: p.pairingLabel,
    filiale: null,
    division: p.division,
    base: p.base,
    fleet: derivedFleet,
    assignmentGroup: p.assignmentGroup,
    assignment: p.assignment,
    schStrDtUtc: p.schStrDtUtc,
    schEndDtUtc: p.schEndDtUtc,
    actStrDtUtc: p.schStrDtUtc,
    actEndDtUtc: p.schEndDtUtc,
    durationDays: 0,
    tafb: Math.max(1, Math.ceil((new Date(p.schEndDtUtc).getTime() - new Date(p.schStrDtUtc).getTime()) / 86_400_000)),
    dutyCount: new Set(segments.map((s) => s.dutySeq)).size,
    segCount: segments.length,
    blockMinutes: 0,
    ver: 1,
    isDeleted: 0,
    source: null,
    tags: null,
    comments: null,
    pairingDt: null,
    composition: compositions.map((c) => ({ rank: c.actingRank, plan: c.plan, fill: c.fill })),
    isFull: computeScenarioCoverage(p) !== 'open',
  }

  const rosterDutyRefs: PairingDutyRef[] = (data.rosterDutyRefs ?? [])
    .filter((ref) => ref.pairingId === pairingId)
    .map((ref) => ({
      crewId: ref.crewId,
      pairingId: ref.pairingId,
      dutySeq: ref.dutySeq,
      dutyRefTz: ref.dutyRefTz,
    }))
  const detail: PairingDetailResponse = { pairing, segments, compositions, rosterDutyRefs }
  const creditMin = pairingCreditMin(segments)

  // Crew assigned to this pairing — join assignments → scenario crew roster.
  // Dedup by crewId (a crew should appear once even if multi-segment).
  const crewById = new Map(data.crew.map((c) => [c.crewId, c]))
  const seen = new Set<string>()
  const crew: PairingCrewDetail[] = data.assignments
    .filter((a) => a.pairingId === pairingId)
    .flatMap((a) => {
      if (seen.has(a.crewId)) return []
      seen.add(a.crewId)
      const c = crewById.get(a.crewId)
      return [{
        crewId: a.crewId,
        name: c?.crewName ?? a.crewId,
        gender: null,
        base: c?.base ?? null,
        position: null,
        actingRank: a.rosterActingRank ?? a.rank ?? null,
        source: a.source ?? null,
        mbhMin: null,
        creditMin,
      }]
    })

  return { detail, crew, rosterDutyRefs }
}
