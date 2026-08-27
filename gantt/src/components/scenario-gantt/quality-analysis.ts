// gantt/src/components/scenario-gantt/quality-analysis.ts
//
// Pure roster-quality computation for the Scenario Gantt "Quality Analyzer".
// Builds one row per loaded crew from the already-loaded ScenarioGanttData — no
// network, no React (so it is deterministically unit-testable, and the dialog can
// compute it lazily on open without touching §First-Paint).
//
// Scenario-only: this consumes scenario data shapes (source = 'CR' | 'PA'),
// which the Live gantt does not carry. The Live source omits the useQualityAnalysis
// hook entirely, so the button never appears in Live.
import type {
  ScenarioGanttData,
  ScenarioGanttCrew,
  ScenarioGanttPairing,
  ScenarioGanttPairingSegment,
  ScenarioGanttGroundItem,
} from '@/types/scenario-gantt'

/** Parameters driving each quality check — all user-configurable via the Parameter Config tab. */
export interface QualityParams {
  /** P1: minimum consecutive RES/standby days to NOT be flagged. Runs shorter than this are flagged. */
  minConsecutiveResDays: number
  /** P2: maximum consecutive working days before a run is flagged. */
  maxConsecutiveWorkingDays: number
  // P3 (day-off-only) has no configurable params.
  /** P4: maximum working days allowed in the scenario period. */
  maxWorkingDaysInPeriod: number
  /** P4: assignment codes (checked against g.assignment only) that are NOT working days. */
  nonWorkingAssignments: string[]
  /** P4: crew divisions this rule applies to. Crew outside these divisions are exempt (OK). */
  maxWorkingDaysApplicableDivisions: string[]
}

export const DEFAULT_QUALITY_PARAMS: QualityParams = {
  minConsecutiveResDays: 2,
  maxConsecutiveWorkingDays: 6,
  maxWorkingDaysInPeriod: 18,
  nonWorkingAssignments: ['ILL', 'VAC', 'DO'],
  maxWorkingDaysApplicableDivisions: ['P'],
}

/** Backward-compat aliases — imported by the dialog description strings. */
export const MAX_CONSECUTIVE_WORKING_DAYS = DEFAULT_QUALITY_PARAMS.maxConsecutiveWorkingDays
export const MIN_CONSECUTIVE_RESERVE_DAYS = DEFAULT_QUALITY_PARAMS.minConsecutiveResDays

/** Stable criterion key (testid + dedup). */
export type QualityRuleKey =
  | 'standalone-res'
  | 'consecutive-working'
  | 'day-off-only'
  | 'max-working-days'

/**
 * Human-facing naming id per quality criterion. Quality rules are their own category numbered
 * from Qlty-1001 (mirrors the e2e test-id scheme, see docs/test-cases/e2e/README.md). Append the
 * NEXT id here when adding a criterion — never reuse an id.
 */
export const QUALITY_RULE_IDS: Record<QualityRuleKey, string> = {
  'standalone-res':      'Qlty-1001',
  'consecutive-working': 'Qlty-1002',
  'day-off-only':        'Qlty-1003',
  'max-working-days':    'Qlty-1004',
}

/**
 * One quality finding for a crew. The Quality column is a LIST of findings so more
 * criteria can be added later. `ok === true` means the criterion passed (nothing to flag).
 */
export interface QualityFinding {
  /** Stable key for the criterion (testid + dedup). */
  key: QualityRuleKey
  /** Naming id, e.g. "Qlty-1001". */
  id: string
  /** Human label, e.g. "Standalone RES". */
  label: string
  /** Number of offending occurrences (0 ⇒ ok). */
  count: number
  /** Supporting detail rows (isolated reserve dates / long working-run ranges) for the tooltip. */
  detail: string[]
  /** Whether the criterion passed (count === 0). */
  ok: boolean
}

/** One crew's roster-quality row. Credits are raw minutes (the dialog formats them). */
export interface CrewQualityRow {
  crewId: string
  base: string
  rank: string
  /** Credited minutes of lead-in GROUND duties carried into the scenario (source='PA'). */
  leadInCreditMin: number
  /** "Before optimization" — credited minutes of live pre-assigned pairings carried into the scenario. */
  preAssignCreditMin: number
  /** "After optimization" — newly added CR credit from solver pairings and credited RES/SBY ground duties. */
  solverCreditMin: number
  /** Extensible quality findings (standalone RES + consecutive-working). */
  findings: QualityFinding[]
}

/**
 * Reserve/standby predicate. We key on the backend's own group classification
 * (`assignmentGroup === 'SBY'`) so the rule stays data-driven rather than pinned to a
 * hard-coded code list, plus the explicit `RES` code the client named (it can arrive
 * under the generic 'GRD' group).
 */
export const isReserveStandby = (assignmentGroup: string, assignment: string): boolean =>
  assignmentGroup === 'SBY' || assignment === 'RES'

/** Simulator predicate (group/code driven). */
export const isSim = (assignmentGroup: string, assignment: string): boolean =>
  assignmentGroup === 'SIM' || assignment === 'SIM'

/**
 * Day-off predicate. Day-off ground items arrive under the `OFF` group (Canvas color map) or
 * the `DO` group (real optimization output, e.g. scenario 543 crew 1824), with the explicit
 * `DO` code. A roster made up of ONLY these — no flying, reserve, sim, sick leave, vacation or
 * training — means the crew received no assignable work at all.
 */
export const isDayOff = (assignmentGroup: string, assignment: string): boolean =>
  assignmentGroup === 'OFF' || assignmentGroup === 'DO' || assignment === 'DO'

/** Total credited minutes for a pairing = Σ of each distinct duty's credit (deduped by dutySeq). */
const pairingCreditMin = (segs: ScenarioGanttPairingSegment[] | undefined): number => {
  if (!segs) return 0
  const byDuty = new Map<number, number>()
  for (const s of segs) {
    if (s.dutyActCreditedMinutes != null) byDuty.set(s.dutySeq, Math.round(Number(s.dutyActCreditedMinutes)))
  }
  let total = 0
  for (const v of byDuty.values()) total += v
  return total
}

/** Whole-day index (days since epoch, UTC) for an ISO timestamp. */
const dayIndex = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000)
/** Inverse of dayIndex → 'YYYY-MM-DD'. */
const dayKey = (idx: number): string => new Date(idx * 86_400_000).toISOString().slice(0, 10)

/** Every calendar day key (inclusive) spanned by [startIso, endIso]. */
const daysBetween = (startIso: string, endIso: string): string[] => {
  const s = dayIndex(startIso)
  const e = Math.max(s, dayIndex(endIso))
  const out: string[] = []
  for (let d = s; d <= e; d++) out.push(dayKey(d))
  return out
}

/** Filter day-key strings to those within [from, to] inclusive (ISO date lexicographic order). */
const clipDays = (days: string[], from: string, to: string): string[] =>
  days.filter((d) => d >= from && d <= to)

/**
 * Isolated reserve days — a reserve/standby day in a maximal consecutive run of length 1
 * (the "RES + blank + RES" pattern). The client wants a minimum of two consecutive
 * RES/standby, so every length-1 run is a flag.
 */
export const findStandaloneReserveDays = (dayKeys: Iterable<string>): string[] => {
  const uniqueDays = [...new Set(dayKeys)].sort()
  const standalone: string[] = []
  for (let i = 0; i < uniqueDays.length; i++) {
    const idx = dayIndex(uniqueDays[i])
    const prevAdjacent = i > 0 && dayIndex(uniqueDays[i - 1]) === idx - 1
    const nextAdjacent = i < uniqueDays.length - 1 && dayIndex(uniqueDays[i + 1]) === idx + 1
    if (!prevAdjacent && !nextAdjacent) standalone.push(uniqueDays[i])
  }
  return standalone
}

/**
 * Maximal consecutive-working-day runs longer than the limit, as "start–end (Nd)" strings.
 * Working days = flight + sim + reserve/standby (per the client definition).
 */
export const findLongWorkingRuns = (
  dayKeys: Iterable<string>,
  maxDays = MAX_CONSECUTIVE_WORKING_DAYS,
): string[] => {
  const uniqueDays = [...new Set(dayKeys)].sort()
  const runs: string[] = []
  let runStart = 0
  for (let i = 1; i <= uniqueDays.length; i++) {
    const broke = i === uniqueDays.length || dayIndex(uniqueDays[i]) !== dayIndex(uniqueDays[i - 1]) + 1
    if (broke) {
      const len = i - runStart
      if (len > maxDays) runs.push(`${uniqueDays[runStart]}–${uniqueDays[i - 1]} (${len}d)`)
      runStart = i
    }
  }
  return runs
}

/**
 * Qlty-1004: counts distinct working days for a crew within the scenario period.
 * A day is working if the crew has any duty whose `assignment` is NOT in
 * `params.nonWorkingAssignments`. All assigned pairings (FLY/DHD) are always working.
 * Multi-day duties are expanded to daily keys and clipped to [periodStart, periodEnd].
 * Crew outside `params.maxWorkingDaysApplicableDivisions` are exempt (OK, count 0).
 */
export function findMaxWorkingDaysInPeriod(
  crew: ScenarioGanttCrew,
  pairings: ScenarioGanttPairing[],
  groundItems: ScenarioGanttGroundItem[],
  periodStart: string,
  periodEnd: string,
  params: QualityParams,
): QualityFinding {
  if (!params.maxWorkingDaysApplicableDivisions.includes(crew.division)) {
    return {
      key: 'max-working-days',
      id: QUALITY_RULE_IDS['max-working-days'],
      label: 'Max Working Days',
      count: 0,
      detail: [],
      ok: true,
    }
  }

  const workingDays = new Set<string>()

  for (const p of pairings) {
    for (const d of clipDays(daysBetween(p.schStrDtUtc, p.schEndDtUtc || p.schStrDtUtc), periodStart, periodEnd)) {
      workingDays.add(d)
    }
  }

  for (const g of groundItems) {
    if (params.nonWorkingAssignments.includes(g.assignment)) continue
    for (const d of clipDays(daysBetween(g.schStrDtUtc, g.schEndDtUtc || g.schStrDtUtc), periodStart, periodEnd)) {
      workingDays.add(d)
    }
  }

  const count = workingDays.size
  const ok = count <= params.maxWorkingDaysInPeriod
  return {
    key: 'max-working-days',
    id: QUALITY_RULE_IDS['max-working-days'],
    label: 'Max Working Days',
    count: ok ? 0 : 1,
    detail: ok
      ? []
      : [`${count} working days (max ${params.maxWorkingDaysInPeriod}, period ${periodStart}–${periodEnd})`],
    ok,
  }
}

/**
 * Compute the per-crew roster-quality table from a loaded scenario gantt dataset.
 * Crew are returned in the order they appear in `data.crew` (the caller sorts/filters).
 */
export function computeRosterQuality(
  data: ScenarioGanttData,
  params: QualityParams = DEFAULT_QUALITY_PARAMS,
): CrewQualityRow[] {
  const pairingById = new Map<number, ScenarioGanttPairing>(data.pairings.map((p) => [p.pairingId, p]))
  const segsByPairing = new Map<number, ScenarioGanttPairingSegment[]>()
  for (const seg of data.pairingSegments) {
    const list = segsByPairing.get(seg.pairingId) ?? []
    list.push(seg)
    segsByPairing.set(seg.pairingId, list)
  }

  const assignmentsByCrew = new Map<string, typeof data.assignments>()
  for (const a of data.assignments) {
    const list = assignmentsByCrew.get(a.crewId) ?? []
    list.push(a)
    assignmentsByCrew.set(a.crewId, list)
  }
  const groundByCrew = new Map<string, typeof data.groundItems>()
  for (const g of data.groundItems) {
    const list = groundByCrew.get(g.crewId) ?? []
    list.push(g)
    groundByCrew.set(g.crewId, list)
  }

  return data.crew.map((c) => {
    let leadInCreditMin = 0
    let preAssignCreditMin = 0
    let solverCreditMin = 0
    const reserveDays = new Set<string>()
    const workingDays = new Set<string>()
    // For the "day-off only" finding: how many assignable pairings the crew holds and
    // how its ground items split between day-off and everything else.
    let assignedPairingCount = 0
    let dayOffGroundCount = 0
    let nonDayOffGroundCount = 0

    for (const a of assignmentsByCrew.get(c.crewId) ?? []) {
      const pairing = pairingById.get(a.pairingId)
      if (!pairing) continue
      assignedPairingCount++
      const credit = pairingCreditMin(segsByPairing.get(a.pairingId))
      if (a.source === 'PA') preAssignCreditMin += credit
      else solverCreditMin += credit
      // Every assigned pairing is a working duty (flight, or a reserve pairing). Mark all its days.
      if (pairing.schStrDtUtc) {
        for (const d of daysBetween(pairing.schStrDtUtc, pairing.schEndDtUtc || pairing.schStrDtUtc)) workingDays.add(d)
      }
      if (isReserveStandby(pairing.assignmentGroup, pairing.assignment) && pairing.schStrDtUtc) {
        reserveDays.add(pairing.schStrDtUtc.slice(0, 10))
      }
    }

    for (const g of groundByCrew.get(c.crewId) ?? []) {
      const groundCredit = Math.max(0, Math.round(Number(g.actCreditedMinutes ?? 0)))
      if (g.source === 'PA') leadInCreditMin += groundCredit
      const reserve = isReserveStandby(g.assignmentGroup, g.assignment)
      if (g.source === 'CR' && reserve && groundCredit > 0) solverCreditMin += groundCredit
      if (isDayOff(g.assignmentGroup, g.assignment)) dayOffGroundCount++
      else nonDayOffGroundCount++
      if (reserve && g.schStrDtUtc) reserveDays.add(g.schStrDtUtc.slice(0, 10))
      // Working ground = reserve/standby OR sim (day off / leave / training are NOT working).
      if ((reserve || isSim(g.assignmentGroup, g.assignment)) && g.schStrDtUtc) {
        for (const d of daysBetween(g.schStrDtUtc, g.schEndDtUtc || g.schStrDtUtc)) workingDays.add(d)
      }
    }

    const standaloneDates = findStandaloneReserveDays(reserveDays)
    const longRuns = findLongWorkingRuns(workingDays, params.maxConsecutiveWorkingDays)
    // Day-off only = no assigned pairings (no flying/reserve), at least one day off, and NOTHING
    // else on the roster (no sim/leave/vacation/training). A likely data issue — the crew sat the
    // whole horizon idle instead of receiving any assignable work.
    const dayOffOnly = assignedPairingCount === 0 && dayOffGroundCount > 0 && nonDayOffGroundCount === 0

    // P4: max working days in scenario period
    const periodStart = data.scenarioStrDt.slice(0, 10)
    const periodEnd   = data.scenarioEndDt.slice(0, 10)
    const crewPairings = (assignmentsByCrew.get(c.crewId) ?? [])
      .map((a) => pairingById.get(a.pairingId))
      .filter((p): p is ScenarioGanttPairing => p != null)
    const p4Finding = findMaxWorkingDaysInPeriod(
      c, crewPairings, groundByCrew.get(c.crewId) ?? [], periodStart, periodEnd, params,
    )

    const findings: QualityFinding[] = [
      {
        key: 'standalone-res',
        id: QUALITY_RULE_IDS['standalone-res'],
        label: 'Standalone RES',
        count: standaloneDates.length,
        detail: standaloneDates,
        ok: standaloneDates.length === 0,
      },
      {
        key: 'consecutive-working',
        id: QUALITY_RULE_IDS['consecutive-working'],
        label: `Working >${params.maxConsecutiveWorkingDays}d`,
        count: longRuns.length,
        detail: longRuns,
        ok: longRuns.length === 0,
      },
      {
        key: 'day-off-only',
        id: QUALITY_RULE_IDS['day-off-only'],
        label: 'Day-off only',
        count: dayOffOnly ? 1 : 0,
        detail: dayOffOnly ? [`${dayOffGroundCount} days off`] : [],
        ok: !dayOffOnly,
      },
      p4Finding,
    ]

    return { crewId: c.crewId, base: c.base, rank: c.rank, leadInCreditMin, preAssignCreditMin, solverCreditMin, findings }
  })
}
