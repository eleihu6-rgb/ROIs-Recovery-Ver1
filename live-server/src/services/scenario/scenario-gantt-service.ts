import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { engineServerClient } from '../engine-server-client.js'
import { flight as flightTable } from '../../models/flight/flight.js'
import { pairing as pairingTable } from '../../models/pairing/pairing.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { rosterFlight } from '../../models/roster/roster-flight.js'
import { buildRoInputGz, type ScenarioRow } from './scenario-export-service.js'
import { parseSections } from './scenario-result-service.js'
import { type GanttCapabilities, capabilitiesFromDict } from './scenario-capabilities.js'
import { filterPairingsByCrewDivision } from './pairing-division-filter.js'
import { buildScenarioPairingScopeWhere, type ScenarioPairingScope } from './pairing-scope-filter.js'
import { normalizeCrewDivision } from './filter-params-normalize.js'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'
import { attachCrewHistories, type CrewHistoryRow } from './scenario-crew-history.js'

const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const loadScenarioRosterDutyRefs = async (
  fastify: FastifyInstance,
  scenarioId: number,
  pairingIds: number[],
): Promise<ScenarioGanttDutyRef[]> => {
  if (pairingIds.length === 0) return []
  const ids = [...new Set(pairingIds.filter((id) => Number.isFinite(id)))]
  if (ids.length === 0) return []
  const result = await fastify.db.execute<{
    crew_id: string
    pairing_id: string
    duty_seq: string
    duty_ref_tz: string | null
  }>(sql`
    SELECT crew_id, pairing_id, duty_seq, duty_ref_tz
      FROM ${sql.raw(scenarioSchema())}.roster_flight
     WHERE scenario_id = ${scenarioId}
       AND pairing_id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::bigint[]`)})
       AND duty_seq IS NOT NULL
       AND is_deleted = 0
     GROUP BY crew_id, pairing_id, duty_seq, duty_ref_tz
     ORDER BY crew_id, pairing_id, duty_seq
  `)
  return result.rows.map((row) => ({
    crewId: row.crew_id,
    pairingId: Number(row.pairing_id),
    dutySeq: Number(row.duty_seq),
    dutyRefTz: numberOrNull(row.duty_ref_tz),
  }))
}

export interface ScenarioGanttCrew {
  crewId: string
  base: string
  division: string
  /** CrewRank / ActiveRank: current rank for the roster row. */
  crewRank?: string
  /** Deprecated compatibility alias for crewRank. */
  rank: string
  /** Date-effective rank history (from live crew_rank), for per-task-date resolution. */
  ranks?: CrewHistoryRow[]
  /** Date-effective base history (from live crew_base), for per-task-date resolution. */
  bases?: CrewHistoryRow[]
  seniorityNum: string | null
  crewName: string | null
}

export interface ScenarioGanttCompositionSlot {
  rank: string
  plan: number
  fill: number
}

export interface ScenarioGanttPairing {
  pairingId: number
  sourcePairingId?: number
  pairingSource?: 'scenario' | 'live'
  pairingLabel: string | null
  base: string
  fleet: string
  schStrDtUtc: string
  schEndDtUtc: string
  actStrDtUtc?: string
  actEndDtUtc?: string
  assignmentGroup: string
  assignment: string
  division: string
  compositions: ScenarioGanttCompositionSlot[]
}

export interface ScenarioGanttAssignment {
  crewId: string
  pairingId: number
  source: 'IMP' | 'PA' | 'MA' | 'CR'
  /** CrewRank / ActiveRank from roster_flight.active_rank. */
  crewRank?: string | null
  /** Pairing-level ActingRank from roster_flight.roster_acting_rank. */
  rosterActingRank?: string | null
  /** Flight-level Acting from roster_flight.flight_acting_rank. */
  flightActingRank?: string | null
  /** Deprecated compatibility alias for rosterActingRank. */
  rank?: string | null
  sourcePairingId?: number
  pairingSource?: 'scenario' | 'live'
}

export interface ScenarioGanttPairingSegment {
  pairingId:               number
  dutySeq:                 number
  segSeq:                  number
  fltId:                   number | null
  fltDt:                   string | null
  fltNum:                  string
  airline:                 string
  depArp:                  string
  arvArp:                  string
  segAssignment:           string
  schStrDtUtc:             string
  schEndDtUtc:             string
  actStrDtUtc?:            string
  actEndDtUtc?:            string
  dutyStrArp:              string
  dutyEndArp:              string
  dutySchStrDtUtc:         string
  dutySchEndDtUtc:         string
  brief1StartUtc:          string
  brief1EndUtc:            string
  debrief1StartUtc:        string
  debrief1EndUtc:          string
  pickup1StartUtc:         string
  pickup1EndUtc:           string
  dropoff1StartUtc:        string
  dropoff1EndUtc:          string
  dutySchRestMin:          number | null
  dutyActRestMin:          number | null
  dutyActCreditedMinutes:  number | null
}

export interface ScenarioGanttFlight {
  id:          number
  fltNum:      string
  depArp:      string
  arvArp:      string
  schDepDtUtc: string
  schArvDtUtc: string
  fleet:       string
  register:    string | null
}

export interface ScenarioGanttGroundItem {
  crewId: string
  base?: string
  depArp?: string | null
  arvArp?: string | null
  assignmentGroup: string
  assignment: string
  /** Specific display code from Live roster_flight.label (e.g. GDO when assignment is DO). */
  label?: string | null
  schStrDtUtc: string
  schEndDtUtc: string
  actingRank: string
  source: 'IMP' | 'PA' | 'MA' | 'CR'
  /** Credited minutes for this ground task (VAC/ILL/SBY/SIM/GRD). Populated for PA items from roster_flight.act_credited_minutes; undefined for optimizer-assigned items. */
  actCreditedMinutes?: number
  dpMin?: number
}

export interface ScenarioGanttDutyRef {
  crewId: string
  pairingId: number
  dutySeq: number
  dutyRefTz: number | null
}

export interface ScenarioGanttData {
  scenarioId: number
  scenarioName: string | null
  fileType: 'PO' | 'RO' | 'TO'
  /** Scenario-owned legality workset id; displayed read-only in the Scenario toolbar. */
  rulesetId?: number | null
  /** Pane visibility + edit capabilities derived from fileType + dictionary (code fallback). */
  capabilities: GanttCapabilities
  /** Full canvas range — derived from actual pairing data, includes lead-in/out days. */
  strDtLoc: string
  endDtLoc: string
  /** Official scenario dates from DB — used for default viewport zoom (excludes lead-in/out). */
  scenarioStrDt: string
  scenarioEndDt: string
  leadinLive: number
  dataSource: 'live-refresh' | 'snapshot' | 'db' | 'seed'
  /** Seed/preview view (DRAFT/FAILED, no loaded roster) — editing disabled. */
  readOnly?: boolean
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
  assignments: ScenarioGanttAssignment[]
  pairingSegments: ScenarioGanttPairingSegment[]
  /** Optional crew-specific Rule 7500 refs from scenario roster rows. */
  rosterDutyRefs?: ScenarioGanttDutyRef[]
  flights: ScenarioGanttFlight[]
  groundItems: ScenarioGanttGroundItem[]
  /** Per-crew per-month manday stats computed from optimization data. crewId → yearMonth → stats */
  crewStats: Record<string, Record<string, ScenarioMonthStats>>
}

export interface ScenarioMonthStats {
  credit: number      // total credited minutes for the month
  dayOffCount: number // number of DO-assignment days
  alCount: number     // number of VAC-assignment days (FD)
  leaveCount: number  // number of ILL-assignment days (CC)
  /** Optional Live manday KPIs, used when a seed scenario shows Live roster context. */
  ybh?: number
  mbh?: number
  mcred?: number
  yal?: number
  mal?: number
  ydo?: number
  mdo?: number
}

function parseCrewAndPairings(inputGz: Buffer, pairingSource: ScenarioPairingSource = 'scenario'): {
  crew: ScenarioGanttCrew[]
  pairings: ScenarioGanttPairing[]
} {
  const sections = parseSections(inputGz)

  const crewRows = sections['crew'] ?? []
  const crewBaseRows = sections['crew_base'] ?? []
  const crewRankRows = sections['crew_rank'] ?? []
  const pairingRows = sections['pairing'] ?? []
  const compositionRows = sections['pairing_composition'] ?? []

  // Build composition map: pairingId → slots
  const compositionsByPairing = new Map<number, ScenarioGanttCompositionSlot[]>()
  for (const r of compositionRows) {
    if (r['is_deleted'] && Number(r['is_deleted']) !== 0) continue
    const pid = Number(r['pairing_id'])
    const slot: ScenarioGanttCompositionSlot = {
      rank: r['acting_rank'] ?? '',
      plan: Number(r['plan'] ?? 0),
      fill: Number(r['fill'] ?? 0),
    }
    const list = compositionsByPairing.get(pid) ?? []
    list.push(slot)
    compositionsByPairing.set(pid, list)
  }

  // Pick the crew_base with the latest eff_dt (most current effective base),
  // not the first row (which may be a historical/expired record).
  const baseByCrewId = new Map<string, string>()
  const bestBaseByCrew = new Map<string, { base: string; eff: string }>()
  for (const r of crewBaseRows) {
    const cid = r['crew_id']
    const eff = r['eff_dt'] ?? ''
    const cur = bestBaseByCrew.get(cid)
    if (!cur || eff > cur.eff) {
      bestBaseByCrew.set(cid, { base: r['base'], eff })
    }
  }
  for (const [cid, v] of bestBaseByCrew) {
    baseByCrewId.set(cid, v.base)
  }

  const rankByCrewId = new Map<string, string>()
  for (const r of crewRankRows) {
    if (!rankByCrewId.has(r['crew_id'])) rankByCrewId.set(r['crew_id'], r['rank'])
  }

  const seenCrewIds = new Set<string>()
  const crew: ScenarioGanttCrew[] = crewRows
    .map((r) => {
      const nameParts = [r['first_name'], r['middle_name'], r['last_name']].filter(Boolean)
      return {
        crewId: r['crew_id'],
        base: baseByCrewId.get(r['crew_id']) ?? '',
        division: r['division'] ?? '',
        crewRank: rankByCrewId.get(r['crew_id']) ?? '',
        rank: rankByCrewId.get(r['crew_id']) ?? '',
        seniorityNum: r['seniority_num'] || null,
        crewName: nameParts.length > 0 ? nameParts.join(' ') : null,
      }
    })
    .filter((c) => {
      if (seenCrewIds.has(c.crewId)) return false
      seenCrewIds.add(c.crewId)
      return true
    })

  const pairings: ScenarioGanttPairing[] = pairingRows.map((r) => {
    const pid = Number(r['id'])
    return {
      pairingId: pid,
      sourcePairingId: pid,
      pairingSource,
      pairingLabel: r['pairing_label'] || null,
      interfaceId: r['interface_id'] ?? null,
      base: r['base'] ?? '',
      fleet: r['fleet'] ?? '',
      schStrDtUtc: r['sch_str_dt_utc'] ?? '',
      schEndDtUtc: r['sch_end_dt_utc'] ?? '',
      actStrDtUtc: r['act_str_dt_utc'] ?? '',
      actEndDtUtc: r['act_end_dt_utc'] ?? '',
      assignmentGroup: r['assignment_group'] ?? '',
      assignment: r['assignment'] ?? '',
      division: r['division'] ?? '',
      compositions: compositionsByPairing.get(pid) ?? [],
    }
  })

  // Scope pairings to the divisions present among the (already division-scoped)
  // crew — the gz `pairing` section is not division-filtered at export time, so a
  // pilot scenario would otherwise surface cabin pairings. Covers buildGanttDataSnapshot
  // AND buildGanttDataLiveRefresh (both call this). See spec 2026-06-22.
  return { crew, pairings: filterPairingsByCrewDivision(crew, pairings) }
}

function parsePairingSegments(inputGz: Buffer): ScenarioGanttPairingSegment[] {
  const sections = parseSections(inputGz)
  return (sections['pairing_segment'] ?? []).map((r) => ({
    pairingId:        Number(r['pairing_id']),
    dutySeq:          Number(r['duty_seq']),
    segSeq:           Number(r['seg_seq']),
    fltId:            r['flt_id'] ? Number(r['flt_id']) : null,
    fltDt:            r['flt_dt'] || null,
    fltNum:           r['flt_num'] ?? '',
    airline:          r['airline'] ?? '',
    depArp:           r['dep_arp'] ?? '',
    arvArp:           r['arv_arp'] ?? '',
    segAssignment:    r['seg_assignment'] ?? 'FLT',
    schStrDtUtc:      r['sch_str_dt_utc'] ?? '',
    schEndDtUtc:      r['sch_end_dt_utc'] ?? '',
    actStrDtUtc:      r['act_str_dt_utc'] ?? '',
    actEndDtUtc:      r['act_end_dt_utc'] ?? '',
    dutyStrArp:       r['duty_str_arp'] ?? '',
    dutyEndArp:       r['duty_end_arp'] ?? '',
    dutySchStrDtUtc:  r['duty_sch_str_dt_utc'] ?? '',
    dutySchEndDtUtc:  r['duty_sch_end_dt_utc'] ?? '',
    dutySchRestMin:          r['duty_sch_rest_min'] ? Number(r['duty_sch_rest_min']) : null,
    dutyActRestMin:          r['duty_act_rest_min'] ? Number(r['duty_act_rest_min']) : null,
    dutyActCreditedMinutes:  r['duty_act_credited_minutes'] ? Number(r['duty_act_credited_minutes']) : null,
    brief1StartUtc:   r['brief_start_utc'] ?? '',
    brief1EndUtc:     r['brief_end_utc'] ?? '',
    debrief1StartUtc: r['debrief_start_utc'] ?? '',
    debrief1EndUtc:   r['debrief_end_utc'] ?? '',
    pickup1StartUtc:  r['pickup_start_utc'] ?? '',
    pickup1EndUtc:    r['pickup_end_utc'] ?? '',
    dropoff1StartUtc: r['dropoff_start_utc'] ?? '',
    dropoff1EndUtc:   r['dropoff_end_utc'] ?? '',
  }))
}

function parseFlights(inputGz: Buffer): ScenarioGanttFlight[] {
  const sections = parseSections(inputGz)
  return (sections['flight'] ?? []).map((r) => ({
    id:          Number(r['id']),
    fltNum:      r['flt_num'] ?? '',
    depArp:      r['dep_arp'] ?? '',
    arvArp:      r['arv_arp'] ?? '',
    schDepDtUtc: r['sch_dep_dt_utc'] ?? '',
    schArvDtUtc: r['sch_arv_dt_utc'] ?? '',
    fleet:       r['fleet'] ?? '',
    register:    r['register'] || null,
  }))
}

function filterFlightsByPairingSegments(
  flights: ScenarioGanttFlight[],
  pairingSegments: ScenarioGanttPairingSegment[],
): ScenarioGanttFlight[] {
  const referencedFlightIds = new Set(
    pairingSegments.map((segment) => segment.fltId).filter((id): id is number => id != null),
  )
  if (referencedFlightIds.size === 0) return []
  return flights.filter((flight) => referencedFlightIds.has(flight.id))
}

export const GANTT_LEAD_DAYS = 7
const LEAD_MS = GANTT_LEAD_DAYS * 24 * 3_600_000

/**
 * Inclusive start / exclusive end of the gantt lead-in window:
 * [strDtLoc - GANTT_LEAD_DAYS, strDtLoc).
 */
export function leadinWindowBounds(strDtLoc: Date | string): {
  leadStart: Date
  leadEndExclusive: Date
} {
  const leadEndExclusive = new Date(strDtLoc)
  const leadStart = new Date(leadEndExclusive)
  leadStart.setUTCDate(leadStart.getUTCDate() - GANTT_LEAD_DAYS)
  return { leadStart, leadEndExclusive }
}

/**
 * Live roster window for seed / PA preview: lead-in + official scenario period.
 * [strDtLoc - GANTT_LEAD_DAYS, endDtLoc + 1d).
 *
 * Lead-in-only filtering would drop in-period Live duties that seed relies on
 * (DRAFT has no optimizer assignments). Geometry merge still only fills pairing
 * ids missing from the RO window.
 */
export function livePaWindowBounds(
  strDtLoc: Date | string,
  endDtLoc: Date | string,
): {
  leadStart: Date
  loadEndExclusive: Date
} {
  const { leadStart } = leadinWindowBounds(strDtLoc)
  const loadEndExclusive = new Date(endDtLoc)
  loadEndExclusive.setUTCDate(loadEndExclusive.getUTCDate() + 1)
  return { leadStart, loadEndExclusive }
}

function toIsoTimestamp(value: Date | string | null | undefined): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

function dateToYmd(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

/**
 * Derive canvas [strDtLoc, endDtLoc] for the scenario Gantt.
 *
 * Always pads exactly ±7 calendar days around the official scenario dates so
 * planners can see lead-in/lead-out context. Scenario timestamps are stored as
 * local-time-as-UTC, so normalize them to calendar-day boundaries before
 * applying the padding. Pairings outside this display window remain clipped to
 * the fixed Gantt range; the scenario date window is the source of truth.
 */
export function deriveDateRange(
  _pairings: ScenarioGanttPairing[],
  officialStart: Date,
  officialEnd: Date,
): { strDtLoc: string; endDtLoc: string } {
  const scenarioStart = new Date(officialStart)
  scenarioStart.setUTCHours(0, 0, 0, 0)
  const scenarioEnd = new Date(officialEnd)
  scenarioEnd.setUTCHours(23, 59, 59, 999)
  const minMs = scenarioStart.getTime() - LEAD_MS
  const maxMs = scenarioEnd.getTime() + LEAD_MS

  return {
    strDtLoc: new Date(minMs).toISOString(),
    endDtLoc: new Date(maxMs).toISOString(),
  }
}

/** Parse ROSTER section from output.gz — source='CR' (optimizer) or 'PA' (pre-assignment). */
function parseRosterGroundItems(
  outputGz: Buffer,
  creditLookup?: Map<string, number>,
): ScenarioGanttGroundItem[] {
  const sections = parseSections(outputGz)
  return (sections['ROSTER'] ?? [])
    .filter((r) => r['crew_id'] && r['sch_str_dt_utc'] && r['sch_end_dt_utc'] && (r['source'] === 'CR' || r['source'] === 'PA' || r['source'] === 'leadin'))
    .map((r) => {
      const schStrDtUtc = r['sch_str_dt_utc'] as string
      let actCreditedMinutes: number | undefined
      if (creditLookup && (r['source'] === 'PA' || r['source'] === 'leadin')) {
        const key = `${r['crew_id']}|${normUtcMin(schStrDtUtc)}`
        actCreditedMinutes = creditLookup.get(key)
      }
      return {
        crewId:             r['crew_id'] as string,
        base:               (r['base'] as string) || '',
        depArp:             (r['dep_arp'] as string) || (r['base'] as string) || '',
        arvArp:             (r['arv_arp'] as string) || '',
        assignmentGroup:    (r['assignment_group'] as string) || 'GRD',
        assignment:         (r['assignment'] as string) || (r['assignment_group'] as string) || 'GRD',
        label:              (r['label'] as string) || null,
        schStrDtUtc,
        schEndDtUtc:        r['sch_end_dt_utc'] as string,
        actingRank:         (r['acting_rank'] as string) || '',
        source:             (r['source'] === 'CR' ? 'CR' : 'PA') as ScenarioGanttGroundItem['source'],
        actCreditedMinutes,
        dpMin: r['dp_min'] != null && Number.isFinite(Number(r['dp_min'])) ? Number(r['dp_min']) : undefined,
      }
    })
}

/**
 * Build a (crewId|schStrDtUtc) → max actCreditedMinutes lookup from the
 * `## roster_flight` section of input.gz.  Only ground tasks (no pairing_id)
 * with a positive credit are included.  Where duplicates exist for the same
 * (crew, time) key, the maximum credit wins.
 */
/** Normalize a UTC timestamp to YYYY-MM-DDTHH:mm to match across DB ('2026-05-23 04:00:00')
 *  and optimizer ('2026-05-25T06:00') formats. */
const normUtcMin = (s: string) => s.slice(0, 16).replace(' ', 'T')

type ScenarioPairingSource = NonNullable<ScenarioGanttPairing['pairingSource']>

const sourcePairingKey = (source: ScenarioPairingSource, sourcePairingId: number): string =>
  `${source}:${sourcePairingId}`

const assignmentPairingIdentity = (
  assignment: ScenarioGanttAssignment,
  fallbackSource: ScenarioPairingSource,
): { source: ScenarioPairingSource; sourcePairingId: number } => ({
  source: assignment.pairingSource ?? fallbackSource,
  sourcePairingId: assignment.sourcePairingId ?? assignment.pairingId,
})

const allocateDisplayPairingId = (sourcePairingId: number, usedDisplayIds: Set<number>): number => {
  if (!usedDisplayIds.has(sourcePairingId)) {
    usedDisplayIds.add(sourcePairingId)
    return sourcePairingId
  }
  let candidate = -Math.abs(sourcePairingId)
  if (candidate === 0) candidate = -1
  while (usedDisplayIds.has(candidate)) candidate -= 1
  usedDisplayIds.add(candidate)
  return candidate
}

function buildRosterFlightCreditLookup(inputGz: Buffer): Map<string, number> {
  const sections = parseSections(inputGz)
  const rfRows = sections['roster_flight'] ?? []
  const lookup = new Map<string, number>()
  for (const r of rfRows) {
    if (!r['crew_id'] || !r['sch_str_dt_utc'] || r['pairing_id']) continue
    const raw = r['act_credited_minutes']
    if (!raw) continue
    const num = Number(raw)
    if (!Number.isFinite(num) || num <= 0) continue
    const key = `${r['crew_id']}|${normUtcMin(r['sch_str_dt_utc'])}`
    const existing = lookup.get(key) ?? 0
    if (num > existing) lookup.set(key, num)
  }
  return lookup
}

function parseOptAssignments(outputGz: Buffer): ScenarioGanttAssignment[] {
  const sections = parseSections(outputGz)
  return (sections['ASSIGNMENTS'] ?? [])
    .filter((r) => r['crew_id'] && r['pairing_id'] && (r['source'] === 'CR' || r['source'] === 'PA' || r['source'] === 'leadin' || !r['source']))
    .map((r) => ({
      crewId:    r['crew_id'],
      pairingId: Number(r['pairing_id']),
      source:    (r['source'] === 'PA' || r['source'] === 'leadin' ? 'PA' : 'CR') as ScenarioGanttAssignment['source'],
      // Pairing Info shows this as the crew's Acting Rank. The engine writes the
      // assignment role (CA/FO/FA/…) in output.gz ASSIGNMENTS.acting_rank; dropping
      // it left the snapshot path (historical versions / gz source) with a blank
      // Acting Rank column in the Pairing Info "Crew on Pairing" table.
      rosterActingRank: (r['acting_rank'] as string | undefined) ?? null,
      rank: (r['acting_rank'] as string | undefined) ?? null,
    }))
}

/**
 * The engine writes SBY assignments to ROSTER (not ASSIGNMENTS), so they are
 * parsed as ground items and miss credit + pairing association.
 *
 * This function matches each SBY ROSTER ground item against pairingSegments
 * whose parent pairing has assignmentGroup='SBY', using (dutySchStrDtUtc,
 * dutySchEndDtUtc) as key. This covers all SBY subtypes (PRAM, PRPM, etc.)
 * rather than filtering by segAssignment alone.
 *
 * Creates synthetic ScenarioGanttAssignment entries and removes matched SBY
 * items from groundItems to prevent duplicate rendering.
 */
export function injectSbyAssignments(
  pairings: ScenarioGanttPairing[],
  pairingSegments: ScenarioGanttPairingSegment[],
  groundItems: ScenarioGanttGroundItem[],
  assignments: ScenarioGanttAssignment[],
): { assignments: ScenarioGanttAssignment[]; groundItems: ScenarioGanttGroundItem[] } {
  // Collect all pairingIds that are SBY pairings (by pairing assignmentGroup)
  const sbyPairingIds = new Set<number>(
    pairings.filter((p) => p.assignmentGroup === 'SBY').map((p) => p.pairingId),
  )
  if (sbyPairingIds.size === 0) return { assignments, groundItems }

  // Build lookup: `${dutySchStrDtUtc}|${dutySchEndDtUtc}` → pairingId
  const sbyPairingByTime = new Map<string, number>()
  for (const seg of pairingSegments) {
    if (!sbyPairingIds.has(seg.pairingId)) continue
    const key = `${seg.dutySchStrDtUtc}|${seg.dutySchEndDtUtc}`
    if (!sbyPairingByTime.has(key)) {
      sbyPairingByTime.set(key, seg.pairingId)
    }
  }

  if (sbyPairingByTime.size === 0) return { assignments, groundItems }

  const syntheticAssignments: ScenarioGanttAssignment[] = []
  const remainingGroundItems: ScenarioGanttGroundItem[] = []

  for (const item of groundItems) {
    if (item.assignmentGroup !== 'SBY') {
      remainingGroundItems.push(item)
      continue
    }
    const key = `${item.schStrDtUtc}|${item.schEndDtUtc}`
    const pairingId = sbyPairingByTime.get(key)
    if (pairingId == null) {
      remainingGroundItems.push(item)
      continue
    }
    syntheticAssignments.push({
      crewId: item.crewId,
      pairingId,
      source: item.source,
      rosterActingRank: item.actingRank || null,
      flightActingRank: item.actingRank || null,
      rank: item.actingRank || null,
    })
  }

  if (syntheticAssignments.length === 0) return { assignments, groundItems }

  return {
    assignments: [...assignments, ...syntheticAssignments],
    groundItems: remainingGroundItems,
  }
}

const RESERVE_PAIRING_GROUPS = new Set(['RES', 'SBY'])
const pairingSourceKey = (pairing: Pick<ScenarioGanttPairing, 'pairingSource' | 'sourcePairingId' | 'pairingId'>): string =>
  `${pairing.pairingSource ?? 'live'}:${pairing.sourcePairingId ?? pairing.pairingId}`

const selectedPairingTypes = (filterParams: Record<string, unknown> | undefined): string[] => {
  const fp = (filterParams ?? {}) as Record<string, Record<string, unknown>>
  const pairingFilter = (fp.pairing ?? {}) as Record<string, unknown>
  return ((pairingFilter.types as string[] | undefined) ?? []).map((value) => String(value).toUpperCase())
}

export function pruneUnreferencedReservePairings(
  pairings: ScenarioGanttPairing[],
  pairingSegments: ScenarioGanttPairingSegment[],
  flights: ScenarioGanttFlight[],
  assignments: ScenarioGanttAssignment[],
  sourcePairingKeys: ReadonlySet<string> = new Set(),
  sourceReserveGroups: ReadonlySet<string> = new Set(),
): {
  pairings: ScenarioGanttPairing[]
  pairingSegments: ScenarioGanttPairingSegment[]
  flights: ScenarioGanttFlight[]
} {
  const referencedPairingIds = new Set(
    assignments.map((assignment) => assignment.pairingId).filter((id) => Number.isFinite(id) && id !== 0),
  )
  const referencedSourcePairingKeys = new Set(
    assignments
      .filter((assignment) => Number.isFinite(assignment.sourcePairingId ?? assignment.pairingId))
      .map((assignment) => sourcePairingKey(
        assignment.pairingSource ?? 'live',
        assignment.sourcePairingId ?? assignment.pairingId,
      )),
  )

  const filteredPairings = pairings.filter((pairing) => {
    return sourcePairingKeys.has(pairingSourceKey(pairing))
      || referencedPairingIds.has(pairing.pairingId)
      || referencedSourcePairingKeys.has(pairingSourceKey(pairing))
  })
  if (filteredPairings.length === pairings.length) {
    return { pairings, pairingSegments, flights }
  }

  const keptPairingIds = new Set(filteredPairings.map((pairing) => pairing.pairingId))
  const filteredPairingSegments = pairingSegments.filter((segment) => keptPairingIds.has(segment.pairingId))
  const keptFlightIds = new Set(
    filteredPairingSegments
      .map((segment) => segment.fltId)
      .filter((id): id is number => id != null),
  )
  const filteredFlights = flights.filter((flight) => keptFlightIds.has(flight.id))

  return {
    pairings: filteredPairings,
    pairingSegments: filteredPairingSegments,
    flights: filteredFlights,
  }
}

/**
 * Recompute composition fill values from actual optimizer assignments.
 * The fill stored in input.gz pairing_composition reflects the pre-optimization
 * state and is stale by the time the optimizer has finished. In particular, SBY
 * pairings always have fill=0 in input.gz (the engine only writes SBY to ROSTER).
 */
export function recomputeCompositionFill(
  pairings: ScenarioGanttPairing[],
  optAssignments: ScenarioGanttAssignment[],
  crew: ScenarioGanttCrew[],
): ScenarioGanttPairing[] {
  // Pairing composition is filled by pairing-level acting rank.
  const rankByCrewId = new Map<string, string>(crew.map((c) => [c.crewId, c.crewRank || c.rank]))

  // Count distinct crew assignments per (pairingId, rank); roster rows are per segment.
  const fillCount = new Map<string, number>()
  const seen = new Set<string>()
  for (const { crewId, pairingId, rosterActingRank, rank: assignmentRank } of optAssignments) {
    const rank = rosterActingRank || assignmentRank || rankByCrewId.get(crewId)
    if (!rank) continue
    const seenKey = `${pairingId}|${rank}|${crewId}`
    if (seen.has(seenKey)) continue
    seen.add(seenKey)
    const key = `${pairingId}|${rank}`
    fillCount.set(key, (fillCount.get(key) ?? 0) + 1)
  }

  return pairings.map((p) => {
    if (p.compositions.length === 0) return p
    const updatedComps = p.compositions.map((c) => {
      const actual = fillCount.get(`${p.pairingId}|${c.rank}`) ?? 0
      return actual !== c.fill ? { ...c, fill: actual } : c
    })
    const changed = updatedComps.some((c, i) => c !== p.compositions[i])
    return changed ? { ...p, compositions: updatedComps } : p
  })
}

/** Row shape selected from live `roster_flight` for lead-in. */
export interface LeadinRow {
  crewId: string
  base: string | null
  depArp?: string | null
  arvArp?: string | null
  pairingId: number | null
  assignmentGroup: string | null
  assignment: string | null
  label?: string | null
  schStrDtUtc: Date | null
  schEndDtUtc: Date | null
  actingRank: string | null
  rosterActingRank?: string | null
  flightActingRank?: string | null
  activeRank?: string | null
  isDeleted: number
  actCreditedMinutes: string | number | null
}

/** Pure mapper: live roster rows → lead-in assignments + ground items (source='PA'). */
export function mapLeadinRows(rows: LeadinRow[]): {
  assignments: ScenarioGanttAssignment[]
  groundItems: ScenarioGanttGroundItem[]
} {
  const seenAssignments = new Set<string>()
  const assignments: ScenarioGanttAssignment[] = []
  for (const r of rows) {
    if (r.pairingId === null || r.isDeleted !== 0) continue
    const key = `${r.crewId}|${r.pairingId}`
    if (seenAssignments.has(key)) continue
    seenAssignments.add(key)
    assignments.push({
      crewId: r.crewId,
      pairingId: r.pairingId!,
      source: 'PA' as const,
      crewRank: r.activeRank ?? null,
      rosterActingRank: r.rosterActingRank ?? null,
      flightActingRank: r.flightActingRank ?? r.actingRank ?? null,
      rank: r.rosterActingRank ?? null,
      sourcePairingId: r.pairingId!,
      pairingSource: 'live' as const,
    })
  }

  const groundItems: ScenarioGanttGroundItem[] = rows
    .filter((r) => r.pairingId === null && r.isDeleted === 0 && r.schStrDtUtc && r.schEndDtUtc)
    .map((r) => ({
      crewId:             r.crewId,
      base:               r.base ?? '',
      depArp:             r.depArp ?? r.base ?? '',
      arvArp:             r.arvArp ?? '',
      assignmentGroup:    r.assignmentGroup ?? '',
      assignment:         r.assignment ?? r.assignmentGroup ?? '',
      label:              r.label ?? null,
      schStrDtUtc:        r.schStrDtUtc!.toISOString(),
      schEndDtUtc:        r.schEndDtUtc!.toISOString(),
      actingRank:         r.flightActingRank ?? r.actingRank ?? '',
      source:             'PA' as const,
      actCreditedMinutes: r.actCreditedMinutes != null ? Number(r.actCreditedMinutes) : undefined,
    }))

  return { assignments, groundItems }
}

/**
 * Load Live roster_flight for the given crew whose duty start falls in
 * [leadStart, leadEndExclusive). Deleted rows are excluded in SQL.
 * Exported for unit testing.
 */
export async function loadLeadinFromLive(
  db: FastifyInstance['db'],
  crewIds: string[],
  leadStart: Date,
  leadEndExclusive: Date,
): Promise<{ assignments: ScenarioGanttAssignment[]; groundItems: ScenarioGanttGroundItem[] }> {
  if (crewIds.length === 0) return { assignments: [], groundItems: [] }
  const rows = await db
    .select({
      crewId:             rosterFlight.crewId,
      base:               rosterFlight.base,
      depArp:             rosterFlight.depArp,
      arvArp:             rosterFlight.arvArp,
      pairingId:          rosterFlight.pairingId,
      assignmentGroup:    rosterFlight.assignmentGroup,
      assignment:         rosterFlight.assignment,
      label:              rosterFlight.label,
      schStrDtUtc:        rosterFlight.schStrDtUtc,
      schEndDtUtc:        rosterFlight.schEndDtUtc,
      actingRank:         rosterFlight.flightActingRank,
      flightActingRank:   rosterFlight.flightActingRank,
      rosterActingRank:   rosterFlight.rosterActingRank,
      activeRank:         rosterFlight.activeRank,
      isDeleted:          rosterFlight.isDeleted,
      actCreditedMinutes: rosterFlight.actCreditedMinutes,
    })
    .from(rosterFlight)
    .where(
      and(
        inArray(rosterFlight.crewId, crewIds),
        eq(rosterFlight.isDeleted, 0),
        gte(rosterFlight.schStrDtUtc, leadStart),
        lt(rosterFlight.schStrDtUtc, leadEndExclusive),
      ),
    )
  return mapLeadinRows(rows as LeadinRow[])
}

/**
 * Append Live pairing / segment / flight geometry for lead-in assignment
 * pairingIds missing from the RO window payload (display only — does not
 * touch scenario tables or buildRoInputGz).
 */
export async function mergeLeadinPairingGeometry(
  db: FastifyInstance['db'],
  pairings: ScenarioGanttPairing[],
  pairingSegments: ScenarioGanttPairingSegment[],
  flights: ScenarioGanttFlight[],
  leadinAssignments: ScenarioGanttAssignment[],
  assignmentPairingSource: ScenarioPairingSource = 'live',
): Promise<{
  pairings: ScenarioGanttPairing[]
  pairingSegments: ScenarioGanttPairingSegment[]
  flights: ScenarioGanttFlight[]
  assignments: ScenarioGanttAssignment[]
}> {
  const usedDisplayIds = new Set(pairings.map((p) => p.pairingId))
  const displayBySourcePairing = new Map<string, number>()
  for (const p of pairings) {
    const sourcePairingId = p.sourcePairingId ?? p.pairingId
    if (p.pairingSource) {
      displayBySourcePairing.set(sourcePairingKey(p.pairingSource, sourcePairingId), p.pairingId)
    } else {
      displayBySourcePairing.set(sourcePairingKey('live', sourcePairingId), p.pairingId)
      displayBySourcePairing.set(sourcePairingKey('scenario', sourcePairingId), p.pairingId)
    }
  }
  const missing = [
    ...new Set(
      leadinAssignments
        .map((assignment) => assignmentPairingIdentity(assignment, assignmentPairingSource))
        .filter(({ source, sourcePairingId }) => {
          if (source !== 'live' || !Number.isFinite(sourcePairingId) || sourcePairingId === 0) return false
          return !displayBySourcePairing.has(sourcePairingKey(source, sourcePairingId))
        })
        .map(({ sourcePairingId }) => sourcePairingId),
    ),
  ]

  const remapAssignments = (): ScenarioGanttAssignment[] =>
    leadinAssignments.map((assignment) => {
      const identity = assignmentPairingIdentity(assignment, assignmentPairingSource)
      return {
        ...assignment,
        sourcePairingId: identity.sourcePairingId,
        pairingSource: identity.source,
        pairingId:
          displayBySourcePairing.get(sourcePairingKey(identity.source, identity.sourcePairingId)) ??
          assignment.pairingId,
      }
    })

  if (missing.length === 0) {
    return {
      pairings,
      pairingSegments,
      flights,
      assignments: remapAssignments(),
    }
  }

  const livePairings = await db
    .select({
      id: pairingTable.id,
      pairingLabel: pairingTable.pairingLabel,
      base: pairingTable.base,
      fleet: pairingTable.fleet,
      schStrDtUtc: pairingTable.schStrDtUtc,
      schEndDtUtc: pairingTable.schEndDtUtc,
      actStrDtUtc: pairingTable.actStrDtUtc,
      actEndDtUtc: pairingTable.actEndDtUtc,
      assignmentGroup: pairingTable.assignmentGroup,
      assignment: pairingTable.assignment,
      division: pairingTable.division,
    })
    .from(pairingTable)
    .where(and(inArray(pairingTable.id, missing), eq(pairingTable.isDeleted, 0)))

  if (livePairings.length === 0) {
    return { pairings, pairingSegments, flights, assignments: remapAssignments() }
  }

  const loadedIds = livePairings.map((p) => p.id)
  const displayIdByLiveId = new Map<number, number>()
  for (const id of loadedIds) {
    const displayId = allocateDisplayPairingId(id, usedDisplayIds)
    displayIdByLiveId.set(id, displayId)
    displayBySourcePairing.set(sourcePairingKey('live', id), displayId)
  }

  const [compRows, segRows] = await Promise.all([
    db
      .select({
        pairingId: pairingComposition.pairingId,
        actingRank: pairingComposition.actingRank,
        plan: pairingComposition.plan,
        fill: pairingComposition.fill,
      })
      .from(pairingComposition)
      .where(and(inArray(pairingComposition.pairingId, loadedIds), eq(pairingComposition.isDeleted, 0))),
    db
      .select({
        pairingId: pairingSegment.pairingId,
        dutySeq: pairingSegment.dutySeq,
        segSeq: pairingSegment.segSeq,
        fltId: pairingSegment.fltId,
        fltDt: pairingSegment.fltDt,
        fltNum: pairingSegment.fltNum,
        airline: pairingSegment.airline,
        depArp: pairingSegment.depArp,
        arvArp: pairingSegment.arvArp,
        segAssignment: pairingSegment.segAssignment,
        schStrDtUtc: pairingSegment.schStrDtUtc,
        schEndDtUtc: pairingSegment.schEndDtUtc,
        actStrDtUtc: pairingSegment.actStrDtUtc,
        actEndDtUtc: pairingSegment.actEndDtUtc,
        dutyStrArp: pairingSegment.dutyStrArp,
        dutyEndArp: pairingSegment.dutyEndArp,
        dutySchStrDtUtc: pairingSegment.dutySchStrDtUtc,
        dutySchEndDtUtc: pairingSegment.dutySchEndDtUtc,
        dutySchRestMin: pairingSegment.dutySchRestMin,
        dutyActRestMin: pairingSegment.dutyActRestMin,
        dutyActCreditedMinutes: pairingSegment.dutyActCreditedMinutes,
        briefStartUtc: pairingSegment.briefStartUtc,
        briefEndUtc: pairingSegment.briefEndUtc,
        debriefStartUtc: pairingSegment.debriefStartUtc,
        debriefEndUtc: pairingSegment.debriefEndUtc,
        pickupStartUtc: pairingSegment.pickupStartUtc,
        pickupEndUtc: pairingSegment.pickupEndUtc,
        dropoffStartUtc: pairingSegment.dropoffStartUtc,
        dropoffEndUtc: pairingSegment.dropoffEndUtc,
      })
      .from(pairingSegment)
      .where(and(inArray(pairingSegment.pairingId, loadedIds), eq(pairingSegment.isDeleted, 0))),
  ])

  const compsByPairing = new Map<number, ScenarioGanttCompositionSlot[]>()
  for (const row of compRows) {
    const list = compsByPairing.get(row.pairingId) ?? []
    list.push({
      rank: row.actingRank ?? '',
      plan: row.plan ?? 0,
      fill: row.fill ?? 0,
    })
    compsByPairing.set(row.pairingId, list)
  }

  const appendedPairings: ScenarioGanttPairing[] = livePairings.map((p) => ({
    pairingId: displayIdByLiveId.get(p.id) ?? p.id,
    sourcePairingId: p.id,
    pairingSource: 'live',
    pairingLabel: p.pairingLabel ?? null,
    base: p.base,
    fleet: p.fleet ?? '',
    schStrDtUtc: toIsoTimestamp(p.schStrDtUtc),
    schEndDtUtc: toIsoTimestamp(p.schEndDtUtc),
    actStrDtUtc: toIsoTimestamp(p.actStrDtUtc),
    actEndDtUtc: toIsoTimestamp(p.actEndDtUtc),
    assignmentGroup: p.assignmentGroup,
    assignment: p.assignment,
    division: p.division,
    compositions: compsByPairing.get(p.id) ?? [],
  }))

  const appendedSegments: ScenarioGanttPairingSegment[] = segRows.map((s) => ({
    pairingId: displayIdByLiveId.get(s.pairingId) ?? s.pairingId,
    dutySeq: s.dutySeq,
    segSeq: s.segSeq,
    fltId: s.fltId,
    fltDt: dateToYmd(s.fltDt),
    fltNum: s.fltNum,
    airline: s.airline,
    depArp: s.depArp,
    arvArp: s.arvArp,
    segAssignment: s.segAssignment,
    schStrDtUtc: toIsoTimestamp(s.schStrDtUtc),
    schEndDtUtc: toIsoTimestamp(s.schEndDtUtc),
    actStrDtUtc: toIsoTimestamp(s.actStrDtUtc),
    actEndDtUtc: toIsoTimestamp(s.actEndDtUtc),
    dutyStrArp: s.dutyStrArp,
    dutyEndArp: s.dutyEndArp,
    dutySchStrDtUtc: toIsoTimestamp(s.dutySchStrDtUtc),
    dutySchEndDtUtc: toIsoTimestamp(s.dutySchEndDtUtc),
    dutySchRestMin: s.dutySchRestMin,
    dutyActRestMin: s.dutyActRestMin,
    dutyActCreditedMinutes:
      s.dutyActCreditedMinutes != null ? Number(s.dutyActCreditedMinutes) : null,
    brief1StartUtc: toIsoTimestamp(s.briefStartUtc),
    brief1EndUtc: toIsoTimestamp(s.briefEndUtc),
    debrief1StartUtc: toIsoTimestamp(s.debriefStartUtc),
    debrief1EndUtc: toIsoTimestamp(s.debriefEndUtc),
    pickup1StartUtc: toIsoTimestamp(s.pickupStartUtc),
    pickup1EndUtc: toIsoTimestamp(s.pickupEndUtc),
    dropoff1StartUtc: toIsoTimestamp(s.dropoffStartUtc),
    dropoff1EndUtc: toIsoTimestamp(s.dropoffEndUtc),
  }))

  const haveFlight = new Set(flights.map((f) => f.id))
  const missingFltIds = [
    ...new Set(
      appendedSegments
        .map((s) => s.fltId)
        .filter((id): id is number => id != null && !haveFlight.has(id)),
    ),
  ]

  let appendedFlights: ScenarioGanttFlight[] = []
  if (missingFltIds.length > 0) {
    const flightRows = await db
      .select({
        id: flightTable.id,
        fltNum: flightTable.fltNum,
        depArp: flightTable.depArp,
        arvArp: flightTable.arvArp,
        schDepDtUtc: flightTable.schDepDtUtc,
        schArvDtUtc: flightTable.schArvDtUtc,
        fleet: flightTable.fleet,
        register: flightTable.register,
      })
      .from(flightTable)
      .where(and(inArray(flightTable.id, missingFltIds), eq(flightTable.isDeleted, 0)))

    appendedFlights = flightRows.map((f) => ({
      id: f.id,
      fltNum: f.fltNum,
      depArp: f.depArp,
      arvArp: f.arvArp,
      schDepDtUtc: toIsoTimestamp(f.schDepDtUtc),
      schArvDtUtc: toIsoTimestamp(f.schArvDtUtc),
      fleet: f.fleet,
      register: f.register ?? null,
    }))
  }

  return {
    pairings: [...pairings, ...appendedPairings],
    pairingSegments: [...pairingSegments, ...appendedSegments],
    flights: [...flights, ...appendedFlights],
    assignments: remapAssignments(),
  }
}

async function loadPoScenarioPairingGeometry(
  fastify: FastifyInstance,
  pairingScenarioId: number,
  scope: ScenarioPairingScope,
): Promise<{
  pairings: ScenarioGanttPairing[]
  pairingSegments: ScenarioGanttPairingSegment[]
}> {
  const sourceMeta = await fastify.db.execute<{ pairing_scenario_id: string | null }>(sql`
    SELECT pairing_scenario_id
    FROM ${sql.raw(liveSchema())}.scenario
    WHERE id = ${pairingScenarioId}
  `)
  const sourcePointer = Number(sourceMeta.rows[0]?.pairing_scenario_id ?? 0)
  const sourceScenarioId = sourcePointer > 0 ? sourcePointer : pairingScenarioId
  const scopeWhere = buildScenarioPairingScopeWhere({
    ...scope,
    compositionTable: `${scenarioSchema()}.pairing_composition`,
    compositionScenarioId: sourceScenarioId,
    includeDateRange: false,
  })
  const loadPairingRows = async (schema: string, scenarioId: number, source: ScenarioPairingSource): Promise<Array<{
    id: string
    pairing_label: string | null
    interface_id: string | null
    base: string | null
    fleet: string | null
    sch_str: string | null
    sch_end: string | null
    act_str: string | null
    act_end: string | null
    assignment_group: string | null
    assignment: string | null
    division: string | null
    source: ScenarioPairingSource
  }>> => {
    const res = await fastify.db.execute<{
      id: string
      pairing_label: string | null
      interface_id: string | null
      base: string | null
      fleet: string | null
      sch_str: string | null
      sch_end: string | null
      act_str: string | null
      act_end: string | null
      assignment_group: string | null
      assignment: string | null
      division: string | null
    }>(sql`
    SELECT id, pairing_label, interface_id, base, fleet,
      to_char(sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS sch_str,
      to_char(sch_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS sch_end,
      to_char(act_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS act_str,
      to_char(act_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS act_end,
      assignment_group, assignment, division
    FROM ${sql.raw(schema)}.pairing pairing
      WHERE scenario_id = ${scenarioId} AND is_deleted = 0 AND ${scopeWhere}
  `)
    return res.rows.map((row) => ({ ...row, source }))
  }

  const pairRows = [
    ...await loadPairingRows(scenarioSchema(), sourceScenarioId, 'scenario'),
  ]
  if (pairRows.length === 0) return { pairings: [], pairingSegments: [] }
  const usedDisplayIds = new Set<number>()
  const displayBySourcePairing = new Map<string, number>()
  for (const row of pairRows) {
    const sourcePairingId = Number(row.id)
    const displayId = allocateDisplayPairingId(sourcePairingId, usedDisplayIds)
    displayBySourcePairing.set(sourcePairingKey(row.source, sourcePairingId), displayId)
  }
  const scenarioPairingIds = pairRows.filter((row) => row.source === 'scenario').map((row) => Number(row.id))
  const livePairingIds = pairRows.filter((row) => row.source === 'live').map((row) => Number(row.id))

  const loadCompositionRows = async (schema: string, scenarioId: number, source: ScenarioPairingSource, ids: number[]): Promise<Array<{
    pairing_id: string
    acting_rank: string | null
    plan: string | number | null
    fill: string | number | null
    source: ScenarioPairingSource
  }>> => {
    if (ids.length === 0) return []
    const res = await fastify.pgPool.query<{
      pairing_id: string
      acting_rank: string | null
      plan: string | number | null
      fill: string | number | null
    }>(
    `SELECT pairing_id, acting_rank, plan, fill
      FROM ${schema}.pairing_composition
      WHERE scenario_id = $1 AND pairing_id = ANY($2::bigint[]) AND is_deleted = 0`,
      [scenarioId, ids],
    )
    return res.rows.map((row) => ({ ...row, source }))
  }
  const compRows = [
    ...await loadCompositionRows(scenarioSchema(), sourceScenarioId, 'scenario', scenarioPairingIds),
    ...await loadCompositionRows(liveSchema(), 0, 'live', livePairingIds),
  ]
  const compsByPairing = new Map<number, ScenarioGanttCompositionSlot[]>()
  for (const row of compRows) {
    const pairingId = displayBySourcePairing.get(sourcePairingKey(row.source, Number(row.pairing_id)))
    if (pairingId == null) continue
    const list = compsByPairing.get(pairingId) ?? []
    list.push({
      rank: row.acting_rank ?? '',
      plan: Number(row.plan ?? 0),
      fill: Number(row.fill ?? 0),
    })
    compsByPairing.set(pairingId, list)
  }

  const loadSegmentRows = async (
    schema: string,
    scenarioId: number,
    source: ScenarioPairingSource,
    ids: number[],
  ): Promise<Array<Record<string, string | null> & { source: ScenarioPairingSource }>> => {
    if (ids.length === 0) return []
    const res = await fastify.pgPool.query<Record<string, string | null>>(
    `SELECT pairing_id, duty_seq, seg_seq, flt_id, flt_dt::text AS flt_dt, flt_num, airline,
        dep_arp, arv_arp, seg_assignment,
        to_char(sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS sch_str,
        to_char(sch_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS sch_end,
        to_char(act_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS act_str,
        to_char(act_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS act_end,
        duty_str_arp, duty_end_arp,
        to_char(duty_sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS duty_sch_str,
        to_char(duty_sch_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS duty_sch_end,
        duty_sch_rest_min, duty_act_rest_min, duty_act_credited_minutes,
        to_char(brief_start_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS brief_start,
        to_char(brief_end_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS brief_end,
        to_char(debrief_start_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS debrief_start,
        to_char(debrief_end_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS debrief_end,
        to_char(pickup_start_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS pickup_start,
        to_char(pickup_end_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS pickup_end,
        to_char(dropoff_start_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS dropoff_start,
        to_char(dropoff_end_utc, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS dropoff_end
      FROM ${schema}.pairing_segment
      WHERE scenario_id = $1 AND pairing_id = ANY($2::bigint[]) AND is_deleted = 0`,
      [scenarioId, ids],
    )
    return res.rows.map((row) => ({ ...row, source }))
  }
  const segRows = [
    ...await loadSegmentRows(scenarioSchema(), sourceScenarioId, 'scenario', scenarioPairingIds),
    ...await loadSegmentRows(liveSchema(), 0, 'live', livePairingIds),
  ]
  const numOrNull = (v: string | null): number | null => (v != null && v !== '' ? Number(v) : null)

  return {
    pairings: pairRows.map((row) => {
      const sourcePairingId = Number(row.id)
      const pairingId = displayBySourcePairing.get(sourcePairingKey(row.source, sourcePairingId)) ?? sourcePairingId
      return {
        pairingId,
        sourcePairingId,
        pairingSource: row.source,
        pairingLabel: row.pairing_label || null,
        interfaceId: row.interface_id ?? null,
        base: row.base ?? '',
        fleet: row.fleet ?? '',
    schStrDtUtc: row.sch_str ?? '',
    schEndDtUtc: row.sch_end ?? '',
    actStrDtUtc: row.act_str ?? '',
    actEndDtUtc: row.act_end ?? '',
        assignmentGroup: row.assignment_group ?? '',
        assignment: row.assignment ?? '',
        division: row.division ?? '',
        compositions: compsByPairing.get(pairingId) ?? [],
      }
    }),
    pairingSegments: segRows.map((row) => ({
      pairingId: displayBySourcePairing.get(sourcePairingKey(row.source, Number(row.pairing_id))) ?? Number(row.pairing_id),
      dutySeq: Number(row.duty_seq),
      segSeq: Number(row.seg_seq),
      fltId: row.flt_id ? Number(row.flt_id) : null,
      fltDt: row.flt_dt || null,
      fltNum: row.flt_num ?? '',
      airline: row.airline ?? '',
      depArp: row.dep_arp ?? '',
      arvArp: row.arv_arp ?? '',
      segAssignment: row.seg_assignment ?? 'FLT',
      schStrDtUtc: row.sch_str ?? '',
      schEndDtUtc: row.sch_end ?? '',
      actStrDtUtc: row.act_str ?? '',
      actEndDtUtc: row.act_end ?? '',
      dutyStrArp: row.duty_str_arp ?? '',
      dutyEndArp: row.duty_end_arp ?? '',
      dutySchStrDtUtc: row.duty_sch_str ?? '',
      dutySchEndDtUtc: row.duty_sch_end ?? '',
      brief1StartUtc: row.brief_start ?? '',
      brief1EndUtc: row.brief_end ?? '',
      debrief1StartUtc: row.debrief_start ?? '',
      debrief1EndUtc: row.debrief_end ?? '',
      pickup1StartUtc: row.pickup_start ?? '',
      pickup1EndUtc: row.pickup_end ?? '',
      dropoff1StartUtc: row.dropoff_start ?? '',
      dropoff1EndUtc: row.dropoff_end ?? '',
      dutySchRestMin: numOrNull(row.duty_sch_rest_min),
      dutyActRestMin: numOrNull(row.duty_act_rest_min),
      dutyActCreditedMinutes: numOrNull(row.duty_act_credited_minutes),
    })),
  }
}

/** Snapshot path — read stored input.gz + output.gz.
 *  Falls back to DB for PA item credit when input.gz has no roster_flight section
 *  (i.e. snapshots produced by the legacy Java exporter). */
export async function buildGanttDataSnapshot(
  fastify: FastifyInstance,
  sc: {
    id: number
    name: string | null
    taskId: string
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
    fileType: string
    rulesetId?: number | null
  },
  token: string,
  airline: string,
): Promise<ScenarioGanttData> {
  const [inputGz, outputGz] = await Promise.all([
    engineServerClient.fetchInputFile(sc.taskId, token, airline, sc.id),
    engineServerClient.fetchResultFile(sc.taskId, token, airline, sc.id),
  ])

  return buildGanttDataFromSnapshotFiles(fastify, sc, inputGz, outputGz)
}

export async function buildGanttDataFromSnapshotFiles(
  fastify: FastifyInstance,
  sc: {
    id: number
    name: string | null
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
    fileType: string
    rulesetId?: number | null
  },
  inputGz: Buffer,
  outputGz: Buffer,
): Promise<ScenarioGanttData> {
  const { crew, pairings } = parseCrewAndPairings(inputGz)
  await attachCrewHistories(fastify.db, crew, sc.strDtLoc, sc.endDtLoc)
  const sourcePairingKeys = new Set(pairings.map(pairingSourceKey))
  const rawAssignments = parseOptAssignments(outputGz)
  const creditLookup = buildRosterFlightCreditLookup(inputGz)
  let rawGroundItems = parseRosterGroundItems(outputGz, creditLookup)

  // If input.gz had no roster_flight section (legacy Java snapshot), supplement credit from DB.
  if (creditLookup.size === 0) {
    const needCredit = rawGroundItems.filter((g) => g.source === 'PA' && g.actCreditedMinutes == null)
    if (needCredit.length > 0) {
      const pairs = needCredit.map((g) => sql`(${g.crewId}, ${normUtcMin(g.schStrDtUtc)}::timestamp)`)
      const rows = await fastify.db.execute<{ crew_id: string; sch_str_dt_utc: string; max_credit: string }>(
        sql`SELECT crew_id,
              to_char(sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI') AS sch_str_dt_utc,
              MAX(act_credited_minutes) AS max_credit
            FROM roster_flight
            WHERE pairing_id IS NULL AND is_deleted = 0
              AND (crew_id, sch_str_dt_utc) IN (${sql.join(pairs, sql`, `)})
            GROUP BY crew_id, sch_str_dt_utc`
      )
      const dbCredit = new Map<string, number>()
      for (const r of rows.rows) {
        const num = Number(r.max_credit)
        if (Number.isFinite(num) && num > 0) {
          dbCredit.set(`${r.crew_id}|${r.sch_str_dt_utc}`, num)
        }
      }
      if (dbCredit.size > 0) {
        rawGroundItems = rawGroundItems.map((g) => {
          if (g.actCreditedMinutes != null) return g
          const credit = dbCredit.get(`${g.crewId}|${normUtcMin(g.schStrDtUtc)}`)
          return credit != null ? { ...g, actCreditedMinutes: credit } : g
        })
      }
    }
  }
  const pairingSegments = parsePairingSegments(inputGz)
  const flights = filterFlightsByPairingSegments(parseFlights(inputGz), pairingSegments)

  const { assignments, groundItems } = injectSbyAssignments(pairings, pairingSegments, rawGroundItems, rawAssignments)
  const pruned = pruneUnreferencedReservePairings(
    recomputeCompositionFill(pairings, assignments, crew),
    pairingSegments,
    flights,
    assignments,
    sourcePairingKeys,
  )
  const rosterDutyRefs = await loadScenarioRosterDutyRefs(
    fastify,
    sc.id,
    pruned.pairings.map((pairing) => pairing.pairingId),
  )
  const { strDtLoc, endDtLoc } = deriveDateRange(pruned.pairings, sc.strDtLoc, sc.endDtLoc)

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    fileType: (sc.fileType as 'PO' | 'RO' | 'TO') ?? 'PO',
    rulesetId: sc.rulesetId ?? null,
    capabilities: capabilitiesFromDict([], sc.fileType),
    strDtLoc,
    endDtLoc,
    scenarioStrDt: new Date(sc.strDtLoc).toISOString(),
    scenarioEndDt: new Date(sc.endDtLoc).toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'snapshot',
    crew,
    pairings: pruned.pairings,
    assignments,
    pairingSegments: pruned.pairingSegments,
    ...(rosterDutyRefs.length > 0 ? { rosterDutyRefs } : {}),
    flights: pruned.flights,
    groundItems,
    crewStats: {},
  }
}

/** Live-refresh path — regenerate input from live DB + fetch output.gz. */
export async function buildGanttDataLiveRefresh(
  fastify: FastifyInstance,
  sc: {
    id: number
    name: string | null
    taskId: string
    worksetId: number
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
    filterParams: Record<string, unknown>
    rulesetId: number
    fileType: string
  },
  token: string,
  airline: string,
): Promise<ScenarioGanttData> {
  const scenarioRow: ScenarioRow = {
    id: sc.id,
    worksetId: sc.worksetId,
    strDtLoc: sc.strDtLoc,
    endDtLoc: sc.endDtLoc,
    filterParams: sc.filterParams,
    rulesetId: sc.rulesetId,
    fileType: sc.fileType,
    division: (sc as { division?: string | null }).division ?? 'P',
  }

  const [inputGz, outputGz] = await Promise.all([
    buildRoInputGz(fastify, scenarioRow),
    engineServerClient.fetchResultFile(sc.taskId, token, airline, sc.id),
  ])

  const { crew, pairings } = parseCrewAndPairings(inputGz, 'live')
  await attachCrewHistories(fastify.db, crew, sc.strDtLoc, sc.endDtLoc)
  const sourcePairingKeys = new Set(pairings.map(pairingSourceKey))
  const rawOptAssignments = parseOptAssignments(outputGz)
  const rawGroundItems = parseRosterGroundItems(outputGz)
  const pairingSegments = parsePairingSegments(inputGz)
  const flights = filterFlightsByPairingSegments(parseFlights(inputGz), pairingSegments)

  const { assignments: optAssignments, groundItems: optGroundItems } =
    injectSbyAssignments(pairings, pairingSegments, rawGroundItems, rawOptAssignments)

  // Live PA for lead-in + official period (not full history). In-period rows
  // keep RO pairing geometry; lead-in-only rings get mergeLeadinPairingGeometry.
  const { leadStart, loadEndExclusive } = livePaWindowBounds(sc.strDtLoc, sc.endDtLoc)
  const { assignments: leadinAssignments, groundItems: leadinGroundItems } =
    await loadLeadinFromLive(fastify.db, crew.map((c) => c.crewId), leadStart, loadEndExclusive)

  const merged = await mergeLeadinPairingGeometry(
    fastify.db,
    pairings,
    pairingSegments,
    flights,
    leadinAssignments,
  )
  const allAssignments = [...optAssignments, ...merged.assignments]
  const pruned = pruneUnreferencedReservePairings(
    recomputeCompositionFill(merged.pairings, allAssignments, crew),
    merged.pairingSegments,
    merged.flights,
    allAssignments,
    sourcePairingKeys,
    new Set(selectedPairingTypes(sc.filterParams).filter((type) => RESERVE_PAIRING_GROUPS.has(type))),
  )
  const rosterDutyRefs = await loadScenarioRosterDutyRefs(
    fastify,
    sc.id,
    pruned.pairings.map((pairing) => pairing.pairingId),
  )
  const { strDtLoc, endDtLoc } = deriveDateRange(pruned.pairings, sc.strDtLoc, sc.endDtLoc)

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    fileType: (sc.fileType as 'PO' | 'RO' | 'TO') ?? 'PO',
    rulesetId: sc.rulesetId ?? null,
    capabilities: capabilitiesFromDict([], sc.fileType),
    strDtLoc,
    endDtLoc,
    scenarioStrDt: new Date(sc.strDtLoc).toISOString(),
    scenarioEndDt: new Date(sc.endDtLoc).toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'live-refresh',
    crew,
    pairings: pruned.pairings,
    assignments: allAssignments,
    pairingSegments: pruned.pairingSegments,
    ...(rosterDutyRefs.length > 0 ? { rosterDutyRefs } : {}),
    flights: pruned.flights,
    groundItems: [...optGroundItems, ...leadinGroundItems],
    crewStats: {},
  }
}

/** Seed view for DRAFT/FAILED RO scenarios with no loaded roster.
 *  Renders the RO input (scope-resolved crew/pairings/segments/flights) with NO optimizer
 *  output, plus read-only pre-occupied assignments from the live roster. */
export async function buildGanttDataSeed(
  fastify: FastifyInstance,
  sc: {
    id: number
    name: string | null
    worksetId: number
    strDtLoc: Date
    endDtLoc: Date
    leadinLive: number
    filterParams: Record<string, unknown>
    rulesetId: number
    fileType: string
    pairingScenarioId?: number | null
  },
): Promise<ScenarioGanttData> {
  const scenarioRow: ScenarioRow = {
    id: sc.id,
    worksetId: sc.worksetId,
    strDtLoc: sc.strDtLoc,
    endDtLoc: sc.endDtLoc,
    filterParams: sc.filterParams,
    rulesetId: sc.rulesetId,
    fileType: sc.fileType,
    division: (sc as { division?: string | null }).division ?? 'P',
  }

  const inputGz = await buildRoInputGz(fastify, scenarioRow)
  const { crew, pairings } = parseCrewAndPairings(inputGz, 'live')
  await attachCrewHistories(fastify.db, crew, sc.strDtLoc, sc.endDtLoc)
  let sourcePairings = pairings
  let sourcePairingKeys = new Set(sourcePairings.map(pairingSourceKey))
  let pairingSegments = parsePairingSegments(inputGz)
  let flights = filterFlightsByPairingSegments(parseFlights(inputGz), pairingSegments)

  if (sc.fileType === 'RO' && Number(sc.pairingScenarioId ?? 0) > 0) {
    const fp = (sc.filterParams ?? {}) as Record<string, Record<string, unknown>>
    const pairingFilter = (fp.pairing ?? {}) as Record<string, unknown>
    const duration = (pairingFilter.duration ?? {}) as Record<string, unknown>
    const poGeometry = await loadPoScenarioPairingGeometry(fastify, Number(sc.pairingScenarioId), {
      strDtLoc: sc.strDtLoc,
      endDtLoc: sc.endDtLoc,
      division: normalizeCrewDivision((sc as { division?: string | null }).division ?? 'P'),
      bases: (pairingFilter.bases as string[] | undefined) ?? [],
      ranks: (pairingFilter.ranks as string[] | undefined) ?? [],
      fleets: (pairingFilter.fleets as string[] | undefined) ?? [],
      types: (pairingFilter.types as string[] | undefined) ?? [],
      duration: {
        min: numberOrNull(duration.min),
        max: numberOrNull(duration.max),
      },
    })
    sourcePairings = poGeometry.pairings
    sourcePairingKeys = new Set(sourcePairings.map(pairingSourceKey))
    pairingSegments = poGeometry.pairingSegments
    flights = []
  }

  // Seed has no optimizer roster — load Live PA for lead-in + official period.
  // Geometry merge fills June-only rings missing from the RO pairing window.
  const { leadStart, loadEndExclusive } = livePaWindowBounds(sc.strDtLoc, sc.endDtLoc)
  const leadin = await loadLeadinFromLive(
    fastify.db,
    crew.map((c) => c.crewId),
    leadStart,
    loadEndExclusive,
  )

  const merged = await mergeLeadinPairingGeometry(
    fastify.db,
    sourcePairings,
    pairingSegments,
    flights,
    leadin.assignments,
  )

  const { assignments, groundItems } =
    injectSbyAssignments(merged.pairings, merged.pairingSegments, leadin.groundItems, merged.assignments)
  const pruned = pruneUnreferencedReservePairings(
    recomputeCompositionFill(merged.pairings, assignments, crew),
    merged.pairingSegments,
    merged.flights,
    assignments,
    sourcePairingKeys,
    new Set(selectedPairingTypes(sc.filterParams).filter((type) => RESERVE_PAIRING_GROUPS.has(type))),
  )
  const { strDtLoc, endDtLoc } = deriveDateRange(pruned.pairings, sc.strDtLoc, sc.endDtLoc)

  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    fileType: (sc.fileType as 'PO' | 'RO' | 'TO') ?? 'RO',
    rulesetId: sc.rulesetId ?? null,
    capabilities: capabilitiesFromDict([], sc.fileType),
    strDtLoc,
    endDtLoc,
    scenarioStrDt: new Date(sc.strDtLoc).toISOString(),
    scenarioEndDt: new Date(sc.endDtLoc).toISOString(),
    leadinLive: sc.leadinLive,
    dataSource: 'seed',
    readOnly: true,
    crew,
    pairings: pruned.pairings,
    assignments,
    pairingSegments: pruned.pairingSegments,
    flights: pruned.flights,
    groundItems,
    crewStats: {},
  }
}
