import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from 'pg'
import { liveSchemaName, scenarioSchemaName, quoteIdentifier } from '../../utils/db-schema.js'

type LegalityContextType = 'live' | 'scenario'

type ScenarioCatalogQueryResult = {
  rows: unknown[]
}

type ScenarioCatalogQueryDb = {
  query: (query: string, values?: unknown[]) => Promise<ScenarioCatalogQueryResult>
}

export interface PreviewRosterItem {
  id: number
  crewId: string
  pairingId: number | null
  ver?: number | null
  base?: string | null
  label?: string | null
  assignmentGroup?: string | null
  assignment?: string | null
  role?: string | null
  subRole?: string | null
  source?: string | null
  isRequested?: number | null
  isSwapped?: number | null
  preference?: string | null
  comments?: string | null
  score?: number | null
  workingHour?: string | null
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  actStrDtUtc?: string | null
  actEndDtUtc?: string | null
  fltId?: number | null
  fltDt?: string | null
  dutySeq?: number | null
  segSeq?: number | null
  division?: string | null
  flightActingRank?: string | null
  rosterActingRank?: string | null
  activeRank?: string | null
  position?: string | null
  schCreditedMinutes?: string | number | null
  actCreditedMinutes?: string | number | null
  tagSet?: string | null
  exceptionCode?: string | null
  actRestMin?: number | null
}

export interface LegalityPreviewInput {
  contextType: LegalityContextType
  scenarioId?: number
  rulesetId?: number
  affectedCrewIds: string[]
  afterItems: PreviewRosterItem[]
  focusPairingIds?: number[]
  /** Inclusive Gantt rostering-period calendar bounds (YYYY-MM-DD) for 7505/7507. */
  rpFrom?: string
  rpTo?: string
}

export interface LegalityPreviewViolation {
  crewId: string
  pairingId: number | null
  dutySeq: number | null
  ruleCode: string
  ruleInstance: string
  scopeKey: string
  severity: number
  startDt: string | null
  endDt: string | null
  message: string
  /** Physical flight id for flight-grain rules (e.g. 8030 confirm grouping). */
  flightId?: number | null
}

interface RuleSeverityRow {
  function: number
  instance: string | null
  severity: number
}

const DAY_MS = 86_400_000
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10)

const scriptImport = async <T>(relative: string): Promise<T> => {
  const url = pathToFileURL(path.resolve(process.cwd(), relative)).href
  return import(url) as Promise<T>
}

const toTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

export function selectPreviewFocusItems(
  afterItems: PreviewRosterItem[],
  focusPairingIds?: number[],
): PreviewRosterItem[] {
  if (focusPairingIds !== undefined) {
    const pairingIds = new Set(focusPairingIds)
    return afterItems.filter((item) => item.pairingId != null && pairingIds.has(item.pairingId))
  }
  const temporaryItems = afterItems.filter((item) => item.id < 0)
  return temporaryItems
}

/**
 * How to splice draft `afterItems` into the temp roster copy.
 *
 * When the client sends focusPairingIds (pairing assign/remove/reassign), use a
 * pairing-scoped overlay: delete/replace only those pairing rows. A time-window
 * overlay keyed off a *partial* afterItems list (common when some pairings are
 * missing from the Gantt pairingMap) would wipe the rest of the month and
 * under-count RES days for 7505/7507.
 */
export type PreviewRosterOverlay =
  | { mode: 'pairing'; pairingIds: number[]; itemsToInsert: PreviewRosterItem[] }
  | {
      mode: 'window'
      overlayFrom: string
      overlayToExclusive: string
      itemsToInsert: PreviewRosterItem[]
    }

export function resolvePreviewRosterOverlay(
  afterItems: PreviewRosterItem[],
  focusPairingIds?: number[],
): PreviewRosterOverlay {
  const pairingIds = [...new Set(
    (focusPairingIds ?? []).filter((id) => Number.isFinite(id) && id > 0),
  )]
  if (pairingIds.length > 0) {
    const focus = new Set(pairingIds)
    return {
      mode: 'pairing',
      pairingIds,
      itemsToInsert: afterItems.filter(
        (item) => item.pairingId != null && focus.has(item.pairingId),
      ),
    }
  }
  const { overlayFrom, overlayToExclusive } = resolveWindow(afterItems)
  return {
    mode: 'window',
    overlayFrom,
    overlayToExclusive,
    itemsToInsert: afterItems,
  }
}

export function focusIntervalsFromPreviewItems(
  items: PreviewRosterItem[],
): Array<{ startSecs: number; endSecs: number }> {
  return items.flatMap((item) => {
    const startMs = toTimestamp(item.schStrDtUtc)
    const endMs = toTimestamp(item.schEndDtUtc)
    return startMs == null || endMs == null
      ? []
      : [{ startSecs: startMs / 1000, endSecs: endMs / 1000 }]
  })
}

const resolveWindow = (items: PreviewRosterItem[]) => {
  const values = items.flatMap((item) => [toTimestamp(item.schStrDtUtc), toTimestamp(item.schEndDtUtc)])
    .filter((value): value is number => value != null)
  if (values.length === 0) {
    const today = Date.now()
    return {
      overlayFrom: dateOnly(new Date(today - DAY_MS)),
      overlayToExclusive: dateOnly(new Date(today + DAY_MS)),
      checkFrom: dateOnly(new Date(today - 365 * DAY_MS)),
      checkToExclusive: dateOnly(new Date(today + 31 * DAY_MS)),
    }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  return {
    overlayFrom: dateOnly(new Date(min - DAY_MS)),
    overlayToExclusive: dateOnly(new Date(max + DAY_MS)),
    checkFrom: dateOnly(new Date(min - 365 * DAY_MS)),
    checkToExclusive: dateOnly(new Date(max + 31 * DAY_MS)),
  }
}

const defaultLiveRuleset = async (client: PoolClient): Promise<number> => {
  const result = await client.query<{ id: number }>(
    `select id from ${quoteIdentifier(liveSchemaName())}.workset
      where category = 'RULE'
      order by case when id = 103 then 0 else 1 end, id
      limit 1`,
  )
  const id = result.rows[0]?.id
  if (!id) throw new Error('No RULE workset found for legality preview')
  return Number(id)
}

const normalizeItems = (items: PreviewRosterItem[], affectedCrewIds: string[]): PreviewRosterItem[] => {
  const affected = new Set(affectedCrewIds.map(String))
  return items
    .filter((item) => affected.has(String(item.crewId)))
    .filter((item) => item.schStrDtUtc && item.schEndDtUtc)
}

const normalizeRuleInstance = (value: unknown): string => String(value ?? '').trim()

const ruleSeverityKey = (ruleCode: string, ruleInstance: string): string =>
  `${ruleCode}:${ruleInstance}`

export function normalizePreviewViolations(
  rows: unknown[],
  severityByRule: Map<string, number>,
  focusIntervals?: Array<{ startSecs: number; endSecs: number }>,
): { allowed: boolean; violations: LegalityPreviewViolation[] } {
  let violations = rows.map((row) => {
    const r = row as Record<string, unknown>
    const ruleCode = String(r.rule_code ?? '')
    const ruleInstance = normalizeRuleInstance(r.rule_instance)
    const rawSeverity = Number(r.severity ?? 0)
    const severity = severityByRule.get(ruleSeverityKey(ruleCode, ruleInstance)) ?? rawSeverity
    return {
      crewId: String(r.crew_id ?? ''),
      pairingId: r.pairing_id == null ? null : Number(r.pairing_id),
      dutySeq: r.duty_seq == null ? null : Number(r.duty_seq),
      ruleCode,
      ruleInstance,
      scopeKey: String(r.scope_key ?? ''),
      severity,
      startDt: r.start_dt == null ? null : String(r.start_dt),
      endDt: r.end_dt == null ? null : String(r.end_dt),
      message: String(r.message ?? ''),
      flightId: (() => {
        if (r.flight_id == null || r.flight_id === '') return null
        const n = Number(r.flight_id)
        return Number.isFinite(n) ? n : null
      })(),
    }
  })
  // Draft preview: only surface 8030 hits that overlap the focused assign window
  // (full-crew COF can otherwise flood the dialog with unrelated historical flights).
  if (focusIntervals && focusIntervals.length > 0) {
    violations = violations.filter((v) => {
      if (v.ruleCode !== '8030') return true
      if (v.startDt == null || v.endDt == null) return true
      const startSecs = Date.parse(v.startDt) / 1000
      const endSecs = Date.parse(v.endDt) / 1000
      if (!Number.isFinite(startSecs) || !Number.isFinite(endSecs)) return true
      return focusIntervals.some((f) => startSecs < f.endSecs && endSecs > f.startSecs)
    })
  }
  return {
    allowed: violations.every((v) => v.severity < 3),
    violations,
  }
}

const insertPreviewItems = async (client: PoolClient, items: PreviewRosterItem[]): Promise<void> => {
  if (items.length === 0) return
  await client.query(
    `insert into roster_flight (
       id, crew_id, pairing_id, ver, base, label, assignment_group, assignment, role, sub_role,
       source, is_requested, is_deleted, is_swapped, preference, comments, score, working_hour,
       sch_credited_minutes, act_credited_minutes, sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
       flt_id, flt_dt, duty_seq, seg_seq, division, flight_acting_rank, roster_acting_rank,
       active_rank, position, tag_set, exception_code, act_rest_min
     ) overriding system value
     select
       x.id, x.crew_id, x.pairing_id, coalesce(x.ver, 0), x.base, x.label,
       coalesce(nullif(x.assignment_group, ''), case when x.pairing_id is null then 'GRD' else 'FLY' end),
       coalesce(nullif(x.assignment, ''), x.assignment_group, case when x.pairing_id is null then 'GRD' else 'FLY' end),
       x.role, x.sub_role, coalesce(x.source, 'MA'), coalesce(x.is_requested, 0)::smallint, 0,
       coalesce(x.is_swapped, 0)::smallint, x.preference, x.comments, x.score::integer,
       nullif(x.working_hour, '')::numeric,
       nullif(x.sch_credited_minutes, '')::numeric, nullif(x.act_credited_minutes, '')::numeric,
       x.sch_str_dt_utc, x.sch_end_dt_utc, x.act_str_dt_utc, x.act_end_dt_utc,
       x.flt_id, x.flt_dt::varchar, x.duty_seq::smallint, x.seg_seq::smallint,
       x.division, coalesce(x.flight_acting_rank, ''),
       x.roster_acting_rank, x.active_rank, x.position, x.tag_set, x.exception_code, x.act_rest_min
     from jsonb_to_recordset($1::jsonb) as x(
       id bigint, crew_id varchar, pairing_id bigint, ver int, base varchar, label varchar,
       assignment_group varchar, assignment varchar, role varchar, sub_role varchar,
       source varchar, is_requested int, is_swapped int, preference varchar, comments text,
       score numeric, working_hour varchar, sch_credited_minutes varchar, act_credited_minutes varchar,
       sch_str_dt_utc timestamptz, sch_end_dt_utc timestamptz, act_str_dt_utc timestamptz, act_end_dt_utc timestamptz,
       flt_id bigint, flt_dt date, duty_seq int, seg_seq int, division varchar, flight_acting_rank varchar,
       roster_acting_rank varchar, active_rank varchar, position varchar, tag_set varchar, exception_code varchar, act_rest_min int
     )`,
    [JSON.stringify(items.map((item) => ({
      id: item.id,
      crew_id: item.crewId,
      pairing_id: item.pairingId,
      ver: item.ver ?? 0,
      base: item.base ?? '',
      label: item.label ?? null,
      assignment_group: item.assignmentGroup ?? null,
      assignment: item.assignment ?? null,
      role: item.role ?? null,
      sub_role: item.subRole ?? null,
      source: item.source ?? 'MA',
      is_requested: item.isRequested ?? 0,
      is_swapped: item.isSwapped ?? 0,
      preference: item.preference ?? null,
      comments: item.comments ?? null,
      score: item.score ?? null,
      working_hour: item.workingHour ?? null,
      sch_credited_minutes: item.schCreditedMinutes == null ? null : String(item.schCreditedMinutes),
      act_credited_minutes: item.actCreditedMinutes == null ? null : String(item.actCreditedMinutes),
      sch_str_dt_utc: item.schStrDtUtc,
      sch_end_dt_utc: item.schEndDtUtc,
      act_str_dt_utc: item.actStrDtUtc ?? null,
      act_end_dt_utc: item.actEndDtUtc ?? null,
      flt_id: item.fltId ?? null,
      flt_dt: item.fltDt ?? null,
      duty_seq: item.dutySeq ?? null,
      seg_seq: item.segSeq ?? null,
      division: item.division ?? null,
      flight_acting_rank: item.flightActingRank ?? '',
      roster_acting_rank: item.rosterActingRank ?? null,
      active_rank: item.activeRank ?? null,
      position: item.position ?? null,
      tag_set: item.tagSet ?? null,
      exception_code: item.exceptionCode ?? null,
      act_rest_min: item.actRestMin ?? null,
    })))],
  )
}

const pairingIdsFromItems = (items: PreviewRosterItem[]): number[] => [
  ...new Set(
    items
      .map((item) => item.pairingId)
      .filter((id): id is number => id != null && Number.isFinite(id) && id > 0),
  ),
]

/** Seed other crews already on the touched pairings (not in affectedCrewIds). */
const seedPairingComplementLive = async (
  client: PoolClient,
  live: string,
  affectedCrewIds: string[],
  pairingIds: number[],
  checkFrom: string,
  checkToExclusive: string,
): Promise<void> => {
  if (pairingIds.length === 0) return
  await client.query(
    `insert into roster_flight overriding system value
     select rf.* from ${live}.roster_flight rf
      where rf.is_deleted = 0
        and rf.pairing_id = any($1::bigint[])
        and not (rf.crew_id = any($2::varchar[]))
        and rf.sch_end_dt_utc > $3::timestamptz
        and rf.sch_str_dt_utc < $4::timestamptz
        and not exists (
          select 1 from roster_flight existing
           where existing.id = rf.id
        )`,
    [pairingIds, affectedCrewIds, checkFrom, checkToExclusive],
  )
}

/** Seed crews on the same physical flt_id as the touched pairings (cross-pairing 8030). */
const seedFlightComplementLive = async (
  client: PoolClient,
  live: string,
  affectedCrewIds: string[],
  pairingIds: number[],
  checkFrom: string,
  checkToExclusive: string,
): Promise<void> => {
  if (pairingIds.length === 0) return
  await client.query(
    `with touched as (
       select distinct rf.flt_id
         from ${live}.roster_flight rf
        where rf.is_deleted = 0
          and rf.pairing_id = any($1::bigint[])
          and rf.flt_id is not null
       union
       select distinct ps.flt_id
         from ${live}.pairing_segment ps
        where ps.pairing_id = any($1::bigint[])
          and coalesce(ps.is_deleted, 0) = 0
          and ps.flt_id is not null
     )
     insert into roster_flight overriding system value
     select rf.* from ${live}.roster_flight rf
      where rf.is_deleted = 0
        and rf.flt_id in (select flt_id from touched)
        and not (rf.crew_id = any($2::varchar[]))
        and rf.sch_end_dt_utc > $3::timestamptz
        and rf.sch_str_dt_utc < $4::timestamptz
        and not exists (
          select 1 from roster_flight existing
           where existing.id = rf.id
        )`,
    [pairingIds, affectedCrewIds, checkFrom, checkToExclusive],
  )
}

const seedPairingComplementScenario = async (
  client: PoolClient,
  scenario: string,
  scenarioId: number,
  affectedCrewIds: string[],
  pairingIds: number[],
): Promise<void> => {
  if (pairingIds.length === 0) return
  await client.query(
    `insert into roster_flight overriding system value
     select rf.* from ${scenario}.roster_flight rf
      where rf.scenario_id = $1
        and rf.is_deleted = 0
        and rf.pairing_id = any($2::bigint[])
        and not (rf.crew_id = any($3::varchar[]))
        and not exists (
          select 1 from roster_flight existing
           where existing.id = rf.id
        )`,
    [scenarioId, pairingIds, affectedCrewIds],
  )
}

/** Seed crews sharing flt_id with the touched pairings (cross-pairing 8030/8072).
 *  Includes Live FLY mates not present in scenario.roster_flight (other bases / divisions). */
const seedFlightComplementScenario = async (
  client: PoolClient,
  scenario: string,
  scenarioId: number,
  affectedCrewIds: string[],
  pairingIds: number[],
): Promise<void> => {
  if (pairingIds.length === 0) return
  const live = quoteIdentifier(liveSchemaName())
  await client.query(
    `with touched as (
       select distinct rf.flt_id
         from ${scenario}.roster_flight rf
        where rf.scenario_id = $1
          and rf.is_deleted = 0
          and rf.pairing_id = any($2::bigint[])
          and rf.flt_id is not null
       union
       select distinct rf.flt_id
         from roster_flight rf
        where rf.pairing_id = any($2::bigint[])
          and rf.flt_id is not null
          and rf.is_deleted = 0
       union
       select distinct ps.flt_id
         from ${live}.pairing_segment ps
        where ps.pairing_id = any($2::bigint[])
          and coalesce(ps.is_deleted, 0) = 0
          and ps.flt_id is not null
     )
     insert into roster_flight overriding system value
     select rf.* from ${scenario}.roster_flight rf
      where rf.scenario_id = $1
        and rf.is_deleted = 0
        and rf.flt_id in (select flt_id from touched)
        and not (rf.crew_id = any($3::varchar[]))
        and not exists (
          select 1 from roster_flight existing
           where existing.id = rf.id
        )`,
    [scenarioId, pairingIds, affectedCrewIds],
  )
  // Live FLY mates on focus-pairing flights only (not every flt_id already in temp).
  await client.query(
    `with touched as (
       select distinct rf.flt_id
         from roster_flight rf
        where rf.pairing_id = any($1::bigint[])
          and rf.flt_id is not null
          and rf.is_deleted = 0
       union
       select distinct ps.flt_id
         from ${live}.pairing_segment ps
        where ps.pairing_id = any($1::bigint[])
          and coalesce(ps.is_deleted, 0) = 0
          and ps.flt_id is not null
     )
     insert into roster_flight (
       id, scenario_id, crew_id, pairing_id, ver, base, label, assignment_group, assignment,
       role, sub_role, source, is_requested, is_deleted, is_swapped, preference, comments, score,
       working_hour, sch_credited_minutes, act_credited_minutes, flt_id, duty_seq, seg_seq, flt_dt,
       sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, division, flight_acting_rank,
       roster_acting_rank, active_rank, position, tag_set, exception_code, act_rest_min
     ) overriding system value
     select
       -abs(rf.id), $2, rf.crew_id, rf.pairing_id, rf.ver, rf.base, rf.label, rf.assignment_group, rf.assignment,
       rf.role, rf.sub_role, rf.source, rf.is_requested, 0, rf.is_swapped, rf.preference, rf.comments, rf.score,
       rf.working_hour, rf.sch_credited_minutes, rf.act_credited_minutes, rf.flt_id, rf.duty_seq, rf.seg_seq, rf.flt_dt,
       rf.sch_str_dt_utc, rf.sch_end_dt_utc, rf.act_str_dt_utc, rf.act_end_dt_utc, rf.division, rf.flight_acting_rank,
       rf.roster_acting_rank, rf.active_rank, rf.position, rf.tag_set, rf.exception_code, rf.act_rest_min
       from ${live}.roster_flight rf
      where rf.is_deleted = 0
        and rf.assignment_group = 'FLY'
        and rf.pairing_id is not null
        and rf.flt_id in (select flt_id from touched)
        and not (rf.crew_id = any($3::varchar[]))
        and not exists (
          select 1 from roster_flight existing
           where existing.crew_id = rf.crew_id
             and existing.flt_id is not distinct from rf.flt_id
        )
        and not exists (
          select 1 from roster_flight existing
           where existing.id = -abs(rf.id)
        )`,
    [pairingIds, scenarioId, affectedCrewIds],
  )
}

const applyRosterOverlay = async (
  client: PoolClient,
  affectedCrewIds: string[],
  overlay: PreviewRosterOverlay,
): Promise<number[]> => {
  if (overlay.mode === 'pairing') {
    await client.query(
      `delete from roster_flight
        where crew_id = any($1::varchar[])
          and pairing_id = any($2::bigint[])`,
      [affectedCrewIds, overlay.pairingIds],
    )
    await insertPreviewItems(client, overlay.itemsToInsert)
    return overlay.pairingIds
  }
  await client.query(
    `delete from roster_flight
      where crew_id = any($1::varchar[])
        and sch_end_dt_utc > $2::timestamptz
        and sch_str_dt_utc < $3::timestamptz`,
    [affectedCrewIds, overlay.overlayFrom, overlay.overlayToExclusive],
  )
  await insertPreviewItems(client, overlay.itemsToInsert)
  return pairingIdsFromItems(overlay.itemsToInsert)
}

const createLiveTempRoster = async (
  client: PoolClient,
  affectedCrewIds: string[],
  overlay: PreviewRosterOverlay,
  checkFrom: string,
  checkToExclusive: string,
): Promise<void> => {
  const live = quoteIdentifier(liveSchemaName())
  await client.query(`create temp table roster_flight (like ${live}.roster_flight including defaults) on commit drop`)
  await client.query(
    `insert into roster_flight overriding system value
     select * from ${live}.roster_flight
      where crew_id = any($1::varchar[])
        and is_deleted = 0
        and sch_end_dt_utc > $2::timestamptz
        and sch_str_dt_utc < $3::timestamptz`,
    [affectedCrewIds, checkFrom, checkToExclusive],
  )
  const complementPairingIds = await applyRosterOverlay(client, affectedCrewIds, overlay)
  await seedPairingComplementLive(
    client,
    live,
    affectedCrewIds,
    complementPairingIds,
    checkFrom,
    checkToExclusive,
  )
  await seedFlightComplementLive(
    client,
    live,
    affectedCrewIds,
    complementPairingIds,
    checkFrom,
    checkToExclusive,
  )
}

const createScenarioTempRoster = async (
  client: PoolClient,
  scenarioId: number,
  affectedCrewIds: string[],
  overlay: PreviewRosterOverlay,
): Promise<void> => {
  const scenario = quoteIdentifier(scenarioSchemaName())
  await client.query(`create temp table roster_flight (like ${scenario}.roster_flight including defaults) on commit drop`)
  await client.query(`alter table roster_flight alter column scenario_id set default ${scenarioId}`)
  await client.query(
    `insert into roster_flight overriding system value
     select * from ${scenario}.roster_flight
      where scenario_id = $1
        and crew_id = any($2::varchar[])
        and is_deleted = 0`,
    [scenarioId, affectedCrewIds],
  )
  const complementPairingIds = await applyRosterOverlay(client, affectedCrewIds, overlay)
  await seedPairingComplementScenario(
    client,
    scenario,
    scenarioId,
    affectedCrewIds,
    complementPairingIds,
  )
  await seedFlightComplementScenario(
    client,
    scenario,
    scenarioId,
    affectedCrewIds,
    complementPairingIds,
  )
  const live = quoteIdentifier(liveSchemaName())
  await client.query(
    `insert into roster_flight (
       id, scenario_id, crew_id, pairing_id, ver, base, label, assignment_group, assignment,
       role, sub_role, source, is_requested, is_deleted, is_swapped, preference, comments, score,
       working_hour, sch_credited_minutes, act_credited_minutes, flt_id, duty_seq, seg_seq, flt_dt,
       sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, division, flight_acting_rank,
       roster_acting_rank, active_rank, position, tag_set, exception_code, act_rest_min
     ) overriding system value
     select
       -abs(rf.id), $1, rf.crew_id, rf.pairing_id, rf.ver, rf.base, rf.label, rf.assignment_group, rf.assignment,
       rf.role, rf.sub_role, rf.source, rf.is_requested, 0, rf.is_swapped, rf.preference, rf.comments, rf.score,
       rf.working_hour, rf.sch_credited_minutes, rf.act_credited_minutes, rf.flt_id, rf.duty_seq, rf.seg_seq, rf.flt_dt,
       rf.sch_str_dt_utc, rf.sch_end_dt_utc, rf.act_str_dt_utc, rf.act_end_dt_utc, rf.division, rf.flight_acting_rank,
       rf.roster_acting_rank, rf.active_rank, rf.position, rf.tag_set, rf.exception_code, rf.act_rest_min
       from ${live}.roster_flight rf
      where rf.is_deleted = 0
        and rf.crew_id = any($2::varchar[])
        and rf.sch_end_dt_utc < (
          select s.str_dt_loc from ${live}.scenario s where s.id = $1
        )
        and not exists (
          select 1 from roster_flight existing
           where existing.id = -abs(rf.id)
             and existing.crew_id = rf.crew_id
        )`,
    [scenarioId, affectedCrewIds],
  )

  // Backfill dep_arp / arv_arp for draft-assigned and complement rows
  // that were not sourced from the solver output (which already carries them).
  // insertPreviewItems does not set these columns, and the scenario.flight /
  // scenario.pairing_segment partitions are empty when pairing_scenario_id = 0,
  // so source-level COALESCE(…rf.arv_arp, f.arv_arp, ps.arv_arp, '') falls
  // through to '' and destination-gated rules (8071, etc.) silently drop the
  // new row before the Rust checker ever sees it.
  await client.query(
    `with flight_data as (
       select rf.id,
              coalesce(lf.dep_arp, sf.dep_arp) as dep,
              coalesce(lf.arv_arp, sf.arv_arp) as arv
         from roster_flight rf
         left join ${live}.flight lf on lf.id = rf.flt_id
         left join ${scenario}.flight sf on sf.scenario_id = $1 and sf.id = rf.flt_id
        where rf.pairing_id is not null
          and rf.flt_id is not null
          and (rf.dep_arp is null or rf.arv_arp is null)
     )
     update roster_flight rf set
       dep_arp = fd.dep,
       arv_arp = fd.arv
     from flight_data fd
     where rf.id = fd.id
       and (fd.dep is not null or fd.arv is not null)`,
    [scenarioId],
  )
}

const schemaAwareClient = (client: PoolClient, contextType: LegalityContextType) => {
  const live = quoteIdentifier(liveSchemaName())
  const scenario = quoteIdentifier(scenarioSchemaName())
  const applySchemas = (text: string) => {
    let out = text.replaceAll('f8.', `${live}.`).replaceAll('scenario.', `${scenario}.`)
    if (contextType === 'scenario') {
      out = out.replaceAll(`${scenario}.roster_flight`, 'roster_flight')
    }
    return out
  }
  return {
    query: (queryConfig: unknown, values?: unknown[], callback?: unknown) => {
      if (typeof queryConfig === 'string') return client.query(applySchemas(queryConfig), values as never, callback as never)
      if (queryConfig && typeof (queryConfig as { text?: unknown }).text === 'string') {
        const cfg = queryConfig as { text: string }
        return client.query({ ...cfg, text: applySchemas(cfg.text) } as never, values as never, callback as never)
      }
      return client.query(queryConfig as never, values as never, callback as never)
    },
  }
}

export async function recalculatePreviewAccRefTz(
  client: PoolClient,
  contextType: LegalityContextType,
  rulesetId: number,
  scenarioId?: number,
): Promise<unknown[]> {
  const accRef = await scriptImport<{
    recalculateAccRefTz: (db: unknown, options: Record<string, unknown>) => Promise<unknown[]>
  }>('scripts/acc-ref-tz.mjs')
  const live = quoteIdentifier(liveSchemaName())
  const scenario = quoteIdentifier(scenarioSchemaName())
  const isScenario = contextType === 'scenario'
  if (isScenario && scenarioId == null) throw new Error('scenarioId is required for scenario 7500 preview')
  return accRef.recalculateAccRefTz(client, {
    liveSchema: live,
    rosterTable: 'roster_flight',
    pairingSegmentTable: isScenario ? `${scenario}.pairing_segment` : `${live}.pairing_segment`,
    pairingSegmentWhereSql: isScenario ? 'and ps.scenario_id = $1' : '',
    // Live-backed scenarios (pairing_scenario_id=0) have no scenario.pairing_segment rows;
    // fall back to live segments for dep/arr airports so duty_ref_tz is not written as UTC/0.
    ...(isScenario ? { livePairingSegmentTable: `${live}.pairing_segment` } : {}),
    airportTable: `${live}.airport`,
    whereSql: isScenario ? 'rf.scenario_id = $1 and' : '',
    values: isScenario ? [scenarioId] : [],
    rulesetId,
  })
}

export async function previewDraftLegality(
  fastify: FastifyInstance,
  input: LegalityPreviewInput,
): Promise<{ allowed: boolean; violations: LegalityPreviewViolation[] }> {
  const affectedCrewIds = [...new Set(input.affectedCrewIds.map(String).filter(Boolean))]
  const afterItems = normalizeItems(input.afterItems, affectedCrewIds)
  if (affectedCrewIds.length === 0 || afterItems.length === 0) return { allowed: true, violations: [] }

  const focusIntervals = focusIntervalsFromPreviewItems(
    selectPreviewFocusItems(afterItems, input.focusPairingIds),
  )
  const rosterOverlay = resolvePreviewRosterOverlay(afterItems, input.focusPairingIds)
  const { checkFrom, checkToExclusive } = resolveWindow(afterItems)
  const client = await fastify.pgPool.connect()
  try {
    await client.query('begin')
    await client.query(`set local search_path = pg_temp, ${quoteIdentifier(liveSchemaName())}, public`)

    const db = schemaAwareClient(client, input.contextType)
    let rulesetId = input.rulesetId
    let source: unknown
    let ctx: Record<string, unknown>

    const core = await scriptImport<{
      computeViolations: (source: unknown, ctx: Record<string, unknown>, onlyCodes?: string[] | null) => Promise<unknown[]>
    }>('scripts/legality-recheck-core.mjs')

    if (input.contextType === 'live') {
      rulesetId = rulesetId && Number.isInteger(Number(rulesetId)) && Number(rulesetId) > 0
        ? Number(rulesetId)
        : await defaultLiveRuleset(client)
      await createLiveTempRoster(client, affectedCrewIds, rosterOverlay, checkFrom, checkToExclusive)
      await recalculatePreviewAccRefTz(client, 'live', rulesetId)
      const liveModule = await scriptImport<{
        liveSource: (db: unknown, fromIso: string, toExclusiveIso: string) => unknown
      }>('scripts/live-legality.mjs')
      source = liveModule.liveSource(db, checkFrom, checkToExclusive)
      ctx = {
        rulesetId,
        dateFrom: checkFrom,
        dateTo: checkToExclusive,
        preview: true,
        focusIntervals,
        focusPairingIds: input.focusPairingIds ?? [],
        ...(input.rpFrom && input.rpTo ? { rpFrom: input.rpFrom, rpTo: input.rpTo } : {}),
      }
    } else {
      if (!input.scenarioId) throw new Error('scenarioId is required for scenario legality preview')
      const scenarioModule = await scriptImport<{
        applySchemas: (text: string) => string
        loadContext: (
          scenarioId: number,
          queryDb?: ScenarioCatalogQueryDb,
        ) => Promise<Record<string, unknown> | null>
        scenarioSource: (db: unknown, scenarioId: number, ctx: Record<string, unknown>) => unknown
      }>('scripts/scenario-legality.mjs')
      // Catalog client: rewrite f8./scenario. schema names, but do NOT remap
      // scenario.roster_flight → temp roster_flight (that rewrite is only for compute).
      const catalogDb: ScenarioCatalogQueryDb = {
        query: async (queryConfig, values) => {
          const result = await client.query(
            scenarioModule.applySchemas(queryConfig),
            values as never,
          )
          return { rows: result.rows }
        },
      }
      const scenarioCtx = await scenarioModule.loadContext(input.scenarioId, catalogDb)
      if (!scenarioCtx) throw new Error(`Scenario ${input.scenarioId} not found`)
      rulesetId = Number(scenarioCtx.rulesetId)
      if (!Number.isInteger(rulesetId) || rulesetId <= 0) throw new Error(`Scenario ${input.scenarioId} has no ruleset_id`)
      await createScenarioTempRoster(client, input.scenarioId, affectedCrewIds, rosterOverlay)
      await recalculatePreviewAccRefTz(client, 'scenario', rulesetId, input.scenarioId)
      const sourceCtx = {
        ...scenarioCtx,
        preview: true,
        focusPairingIds: input.focusPairingIds ?? [],
      }
      source = scenarioModule.scenarioSource(db, input.scenarioId, sourceCtx)
      ctx = {
        ...sourceCtx,
        rulesetId,
        focusIntervals,
        ...(input.rpFrom && input.rpTo ? { rpFrom: input.rpFrom, rpTo: input.rpTo } : {}),
      }
    }

    const all = await core.computeViolations(source, ctx, null)
    const ruleSeverityRows = await client.query<RuleSeverityRow>(
      `select r.function, r.instance, r.severity
         from rule_set rs
         join rule r on r.rule_id = rs.rule_id
        where rs.workset_id = $1`,
      [rulesetId],
    )
    await client.query('rollback')
    const severityByRule = new Map<string, number>()
    for (const row of ruleSeverityRows.rows) {
      severityByRule.set(ruleSeverityKey(String(row.function), normalizeRuleInstance(row.instance)), Number(row.severity))
    }
    return normalizePreviewViolations(all, severityByRule, focusIntervals)
  } catch (err) {
    try { await client.query('rollback') } catch {}
    fastify.log.error({ err }, 'legality preview failed')
    throw err
  } finally {
    client.release()
  }
}
