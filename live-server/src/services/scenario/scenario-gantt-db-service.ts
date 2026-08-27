// DB-backed scenario Gantt assembly.
//
// Reads the partition-backed `scenario` schema (and live `f8.*` for partition 0)
// to produce the exact `ScenarioGanttData` shape the gz path emits. The frontend
// cannot tell which source produced the payload.

import { sql, type SQL } from 'drizzle-orm'
import type { drizzle } from 'drizzle-orm/node-postgres'
import {
  deriveDateRange,
  injectSbyAssignments,
  mergeLeadinPairingGeometry,
  pruneUnreferencedReservePairings,
  recomputeCompositionFill,
  type ScenarioGanttData,
  type ScenarioGanttCrew,
  type ScenarioGanttPairing,
  type ScenarioGanttCompositionSlot,
  type ScenarioGanttAssignment,
  type ScenarioGanttPairingSegment,
  type ScenarioGanttFlight,
  type ScenarioGanttGroundItem,
  type ScenarioMonthStats,
} from './scenario-gantt-service.js'
import { resolvePartitions } from './scenario-partition.js'
import { attachCrewHistories } from './scenario-crew-history.js'
import { capabilitiesFromDict } from './scenario-capabilities.js'
import { filterPairingsByCrewDivision } from './pairing-division-filter.js'
import { normalizeCrewDivision } from './filter-params-normalize.js'
import { buildScenarioPairingScopeWhere } from './pairing-scope-filter.js'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'
import { normalizeRosterSource } from '../../routes/scenario/scenario.js'
import { crewIdSet } from './scenario-crew-scope.js'

type Db = ReturnType<typeof drizzle>

/** Roster is always scenario-scoped, keyed by the scenario's own id. */
const rosterTable = (): string => `${scenarioSchema()}.roster_flight`

/** scenario timestamp columns hold UTC wall-clock; read as text + 'Z' so node-pg never reinterprets them as local. */
const utc = (col: string, alias: string): string =>
  `to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS') || 'Z' AS ${alias}`

const RESERVE_PAIRING_GROUPS = new Set(['RES', 'SBY'])

const selectedPairingTypes = (filterParams: Record<string, unknown> | null | undefined): string[] => {
  const fp = (filterParams ?? {}) as Record<string, Record<string, unknown>>
  const pairingFilter = (fp.pairing ?? {}) as Record<string, unknown>
  return ((pairingFilter.types as string[] | undefined) ?? []).map((value) => String(value).toUpperCase())
}

/** Inline a numeric id array as a bigint[] literal (values are DB-sourced numbers — safe). */
const bigintArray = (ids: number[]): ReturnType<typeof sql.raw> =>
  sql.raw(`ARRAY[${ids.join(',')}]::bigint[]`)

/** `ANY(ARRAY[$1,$2,...]::text[])` with the ids bound as parameters (safe for arbitrary strings). */
const anyTextArray = (ids: string[]) =>
  sql`ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::text[])`

const bigintArrayWhere = (column: string, ids: number[]): SQL =>
  ids.length > 0 ? sql`${sql.raw(column)} = ANY(${bigintArray(ids)})` : sql`FALSE`

const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

/**
 * Per-crew per-month manday stats from `scenario.crew_manday_{fd,cc_am}_monthly`.
 * crewId → yearMonth → { credit, dayOffCount, alCount, leaveCount } (credit in minutes).
 */
export const computeScenarioCrewStatsFromDb = async (
  db: Db,
  scenarioId: number,
  crewIds?: string[],
): Promise<Record<string, Record<string, ScenarioMonthStats>>> => {
  const scopedCrewIds = crewIds?.filter(Boolean) ?? []
  const crewFilter = scopedCrewIds.length > 0
    ? sql` AND crew_id = ANY(${scopedCrewIds})`
    : sql``
  const out: Record<string, Record<string, ScenarioMonthStats>> = {}
  const put = (
    crewId: string,
    ym: string,
    credit: number,
    dayOff: number,
    al: number,
    leave: number
  ): void => {
    ;(out[crewId] ??= {})[ym] = {
      credit,
      dayOffCount: dayOff,
      alCount: al,
      leaveCount: leave,
    }
  }

  const fd = await db.execute<{
    crew_id: string
    roster_period: string
    credit: string
    is_day_off: number
    is_al: number
  }>(sql`
    SELECT crew_id, roster_period, credit, is_day_off, is_al
    FROM ${sql.raw(scenarioSchema())}.crew_manday_fd_period
    WHERE scenario_id = ${scenarioId}${crewFilter}
  `)
  for (const r of fd.rows) {
    put(r.crew_id, r.roster_period, Number(r.credit), Number(r.is_day_off), Number(r.is_al), 0)
  }

  const cc = await db.execute<{
    crew_id: string
    roster_period: string
    credit: string
    is_day_off: number
    is_leave: number
  }>(sql`
    SELECT crew_id, roster_period, credit, is_day_off, is_leave
    FROM ${sql.raw(scenarioSchema())}.crew_manday_cc_am_period
    WHERE scenario_id = ${scenarioId}${crewFilter}
  `)
  for (const r of cc.rows) {
    put(r.crew_id, r.roster_period, Number(r.credit), Number(r.is_day_off), 0, Number(r.is_leave))
  }

  return out
}

export interface ScenarioDbMeta {
  id: number
  name: string | null
  strDtLoc: Date
  endDtLoc: Date
  leadinLive: number
  fileType: string
  pairingScenarioId: number
  flightScenarioId: number
  filterParams?: Record<string, unknown> | null
  division?: string | null
  rulesetId?: number | null
}

/**
 * Assemble the exact `ScenarioGanttData` the gz path produces, but sourced from
 * the partition-backed DB. Roster (assignments + ground) always comes from
 * `scenario.roster_flight` keyed by the scenario id; pairings/segments/flights
 * are resolved to live `f8.*` (partition 0) or a frozen `scenario.*` copy via
 * `resolvePartitions`. The only differences vs the gz path: table names are
 * partition-resolved and `dataSource = 'db'`.
 */
export const buildGanttDataFromDb = async (
  db: Db,
  sc: ScenarioDbMeta
): Promise<ScenarioGanttData> => {
  const isPairingOnlyPo = sc.fileType === 'PO'
  const r = resolvePartitions({
    id: sc.id,
    pairingScenarioId: isPairingOnlyPo && sc.pairingScenarioId === 0 ? sc.id : sc.pairingScenarioId,
    flightScenarioId: isPairingOnlyPo && sc.flightScenarioId === 0 ? sc.id : sc.flightScenarioId,
  })
  const sourcePairingSource = r.pairingTable.startsWith(scenarioSchema()) ? 'scenario' : 'live'
  const flightPartColumn = r.flightTable.startsWith(scenarioSchema()) ? 'scenario_id' : 'sch_id'
  const roster = rosterTable()

  // ── assignments (pairing-linked roster rows) ──
  const rawAssignments: ScenarioGanttAssignment[] = isPairingOnlyPo
    ? []
    : (await db.execute<{
        crew_id: string
        pairing_id: string
        source: string | null
        active_rank: string | null
        roster_acting_rank: string | null
        flight_acting_rank: string | null
      }>(sql`
        SELECT crew_id, pairing_id, source,
          max(active_rank) AS active_rank,
          max(roster_acting_rank) AS roster_acting_rank,
          max(flight_acting_rank) AS flight_acting_rank
        FROM ${sql.raw(roster)}
        WHERE scenario_id = ${sc.id} AND pairing_id IS NOT NULL AND is_deleted = 0
        GROUP BY crew_id, pairing_id, source
      `)).rows.map((row) => {
        const source = normalizeRosterSource(row.source)
        const sourcePairingId = Number(row.pairing_id)
        const pairingSource = source === 'PA' ? 'live' : sourcePairingSource
        return {
          crewId: row.crew_id,
          pairingId: sourcePairingId,
          source,
          crewRank: row.active_rank,
          rosterActingRank: row.roster_acting_rank,
          flightActingRank: row.flight_acting_rank,
          rank: row.roster_acting_rank,
          sourcePairingId,
          pairingSource,
        }
      })

  // ── ground items (pairing-less roster rows) ──
  const rawGroundItems: ScenarioGanttGroundItem[] = isPairingOnlyPo
    ? []
    : (await db.execute<{
        crew_id: string
        base: string | null
        dep_arp: string | null
        arv_arp: string | null
        assignment_group: string | null
        assignment: string | null
        label: string | null
        sch_str: string
        sch_end: string
        flight_acting_rank: string | null
        source: string | null
        act_credited_minutes: string | null
        dp_min: number | null
      }>(sql`
        SELECT crew_id, base, dep_arp, arv_arp, assignment_group, assignment, label,
          ${sql.raw(utc('sch_str_dt_utc', 'sch_str'))},
          ${sql.raw(utc('sch_end_dt_utc', 'sch_end'))},
          flight_acting_rank, source, act_credited_minutes, dp_min
        FROM ${sql.raw(roster)}
        WHERE scenario_id = ${sc.id} AND pairing_id IS NULL AND is_deleted = 0
          AND sch_str_dt_utc IS NOT NULL AND sch_end_dt_utc IS NOT NULL
      `)).rows.map((row) => ({
        crewId: row.crew_id,
        base: row.base || '',
        depArp: row.dep_arp || row.base || '',
        arvArp: row.arv_arp || '',
        assignmentGroup: row.assignment_group || 'GRD',
        assignment: row.assignment || row.assignment_group || 'GRD',
        label: row.label ?? null,
        schStrDtUtc: row.sch_str,
        schEndDtUtc: row.sch_end,
        actingRank: row.flight_acting_rank || '',
        source: normalizeRosterSource(row.source),
        actCreditedMinutes:
          row.act_credited_minutes != null && Number.isFinite(Number(row.act_credited_minutes))
            ? Number(row.act_credited_minutes)
            : undefined,
        dpMin: row.dp_min != null && Number.isFinite(Number(row.dp_min)) ? Number(row.dp_min) : undefined,
      }))

  const fp = (sc.filterParams ?? {}) as Record<string, Record<string, unknown>>
  const pairingFilter = (fp.pairing ?? {}) as Record<string, unknown>
  const bases = (pairingFilter.bases as string[] | undefined) ?? []
  const ranks = (pairingFilter.ranks as string[] | undefined) ?? []
  const fleets = (pairingFilter.fleets as string[] | undefined) ?? []
  const types = (pairingFilter.types as string[] | undefined) ?? []
  const duration = (pairingFilter.duration ?? {}) as Record<string, unknown>
  const sourcePairingIdWhere = (() => {
    if (isPairingOnlyPo) return sql`TRUE`
    return buildScenarioPairingScopeWhere({
      strDtLoc: sc.strDtLoc,
      endDtLoc: sc.endDtLoc,
      division: normalizeCrewDivision(sc.division),
      bases,
      ranks,
      fleets,
      types,
      duration: {
        min: numberOrNull(duration.min),
        max: numberOrNull(duration.max),
      },
      compositionTable: r.compositionTable,
      compositionScenarioId: r.pairingPart,
      includeDateRange: sourcePairingSource === 'live',
    })
  })()

  const sourcePairingRes = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM ${sql.raw(r.pairingTable)} pairing
    WHERE scenario_id = ${r.pairingPart}
      AND ${sourcePairingIdWhere}
      AND is_deleted = 0
  `)
  const sourcePairingIds = sourcePairingRes.rows.map((row) => Number(row.id))
  const sourcePairingKeys = new Set(
    sourcePairingIds.map((id) => `${sourcePairingSource}:${id}`),
  )

  const referencedPairingIds = [...new Set([
    ...sourcePairingIds,
    ...rawAssignments
      .filter((assignment) => (assignment.pairingSource ?? sourcePairingSource) === sourcePairingSource)
      .map((assignment) => assignment.sourcePairingId ?? assignment.pairingId),
  ])]
  const pairingWhere = bigintArrayWhere('id', referencedPairingIds)
  const pairingIdWhere = bigintArrayWhere('pairing_id', referencedPairingIds)
  const rosterDutyRefs: ScenarioGanttData['rosterDutyRefs'] = isPairingOnlyPo || referencedPairingIds.length === 0
    ? []
    : (await db.execute<{
        crew_id: string
        pairing_id: string
        duty_seq: string
        duty_ref_tz: string | null
      }>(sql`
        SELECT crew_id, pairing_id, duty_seq, duty_ref_tz
        FROM ${sql.raw(roster)}
        WHERE scenario_id = ${sc.id}
          AND pairing_id = ANY(${bigintArray(referencedPairingIds)})
          AND duty_seq IS NOT NULL
          AND is_deleted = 0
        GROUP BY crew_id, pairing_id, duty_seq, duty_ref_tz
        ORDER BY crew_id, pairing_id, duty_seq
      `)).rows.map((row) => ({
        crewId: row.crew_id,
        pairingId: Number(row.pairing_id),
        dutySeq: Number(row.duty_seq),
        dutyRefTz: numberOrNull(row.duty_ref_tz),
      }))

  // ── pairings + compositions (partition-resolved) ──
  const pairRes = await db.execute<{
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
      ${sql.raw(utc('sch_str_dt_utc', 'sch_str'))},
      ${sql.raw(utc('sch_end_dt_utc', 'sch_end'))},
      ${sql.raw(utc('act_str_dt_utc', 'act_str'))},
      ${sql.raw(utc('act_end_dt_utc', 'act_end'))},
      assignment_group, assignment, division
    FROM ${sql.raw(r.pairingTable)}
    WHERE scenario_id = ${r.pairingPart}
      AND ${pairingWhere}
      AND is_deleted = 0
  `)

  const compRes = await db.execute<{ pairing_id: string; acting_rank: string | null; plan: number; fill: number }>(sql`
    SELECT pairing_id, acting_rank, plan, fill
    FROM ${sql.raw(r.compositionTable)}
    WHERE scenario_id = ${r.pairingPart}
      AND ${pairingIdWhere}
      AND is_deleted = 0
  `)
  const compsByPairing = new Map<number, ScenarioGanttCompositionSlot[]>()
  for (const row of compRes.rows) {
    const pid = Number(row.pairing_id)
    const list = compsByPairing.get(pid) ?? []
    list.push({ rank: row.acting_rank ?? '', plan: Number(row.plan ?? 0), fill: Number(row.fill ?? 0) })
    compsByPairing.set(pid, list)
  }

  const pairings: ScenarioGanttPairing[] = pairRes.rows.map((row) => {
    const pid = Number(row.id)
    return {
      pairingId: pid,
      sourcePairingId: pid,
      pairingSource: sourcePairingSource,
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
      compositions: compsByPairing.get(pid) ?? [],
    }
  })

  // ── pairing segments ──
  const segRes = await db.execute<Record<string, string | null>>(sql`
    SELECT ps.pairing_id, ps.duty_seq, ps.seg_seq, ps.flt_id, ps.flt_dt::text AS flt_dt, ps.flt_num, ps.airline,
      ps.dep_arp, ps.arv_arp, ps.seg_assignment,
      ${sql.raw(utc('ps.sch_str_dt_utc', 'sch_str'))},
      ${sql.raw(utc('ps.sch_end_dt_utc', 'sch_end'))},
      ${sql.raw(utc('ps.act_str_dt_utc', 'act_str'))},
      ${sql.raw(utc('ps.act_end_dt_utc', 'act_end'))},
      ps.duty_str_arp, ps.duty_end_arp,
      ${sql.raw(utc('ps.duty_sch_str_dt_utc', 'duty_sch_str'))},
      ${sql.raw(utc('ps.duty_sch_end_dt_utc', 'duty_sch_end'))},
      ps.duty_sch_rest_min, ps.duty_act_rest_min, ps.duty_act_credited_minutes,
      ${sql.raw(utc('ps.brief_start_utc', 'brief_start'))},
      ${sql.raw(utc('ps.brief_end_utc', 'brief_end'))},
      ${sql.raw(utc('ps.debrief_start_utc', 'debrief_start'))},
      ${sql.raw(utc('ps.debrief_end_utc', 'debrief_end'))},
      ${sql.raw(utc('ps.pickup_start_utc', 'pickup_start'))},
      ${sql.raw(utc('ps.pickup_end_utc', 'pickup_end'))},
      ${sql.raw(utc('ps.dropoff_start_utc', 'dropoff_start'))},
      ${sql.raw(utc('ps.dropoff_end_utc', 'dropoff_end'))}
    FROM ${sql.raw(r.segmentTable)} ps
    WHERE ps.scenario_id = ${r.pairingPart}
      AND ${pairingIdWhere}
      AND ps.is_deleted = 0
  `)
  const numOrNull = (v: string | null): number | null => (v != null && v !== '' ? Number(v) : null)
  const pairingSegments: ScenarioGanttPairingSegment[] = segRes.rows.map((row) => ({
    pairingId: Number(row.pairing_id),
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
  }))

  const { strDtLoc, endDtLoc } = deriveDateRange(pairings, sc.strDtLoc, sc.endDtLoc)

  // ── flights (Flight-pane dataset; only flights referenced by scoped pairings) ──
  const scopedFlightIds = [
    ...new Set(pairingSegments.map((segment) => segment.fltId).filter((id): id is number => id != null)),
  ]
  const flightRows = scopedFlightIds.length === 0
    ? []
    : (await db.execute<{
    id: string
    flt_num: string | null
    dep_arp: string | null
    arv_arp: string | null
    sch_dep: string | null
    sch_arv: string | null
      fleet: string | null
      register: string | null
    }>(sql`
      SELECT id, flt_num, dep_arp, arv_arp,
      ${sql.raw(utc('sch_dep_dt_utc', 'sch_dep'))},
      ${sql.raw(utc('sch_arv_dt_utc', 'sch_arv'))},
        fleet, register
      FROM ${sql.raw(r.flightTable)}
      WHERE ${sql.raw(flightPartColumn)} = ${r.flightPart}
        AND id = ANY(${bigintArray(scopedFlightIds)})
    `)).rows
  const flights: ScenarioGanttFlight[] = flightRows.map((row) => ({
    id: Number(row.id),
    fltNum: row.flt_num ?? '',
    depArp: row.dep_arp ?? '',
    arvArp: row.arv_arp ?? '',
    schDepDtUtc: row.sch_dep ?? '',
    schArvDtUtc: row.sch_arv ?? '',
    fleet: row.fleet ?? '',
    register: row.register || null,
  }))

  // ── crew (always live f8.*) ──
  // Crew visibility is owned by Scenario Crew Filter, not by whether the
  // optimizer emitted a task for that crew. Empty crews must remain visible.
  const crewIds = isPairingOnlyPo
    ? []
    : (await db.execute<{ crew_id: string }>(sql`
        SELECT crew_id
        FROM ${sql.raw(liveSchema())}.crew
        WHERE crew_id IN (${crewIdSet(sc, liveSchema())})
        ORDER BY crew_id
      `)).rows.map((row) => row.crew_id)
  const crew = isPairingOnlyPo ? [] : await buildCrew(db, crewIds)
  if (crew.length > 0) await attachCrewHistories(db, crew, sc.strDtLoc, sc.endDtLoc)

  const crewStats = isPairingOnlyPo ? {} : await computeScenarioCrewStatsFromDb(db, sc.id)

  // ── parity transforms (same as gz path) ──
  const merged = await mergeLeadinPairingGeometry(
    db as Parameters<typeof mergeLeadinPairingGeometry>[0],
    pairings,
    pairingSegments,
    flights,
    rawAssignments,
    sourcePairingSource,
  )

  const { assignments, groundItems } = injectSbyAssignments(
    merged.pairings,
    merged.pairingSegments,
    rawGroundItems,
    merged.assignments,
  )
  const updatedPairings = recomputeCompositionFill(merged.pairings, assignments, crew)
  const pruned = pruneUnreferencedReservePairings(
    updatedPairings,
    merged.pairingSegments,
    merged.flights,
    assignments,
    sourcePairingKeys,
    new Set(selectedPairingTypes(sc.filterParams).filter((type) => RESERVE_PAIRING_GROUPS.has(type))),
  )
  const scopedPairings = filterPairingsByCrewDivision(crew, pruned.pairings)

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
    dataSource: 'db',
    crew,
    pairings: scopedPairings,
    assignments,
    pairingSegments: pruned.pairingSegments,
    rosterDutyRefs,
    flights: pruned.flights,
    groundItems,
    crewStats,
  }
}

/** Live crew with latest-effective base + rank for the given crew ids. */
const buildCrew = async (db: Db, crewIds: string[]): Promise<ScenarioGanttCrew[]> => {
  if (crewIds.length === 0) return []

  const baseRes = await db.execute<{ crew_id: string; base: string | null }>(sql`
    SELECT DISTINCT ON (crew_id) crew_id, base
    FROM ${sql.raw(liveSchema())}.crew_base
    WHERE crew_id = ${anyTextArray(crewIds)}
    ORDER BY crew_id, eff_dt DESC NULLS LAST
  `)
  const baseByCrew = new Map(baseRes.rows.map((row) => [row.crew_id, row.base ?? '']))

  const rankRes = await db.execute<{ crew_id: string; rank: string | null }>(sql`
    SELECT DISTINCT ON (crew_id) crew_id, rank
    FROM ${sql.raw(liveSchema())}.crew_rank
    WHERE crew_id = ${anyTextArray(crewIds)}
    ORDER BY crew_id, eff_dt DESC NULLS LAST
  `)
  const rankByCrew = new Map(rankRes.rows.map((row) => [row.crew_id, row.rank ?? '']))

  const crewRes = await db.execute<{
    crew_id: string
    first_name: string | null
    middle_name: string | null
    last_name: string | null
    division: string | null
    seniority_num: string | null
  }>(sql`
    SELECT crew_id, first_name, middle_name, last_name, division, seniority_num
    FROM ${sql.raw(liveSchema())}.crew
    WHERE crew_id = ${anyTextArray(crewIds)}
  `)
  const seen = new Set<string>()
  return crewRes.rows
    .map((row) => {
      const nameParts = [row.first_name, row.middle_name, row.last_name].filter(Boolean)
      return {
        crewId: row.crew_id,
        base: baseByCrew.get(row.crew_id) ?? '',
        division: row.division ?? '',
        crewRank: rankByCrew.get(row.crew_id) ?? '',
        rank: rankByCrew.get(row.crew_id) ?? '',
        seniorityNum: row.seniority_num || null,
        crewName: nameParts.length > 0 ? nameParts.join(' ') : null,
      }
    })
    .filter((c) => {
      if (seen.has(c.crewId)) return false
      seen.add(c.crewId)
      return true
    })
}
