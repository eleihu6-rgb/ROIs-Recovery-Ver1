import { eq, sql } from 'drizzle-orm'
import { gunzipSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { scenario } from '../../models/scenario/scenario.js'
import { invalidate, invalidatePattern } from '../../utils/cache.js'
import { liveSchema, scenarioSchema } from '../../utils/db-schema.js'
import { resolveFilialeLower } from '../../utils/filiale.js'
import { getScenarioResults, upsertScenarioResultJson } from './scenario-result-store.js'
import { crewIdSet } from './scenario-crew-scope.js'
import { workset } from '../../models/rule/workset.js'
import { buildScenarioVersionRecord, scenarioVersionService } from './scenario-version-service.js'
import { buildScenarioPairingScopeWhere } from './pairing-scope-filter.js'
import { normalizeCrewDivision } from './filter-params-normalize.js'

export interface ResultMetadata {
  scenarioId: number
  taskId: string
  status: string // engine status: DONE | FAILED | INFEASIBLE | TIMEOUT
  filePath: string
  inputPath?: string | null
  archivePath?: string | null
  version?: string | null
  executedBy?: string | null
  executedAt?: string | null
  fileTimestamp?: string | null
  algorithmSnapshot?: Record<string, unknown>
  ruleSnapshot?: Record<string, unknown>
  fileSize: number
  checksum: string
  kpi: Record<string, unknown>[]
  resultMeta: Record<string, unknown>
  /** Report-shaped sections built by the engine from result.json — the same
   *  `general_kpi` / `scheduling_details` contract the legacy report serves,
   *  so the gantt renders identical numbers. Optional: older engine binaries
   *  omit them and the frontend falls back. */
  generalKpi?: Record<string, unknown>
  schedulingDetails?: Record<string, unknown>
  credit_roster_period_note?: string
}

/** Persisted `raw_result` JSONB payload. Carries the report-shaped sections at
 *  the top level under the literal keys the gantt reads (`general_kpi`,
 *  `scheduling_details`), with safe defaults for older callbacks that omit them. */
export const buildRawResultPayload = (meta: ResultMetadata): Record<string, unknown> => ({
  metadata: meta,
  resultMeta: meta.resultMeta ?? {},
  engineKpi: meta.kpi ?? [],
  general_kpi: meta.generalKpi ?? {},
  scheduling_details: meta.schedulingDetails ?? {},
})

export interface CrewAssignment {
  crewId: string
  pairingId: number
}

/** Parse a `## SECTION` CSV gzip buffer into { section: rows }. */
export function parseSections(buf: Buffer): Record<string, Record<string, string>[]> {
  const text = gunzipSync(buf).toString('utf-8')
  const sections: Record<string, Record<string, string>[]> = {}
  let current: string | null = null
  let header: string[] = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      current = line.slice(3).trim()
      header = []
      sections[current] = []
    } else if (!line || !current) {
      continue
    } else if (header.length === 0) {
      header = line.split(',')
    } else {
      const cells = line.split(',')
      const row: Record<string, string> = {}
      header.forEach((h, i) => {
        row[h] = cells[i] ?? ''
      })
      sections[current].push(row)
    }
  }
  return sections
}

/** Extract the crew_id -> pairing_id assignment overlay. */
export function parseAssignments(sections: Record<string, Record<string, string>[]>): CrewAssignment[] {
  return (sections.ASSIGNMENTS ?? []).map((r) => ({
    crewId: r.crew_id,
    pairingId: Number(r.pairing_id),
  }))
}

const DONE_STATES = new Set(['DONE'])
const KpiOrder = {
  crewUtilized: 1,
  assigned: 2,
  highestCredit: 3,
  avgCredit: 4,
  pairingLines: 5,
  reserveLines: 6,
  pairingCoverage: 7,
  reserveCoverage: 8,
} as const

const GROUP_ORDER = ['FLY', 'DO', 'CRPM']

const section = (
  sections: Record<string, Record<string, string>[]>,
  ...names: string[]
): Record<string, string>[] => {
  for (const name of names) {
    const rows = sections[name]
    if (rows) return rows
  }
  return []
}

const val = (row: Record<string, string>, ...names: string[]): string => {
  for (const name of names) {
    const value = row[name]
    if (value != null && value !== '') return value
  }
  return ''
}

const numVal = (row: Record<string, string>, ...names: string[]): number => {
  const n = Number(val(row, ...names))
  return Number.isFinite(n) ? n : 0
}

const addSet = (map: Map<string, Set<string>>, key: string, value: string): void => {
  const set = map.get(key) ?? new Set<string>()
  set.add(value)
  map.set(key, set)
}

const orderedBreakdown = (counts: Map<string, number>): string => {
  const groups = [...counts.keys()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a)
    const bi = GROUP_ORDER.indexOf(b)
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return a.localeCompare(b)
  })
  return groups.map((group) => `${group}:${counts.get(group) ?? 0}`).join(' / ')
}

const yearMonthFrom = (value: Date | string | null | undefined): string => {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 7)
  return d.toISOString().slice(0, 7)
}

const dateOnlyFrom = (value: Date | string | null | undefined): string => {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toISOString().slice(0, 10)
}

const periodLabel = (yearMonth: string): string =>
  /^\d{4}-\d{2}$/.test(yearMonth) ? `${yearMonth.slice(0, 4)}RP${yearMonth.slice(5, 7)}` : yearMonth

const formatMinutesHours = (minutes: number): string => `${(minutes / 60).toFixed(1)}h`

interface CreditSummary {
  yearMonth: string
  totalCreditMin: number
  nonZeroCrew: number
  zeroCrew: number
  avgHours: number
  highestHours: number
}

interface CreditReportRow {
  crew_id: string
  base?: string
  rank: string
  credited_hours: number | null
  credit_min: number | null
  credit_max: number | null
  pre_assigned_types: string
  in_range: boolean | null
  available_days: number | null
  per_day_rate: number | null
  period_credit_target: number | null
  target_gap: number | null
  preassign_rest_days: number | null
  required_dayoff: number | null
  actual_dayoff: number | null
  dayoff_ok: boolean | null
}

interface UncoveredReportRow {
  type: string
  pairing_id: string
  task_id: string
  name: string
  base: string
  rank: string
  start_base: string
  end_base: string
  credit: number
}

interface DistributionReportRow {
  date: string
  assigned_pairing: number
  assigned_reserve: number
  uncovered_pairing: number
  uncovered_reserve: number
  available_crew: number
  assigned_pairing_slots_total?: number
  assigned_reserve_slots_total?: number
  uncovered_pairing_slots_total?: number
  uncovered_reserve_slots_total?: number
  busy_crew_days_total?: number
  busy_pairing_crew_days_total?: number
  busy_reserve_crew_days_total?: number
  available_crew_days_total?: number
}

interface DistributionSourceTask {
  kind: 'assigned' | 'preassign'
  reserve?: boolean
  start: string
  end: string
}

interface DistributionSourceCrew {
  crew_id: string
  rank: string
  tasks: DistributionSourceTask[]
}

interface DistributionSourceDemand {
  rank: string
  reserve: boolean
  start: string
  end: string
}

interface DistributionSourceTimezone {
  base: string
  tz: string
}

/**
 * Raw data the frontend needs to compute the distribution view client-side, exactly
 * like the Report's ScheduleDistribution (which buckets days in the browser so rank
 * and timezone filters are instant). Persisted under the `distribution` result type;
 * older scenarios keep the legacy flat DistributionReportRow[] array there instead.
 */
interface DistributionSource {
  version: 2
  window: { start: string; end: string } // Z-suffix ISO UTC instants, end exclusive
  timezones: DistributionSourceTimezone[]
  crews: DistributionSourceCrew[]
  demand: DistributionSourceDemand[]
}

interface CoverageSummary {
  total: number
  preassigned: number
  optimized: number
  coveredSlots: number
  plannedSlots: number
  averageCoverage: number
}

const summarizeLinesAndCoverage = (
  group: 'FLY' | 'RES',
  pairings: Map<string, string>,
  planByPairing: Map<string, number>,
  openByPairing: Map<string, number>,
  paByPairing: Map<string, Set<string>>,
  crByPairing: Map<string, Set<string>>,
  includedPairingIds?: ReadonlySet<string>,
): CoverageSummary => {
  let total = 0
  let preassigned = 0
  let optimized = 0
  let coveredSlots = 0
  let plannedSlots = 0
  let coverageSum = 0
  let coverageDen = 0

  for (const [pid, ag] of pairings) {
    if (ag !== group) continue
    // The input file contains every candidate pairing. The DB-backed Gantt
    // only renders FLY pairings that survived result loading and can be
    // resolved to a valid roster/pairing row. RES lines are kept from the
    // source set because an uncovered reserve line is still visible in Gantt.
    if (group === 'FLY' && includedPairingIds && !includedPairingIds.has(pid)) continue
    total += 1
    const pa = paByPairing.get(pid)?.size ?? 0
    const cr = crByPairing.get(pid)?.size ?? 0
    const plan = planByPairing.get(pid) ?? 0
    const open = openByPairing.get(pid) ?? plan
    if (pa > 0 && open <= 0) preassigned += 1
    else optimized += 1
    if (plan > 0) {
      const covered = Math.min(plan, pa + cr)
      coveredSlots += covered
      plannedSlots += plan
      coverageSum += covered / plan
      coverageDen += 1
    }
  }

  return {
    total,
    preassigned,
    optimized,
    coveredSlots,
    plannedSlots,
    averageCoverage: coverageDen > 0 ? coverageSum / coverageDen : 0,
  }
}

interface GanttMetricScope {
  crewIds: string[]
  flyPairingIds: Set<string>
}

const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const pairingScopeArgs = (
  scope: { strDtLoc: Date; endDtLoc: Date; filterParams: Record<string, unknown>; division?: string | null },
) => {
  const fp = (scope.filterParams ?? {}) as Record<string, Record<string, unknown>>
  const pairingFilter = (fp.pairing ?? {}) as Record<string, unknown>
  const duration = (pairingFilter.duration ?? {}) as Record<string, unknown>
  return {
    strDtLoc: scope.strDtLoc,
    endDtLoc: scope.endDtLoc,
    division: normalizeCrewDivision(scope.division),
    bases: (pairingFilter.bases as string[] | undefined) ?? [],
    ranks: (pairingFilter.ranks as string[] | undefined) ?? [],
    fleets: (pairingFilter.fleets as string[] | undefined) ?? [],
    types: (pairingFilter.types as string[] | undefined) ?? [],
    duration: {
      min: numberOrNull(duration.min),
      max: numberOrNull(duration.max),
    },
    compositionTable: `${liveSchema()}.pairing_composition`,
    compositionScenarioId: 0,
    includeDateRange: true,
  }
}

/**
 * Read the same loaded result scope used by the DB-backed Scenario Gantt.
 * Pairing scope follows the Gantt contract: Pairing Filter candidates plus
 * roster/preassignment-linked pairings. Empty/unfilled filtered pairings must
 * remain counted even after the last roster row is removed.
 */
const loadGanttMetricScope = async (
  fastify: FastifyInstance,
  scenarioId: number,
  crewScope: { strDtLoc: Date; endDtLoc: Date; filterParams: Record<string, unknown>; division?: string | null },
): Promise<GanttMetricScope | null> => {
  const pool = (fastify as FastifyInstance & {
    pgPool?: { query: (sqlText: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
  }).pgPool
  if (!pool) return null

  const crewResult = await fastify.db.execute<{ crew_id: string }>(sql`
    SELECT crew_id
    FROM ${sql.raw(liveSchema())}.crew
    WHERE crew_id IN (${crewIdSet(crewScope, liveSchema())})
  `)
  const scopeWhere = buildScenarioPairingScopeWhere(pairingScopeArgs(crewScope))
  const filteredPairingRows = await fastify.db.execute<{ id: string; assignment_group: string | null }>(sql`
    SELECT id, assignment_group
    FROM ${sql.raw(liveSchema())}.pairing pairing
    WHERE scenario_id = 0
      AND is_deleted = 0
      AND ${scopeWhere}
  `)
  const rosterRows = await pool.query(
    `SELECT DISTINCT rf.crew_id, rf.pairing_id, upper(coalesce(p.assignment_group, '')) AS pairing_group
       FROM ${scenarioSchema()}.roster_flight rf
       JOIN ${liveSchema()}.crew c ON c.crew_id = rf.crew_id
       LEFT JOIN ${liveSchema()}.pairing p ON p.id = rf.pairing_id
      WHERE rf.scenario_id = $1
        AND rf.is_deleted = 0`,
    [scenarioId],
  )

  const crewIds = [...new Set(crewResult.rows.map((row) => String(row.crew_id ?? '')).filter(Boolean))]
  const flyPairingIds = new Set<string>()
  for (const row of filteredPairingRows.rows) {
    if (String(row.assignment_group ?? '').toUpperCase() === 'FLY') {
      flyPairingIds.add(String(row.id))
    }
  }
  for (const id of rosterRows.rows
      .filter((row) => row.pairing_id != null && String(row.pairing_group ?? '') === 'FLY')
      .map((row) => String(row.pairing_id))) {
    flyPairingIds.add(id)
  }
  if (crewIds.length === 0 && flyPairingIds.size === 0) return null
  return { crewIds, flyPairingIds }
}

export const syncScenarioPairingKpisFromDb = async (
  fastify: FastifyInstance,
  scenarioId: number,
  scope: { strDtLoc: Date; endDtLoc: Date; filterParams: Record<string, unknown>; division?: string | null },
  updatedBy = 'scenario_patch',
): Promise<void> => {
  const scopeWhere = buildScenarioPairingScopeWhere(pairingScopeArgs(scope))
  const filteredPairingRows = await fastify.db.execute<{ id: string; assignment_group: string | null }>(sql`
    SELECT id, assignment_group
    FROM ${sql.raw(liveSchema())}.pairing pairing
    WHERE scenario_id = 0
      AND is_deleted = 0
      AND ${scopeWhere}
  `)

  const pairingGroup = new Map<string, string>()
  for (const row of filteredPairingRows.rows) {
    pairingGroup.set(String(row.id), String(row.assignment_group ?? 'FLY').toUpperCase())
  }

  const roster = await fastify.pgPool.query<{
    pairing_id: string
    source: string | null
    crew_id: string
    roster_acting_rank: string | null
    assignment_group: string | null
  }>(
    `SELECT rf.pairing_id, rf.source, rf.crew_id, rf.roster_acting_rank,
            upper(coalesce(p.assignment_group, rf.assignment_group, 'FLY')) AS assignment_group
       FROM ${scenarioSchema()}.roster_flight rf
       LEFT JOIN ${liveSchema()}.pairing p ON p.id = rf.pairing_id
      WHERE rf.scenario_id = $1
        AND rf.is_deleted = 0
        AND rf.pairing_id IS NOT NULL`,
    [scenarioId],
  )
  for (const row of roster.rows) {
    pairingGroup.set(String(row.pairing_id), String(row.assignment_group ?? 'FLY').toUpperCase())
  }

  const pairingIds = [...pairingGroup.keys()].map((id) => Number(id)).filter((id) => Number.isFinite(id))
  const compRows = pairingIds.length === 0
    ? []
    : (await fastify.pgPool.query<{
      pairing_id: string
      acting_rank: string | null
      plan: string | number | null
    }>(
      `SELECT pairing_id, acting_rank, plan
         FROM ${liveSchema()}.pairing_composition
        WHERE scenario_id = 0
          AND pairing_id = ANY($1::bigint[])
          AND is_deleted = 0`,
      [pairingIds],
    )).rows

  const planByPairing = new Map<string, number>()
  const paByPairing = new Map<string, Set<string>>()
  const crByPairing = new Map<string, Set<string>>()
  for (const row of compRows) {
    const pid = String(row.pairing_id)
    planByPairing.set(pid, (planByPairing.get(pid) ?? 0) + Number(row.plan ?? 0))
  }
  for (const row of roster.rows) {
    const pid = String(row.pairing_id)
    const source = String(row.source ?? 'CR').toUpperCase()
    const target = source === 'PA' || source === 'LEADIN' ? paByPairing : crByPairing
    addSet(target, pid, row.crew_id)
  }

  const summarizeCurrent = (group: 'FLY' | 'RES'): CoverageSummary => {
    let total = 0
    let preassigned = 0
    let optimized = 0
    let coveredSlots = 0
    let plannedSlots = 0
    let coverageSum = 0
    let coverageDen = 0
    for (const [pid, ag] of pairingGroup) {
      if (ag !== group) continue
      total += 1
      const plan = planByPairing.get(pid) ?? 0
      const assigned = new Set([
        ...[...(paByPairing.get(pid) ?? new Set<string>())],
        ...[...(crByPairing.get(pid) ?? new Set<string>())],
      ]).size
      const open = Math.max(0, plan - assigned)
      if ((paByPairing.get(pid)?.size ?? 0) > 0 && open <= 0) preassigned += 1
      else optimized += 1
      if (plan > 0) {
        const covered = Math.min(plan, assigned)
        coveredSlots += covered
        plannedSlots += plan
        coverageSum += covered / plan
        coverageDen += 1
      }
    }
    return { total, preassigned, optimized, coveredSlots, plannedSlots, averageCoverage: coverageDen > 0 ? coverageSum / coverageDen : 0 }
  }

  const fly = summarizeCurrent('FLY')
  const res = summarizeCurrent('RES')
  const lineRows = [
    { kpiNames: 'Pairing Lines', kpiValues: String(fly.total), description: `Pre-Assignment: ${fly.preassigned} / Optimize: ${fly.optimized}`, idx: KpiOrder.pairingLines, type: 'UTILIZATION' },
    { kpiNames: 'Reserve Lines', kpiValues: String(res.total), description: `Pre-Assignment: ${res.preassigned} / Optimize: ${res.optimized}`, idx: KpiOrder.reserveLines, type: 'UTILIZATION' },
    { kpiNames: 'Pairing Coverage', kpiValues: `${(fly.averageCoverage * 100).toFixed(1)}%`, description: `${fly.coveredSlots} / ${fly.plannedSlots} planned slots`, idx: KpiOrder.pairingCoverage, type: 'UTILIZATION' },
    { kpiNames: 'Reserve Coverage', kpiValues: `${(res.averageCoverage * 100).toFixed(1)}%`, description: `${res.coveredSlots} / ${res.plannedSlots} planned slots`, idx: KpiOrder.reserveCoverage, type: 'UTILIZATION' },
  ]
  const current = (await getScenarioResults(fastify, scenarioId)).kpi as Array<Record<string, unknown>>
  const lineNames = new Set(lineRows.map((row) => row.kpiNames))
  const merged = [...current.filter((row) => !lineNames.has(String(row.kpiNames))), ...lineRows]
    .map((row, index) => ({ ...row, id: index + 1, scenarioId }))
  await upsertScenarioResultJson(fastify, scenarioId, 'kpi', merged, updatedBy)
}

const fallbackCreditFromGz = (
  yearMonth: string,
  rpStart: string,
  rpEnd: string,
  crewIds: string[],
  inSections: Record<string, Record<string, string>[]>,
  outSections: Record<string, Record<string, string>[]>,
): CreditSummary => {
  const dutyRows = section(inSections, 'PairingDuty', 'pairing_segment')
  const dutyCredit = new Map<string, number>()
  const dutyStart = new Map<string, string>()

  for (const row of dutyRows) {
    const pid = val(row, 'pairingId', 'pairing_id')
    const seq = val(row, 'dutySeq', 'duty_seq')
    if (!pid || !seq) continue
    const key = `${pid}:${seq}`
    const mins = numVal(row, 'creditedMinutes', 'duty_act_credited_minutes')
    if (mins > (dutyCredit.get(key) ?? 0)) dutyCredit.set(key, mins)
    const start = val(row, 'actStrDtUtc', 'act_str_dt_utc', 'duty_sch_str_dt_utc', 'sch_str_dt_utc')
    if (start && !dutyStart.has(key)) dutyStart.set(key, dateOnlyFrom(start))
  }

  const creditByCrew = new Map<string, number>()
  for (const assignment of section(outSections, 'ASSIGNMENTS')) {
    const source = val(assignment, 'source')
    if (source && source !== 'CR') continue
    const crewId = val(assignment, 'crew_id', 'crewId')
    const pid = val(assignment, 'pairing_id', 'pairingId')
    if (!crewId || !pid) continue
    for (const [key, mins] of dutyCredit) {
      if (!key.startsWith(`${pid}:`)) continue
      const dutyDate = dutyStart.get(key)
      if (rpStart && dutyDate && dutyDate < rpStart) continue
      if (rpEnd && dutyDate && dutyDate > rpEnd) continue
      creditByCrew.set(crewId, (creditByCrew.get(crewId) ?? 0) + mins)
    }
  }

  return summarizeCredit(yearMonth, crewIds, creditByCrew)
}

const summarizeCredit = (
  yearMonth: string,
  crewIds: string[],
  creditByCrew: Map<string, number>,
): CreditSummary => {
  let totalCreditMin = 0
  let nonZeroCrew = 0
  let highestMin = 0
  for (const crewId of crewIds) {
    const credit = creditByCrew.get(crewId) ?? 0
    if (credit <= 0) continue
    totalCreditMin += credit
    nonZeroCrew += 1
    highestMin = Math.max(highestMin, credit)
  }
  const totalCrews = crewIds.length
  return {
    yearMonth,
    totalCreditMin,
    nonZeroCrew,
    zeroCrew: Math.max(0, totalCrews - nonZeroCrew),
    avgHours: nonZeroCrew > 0 ? totalCreditMin / nonZeroCrew / 60 : 0,
    highestHours: highestMin / 60,
  }
}

const buildCreditRows = (
  crewIds: string[],
  rankByCrew: Map<string, string>,
  creditByCrew: Map<string, number>,
): CreditReportRow[] => crewIds.map((crewId) => {
  const minutes = creditByCrew.get(crewId) ?? 0
  const hours = Number((minutes / 60).toFixed(1))
  return {
    crew_id: crewId,
    base: '',
    rank: rankByCrew.get(crewId) || 'UNK',
    credited_hours: hours,
    credit_min: null,
    credit_max: null,
    pre_assigned_types: '',
    in_range: true,
    available_days: null,
    per_day_rate: null,
    period_credit_target: null,
    target_gap: null,
    preassign_rest_days: null,
    required_dayoff: null,
    actual_dayoff: null,
    dayoff_ok: null,
  }
})

const compactCreditRows = (
  value: unknown,
  crewIds: string[],
): CreditReportRow[] => {
  if (!Array.isArray(value)) return []
  const allowed = new Set(crewIds)
  return value
    .filter((row): row is Record<string, unknown> => (
      Boolean(row) && typeof row === 'object' && !Array.isArray(row)
    ))
    .filter((row) => allowed.size === 0 || allowed.has(String(row.crew_id ?? '')))
    .map((row) => ({
      crew_id: String(row.crew_id ?? ''),
      base: String(row.base ?? ''),
      rank: String(row.rank ?? 'UNK'),
      credited_hours: row.credited_hours == null ? null : Number(row.credited_hours),
      credit_min: row.credit_min == null ? (row.target_min == null ? null : Number(row.target_min)) : Number(row.credit_min),
      credit_max: row.credit_max == null ? (row.target_max == null ? null : Number(row.target_max)) : Number(row.credit_max),
      pre_assigned_types: String(row.pre_assigned_types ?? ''),
      in_range: row.in_range == null ? null : Boolean(row.in_range),
      available_days: row.available_days == null ? null : Number(row.available_days),
      per_day_rate: row.per_day_rate == null ? null : Number(row.per_day_rate),
      period_credit_target: row.period_credit_target == null ? null : Number(row.period_credit_target),
      target_gap: row.target_gap == null ? null : Number(row.target_gap),
      preassign_rest_days: row.preassign_rest_days == null ? null : Number(row.preassign_rest_days),
      required_dayoff: row.required_dayoff == null ? null : Number(row.required_dayoff),
      actual_dayoff: row.actual_dayoff == null ? null : Number(row.actual_dayoff),
      dayoff_ok: row.dayoff_ok == null ? null : Boolean(row.dayoff_ok),
    }))
    .filter((row) => row.crew_id.length > 0)
}

const buildDutyCreditByPairing = (sections: Record<string, Record<string, string>[]>): Map<string, number> => {
  const dutyCredit = new Map<string, number>()
  for (const row of section(sections, 'PairingDuty', 'pairing_segment')) {
    const pid = val(row, 'pairingId', 'pairing_id')
    if (!pid) continue
    dutyCredit.set(pid, (dutyCredit.get(pid) ?? 0) + numVal(row, 'creditedMinutes', 'duty_act_credited_minutes'))
  }
  return dutyCredit
}

export const buildUncoveredRows = (
  inSections: Record<string, Record<string, string>[]>,
  pairings: Map<string, string>,
  rankByCrew: Map<string, string>,
  paByPairing: Map<string, Set<string>>,
  crByPairing: Map<string, Set<string>>,
): UncoveredReportRow[] => {
  const pairingRows = new Map<string, Record<string, string>>()
  for (const row of section(inSections, 'pairing', 'Pairing', 'PAIRINGS')) {
    const pid = val(row, 'id', 'pairing_id', 'pairingId')
    if (pid) pairingRows.set(pid, row)
  }
  const dutyCreditByPairing = buildDutyCreditByPairing(inSections)
  const rows: UncoveredReportRow[] = []

  for (const row of section(inSections, 'pairing_composition', 'PairingComposition')) {
    const pid = val(row, 'pairing_id', 'pairingId')
    if (!pid) continue
    const plan = numVal(row, 'plan', 'required_count', 'planValue')
    if (plan <= 0) continue
    const rank = val(row, 'rank', 'acting_rank', 'crew_rank', 'composition_rank').toUpperCase()
    const matchesRank = (crewId: string): boolean => !rank || (rankByCrew.get(crewId) || '').toUpperCase() === rank
    const crCrew = [...(crByPairing.get(pid) ?? new Set<string>())].filter(matchesRank)
    const assignedCrew = new Set<string>([
      ...[...(paByPairing.get(pid) ?? new Set<string>())],
      ...crCrew,
    ].filter(matchesRank))
    const explicitlyOpen = val(row, 'open')
    const openBeforeOptimize = explicitlyOpen !== '' ? Number(explicitlyOpen) : Number.NaN
    const uncovered = Number.isFinite(openBeforeOptimize)
      ? Math.max(0, openBeforeOptimize - crCrew.length)
      : Math.max(0, plan - assignedCrew.size)
    if (uncovered <= 0) continue

    const pairing = pairingRows.get(pid)
    const group = (pairings.get(pid) || val(pairing ?? {}, 'assignment_group', 'assignmentGroup') || 'Pairing').toUpperCase()
    const type = group === 'RES' ? 'Reserve' : 'Pairing'
    for (let i = 0; i < uncovered; i += 1) {
      rows.push({
        type,
        pairing_id: pid,
        task_id: `${pid}_${rank || 'ANY'}_${i}`,
        name: val(pairing ?? {}, 'pairing_label', 'pairingLabel', 'name', 'pairing_name', 'pairingName') || pid,
        base: val(pairing ?? {}, 'base') || '',
        rank: rank || 'ANY',
        start_base: val(pairing ?? {}, 'sch_str_dt_utc', 'schStrDtUtc', 'start_base', 'startBase') || '',
        end_base: val(pairing ?? {}, 'sch_end_dt_utc', 'schEndDtUtc', 'end_base', 'endBase') || '',
        credit: Number(((dutyCreditByPairing.get(pid) ?? 0) / 60).toFixed(1)),
      })
    }
  }
  return rows
}

const dateOnly = (value: string): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

const addDays = (date: string, days: number): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

const eachDate = (start: string, end: string): string[] => {
  const first = dateOnly(start)
  const last = dateOnly(end || start)
  if (!first) return []
  const dates: string[] = []
  for (let current = first; current <= (last || first); current = addDays(current, 1)) {
    dates.push(current)
    if (dates.length > 370) break
  }
  return dates
}

const incrementDistribution = (
  rows: Map<string, DistributionReportRow>,
  date: string,
  field: keyof Omit<DistributionReportRow, 'date'>,
  amount = 1,
): void => {
  const row = rows.get(date) ?? {
    date,
    assigned_pairing: 0,
    assigned_reserve: 0,
    uncovered_pairing: 0,
    uncovered_reserve: 0,
    available_crew: 0,
  }
  row[field] += amount
  rows.set(date, row)
}

const buildPairingSpans = (
  inSections: Record<string, Record<string, string>[]>,
): Map<string, { start: string; end: string }> => {
  const spans = new Map<string, { start: string; end: string }>()
  const merge = (pid: string, start: string, end: string): void => {
    const s = dateOnly(start)
    const e = dateOnly(end || start)
    if (!pid || !s) return
    const current = spans.get(pid)
    spans.set(pid, {
      start: !current || s < current.start ? s : current.start,
      end: !current || e > current.end ? e : current.end,
    })
  }
  for (const row of section(inSections, 'pairing', 'Pairing', 'PAIRINGS')) {
    const pid = val(row, 'id', 'pairing_id', 'pairingId')
    merge(
      pid,
      val(row, 'sch_str_dt_utc', 'schStrDtUtc', 'start_date', 'startDate', 'pickup_dt_loc', 'pickupDtLoc'),
      val(row, 'sch_end_dt_utc', 'schEndDtUtc', 'end_date', 'endDate', 'dropoff_dt_loc', 'dropoffDtLoc'),
    )
  }
  for (const row of section(inSections, 'PairingDuty', 'pairing_segment')) {
    const pid = val(row, 'pairingId', 'pairing_id')
    merge(
      pid,
      val(row, 'actStrDtUtc', 'act_str_dt_utc', 'duty_sch_str_dt_utc', 'sch_str_dt_utc'),
      val(row, 'actEndDtUtc', 'act_end_dt_utc', 'duty_sch_end_dt_utc', 'sch_end_dt_utc'),
    )
  }
  return spans
}

export const buildDistributionRows = (
  inSections: Record<string, Record<string, string>[]>,
  outSections: Record<string, Record<string, string>[]>,
  pairings: Map<string, string>,
  crewIds: string[],
  rankByCrew: Map<string, string>,
  paByPairing: Map<string, Set<string>>,
  crByPairing: Map<string, Set<string>>,
  rpStart: string,
  rpEnd: string,
): DistributionReportRow[] => {
  const rows = new Map<string, DistributionReportRow>()
  const spans = buildPairingSpans(inSections)
  const unavailableCrewDays = new Set<string>()
  const busyCrewDays = new Set<string>()
  const busyPairingCrewDays = new Set<string>()
  const busyReserveCrewDays = new Set<string>()
  let assignedPairingSlots = 0
  let assignedReserveSlots = 0
  let uncoveredPairingSlots = 0
  let uncoveredReserveSlots = 0

  const markCrewDays = (target: Set<string>, crewId: string, start: string, end: string): void => {
    if (!crewId) return
    for (const date of eachDate(start, end)) target.add(`${crewId}:${date}`)
  }

  for (const row of section(outSections, 'ASSIGNMENTS')) {
    const pid = val(row, 'pairing_id', 'pairingId')
    const crewId = val(row, 'crew_id', 'crewId')
    const source = (val(row, 'source') || 'CR').toUpperCase()
    if (!pid || !crewId) continue
    const span = spans.get(pid)
    if (!span) continue
    if (source === 'PA' || source === 'LEADIN') {
      markCrewDays(unavailableCrewDays, crewId, span.start, span.end)
      continue
    }
    if (source !== 'CR') continue
    const isReserve = (pairings.get(pid) ?? 'FLY') === 'RES'
    const field = isReserve ? 'assigned_reserve' : 'assigned_pairing'
    if (isReserve) assignedReserveSlots += 1
    else assignedPairingSlots += 1
    for (const date of eachDate(span.start, span.end)) {
      incrementDistribution(rows, date, field)
      busyCrewDays.add(`${crewId}:${date}`)
      const typeBusyCrewDays = isReserve ? busyReserveCrewDays : busyPairingCrewDays
      typeBusyCrewDays.add(`${crewId}:${date}`)
    }
  }

  for (const row of section(outSections, 'ROSTER')) {
    const source = (val(row, 'source') || 'CR').toUpperCase()
    if (source !== 'PA' && source !== 'LEADIN') continue
    markCrewDays(
      unavailableCrewDays,
      val(row, 'crew_id', 'crewId'),
      val(row, 'sch_str_dt_utc', 'schStrDtUtc', 'act_str_dt_utc', 'actStrDtUtc'),
      val(row, 'sch_end_dt_utc', 'schEndDtUtc', 'act_end_dt_utc', 'actEndDtUtc'),
    )
  }

  for (const row of section(inSections, 'pairing_composition', 'PairingComposition')) {
    const pid = val(row, 'pairing_id', 'pairingId')
    if (!pid) continue
    const plan = numVal(row, 'plan', 'required_count', 'planValue')
    if (plan <= 0) continue
    const rank = val(row, 'rank', 'acting_rank', 'crew_rank', 'composition_rank').toUpperCase()
    const matchesRank = (crewId: string): boolean => !rank || (rankByCrew.get(crewId) || '').toUpperCase() === rank
    const crCrew = [...(crByPairing.get(pid) ?? new Set<string>())].filter(matchesRank)
    const assignedCrew = new Set<string>([
      ...[...(paByPairing.get(pid) ?? new Set<string>())],
      ...crCrew,
    ].filter(matchesRank))
    const explicitlyOpen = val(row, 'open')
    const openBeforeOptimize = explicitlyOpen !== '' ? Number(explicitlyOpen) : Number.NaN
    const uncovered = Number.isFinite(openBeforeOptimize)
      ? Math.max(0, openBeforeOptimize - crCrew.length)
      : Math.max(0, plan - assignedCrew.size)
    if (uncovered <= 0) continue
    const span = spans.get(pid)
    if (!span) continue
    const isReserve = (pairings.get(pid) ?? 'FLY') === 'RES'
    const field = isReserve ? 'uncovered_reserve' : 'uncovered_pairing'
    if (isReserve) uncoveredReserveSlots += uncovered
    else uncoveredPairingSlots += uncovered
    for (const date of eachDate(span.start, span.end)) incrementDistribution(rows, date, field, uncovered)
  }

  let availableCrewDays = 0
  for (const date of eachDate(rpStart, rpEnd)) {
    const availableCrew = crewIds.reduce(
      (count, crewId) => count + (unavailableCrewDays.has(`${crewId}:${date}`) ? 0 : 1),
      0,
    )
    incrementDistribution(rows, date, 'available_crew', availableCrew)
    availableCrewDays += availableCrew
  }

  return [...rows.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      assigned_pairing_slots_total: assignedPairingSlots,
      assigned_reserve_slots_total: assignedReserveSlots,
      uncovered_pairing_slots_total: uncoveredPairingSlots,
      uncovered_reserve_slots_total: uncoveredReserveSlots,
      busy_crew_days_total: busyCrewDays.size,
      busy_pairing_crew_days_total: busyPairingCrewDays.size,
      busy_reserve_crew_days_total: busyReserveCrewDays.size,
      available_crew_days_total: availableCrewDays,
    }))
}

/**
 * Normalize an engine time string to a Z-suffixed ISO-8601 UTC instant. The engine
 * emits "2026-07-05 00:00:00" / "2026-07-05T00:00:00" / bare "2026-07-05" — none of
 * which the browser Date parser reliably reads as UTC. Date-only values become
 * local-midnight UTC instants; bare datetimes are read as UTC wall-clock.
 */
const toUtcIso = (value: string): string => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)) {
    const d = new Date(text)
    return Number.isNaN(d.getTime()) ? text : d.toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`
  const dt = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/.exec(text)
  if (dt) {
    const [, y, mo, d, h, mi, s, ms] = dt
    return new Date(Date.UTC(
      Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi),
      Number(s ?? 0), Number(ms ? ms.slice(0, 3).padEnd(3, '0') : 0),
    )).toISOString()
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString()
}

/**
 * Pairing span as real UTC instants, merged by min start / max end across the
 * pairing and PairingDuty sections. Unlike `buildPairingSpans` (date-only merge),
 * this keeps the instant boundaries so the client's half-open [start, end) day
 * overlap reproduces the Report's day bucketing in non-UTC timezones.
 */
const buildPairingSpanInstants = (
  inSections: Record<string, Record<string, string>[]>,
): Map<string, { start: string; end: string }> => {
  const spans = new Map<string, { start: number; end: number }>()
  const merge = (pid: string, start: string, end: string): void => {
    const s = Date.parse(toUtcIso(start))
    const e = Date.parse(toUtcIso(end || start))
    if (!pid || !Number.isFinite(s)) return
    const endMs = Number.isFinite(e) ? e : s
    const current = spans.get(pid)
    spans.set(pid, {
      start: !current || s < current.start ? s : current.start,
      end: !current || endMs > current.end ? endMs : current.end,
    })
  }
  for (const row of section(inSections, 'pairing', 'Pairing', 'PAIRINGS')) {
    const pid = val(row, 'id', 'pairing_id', 'pairingId')
    merge(
      pid,
      val(row, 'sch_str_dt_utc', 'schStrDtUtc', 'start_date', 'startDate', 'pickup_dt_loc', 'pickupDtLoc'),
      val(row, 'sch_end_dt_utc', 'schEndDtUtc', 'end_date', 'endDate', 'dropoff_dt_loc', 'dropoffDtLoc'),
    )
  }
  for (const row of section(inSections, 'PairingDuty', 'pairing_segment')) {
    const pid = val(row, 'pairingId', 'pairing_id')
    merge(
      pid,
      val(row, 'actStrDtUtc', 'act_str_dt_utc', 'duty_sch_str_dt_utc', 'sch_str_dt_utc'),
      val(row, 'actEndDtUtc', 'act_end_dt_utc', 'duty_sch_end_dt_utc', 'sch_end_dt_utc'),
    )
  }
  const out = new Map<string, { start: string; end: string }>()
  for (const [pid, span] of spans) {
    out.set(pid, { start: new Date(span.start).toISOString(), end: new Date(span.end).toISOString() })
  }
  return out
}

const buildTimezoneOptions = (
  baseByCrew: Map<string, string>,
  tzByBase: Map<string, string>,
): DistributionSourceTimezone[] => {
  const byBase = new Map<string, string>()
  for (const base of baseByCrew.values()) {
    const tz = tzByBase.get(base)
    if (base && tz) byBase.set(base, tz)
  }
  return [...byBase.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([base, tz]) => ({ base, tz }))
}

/**
 * Build the client-computable distribution source from the already-parsed input
 * and output sections. Semantics mirror the Report's ScheduleDistribution model:
 * - CR assignments become `assigned` tasks; PA/LEADIN (work activity or day off)
 *   become `preassign` tasks that block a crew's availability.
 * - Uncovered demand is per expanded slot (one entry per open unit of a
 *   composition row), each overlapping its pairing span.
 * - A task counts on every local day its [start, end) span overlaps.
 */
export const buildDistributionSource = (
  inSections: Record<string, Record<string, string>[]>,
  outSections: Record<string, Record<string, string>[]>,
  pairings: Map<string, string>,
  crewIds: string[],
  rankByCrew: Map<string, string>,
  baseByCrew: Map<string, string>,
  tzByBase: Map<string, string>,
  paByPairing: Map<string, Set<string>>,
  crByPairing: Map<string, Set<string>>,
  rpStart: string,
  rpEnd: string,
): DistributionSource => {
  const spans = buildPairingSpanInstants(inSections)
  const tasksByCrew = new Map<string, DistributionSourceTask[]>()

  for (const row of section(outSections, 'ASSIGNMENTS')) {
    const pid = val(row, 'pairing_id', 'pairingId')
    const crewId = val(row, 'crew_id', 'crewId')
    const source = (val(row, 'source') || 'CR').toUpperCase()
    if (!pid || !crewId) continue
    const span = spans.get(pid)
    if (!span) continue
    const tasks = tasksByCrew.get(crewId) ?? []
    if (source === 'PA' || source === 'LEADIN') {
      tasks.push({ kind: 'preassign', start: span.start, end: span.end })
    } else if (source === 'CR') {
      tasks.push({
        kind: 'assigned',
        reserve: (pairings.get(pid) ?? 'FLY') === 'RES',
        start: span.start,
        end: span.end,
      })
    }
    tasksByCrew.set(crewId, tasks)
  }

  for (const row of section(outSections, 'ROSTER')) {
    const source = (val(row, 'source') || 'CR').toUpperCase()
    if (source !== 'PA' && source !== 'LEADIN') continue
    const crewId = val(row, 'crew_id', 'crewId')
    if (!crewId) continue
    const start = toUtcIso(val(row, 'sch_str_dt_utc', 'schStrDtUtc', 'act_str_dt_utc', 'actStrDtUtc'))
    if (!start) continue
    let end = toUtcIso(val(row, 'sch_end_dt_utc', 'schEndDtUtc', 'act_end_dt_utc', 'actEndDtUtc'))
    if (!end) end = `${addDays(start.slice(0, 10), 1)}T00:00:00.000Z`
    const tasks = tasksByCrew.get(crewId) ?? []
    tasks.push({ kind: 'preassign', start, end })
    tasksByCrew.set(crewId, tasks)
  }

  const demand: DistributionSourceDemand[] = []
  for (const row of section(inSections, 'pairing_composition', 'PairingComposition')) {
    const pid = val(row, 'pairing_id', 'pairingId')
    if (!pid) continue
    const plan = numVal(row, 'plan', 'required_count', 'planValue')
    if (plan <= 0) continue
    const rank = val(row, 'rank', 'acting_rank', 'crew_rank', 'composition_rank').toUpperCase()
    const matchesRank = (crewId: string): boolean => !rank || (rankByCrew.get(crewId) || '').toUpperCase() === rank
    const crCrew = [...(crByPairing.get(pid) ?? new Set<string>())].filter(matchesRank)
    const assignedCrew = new Set<string>([
      ...[...(paByPairing.get(pid) ?? new Set<string>())],
      ...crCrew,
    ].filter(matchesRank))
    const explicitlyOpen = val(row, 'open')
    const openBeforeOptimize = explicitlyOpen !== '' ? Number(explicitlyOpen) : Number.NaN
    const uncovered = Number.isFinite(openBeforeOptimize)
      ? Math.max(0, openBeforeOptimize - crCrew.length)
      : Math.max(0, plan - assignedCrew.size)
    if (uncovered <= 0) continue
    const span = spans.get(pid)
    if (!span) continue
    const isReserve = (pairings.get(pid) ?? 'FLY') === 'RES'
    for (let i = 0; i < uncovered; i++) {
      demand.push({ rank: rank || 'UNK', reserve: isReserve, start: span.start, end: span.end })
    }
  }

  return {
    version: 2,
    window: {
      start: `${rpStart}T00:00:00.000Z`,
      end: `${addDays(rpEnd, 1)}T00:00:00.000Z`,
    },
    timezones: buildTimezoneOptions(baseByCrew, tzByBase),
    crews: crewIds.map((crewId) => ({
      crew_id: crewId,
      rank: rankByCrew.get(crewId) ?? 'UNK',
      tasks: tasksByCrew.get(crewId) ?? [],
    })),
    demand,
  }
}

const loadCreditSummary = async (
  fastify: FastifyInstance,
  scenarioId: number,
  yearMonth: string,
  rpStart: string,
  rpEnd: string,
  crewIds: string[],
  rankByCrew: Map<string, string> = new Map(),
): Promise<{ summary: CreditSummary; rows: CreditReportRow[] } | null> => {
  const pool = (fastify as FastifyInstance & { pgPool?: { query: (sqlText: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } }).pgPool
  if (!pool || !yearMonth || !rpStart || !rpEnd || crewIds.length === 0) return null
  const schema = scenarioSchema()
  const rows = await pool.query(
    `SELECT crew_id, SUM(credit) AS credit
       FROM ${schema}.crew_manday_fd_daily
      WHERE scenario_id=$1 AND crew_base_dt >= $2::date AND crew_base_dt <= $3::date
      GROUP BY crew_id
     UNION ALL
     SELECT crew_id, SUM(credit) AS credit
       FROM ${schema}.crew_manday_cc_am_daily
      WHERE scenario_id=$1 AND crew_base_dt >= $2::date AND crew_base_dt <= $3::date
      GROUP BY crew_id`,
    [scenarioId, rpStart, rpEnd],
  )
  const creditByCrew = new Map<string, number>()
  for (const row of rows.rows) {
    creditByCrew.set(String(row.crew_id), Number(row.credit ?? 0))
  }
  return {
    summary: summarizeCredit(yearMonth, crewIds, creditByCrew),
    rows: buildCreditRows(crewIds, rankByCrew, creditByCrew),
  }
}

/**
 * Persist optimization result metadata onto the scenario (approach B: the
 * heavy ro_output.gz stays on engine-server; only metadata is stored here).
 */
export async function saveResult(
  fastify: FastifyInstance,
  meta: ResultMetadata,
  token?: string,
  airline?: string,
): Promise<void> {
  const finalStatus = DONE_STATES.has(meta.status) ? 'DONE' : 'FAILED'

  await fastify.db
    .update(scenario)
    .set({
      fileSize: meta.fileSize,
      checksum: meta.checksum,
      taskId: meta.taskId,
      // Keep a successful scenario RUNNING while the result loader transcribes
      // roster/manday rows. The progress endpoint uses this window to expose
      // the "Writing optimized roster" phase instead of jumping straight to
      // DONE before the database is usable.
      ...(
        finalStatus !== 'DONE' || !meta.taskId || !token
          ? { status: finalStatus }
          : {}
      ),
      optimizedCount: sql`${scenario.optimizedCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(scenario.id, meta.scenarioId))

  if (finalStatus === 'DONE' && meta.filePath) {
    const [row] = typeof fastify.db.select === 'function'
      ? await fastify.db
        .select({ filePaths: scenario.filePaths })
        .from(scenario)
        .where(eq(scenario.id, meta.scenarioId))
        .limit(1)
      : []
    const versions = scenarioVersionService.versionsFor(row ?? {})
    if (!versions.some((version) => version.taskId === meta.taskId || version.filePath === meta.filePath)) {
      const version = meta.version ?? scenarioVersionService.nextVersionFor(row ?? {})
      await scenarioVersionService.appendVersion(
        fastify,
        meta.scenarioId,
        buildScenarioVersionRecord({
          version,
          taskId: meta.taskId,
          status: finalStatus,
          filePath: meta.filePath,
          inputPath: meta.inputPath,
          archivePath: meta.archivePath,
          fileSize: meta.fileSize,
          checksum: meta.checksum,
          executedBy: meta.executedBy,
          executedAt: meta.executedAt,
          fileTimestamp: meta.fileTimestamp,
          algorithmSnapshot: meta.algorithmSnapshot,
          ruleSnapshot: meta.ruleSnapshot,
        }),
      )
    }
  }

  await Promise.all([
    invalidate(fastify.redis, `scenario:${meta.scenarioId}`),
    invalidatePattern(fastify.redis, `scenario:list:*`),
  ])

  // On a completed run, transcribe the result into the partition-backed scenario
  // schema so the DB read path can serve it. A successful engine result is not
  // usable by the DB-backed Gantt until this load commits.
  if (finalStatus === 'DONE' && meta.taskId && token) {
    const { loadScenarioResultIntoDb } = await import('./scenario-result-loader.js')
    try {
      const r = await loadScenarioResultIntoDb(fastify, {
        scenarioId: meta.scenarioId,
        taskId: meta.taskId,
        token,
        airline: airline ?? await resolveFilialeLower(fastify),
      })
      // List "N results" is Redis-cached per query key. saveResult already
      // invalidated on DONE, but clients often re-fetch before CR rows land —
      // that stamps 0 into the unfiltered list key. Re-invalidate after load
      // so search vs full-list stop disagreeing until TTL.
      await invalidatePattern(fastify.redis, `scenario:list:*`)
      fastify.log.info(
        `scenario ${meta.scenarioId} loaded into DB: ${r.roster} roster, ${r.monthly} monthly manday`,
      )
    } catch (err) {
      const message = (err as Error).message
      fastify.log.error(`scenario ${meta.scenarioId} DB load failed: ${message}`)
      await fastify.db
        .update(scenario)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(scenario.id, meta.scenarioId))
      await Promise.all([
        invalidate(fastify.redis, `scenario:${meta.scenarioId}`),
        invalidatePattern(fastify.redis, `scenario:list:*`),
      ])
      throw err
    }

    await fastify.db
      .update(scenario)
      .set({ status: 'DONE', updatedAt: new Date() })
      .where(eq(scenario.id, meta.scenarioId))
    await Promise.all([
      invalidate(fastify.redis, `scenario:${meta.scenarioId}`),
      invalidatePattern(fastify.redis, `scenario:list:*`),
    ])
  }
}

/**
 * Compute rich KPI statistics from optimization gz files and persist them to
 * scenario_result type='kpi'.
 *
 * Canonical KPI set:
 *   1. Crew Utilized
 *   2. Assigned
 *   3. Highest Credit
 *   4. Avg Credit Hours
 *   5. Pairing Lines
 *   6. Reserve Lines
 *   7. Pairing Coverage
 *   8. Reserve Coverage
 */
export async function computeAndPersistKpis(
  fastify: FastifyInstance,
  meta: ResultMetadata,
  token: string,
  airline: string,
): Promise<void> {
  const { scenarioId, taskId } = meta

  const scenarioRows = await fastify.db
    .select({
      strDtLoc: scenario.strDtLoc,
      endDtLoc: scenario.endDtLoc,
      filterParams: scenario.filterParams,
      division: workset.division,
    })
    .from(scenario)
    .innerJoin(workset, eq(workset.id, scenario.worksetId))
    .where(eq(scenario.id, scenarioId))
  const rpStart = dateOnlyFrom(scenarioRows[0]?.strDtLoc)
  const rpEnd = dateOnlyFrom(scenarioRows[0]?.endDtLoc)
  const yearMonth = yearMonthFrom(scenarioRows[0]?.strDtLoc)

  const crewIds: string[] = []
  const pairings = new Map<string, string>()
  const planByPairing = new Map<string, number>()
  const openByPairing = new Map<string, number>()
  const paByPairing = new Map<string, Set<string>>()
  const crByPairing = new Map<string, Set<string>>()
  const assignedCounts = new Map<string, number>()
  let creditSummary: CreditSummary | null = null
  let creditRows: CreditReportRow[] = []
  let uncoveredRows: UncoveredReportRow[] = []
  let distributionSource: DistributionSource | null = null
  const rankByCrew = new Map<string, string>()
  let ganttMetricScope: GanttMetricScope | null = null
  let metadataCreditRows: CreditReportRow[] = []

  try {
    const { engineServerClient } = await import('../engine-server-client.js')
    const [outputGz, inputGz] = await Promise.all([
      engineServerClient.fetchResultFile(taskId, token, airline, scenarioId),
      engineServerClient.fetchInputFile(taskId, token, airline, scenarioId),
    ])

    const outSections = parseSections(outputGz)
    const inSections  = parseSections(inputGz)

    for (const row of section(inSections, 'crew_rank', 'CrewRank')) {
      const crewId = val(row, 'crew_id', 'crewId')
      const rank = val(row, 'rank', 'actingRank') || 'UNK'
      if (crewId && !rankByCrew.has(crewId)) rankByCrew.set(crewId, rank)
    }
    for (const row of section(inSections, 'crew', 'CREWS', 'Crew')) {
      const crewId = val(row, 'crew_id', 'crewId')
      if (!crewId || crewIds.includes(crewId)) continue
      crewIds.push(crewId)
    }

    for (const row of section(inSections, 'pairing', 'Pairing', 'PAIRINGS')) {
      const pid = val(row, 'id', 'pairing_id', 'pairingId')
      if (!pid) continue
      const ag = (val(row, 'assignment_group', 'assignmentGroup') || 'FLY').toUpperCase()
      pairings.set(pid, ag)
    }

    for (const row of section(inSections, 'pairing_composition', 'PairingComposition')) {
      const pid = val(row, 'pairing_id', 'pairingId')
      if (!pid) continue
      const plan = numVal(row, 'plan', 'required_count')
      const open = row.open != null && row.open !== '' ? numVal(row, 'open') : plan - numVal(row, 'fill')
      planByPairing.set(pid, (planByPairing.get(pid) ?? 0) + plan)
      openByPairing.set(pid, (openByPairing.get(pid) ?? 0) + open)
    }

    const seenCrFlyPairings = new Set<string>()
    for (const row of section(outSections, 'ASSIGNMENTS')) {
      const pid = val(row, 'pairing_id', 'pairingId')
      const crewId = val(row, 'crew_id', 'crewId')
      if (!pid || !crewId) continue
      const src = val(row, 'source') || 'CR'
      if (src === 'PA' || src === 'leadin') {
        addSet(paByPairing, pid, crewId)
      } else if (src === 'CR' || !src) {
        addSet(crByPairing, pid, crewId)
        if ((pairings.get(pid) ?? 'FLY') === 'FLY') seenCrFlyPairings.add(pid)
      }
    }
    assignedCounts.set('FLY', seenCrFlyPairings.size)

    for (const row of section(outSections, 'ROSTER')) {
      const src = val(row, 'source') || 'CR'
      if (src !== 'CR') continue
      const group = (val(row, 'assignment_group', 'assignmentGroup') || val(row, 'assignment') || 'GRD').toUpperCase()
      assignedCounts.set(group, (assignedCounts.get(group) ?? 0) + 1)
    }

    ganttMetricScope = await loadGanttMetricScope(fastify, scenarioId, {
      strDtLoc: scenarioRows[0]?.strDtLoc ?? new Date(0),
      endDtLoc: scenarioRows[0]?.endDtLoc ?? new Date(0),
      filterParams: (scenarioRows[0]?.filterParams ?? {}) as Record<string, unknown>,
      division: scenarioRows[0]?.division,
    }).catch((err: unknown) => {
      fastify.log.warn(
        { scenarioId, err: err instanceof Error ? err.message : String(err) },
        'Scenario KPI Gantt metric scope unavailable; using optimizer input scope',
      )
      return null
    })
    const metricCrewIds = ganttMetricScope?.crewIds.length ? ganttMetricScope.crewIds : crewIds
    metadataCreditRows = compactCreditRows(meta.resultMeta?.credit_hour_report, metricCrewIds)

    const loadedCredit = await loadCreditSummary(fastify, scenarioId, yearMonth, rpStart, rpEnd, metricCrewIds, rankByCrew)
    if (loadedCredit) {
      creditSummary = loadedCredit.summary
      creditRows = metadataCreditRows.length ? metadataCreditRows : loadedCredit.rows
    } else {
      creditSummary = fallbackCreditFromGz(yearMonth, rpStart, rpEnd, metricCrewIds, inSections, outSections)
      const creditByCrew = new Map<string, number>()
      const dutyCreditByPairing = buildDutyCreditByPairing(inSections)
      for (const row of section(outSections, 'ASSIGNMENTS')) {
        const source = val(row, 'source')
        if (source && source !== 'CR') continue
        const crewId = val(row, 'crew_id', 'crewId')
        const pid = val(row, 'pairing_id', 'pairingId')
        if (!crewId || !pid) continue
        creditByCrew.set(crewId, (creditByCrew.get(crewId) ?? 0) + (dutyCreditByPairing.get(pid) ?? 0))
      }
      creditRows = metadataCreditRows.length
        ? metadataCreditRows
        : buildCreditRows(metricCrewIds, rankByCrew, creditByCrew)
    }
    uncoveredRows = buildUncoveredRows(inSections, pairings, rankByCrew, paByPairing, crByPairing)
    // Resolve crew primary base → IANA timezone so the frontend can offer the
    // Report's timezone selector. Failures degrade to UTC-only (timezones: []).
    let baseByCrew = new Map<string, string>()
    let tzByBase = new Map<string, string>()
    try {
      if (fastify.pgPool) {
        const pool = fastify.pgPool as { query: (sqlText: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
        const baseResult = await pool.query(
          `SELECT crew_id, base FROM ${liveSchema()}.crew_base
            WHERE crew_id = ANY($1::text[]) AND is_prime_base = 1 AND (exp_dt IS NULL OR exp_dt > now())`,
          [metricCrewIds],
        )
        for (const row of baseResult.rows) {
          const crewId = String(row.crew_id ?? '')
          const base = String(row.base ?? '')
          if (crewId && base) baseByCrew.set(crewId, base)
        }
        const airportResult = await pool.query(
          `SELECT airport, zone_id FROM ${liveSchema()}.airport WHERE airport = ANY($1::text[])`,
          [[...new Set(baseByCrew.values())]],
        )
        for (const row of airportResult.rows) {
          const airport = String(row.airport ?? '')
          const zoneId = String(row.zone_id ?? '')
          if (airport && zoneId) tzByBase.set(airport, zoneId)
        }
      }
    } catch (err) {
      fastify.log.warn(
        { scenarioId, err: err instanceof Error ? err.message : String(err) },
        'Distribution timezone resolution unavailable; using UTC only',
      )
    }
    distributionSource = buildDistributionSource(
      inSections,
      outSections,
      pairings,
      metricCrewIds,
      rankByCrew,
      baseByCrew,
      tzByBase,
      paByPairing,
      crByPairing,
      rpStart,
      rpEnd,
    )
  } catch (err) {
    fastify.log.warn({ scenarioId, err: (err as Error).message }, 'KPI computation from gz failed — writing zero KPI rows')
    const metricCrewIds = ganttMetricScope?.crewIds.length ? ganttMetricScope.crewIds : crewIds
    creditSummary = summarizeCredit(yearMonth, metricCrewIds, new Map())
    creditRows = metadataCreditRows.length
      ? metadataCreditRows
      : buildCreditRows(metricCrewIds, rankByCrew, new Map())
  }

  type KpiInsert = {
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
    scenarioId: number
    kpiNames: string
    kpiValues: string
    description: string
    idx: number
    type: string
  }
  const now  = new Date()
  const base = { createdBy: 'engine', createdAt: now, updatedBy: 'engine', updatedAt: now, scenarioId }
  const rows: KpiInsert[] = []

  const metricCrewIds = ganttMetricScope?.crewIds.length ? ganttMetricScope.crewIds : crewIds
  const metricCrewRankCounts = new Map<string, number>()
  for (const crewId of metricCrewIds) {
    const rank = rankByCrew.get(crewId) ?? 'UNK'
    metricCrewRankCounts.set(rank, (metricCrewRankCounts.get(rank) ?? 0) + 1)
  }
  const totalCrews = metricCrewIds.length
  const rankDesc = orderedBreakdown(metricCrewRankCounts)
  rows.push({ ...base, kpiNames: 'Crew Utilized', kpiValues: String(totalCrews),
    description: rankDesc || 'No crew in scenario scope', idx: KpiOrder.crewUtilized, type: 'UTILIZATION' })

  const assignedTotal = [...assignedCounts.values()].reduce((sum, n) => sum + n, 0)
  rows.push({ ...base, kpiNames: 'Assigned', kpiValues: String(assignedTotal),
    description: orderedBreakdown(assignedCounts) || 'FLY:0', idx: KpiOrder.assigned, type: 'UTILIZATION' })

  const credit = creditSummary ?? summarizeCredit(yearMonth, metricCrewIds, new Map())
  rows.push({ ...base, kpiNames: 'Highest Credit', kpiValues: formatMinutesHours(credit.highestHours * 60),
    description: 'max monthly credit', idx: KpiOrder.highestCredit, type: 'COST' })
  rows.push({ ...base, kpiNames: 'Avg Credit Hours', kpiValues: `${credit.avgHours.toFixed(1)}h`,
    description: `(${periodLabel(credit.yearMonth)}) Total Credit ${formatMinutesHours(credit.totalCreditMin)} / (${totalCrews} - ${credit.zeroCrew}[0 Credit])`,
    idx: KpiOrder.avgCredit, type: 'COST' })

  const fly = summarizeLinesAndCoverage(
    'FLY',
    pairings,
    planByPairing,
    openByPairing,
    paByPairing,
    crByPairing,
    ganttMetricScope?.flyPairingIds,
  )
  const res = summarizeLinesAndCoverage('RES', pairings, planByPairing, openByPairing, paByPairing, crByPairing)
  rows.push({ ...base, kpiNames: 'Pairing Lines', kpiValues: String(fly.total),
    description: `Pre-Assignment: ${fly.preassigned} / Optimize: ${fly.optimized}`, idx: KpiOrder.pairingLines, type: 'UTILIZATION' })
  rows.push({ ...base, kpiNames: 'Reserve Lines', kpiValues: String(res.total),
    description: `Pre-Assignment: ${res.preassigned} / Optimize: ${res.optimized}`, idx: KpiOrder.reserveLines, type: 'UTILIZATION' })
  rows.push({ ...base, kpiNames: 'Pairing Coverage', kpiValues: `${(fly.averageCoverage * 100).toFixed(1)}%`,
    description: `${fly.coveredSlots} / ${fly.plannedSlots} planned slots`, idx: KpiOrder.pairingCoverage, type: 'UTILIZATION' })
  rows.push({ ...base, kpiNames: 'Reserve Coverage', kpiValues: `${(res.averageCoverage * 100).toFixed(1)}%`,
    description: `${res.coveredSlots} / ${res.plannedSlots} planned slots`, idx: KpiOrder.reserveCoverage, type: 'UTILIZATION' })

  await Promise.all([
    upsertScenarioResultJson(fastify, scenarioId, 'raw_result', buildRawResultPayload(meta)),
    upsertScenarioResultJson(fastify, scenarioId, 'kpi', rows.map((row, index) => ({
      id: index + 1,
      scenarioId,
      kpiNames: row.kpiNames,
      kpiValues: row.kpiValues,
      description: row.description,
      idx: row.idx,
      type: row.type,
    }))),
    upsertScenarioResultJson(fastify, scenarioId, 'credit_hours', creditRows),
    upsertScenarioResultJson(fastify, scenarioId, 'uncovered', uncoveredRows),
    upsertScenarioResultJson(fastify, scenarioId, 'distribution', distributionSource),
  ])

  await Promise.all([
    invalidate(fastify.redis, `scenario:kpi:${scenarioId}`),
    invalidate(fastify.redis, `scenario:result:${scenarioId}`),
  ])
}
