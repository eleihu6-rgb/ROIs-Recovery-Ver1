import { gzipSync } from 'node:zlib'
import { sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { scenarioParameterService } from './scenario-parameter-service.js'
import { normalizeCrewDivision, normalizePoScope } from './filter-params-normalize.js'
import { crewIdSet, numberOrNull, sqlStrArray } from './scenario-crew-scope.js'
export { crewIdSet } from './scenario-crew-scope.js'

/**
 * Scenario raw-table exporter → ro_input.gz.
 *
 * Each export table is a single self-contained SQL query (sub-selects, never
 * per-row loops). All queries run concurrently (Promise.all) — no N+1. Each
 * result becomes a `## table_name` CSV section; sections are joined and gzipped.
 *
 * Filtering from filter_params:
 *  RO/TO crew:    division, bases (→ crew_base), fleets (→ crew_fleet)
 *  RO/TO pairing: division (from pairing or crew), bases, fleets + time window
 *  PO:            flat division + bases on pairing (+ time window)
 *  reference tables (base/rank/fleet): full; airport: only referenced 3-codes
 *
 * Rules: only the Model A `workset` section is exported. The RUST solver reads
 * its legality params straight from `rule.param_json` (Model A) in the DB, so the
 * scenario ro_input carries no rule_set/rule/rule_parameter section. The dead
 * Model B sections (rule_group / rule_group_instance / rule_instance /
 * rule_template) were dropped — nothing downstream parsed them (the solver reads
 * param_json directly; gantt parses crew/pairings/segments/flights only).
 */

export interface ScenarioRow {
  id: number
  worksetId: number
  strDtLoc: Date
  endDtLoc: Date
  filterParams: Record<string, unknown>
  rulesetId: number
  fileType: string
  /** From workset.division — authoritative scenario division scope. */
  division?: string | null
}

interface TableSpec {
  name: string
  query: (s: ScenarioRow) => SQL
}

/**
 * Pairing id set:
 *  - division ← workset.division (authoritative for PO + RO)
 *  - PO bases ← filterParams.bases (legacy singular base OK via normalizePoScope)
 *  - RO bases/ranks/fleets/types/duration ← filterParams.pairing
 *
 * Legacy filterParams.pairing.sources is intentionally ignored: no exported
 * live pairing source column maps to those old UI choices.
 */
export const pairingIdSet = (s: ScenarioRow): SQL => {
  const fp = (s.filterParams ?? {}) as Record<string, unknown>
  const isPo = s.fileType === 'PO'
  const division = normalizeCrewDivision(s.division)

  let bases: string[]
  let ranks: string[] = []
  let fleets: string[] = []
  let types: string[] = []
  let durationMin: number | null = null
  let durationMax: number | null = null

  if (isPo) {
    bases = normalizePoScope(fp).bases
  } else {
    const nested = fp as Record<string, Record<string, unknown>>
    const pf = (nested.pairing ?? {}) as Record<string, unknown>
    bases = (pf.bases as string[] | undefined) ?? []
    ranks = (pf.ranks as string[] | undefined) ?? []
    fleets = (pf.fleets as string[] | undefined) ?? []
    types = (pf.types as string[] | undefined) ?? []
    const duration = (pf.duration ?? {}) as Record<string, unknown>
    durationMin = numberOrNull(duration.min)
    durationMax = numberOrNull(duration.max)
  }

  const parts: SQL[] = [sql`SELECT id FROM pairing pairing
    WHERE sch_str_dt_utc < (${s.endDtLoc}::date + interval '1 day')
      AND sch_end_dt_utc >= ${s.strDtLoc}
      AND is_deleted = 0`]

  parts.push(sql` AND division = ${division}`)

  if (bases.length > 0)
    parts.push(sql` AND base = ANY(ARRAY[${sqlStrArray(bases)}]::text[])`)

  if (ranks.length > 0)
    parts.push(sql` AND EXISTS (
      SELECT 1 FROM pairing_composition pc
      WHERE pc.pairing_id = pairing.id
        AND pc.is_deleted = 0
        AND pc.acting_rank = ANY(ARRAY[${sqlStrArray(ranks)}]::text[]))`)

  if (fleets.length > 0)
    parts.push(sql` AND fleet = ANY(ARRAY[${sqlStrArray(fleets)}]::text[])`)

  if (types.length > 0)
    parts.push(sql` AND assignment = ANY(ARRAY[${sqlStrArray(types)}]::text[])`)

  if (durationMin != null)
    parts.push(sql` AND tafb >= ${durationMin}`)

  if (durationMax != null)
    parts.push(sql` AND tafb <= ${durationMax}`)

  return sql.join(parts, sql``)
}

export async function countScenarioRunScope(
  fastify: FastifyInstance,
  scenario: ScenarioRow,
): Promise<{ crewCount: number; pairingCount: number }> {
  const [crewResult, pairingResult] = await Promise.all([
    fastify.db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM crew WHERE crew_id IN (${crewIdSet(scenario)})`,
    ),
    fastify.db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pairing WHERE id IN (${pairingIdSet(scenario)})`,
    ),
  ])

  return {
    crewCount: Number(crewResult.rows[0]?.count ?? 0),
    pairingCount: Number(pairingResult.rows[0]?.count ?? 0),
  }
}

/** flight id set within the scenario window. */
const flightIdSet = (s: ScenarioRow): SQL =>
  sql`SELECT id FROM flight WHERE sch_dep_dt_utc <= ${s.endDtLoc} AND sch_arv_dt_utc >= ${s.strDtLoc}`

/** crew sub-table time-overlap predicate. */
const overlap = (s: ScenarioRow): SQL =>
  sql`eff_dt <= ${s.endDtLoc} AND (exp_dt >= ${s.strDtLoc} OR exp_dt IS NULL)`

const toIsoDatePart = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString())
const year = (d: Date | string): string => toIsoDatePart(d).slice(0, 4)

/** v2: return the scenario's rulesetId (= workset.id) as the direct ruleset reference. */
function resolveRulesetId(s: ScenarioRow): number {
  return s.rulesetId
}

const SPECS: TableSpec[] = [
  { name: 'scenario', query: (s) => sql`SELECT * FROM scenario WHERE id = ${s.id}` },
  { name: 'workset', query: (s) => sql`SELECT * FROM workset WHERE id = ${s.worksetId}` },
  { name: 'crew', query: (s) => sql`SELECT * FROM crew WHERE crew_id IN (${crewIdSet(s)})` },
  { name: 'crew_team', query: (s) => sql`SELECT * FROM crew_team WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'crew_rank', query: (s) => sql`SELECT * FROM crew_rank WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'crew_base', query: (s) => sql`SELECT * FROM crew_base WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'crew_fleet', query: (s) => sql`SELECT * FROM crew_fleet WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'crew_qualification', query: (s) => sql`SELECT * FROM crew_qualification WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'crew_status', query: (s) => sql`SELECT * FROM crew_status WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'crew_certificate', query: (s) => sql`SELECT * FROM crew_certificate WHERE crew_id IN (${crewIdSet(s)}) AND ${overlap(s)}` },
  { name: 'roster_flight', query: (s) => sql`
    -- Flight rows (pairing-linked): pass through as-is.
    SELECT * FROM roster_flight
    WHERE crew_id IN (${crewIdSet(s)}) AND pairing_id IS NOT NULL AND is_deleted = 0
    UNION ALL
    -- Ground task rows (pairing_id IS NULL): deduplicate by (crew_id, sch_str_dt_utc),
    -- keeping the row with the highest act_credited_minutes so credit is never lost.
    SELECT DISTINCT ON (crew_id, sch_str_dt_utc)
      *
    FROM roster_flight
    WHERE crew_id IN (${crewIdSet(s)}) AND pairing_id IS NULL AND is_deleted = 0
    ORDER BY crew_id, sch_str_dt_utc, act_credited_minutes DESC NULLS LAST
  ` },
  { name: 'crew_manday_fd_period', query: (s) => sql`
    SELECT *
    FROM crew_manday_fd_period
    WHERE crew_id IN (${crewIdSet(s)})
      AND rp_start <= ${toIsoDatePart(s.endDtLoc)}::timestamptz
      AND rp_end   >= ${toIsoDatePart(s.strDtLoc)}::timestamptz
  ` },
  { name: 'crew_manday_fd_yearly', query: (s) => sql`
    SELECT *
    FROM crew_manday_fd_yearly
    WHERE crew_id IN (${crewIdSet(s)})
      AND year >= ${year(s.strDtLoc)}
      AND year <= ${year(s.endDtLoc)}
  ` },
  { name: 'crew_manday_cc_am_period', query: (s) => sql`
    SELECT *
    FROM crew_manday_cc_am_period
    WHERE crew_id IN (${crewIdSet(s)})
      AND rp_start <= ${toIsoDatePart(s.endDtLoc)}::timestamptz
      AND rp_end   >= ${toIsoDatePart(s.strDtLoc)}::timestamptz
  ` },
  { name: 'crew_manday_cc_am_yearly', query: (s) => sql`
    SELECT *
    FROM crew_manday_cc_am_yearly
    WHERE crew_id IN (${crewIdSet(s)})
      AND year >= ${year(s.strDtLoc)}
      AND year <= ${year(s.endDtLoc)}
  ` },
  { name: 'pairing', query: (s) => sql`SELECT * FROM pairing WHERE id IN (${pairingIdSet(s)})` },
  { name: 'pairing_segment', query: (s) => sql`SELECT * FROM pairing_segment WHERE pairing_id IN (${pairingIdSet(s)})` },
  { name: 'pairing_composition', query: (s) => sql`SELECT * FROM pairing_composition WHERE pairing_id IN (${pairingIdSet(s)})` },
  { name: 'flight', query: (s) => sql`SELECT * FROM flight WHERE id IN (${flightIdSet(s)})` },
  { name: 'flight_composition', query: (s) => sql`SELECT * FROM flight_composition WHERE flt_id IN (${flightIdSet(s)})` },
  { name: 'base', query: () => sql`SELECT * FROM base` },
  { name: 'rank', query: () => sql`SELECT * FROM rank` },
  { name: 'fleet', query: () => sql`SELECT * FROM fleet` },
  { name: 'airport', query: (s) => sql`SELECT * FROM airport WHERE airport IN (
      SELECT dep_arp FROM flight WHERE id IN (${flightIdSet(s)})
      UNION SELECT arv_arp FROM flight WHERE id IN (${flightIdSet(s)}))` },
]

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const str = v instanceof Date ? v.toISOString() : String(v)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function toCsvSection(name: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `## ${name}\n`
  const cols = Object.keys(rows[0])
  const header = cols.join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n')
  return `## ${name}\n${header}\n${body}\n`
}

export async function buildRoInputGz(fastify: FastifyInstance, scenario: ScenarioRow): Promise<Buffer> {
  // one query per table, all concurrent — no N+1
  const sections = await Promise.all(
    SPECS.map(async (spec) => {
      const q = spec.query(scenario)
      // tag for test introspection; ignored by the pg driver in production
      ;(q as unknown as { __table?: string }).__table = spec.name
      const res = (await fastify.db.execute(q)) as unknown as { rows: Record<string, unknown>[] }
      return toCsvSection(spec.name, res.rows)
    }),
  )
  const parameterRows = await scenarioParameterService.getEffectiveExportRows(fastify, scenario.id)
  sections.push(toCsvSection('scenario_parameter', parameterRows))
  const algorithmPayload = await scenarioParameterService.getEffectiveAlgorithmPayload(fastify, scenario.id)
  sections.push(toCsvSection('algorithm_parameters', [{
    scenario_id: scenario.id,
    json: JSON.stringify(algorithmPayload),
  }]))
  return gzipSync(Buffer.from(sections.join('\n'), 'utf-8'))
}

export const __test = {
  toCsvSection,
  resolveRulesetId,
  TABLE_COUNT: SPECS.length,
  TABLE_NAMES: SPECS.map((s) => s.name),
}
