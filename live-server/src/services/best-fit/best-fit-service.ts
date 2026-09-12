import type { FastifyInstance } from 'fastify'
import type { RankActingMap } from '@rois/shared-rules'
import { validateAssignment } from '@rois/shared-rules'
import { precheckAssignment } from '../assignment/precheck-service.js'
import {
  buildPairingPreviewItems,
  pairingCreditMinutes,
  type PreviewSegmentRow,
} from '../assignment/preview-roster-items.js'
import {
  previewDraftLegality,
  type LegalityPreviewViolation,
  type PreviewRosterItem,
} from '../rule/legality-preview.js'
import { crewStatsService } from '../crew/crew-stats-service.js'
import { CostLibraryService } from '../cost/cost-library-service.js'
import { calculateCost, type CalculationRevision, type CostCalculation } from '../cost/cost-calculator.js'
import { rosterService } from '../roster/roster-service.js'

/**
 * Best-fit crew for open pairings (Live Gantt — see
 * docs/superpowers/specs/2026-09-11-best-fit-crew-batch-design-Ver2.md).
 *
 * Per pairing and open rank slot, this plans which crew could legally take it.
 * Each candidate is simulated in ISOLATION (one crew, one pairing) and compared
 * against that crew's unmodified roster, so "no NEW hard violation" is a real
 * before/after delta rather than a raw after-state check.
 *
 * Read-only: nothing here writes roster, coverage, locks or violations. The
 * caller decides whether to act on a shortlist (assignment still goes through
 * the normal draft/drag path).
 */

// ── Public result shapes ─────────────────────────────────────────────────────

export type BestFitBasis = 'fairness' | 'cost'
export type BestFitLegalityVerdict = 'pass' | 'soft' | 'hard' | 'unknown'
export type BestFitComparison = 'complete' | 'incomplete'

export interface BestFitViolation {
  crewId: string
  ruleCode: string
  ruleInstance: string
  severity: number
  scopeKey: string
  pairingId: number | null
  dutySeq: number | null
  flightId: number | null
  startDt: string | null
  endDt: string | null
  message: string
}

export interface BestFitLegality {
  verdict: BestFitLegalityVerdict
  comparison: BestFitComparison
  /** Findings that appear only after the hypothetical assignment. */
  newViolations: BestFitViolation[]
  /**
   * Findings present before AND after but not identical (different anchor/window/
   * scope). Same rule code with a shifted window means the assignment moved the
   * finding — review, do not silently pass.
   */
  changedViolations: BestFitViolation[]
  /** Findings identical before and after: visible for context, never blocking. */
  existingViolations: BestFitViolation[]
  message?: string
}

export interface BestFitCostMember {
  instanceId: number
  revisionId: number
  name: string
  calculatorCode: string
  status: 'priced' | 'unpriced' | 'disabled' | 'not-applicable'
  amount: number | null
  currencyCode: string
  formula: string
  breakdown: Array<{ label: string; value: string }>
  note?: string
}

export interface BestFitCost {
  status: 'priced' | 'partial' | 'unpriced' | 'unavailable'
  /** Sum of priced members only. `null` when nothing could be priced. */
  amount: number | null
  currencyCode: string | null
  setLabel: string | null
  setVersion: number | null
  members: BestFitCostMember[]
  note?: string
}

export interface BestFitCandidate {
  crewId: string
  name: string
  rank: string
  /** Composition slot this candidate would fill (after rank-acting resolution). */
  rankUsed: string
  base: string
  fleets: string[]
  division: string
  seniority: number | null
  /** Month block hours in minutes — fairness input, never a pay input. */
  mbhMinutes: number
  mcredMinutes: number
  /**
   * False when the crew has no manday activity on record for the roster period.
   * A missing row must never be read as "0 hours flown" — that would rank an
   * unknown crew as the free-est one, on both the fairness and cost bases.
   */
  statsAvailable: boolean
  /** Payable baseline credit in hours — the guarantee calculator's `beforeCredit`. */
  monthCreditHours: number
  cost: BestFitCost
  legality: BestFitLegality
  why: string
}

export interface BestFitSlotResult {
  rank: string
  plan: number
  fill: number
  open: number
  basicMatchCount: number
  checkedCount: number
  /** True when the basic-match list was capped before legality simulation. */
  truncated: boolean
  /** Best candidate among the CHECKED set only. */
  bestCrewId: string | null
  candidates: BestFitCandidate[]
}

export interface BestFitPairingResult {
  pairing: {
    id: number
    label: string | null
    base: string
    fleet: string
    division: string
    assignmentGroup: string | null
    assignment: string
    schStrDtUtc: string | null
    schEndDtUtc: string | null
    blockMinutes: number
    creditMinutes: number
  }
  coverage: 'open' | 'partial'
  slots: BestFitSlotResult[]
  funnel: {
    universe: number
    basic: number
    pass: number
    soft: number
    hard: number
    unknown: number
  }
  engine: { rulesetId?: number; rpFrom?: string; rpTo?: string }
  generatedAt: string
}

export interface BestFitInput {
  pairingId: number
  rulesetId?: number
  rosterPeriod?: string
  rpFrom?: string
  rpTo?: string
  basis?: BestFitBasis
  costSetId?: number
  maxCandidatesPerSlot?: number
  rankSlots?: string[]
}

// ── Internal shapes ──────────────────────────────────────────────────────────

export interface PairingCompositionSlot {
  rank: string
  plan: number
  fill: number
}

export interface PairingBundle {
  id: number
  label: string | null
  base: string
  fleet: string
  division: string
  filiale: string
  assignmentGroup: string | null
  assignment: string
  schStrDtUtc: Date | string
  schEndDtUtc: Date | string
  segments: PreviewSegmentRow[]
  composition: PairingCompositionSlot[]
}

export interface CrewCandidate {
  crewId: string
  name: string
  division: string
  seniority: number | null
  base: string
  rank: string
  fleets: string[]
}

export interface CandidateCostInput {
  pairing: PairingBundle
  crew: CrewCandidate
  pairingCreditMinutes: number
  monthCreditHours: number
}

export interface BestFitDeps {
  loadPairing: (fastify: FastifyInstance, pairingId: number) => Promise<PairingBundle | null>
  loadCrewUniverse: (
    fastify: FastifyInstance,
    args: { division: string; base: string; fleet: string; asOf: Date },
  ) => Promise<CrewCandidate[]>
  loadCrewRoster: (
    fastify: FastifyInstance,
    crewId: string,
    from: string,
    to: string,
  ) => Promise<PreviewRosterItem[]>
  loadRankActing: (fastify: FastifyInstance, filiale: string) => Promise<RankActingMap>
  loadCrewStats: (
    fastify: FastifyInstance,
    crewIds: string[],
    rosterPeriod: string,
  ) => Promise<Record<string, { mbh: number; mcred: number }>>
  evaluateCost: (fastify: FastifyInstance, input: CandidateCostInput, costSetId?: number) => Promise<BestFitCost>
  runLegality: typeof previewDraftLegality
  precheck: typeof precheckAssignment
}

// ── Pure pipeline (unit-testable without DB or engine) ───────────────────────

export const openCompositionSlots = (composition: PairingCompositionSlot[]): PairingCompositionSlot[] =>
  composition.filter((slot) => (slot.plan ?? 0) > (slot.fill ?? 0))

export const classifyCoverageState = (composition: PairingCompositionSlot[]): 'open' | 'partial' => {
  const totalFill = composition.reduce((sum, slot) => sum + (slot.fill ?? 0), 0)
  return totalFill === 0 ? 'open' : 'partial'
}

/**
 * Stage 1 — base + fleet + division + rank via the SHARED rule
 * (`@rois/shared-rules.validateAssignment`), so Best-fit and the assign path can
 * never disagree about who is eligible. Returns the resolved acting rank, which
 * may be a rank-acting downgrade rather than the crew's own rank.
 */
export const resolveSlotForCrew = (
  crew: CrewCandidate,
  pairing: Pick<PairingBundle, 'id' | 'division' | 'composition'>,
  rankActing: RankActingMap,
): { actingRank: string } | null => {
  if (crew.division !== pairing.division) return null
  if (!crew.fleets.length) return null
  const result = validateAssignment(
    { id: crew.crewId, division: crew.division, rank: crew.rank },
    {
      id: pairing.id,
      division: pairing.division,
      composition: pairing.composition.map((slot) => ({
        actingRank: slot.rank,
        plan: slot.plan ?? 0,
        fill: slot.fill ?? 0,
      })),
    },
    rankActing,
  )
  return result.ok ? { actingRank: result.actingRank } : null
}

const violationIdentity = (violation: LegalityPreviewViolation | BestFitViolation): string =>
  [
    violation.ruleCode,
    violation.ruleInstance,
    violation.scopeKey ?? '',
    violation.pairingId ?? '',
    violation.dutySeq ?? '',
    violation.flightId ?? '',
    violation.startDt ?? '',
    violation.endDt ?? '',
  ].join('|')

const toViolation = (violation: LegalityPreviewViolation): BestFitViolation => ({
  crewId: violation.crewId,
  ruleCode: violation.ruleCode,
  ruleInstance: violation.ruleInstance,
  severity: violation.severity,
  scopeKey: violation.scopeKey,
  pairingId: violation.pairingId ?? null,
  dutySeq: violation.dutySeq ?? null,
  flightId: violation.flightId ?? null,
  startDt: violation.startDt ?? null,
  endDt: violation.endDt ?? null,
  message: violation.message,
})

/**
 * Stage 2 — before/after delta.
 *
 * Identity is (rule, instance, scope, pairing, duty, flight, window). A finding
 * that is byte-identical before and after is unchanged context. Anything else is
 * either new or changed, and both are reviewable outcomes:
 *   - hard (severity >= 3) new/changed → candidate excluded
 *   - soft new/changed               → candidate selectable with a warning
 *
 * `comparison` stays 'complete' because both sides ran the same rules over the
 * same scope; a failed engine call is handled by the caller as 'unknown'.
 */
export const classifyLegalityDelta = (
  before: LegalityPreviewViolation[],
  after: LegalityPreviewViolation[],
): BestFitLegality => {
  const beforeByIdentity = new Map<string, LegalityPreviewViolation>()
  for (const violation of before) beforeByIdentity.set(violationIdentity(violation), violation)

  const afterIdentities = new Set(after.map(violationIdentity))
  const newViolations: BestFitViolation[] = []
  const changedViolations: BestFitViolation[] = []

  for (const violation of after) {
    const identity = violationIdentity(violation)
    if (!beforeByIdentity.has(identity)) {
      newViolations.push(toViolation(violation))
      continue
    }
  }

  // A finding that disappeared is not a problem for this candidate. A finding
  // that exists on both sides under the SAME rule + scope but a different anchor
  // means the assignment moved it — treat it as changed and reviewable.
  const newKeys = new Set(newViolations.map((v) => `${v.ruleCode}|${v.ruleInstance}|${v.scopeKey}`))
  for (const violation of after) {
    const identity = violationIdentity(violation)
    if (beforeByIdentity.has(identity)) continue
    const key = `${violation.ruleCode}|${violation.ruleInstance}|${violation.scopeKey}`
    if (!newKeys.has(key)) continue
    const sameRuleBefore = before.filter(
      (v) => `${v.ruleCode}|${v.ruleInstance}|${v.scopeKey}` === key,
    )
    if (sameRuleBefore.length === 0) continue
    // Same rule reported before under a different anchor → changed, not new.
    newViolations.splice(
      newViolations.findIndex((v) => `${v.ruleCode}|${v.ruleInstance}|${v.scopeKey}` === key),
      1,
    )
    changedViolations.push(toViolation(violation))
  }

  const existingViolations = after
    .filter((violation) => beforeByIdentity.has(violationIdentity(violation)))
    .filter((violation) => afterIdentities.has(violationIdentity(violation)))
    .map(toViolation)

  const blocking = [...newViolations, ...changedViolations].filter((v) => v.severity >= 3)
  const soft = [...newViolations, ...changedViolations].filter((v) => v.severity < 3)

  return {
    verdict: blocking.length > 0 ? 'hard' : soft.length > 0 ? 'soft' : 'pass',
    comparison: 'complete',
    newViolations,
    changedViolations,
    existingViolations,
  }
}

const failLegality = (message: string): BestFitLegality => ({
  verdict: 'unknown',
  comparison: 'incomplete',
  newViolations: [],
  changedViolations: [],
  existingViolations: [],
  message,
})

export const describeRankReason = (
  candidate: Pick<BestFitCandidate, 'mbhMinutes' | 'cost' | 'legality' | 'statsAvailable'>,
  basis: BestFitBasis,
): string => {
  if (candidate.legality.verdict === 'hard') {
    const codes = [...candidate.legality.newViolations, ...candidate.legality.changedViolations]
      .filter((v) => v.severity >= 3)
      .map((v) => v.ruleCode)
    return `New hard violation ${codes.join(', ')} — not selectable`
  }
  if (candidate.legality.verdict === 'unknown') return 'Legality not verified — review required'
  if (!candidate.statsAvailable) return 'no manday data for this roster period — ranked after known crew'
  if (basis === 'cost') {
    if (candidate.cost.status === 'priced' && candidate.cost.amount != null) {
      return `lowest incremental cost ${candidate.cost.amount} ${candidate.cost.currencyCode ?? ''}`.trim()
    }
    return `cost ${candidate.cost.status} — ranked by MBH`
  }
  return `lowest MBH ${formatMinutes(candidate.mbhMinutes)}`
}

export const formatMinutes = (minutes: number): string => {
  const value = Math.max(0, Math.round(minutes || 0))
  const hours = Math.floor(value / 60)
  const rest = value % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Cost rank key: complete+priced first, then partially priced, then unpriced/unavailable. */
const costRankKey = (cost: BestFitCost): [number, number] => {
  if (cost.status === 'priced' && cost.amount != null) return [0, cost.amount]
  if (cost.status === 'partial' && cost.amount != null) return [1, cost.amount]
  return [2, Number.POSITIVE_INFINITY]
}

export const rankCandidates = (candidates: BestFitCandidate[], basis: BestFitBasis): BestFitCandidate[] => {
  const eligible = candidates.filter((candidate) => candidate.legality.verdict !== 'hard')
  const blocked = candidates.filter((candidate) => candidate.legality.verdict === 'hard')

  eligible.sort((a, b) => {
    // Unknown manday data cannot win on either basis; it is listed after known crew.
    if (a.statsAvailable !== b.statsAvailable) return a.statsAvailable ? -1 : 1
    if (basis === 'cost') {
      const [aClass, aAmount] = costRankKey(a.cost)
      const [bClass, bAmount] = costRankKey(b.cost)
      if (aClass !== bClass) return aClass - bClass
      if (aAmount !== bAmount) return aAmount - bAmount
    }
    if (a.mbhMinutes !== b.mbhMinutes) return a.mbhMinutes - b.mbhMinutes
    if (a.mcredMinutes !== b.mcredMinutes) return a.mcredMinutes - b.mcredMinutes
    const aSeniority = a.seniority ?? 0
    const bSeniority = b.seniority ?? 0
    if (aSeniority !== bSeniority) return bSeniority - aSeniority
    return a.crewId.localeCompare(b.crewId)
  })

  blocked.sort((a, b) => a.mbhMinutes - b.mbhMinutes || a.crewId.localeCompare(b.crewId))
  return [
    ...eligible.map((candidate) => ({ ...candidate, why: describeRankReason(candidate, basis) })),
    ...blocked.map((candidate) => ({ ...candidate, why: describeRankReason(candidate, basis) })),
  ]
}

// ── Default IO implementations ───────────────────────────────────────────────

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

/**
 * Which cost members can a single "this pairing lands on this crew" decision
 * actually price?
 *
 * Only the guarantee (GH) member: its inputs are the crew's baseline payable
 * credit and the pairing's payable credit, both of which we hold. Every other
 * member needs a trigger the planner has not stated — hotel/room nights need the
 * pairing's layover structure, deadhead needs DHD sectors, callout/day-off-recall
 * fixed fees need a standby or day-off context, delay bands need a delay, booking
 * needs a ticket change. Feeding credit hours into those calculators would invent
 * a cost that no event produced, so they are reported as not-applicable with a
 * reason and excluded from the total (distinct from "applicable but unpriced").
 */
export const costApplicability = (calculatorCode: string, unitCode = ''): 'applicable' | 'not-applicable' => {
  if (calculatorCode === 'guarantee' && unitCode.trim().toLowerCase() === 'credit hour') return 'applicable'
  return 'not-applicable'
}

export const costNotApplicableReason = (calculatorCode: string, unitCode: string): string => {
  const unit = ` (${unitCode})`
  switch (calculatorCode) {
    case 'standby':
      return `Standby credit${unit} applies to an activation, not to staffing this pairing`
    case 'booking':
      return `Booking replacement${unit} needs a booking change event`
    case 'bands':
      return `Delay cost${unit} needs an actual delay`
    case 'fixed':
      return `Fixed fee${unit} needs a callout / day-off-recall / augmentation trigger`
    case 'minimum':
      return `Minimum billable quantity${unit} has no pairing-derived quantity yet`
    case 'quantity':
      return `Quantity cost${unit} needs its own unit count (nights, sectors, seats) derived from the pairing`
    case 'guarantee':
      return `Guarantee member must be priced in credit hours, got${unit}`
    default:
      return `${calculatorCode}${unit} is not derived from a single pairing assignment`
  }
}

export const buildCostInputs = (
  calculatorCode: string,
  unitCode: string,
  input: CandidateCostInput,
): Record<string, number> | null => {
  if (costApplicability(calculatorCode, unitCode) !== 'applicable') return null
  const creditHours = input.pairingCreditMinutes / 60
  return { beforeCredit: input.monthCreditHours, addedCredit: creditHours }
}

const defaultDeps: BestFitDeps = {
  async loadPairing(fastify, pairingId) {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
      `select p.id, p.pairing_label, p.base, p.fleet, p.division, p.filiale, p.assignment_group, p.assignment,
              p.sch_str_dt_utc, p.sch_end_dt_utc
         from pairing p
        where p.id = $1 and p.is_deleted = 0`,
      [pairingId],
    )
    const row = rows[0]
    if (!row) return null

    const composition = (
      await fastify.pgPool.query<Record<string, unknown>>(
        `select acting_rank, plan, fill
           from pairing_composition
          where pairing_id = $1 and is_deleted = 0`,
        [pairingId],
      )
    ).rows.map((slot) => ({
      rank: String(slot.acting_rank ?? ''),
      plan: Number(slot.plan ?? 0),
      fill: Number(slot.fill ?? 0),
    }))

    const segments = (
      await fastify.pgPool.query<Record<string, unknown>>(
        `select duty_seq, seg_seq, flt_id, flt_dt, flt_num, dep_arp, arv_arp, seg_assignment,
                sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
                coalesce(duty_act_credited_minutes, duty_sch_credited_minutes, 0) as credit_minutes
           from pairing_segment
          where pairing_id = $1 and is_deleted = 0
          order by duty_seq, seg_seq`,
        [pairingId],
      )
    ).rows.map((seg) => ({
      dutySeq: Number(seg.duty_seq),
      segSeq: Number(seg.seg_seq),
      fltId: seg.flt_id == null ? null : Number(seg.flt_id),
      fltDt: (seg.flt_dt as Date | string | null) ?? null,
      fltNum: String(seg.flt_num ?? ''),
      depArp: String(seg.dep_arp ?? ''),
      arvArp: String(seg.arv_arp ?? ''),
      segAssignment: (seg.seg_assignment as string | null) ?? null,
      schStrDtUtc: seg.sch_str_dt_utc as Date | string,
      schEndDtUtc: seg.sch_end_dt_utc as Date | string,
      actStrDtUtc: (seg.act_str_dt_utc as Date | string | null) ?? null,
      actEndDtUtc: (seg.act_end_dt_utc as Date | string | null) ?? null,
      schCreditedMinutesSeg: (seg.credit_minutes as string | number | null) ?? null,
    }))

    return {
      id: Number(row.id),
      label: (row.pairing_label as string | null) ?? null,
      base: String(row.base ?? ''),
      fleet: String(row.fleet ?? ''),
      division: String(row.division ?? ''),
      filiale: String(row.filiale ?? ''),
      assignmentGroup: (row.assignment_group as string | null) ?? null,
      assignment: String(row.assignment ?? ''),
      schStrDtUtc: row.sch_str_dt_utc as Date | string,
      schEndDtUtc: row.sch_end_dt_utc as Date | string,
      segments,
      composition,
    }
  },

  async loadCrewUniverse(fastify, { division, base, fleet, asOf }) {
    // Current-effective base / rank / fleet only. Historical (expired) rows must
    // never surface a candidate the rule engine will reject — same stance as
    // recovery-candidates.currentFleetQuals.
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
      `select c.crew_id, c.first_name, c.last_name, c.division, c.seniority_num,
              b.base, r.rank,
              array_agg(distinct f.fleet_specific) as fleets
         from crew c
         join lateral (
           select base from crew_base cb
            where cb.crew_id = c.crew_id and cb.eff_dt <= $1 and (cb.exp_dt is null or cb.exp_dt > $1)
            order by cb.eff_dt desc limit 1
         ) b on true
         join lateral (
           select rank from crew_rank cr
            where cr.crew_id = c.crew_id and cr.eff_dt <= $1 and (cr.exp_dt is null or cr.exp_dt > $1)
            order by cr.eff_dt desc limit 1
         ) r on true
         join crew_fleet f
           on f.crew_id = c.crew_id and f.eff_dt <= $1 and (f.exp_dt is null or f.exp_dt > $1)
        where c.division = $2 and b.base = $3 and f.fleet_specific = $4
          and c.status >= 0
        group by c.crew_id, c.first_name, c.last_name, c.division, c.seniority_num, b.base, r.rank
        order by c.crew_id`,
      [asOf, division, base, fleet],
    )
    return rows.map((row) => ({
      crewId: String(row.crew_id),
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || String(row.crew_id),
      division: String(row.division ?? ''),
      seniority: row.seniority_num == null ? null : Number(row.seniority_num),
      base: String(row.base ?? ''),
      rank: String(row.rank ?? ''),
      fleets: (row.fleets as string[] | null) ?? [],
    }))
  },

  async loadCrewRoster(fastify, crewId, from, to) {
    const items = (await rosterService.getView(fastify, {
      crewIds: [crewId],
      startDate: from,
      endDate: to,
    })) as Array<Record<string, unknown>>

    return items.map((it) => ({
      id: Number(it.id),
      crewId: String(it.crewId),
      pairingId: it.pairingId == null ? null : Number(it.pairingId),
      base: (it.base as string | null) ?? null,
      label: (it.label as string | null) ?? null,
      assignmentGroup: (it.assignmentGroup as string | null) ?? null,
      assignment: (it.assignment as string | null) ?? null,
      division: (it.division as string | null) ?? null,
      flightActingRank: (it.flightActingRank as string | null) ?? null,
      rosterActingRank: (it.rosterActingRank as string | null) ?? null,
      activeRank: (it.activeRank as string | null) ?? null,
      dutySeq: it.dutySeq == null ? null : Number(it.dutySeq),
      segSeq: it.segSeq == null ? null : Number(it.segSeq),
      fltId: it.fltId == null ? null : Number(it.fltId),
      fltDt: toIso(it.fltDt as Date | string | null),
      schStrDtUtc: toIso(it.schStrDtUtc as Date | string | null),
      schEndDtUtc: toIso(it.schEndDtUtc as Date | string | null),
      actStrDtUtc: toIso(it.actStrDtUtc as Date | string | null),
      actEndDtUtc: toIso(it.actEndDtUtc as Date | string | null),
      actRestMin: it.actRestMin == null ? null : Number(it.actRestMin),
      schCreditedMinutes: (it.schCreditedMinutes as string | number | null) ?? null,
      actCreditedMinutes: (it.actCreditedMinutes as string | number | null) ?? null,
      source: (it.source as string | null) ?? null,
    })) as PreviewRosterItem[]
  },

  async loadRankActing(fastify, filiale) {
    const { rows } = await fastify.pgPool.query<Record<string, unknown>>(
      `select active_rank, acting_rank from rank_acting where filiale = $1`,
      [filiale],
    )
    const map: RankActingMap = new Map()
    for (const row of rows) {
      const active = String(row.active_rank ?? '')
      const acting = String(row.acting_rank ?? '')
      if (!active || !acting) continue
      if (!map.has(active)) map.set(active, new Set<string>())
      map.get(active)!.add(acting)
    }
    return map
  },

  async loadCrewStats(fastify, crewIds, rosterPeriod) {
    const stats = await crewStatsService.getStats(fastify, crewIds, rosterPeriod)
    const map: Record<string, { mbh: number; mcred: number }> = {}
    for (const [crewId, value] of Object.entries(stats)) {
      map[crewId] = { mbh: value.mbh, mcred: value.mcred }
    }
    return map
  },

  async evaluateCost(fastify, input, costSetId) {
    const service = new CostLibraryService(fastify.pgPool)
    const catalog = await service.catalog()
    const instances = catalog.instances as Array<Record<string, unknown>>
    const sets = catalog.sets as Array<Record<string, unknown>>

    const set =
      (costSetId != null ? sets.find((s) => Number(s.id) === costSetId) : undefined) ??
      sets.find((s) => Boolean(s.isDefault) && Boolean(s.enabled)) ??
      sets.find((s) => Boolean(s.enabled))

    if (!set) {
      return {
        status: 'unavailable' as const,
        amount: null,
        currencyCode: null,
        setLabel: null,
        setVersion: null,
        members: [],
        note: 'No enabled cost set is configured',
      }
    }

    const members = (set.members as Array<Record<string, unknown>> | undefined) ?? []
    const byInstance = new Map(instances.map((instance) => [Number(instance.id), instance]))
    const results: BestFitCostMember[] = []

    for (const member of members) {
      if (!member.enabled) continue
      const instance = byInstance.get(Number(member.costInstanceId))
      if (!instance) continue
      const revision = instance.latestRevision as Record<string, unknown> | undefined
      if (!revision) continue
      const calculatorCode = String(revision.calculatorCode ?? '')
      const unitCode = String(revision.unitCode ?? '')
      const name = String(instance.name ?? instance.typeCode ?? `cost ${instance.id}`)
      const base: BestFitCostMember = {
        instanceId: Number(instance.id),
        revisionId: Number(revision.id),
        name,
        calculatorCode,
        status: 'not-applicable',
        amount: null,
        currencyCode: String(revision.currencyCode ?? ''),
        formula: '',
        breakdown: [],
      }

      if (costApplicability(calculatorCode, unitCode) === 'not-applicable') {
        results.push({ ...base, note: costNotApplicableReason(calculatorCode, unitCode) })
        continue
      }

      const rawInputs = buildCostInputs(calculatorCode, unitCode, input)
      if (!rawInputs) {
        results.push({ ...base, note: 'No evaluator for this calculator' })
        continue
      }

      let calculation: CostCalculation
      try {
        calculation = calculateCost(revision as unknown as CalculationRevision, rawInputs)
      } catch (err) {
        results.push({ ...base, note: `Cost input rejected: ${(err as Error).message}` })
        continue
      }

      results.push({
        ...base,
        status: calculation.status,
        amount: calculation.amount,
        currencyCode: calculation.currencyCode,
        formula: calculation.formula,
        breakdown: calculation.breakdown,
      })
    }

    const priced = results.filter((member) => member.status === 'priced' && member.amount != null)
    const unpriced = results.filter((member) => member.status === 'unpriced')
    const currencies = [...new Set(priced.map((member) => member.currencyCode))]
    const amount = priced.length > 0 ? priced.reduce((sum, member) => sum + (member.amount ?? 0), 0) : null
    const status: BestFitCost['status'] =
      currencies.length > 1
        ? 'unavailable'
        : priced.length === 0
          ? (unpriced.length > 0 ? 'unpriced' : 'unavailable')
          : unpriced.length > 0
            ? 'partial'
            : 'priced'

    return {
      status,
      amount: currencies.length > 1 ? null : amount,
      currencyCode: currencies.length === 1 ? currencies[0] : null,
      setLabel: String(set.name ?? ''),
      setVersion: set.version == null ? null : Number(set.version),
      members: results,
      ...(currencies.length > 1
        ? { note: 'Cost members use different currencies; a total cannot be summed' }
        : unpriced.length > 0
          ? { note: `${unpriced.length} applicable member(s) have no price — total is incomplete` }
          : {}),
    }
  },

  runLegality: previewDraftLegality,
  precheck: precheckAssignment,
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

const DEFAULT_MAX_CANDIDATES = 6
const DEFAULT_CONCURRENCY = 3

export interface BestFitInternalDeps extends BestFitDeps {
  concurrency?: number
}

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index]!)
    }
  })
  await Promise.all(runners)
  return results
}

/** Inclusive YYYY-MM-DD for the pairing's own day window, padded for the engine. */
export const engineWindow = (pairing: PairingBundle): { from: string; to: string } => {
  const start = new Date(pairing.schStrDtUtc)
  const end = new Date(pairing.schEndDtUtc)
  const day = 86_400_000
  return {
    from: new Date(start.getTime() - 400 * day).toISOString().slice(0, 10),
    to: new Date(end.getTime() + 60 * day).toISOString().slice(0, 10),
  }
}

export const rosterPeriodOf = (value: Date | string): string | null => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}RP${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export const planBestFitForPairing = async (
  fastify: FastifyInstance,
  input: BestFitInput,
  deps: BestFitInternalDeps = defaultDeps,
): Promise<BestFitPairingResult> => {
  const basis: BestFitBasis = input.basis === 'cost' ? 'cost' : 'fairness'
  const maxCandidates = Math.max(1, Math.min(input.maxCandidatesPerSlot ?? DEFAULT_MAX_CANDIDATES, 20))

  const pairing = await deps.loadPairing(fastify, input.pairingId)
  if (!pairing) throw new Error(`Pairing ${input.pairingId} not found`)

  const openSlots = openCompositionSlots(pairing.composition).filter(
    (slot) => !input.rankSlots?.length || input.rankSlots.includes(slot.rank),
  )
  if (openSlots.length === 0) throw new Error(`Pairing ${input.pairingId} has no open composition slot`)

  const asOf = new Date(pairing.schStrDtUtc)
  const [universe, rankActing] = await Promise.all([
    deps.loadCrewUniverse(fastify, {
      division: pairing.division,
      base: pairing.base,
      fleet: pairing.fleet,
      asOf,
    }),
    deps.loadRankActing(fastify, pairing.filiale),
  ])

  const rosterPeriod = input.rosterPeriod ?? rosterPeriodOf(pairing.schStrDtUtc) ?? ''
  const stats = universe.length > 0
    ? await deps.loadCrewStats(fastify, universe.map((crew) => crew.crewId), rosterPeriod)
    : {}
  const rpFrom = input.rpFrom
  const rpTo = input.rpTo
  const creditMinutes = pairingCreditMinutes(pairing.segments)
  const pairingItems = (crewId: string, actingRank: string): PreviewRosterItem[] =>
    buildPairingPreviewItems(pairing, pairing.segments, crewId, actingRank)

  const slots: BestFitSlotResult[] = []
  const funnel = { universe: universe.length, basic: 0, pass: 0, soft: 0, hard: 0, unknown: 0 }

  for (const slot of openSlots) {
    const matches = universe
      .map((crew) => ({ crew, resolved: resolveSlotForCrew(crew, pairing, rankActing) }))
      .filter((entry): entry is { crew: CrewCandidate; resolved: { actingRank: string } } =>
        entry.resolved != null && entry.resolved.actingRank === slot.rank)

    funnel.basic += matches.length

    // Cap BEFORE the engine runs, ordered by the active basis so the cap cannot
    // hide the likely winner.
    const ordered = matches
      .map((entry) => ({
        ...entry,
        mbhMinutes: stats[entry.crew.crewId]?.mbh ?? 0,
        mcredMinutes: stats[entry.crew.crewId]?.mcred ?? 0,
        statsAvailable: (stats[entry.crew.crewId]?.mbh ?? 0) > 0 || (stats[entry.crew.crewId]?.mcred ?? 0) > 0,
      }))
      .sort((a, b) =>
        Number(b.statsAvailable) - Number(a.statsAvailable) ||
        a.mbhMinutes - b.mbhMinutes ||
        a.mcredMinutes - b.mcredMinutes ||
        a.crew.crewId.localeCompare(b.crew.crewId),
      )
    const selected = ordered.slice(0, maxCandidates)

    const evaluated = await mapWithConcurrency(
      selected,
      deps.concurrency ?? DEFAULT_CONCURRENCY,
      async (entry): Promise<BestFitCandidate> => {
        const roster = await deps.loadCrewRoster(fastify, entry.crew.crewId, engineWindow(pairing).from, engineWindow(pairing).to)
        const after = [...roster, ...pairingItems(entry.crew.crewId, entry.resolved.actingRank)]
        const common = {
          contextType: 'live' as const,
          rulesetId: input.rulesetId,
          affectedCrewIds: [entry.crew.crewId],
          focusPairingIds: [pairing.id],
          ...(rpFrom && rpTo ? { rpFrom, rpTo } : {}),
        }

        let legality: BestFitLegality
        try {
          // Baseline: the crew's roster alone. After: the same roster plus THIS
          // crew's hypothetical pairing rows. Alternatives never share one call.
          const [beforeRun, afterRun] = await Promise.all([
            roster.length > 0
              ? deps.runLegality(fastify, { ...common, afterItems: roster })
              : Promise.resolve({ allowed: true, violations: [] as LegalityPreviewViolation[] }),
            deps.runLegality(fastify, { ...common, afterItems: after }),
          ])
          legality = classifyLegalityDelta(beforeRun.violations, afterRun.violations)
        } catch (err) {
          legality = failLegality(`Legality engine failed: ${(err as Error).message}`)
        }

        let cost: BestFitCost
        try {
          cost = await deps.evaluateCost(
            fastify,
            {
              pairing,
              crew: entry.crew,
              pairingCreditMinutes: creditMinutes,
              monthCreditHours: (stats[entry.crew.crewId]?.mcred ?? 0) / 60,
            },
            input.costSetId,
          )
        } catch (err) {
          cost = {
            status: 'unavailable',
            amount: null,
            currencyCode: null,
            setLabel: null,
            setVersion: null,
            members: [],
            note: `Cost evaluation failed: ${(err as Error).message}`,
          }
        }

        return {
          crewId: entry.crew.crewId,
          name: entry.crew.name,
          rank: entry.crew.rank,
          rankUsed: entry.resolved.actingRank,
          base: entry.crew.base,
          fleets: entry.crew.fleets,
          division: entry.crew.division,
          seniority: entry.crew.seniority,
          mbhMinutes: entry.mbhMinutes,
          mcredMinutes: entry.mcredMinutes,
          statsAvailable: entry.statsAvailable,
          monthCreditHours: (stats[entry.crew.crewId]?.mcred ?? 0) / 60,
          cost,
          legality,
          why: '',
        }
      },
    )

    const ranked = rankCandidates(evaluated, basis)
    for (const candidate of ranked) {
      funnel[candidate.legality.verdict] += 1
    }
    const best = ranked.find((candidate) => candidate.legality.verdict !== 'hard' && candidate.legality.verdict !== 'unknown')

    slots.push({
      rank: slot.rank,
      plan: slot.plan,
      fill: slot.fill,
      open: Math.max(0, (slot.plan ?? 0) - (slot.fill ?? 0)),
      basicMatchCount: matches.length,
      checkedCount: ranked.length,
      truncated: matches.length > selected.length,
      bestCrewId: best?.crewId ?? null,
      candidates: ranked,
    })
  }

  return {
    pairing: {
      id: pairing.id,
      label: pairing.label,
      base: pairing.base,
      fleet: pairing.fleet,
      division: pairing.division,
      assignmentGroup: pairing.assignmentGroup,
      assignment: pairing.assignment,
      schStrDtUtc: toIso(pairing.schStrDtUtc),
      schEndDtUtc: toIso(pairing.schEndDtUtc),
      blockMinutes: Math.round(
        pairing.segments.reduce((sum, seg) => {
          const start = new Date(seg.schStrDtUtc).getTime()
          const end = new Date(seg.schEndDtUtc).getTime()
          return sum + (Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60_000 : 0)
        }, 0),
      ),
      creditMinutes,
    },
    coverage: classifyCoverageState(pairing.composition),
    slots,
    funnel,
    engine: { rulesetId: input.rulesetId, rpFrom, rpTo },
    generatedAt: new Date().toISOString(),
  }
}

export const __test = {
  defaultDeps,
  violationIdentity,
  costRankKey,
}

// ── Combined selection preview ───────────────────────────────────────────────

export interface BestFitSelection {
  pairingId: number
  slotRank: string
  crewId: string
}

export interface BestFitCombinedInput {
  selections: BestFitSelection[]
  rulesetId?: number
  rosterPeriod?: string
  rpFrom?: string
  rpTo?: string
  costSetId?: number
}

export interface BestFitCombinedCrewResult {
  crewId: string
  pairingIds: number[]
  addedCreditMinutes: number
  cost: BestFitCost
  violations: BestFitViolation[]
}

export interface BestFitCombinedResult {
  ok: boolean
  /** Hard findings the joint roster produces, across all selected crew. */
  hardViolations: BestFitViolation[]
  softViolations: BestFitViolation[]
  /** Overlaps and duplicate picks detected without the engine. */
  conflicts: Array<{ kind: 'overlap' | 'duplicate'; crewId: string; pairingIds: number[]; message: string }>
  crew: BestFitCombinedCrewResult[]
  totalCost: { amount: number | null; currencyCode: string | null; status: BestFitCost['status']; note?: string }
  comparison: BestFitComparison
  message?: string
  generatedAt: string
}

const toMs = (value: Date | string | null | undefined): number | null => {
  if (value == null) return null
  const time = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/**
 * Joint check for an explicit shortlist.
 *
 * Every previously-ranked candidate was evaluated in ISOLATION, so this is where
 * shared-crew overlaps, cumulative duty/credit limits and co-crew conditions are
 * actually decided: the selected assignments are placed on one hypothetical
 * roster per crew and re-run through the same engine. Cost is recomputed per crew
 * over the COMBINED added credit — summing the independent candidates would miss
 * a crew crossing a guarantee tier because of a second pairing.
 */
export const previewCombinedSelection = async (
  fastify: FastifyInstance,
  input: BestFitCombinedInput,
  deps: BestFitInternalDeps = defaultDeps,
): Promise<BestFitCombinedResult> => {
  const generatedAt = new Date().toISOString()
  const selections = input.selections ?? []
  if (selections.length === 0) {
    return {
      ok: false,
      hardViolations: [],
      softViolations: [],
      conflicts: [],
      crew: [],
      totalCost: { amount: null, currencyCode: null, status: 'unavailable' },
      comparison: 'incomplete',
      message: 'No selection provided',
      generatedAt,
    }
  }

  const conflicts: BestFitCombinedResult['conflicts'] = []
  const seenSlot = new Set<string>()
  for (const selection of selections) {
    const slotKey = `${selection.pairingId}|${selection.slotRank}`
    if (seenSlot.has(slotKey)) {
      conflicts.push({
        kind: 'duplicate',
        crewId: selection.crewId,
        pairingIds: [selection.pairingId],
        message: `Slot ${selection.slotRank} of pairing ${selection.pairingId} is shortlisted more than once`,
      })
    }
    seenSlot.add(slotKey)
  }

  const pairingIds = [...new Set(selections.map((selection) => selection.pairingId))]
  const bundles = new Map<number, PairingBundle>()
  for (const pairingId of pairingIds) {
    const bundle = await deps.loadPairing(fastify, pairingId)
    if (!bundle) throw new Error(`Pairing ${pairingId} not found`)
    bundles.set(pairingId, bundle)
  }

  const byCrew = new Map<string, BestFitSelection[]>()
  for (const selection of selections) {
    const list = byCrew.get(selection.crewId) ?? []
    list.push(selection)
    byCrew.set(selection.crewId, list)
  }

  for (const [crewId, list] of byCrew) {
    const spans = list
      .map((selection) => {
        const bundle = bundles.get(selection.pairingId)!
        return { pairingId: selection.pairingId, start: toMs(bundle.schStrDtUtc), end: toMs(bundle.schEndDtUtc) }
      })
      .filter((span) => span.start != null && span.end != null)
    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length; j += 1) {
        const a = spans[i]!
        const b = spans[j]!
        if (a.start! < b.end! && b.start! < a.end!) {
          conflicts.push({
            kind: 'overlap',
            crewId,
            pairingIds: [a.pairingId, b.pairingId],
            message: `Crew ${crewId} is shortlisted for ${a.pairingId} and ${b.pairingId} with overlapping duties`,
          })
        }
      }
    }
  }

  const rosterPeriod =
    input.rosterPeriod ??
    rosterPeriodOf(bundles.get(pairingIds[0]!)!.schStrDtUtc) ??
    ''
  const stats = await deps.loadCrewStats(fastify, [...byCrew.keys()], rosterPeriod)

  const afterItems: PreviewRosterItem[] = []
  // Baseline = the crews' current rosters only. The delta (below) is what makes a
  // joint verdict meaningful: a crew whose roster already carries an unrelated
  // finding must not block the shortlist for it.
  const baselineItems: PreviewRosterItem[] = []
  const crewResults: BestFitCombinedCrewResult[] = []
  const firstBundle = bundles.get(pairingIds[0]!)!
  const window = engineWindow(firstBundle)

  for (const [crewId, list] of byCrew) {
    const roster = await deps.loadCrewRoster(fastify, crewId, window.from, window.to)
    let addedCreditMinutes = 0
    for (const selection of list) {
      const bundle = bundles.get(selection.pairingId)!
      addedCreditMinutes += pairingCreditMinutes(bundle.segments)
      afterItems.push(...buildPairingPreviewItems(bundle, bundle.segments, crewId, selection.slotRank))
    }
    baselineItems.push(...roster)
    afterItems.push(...roster)
    crewResults.push({
      crewId,
      pairingIds: list.map((selection) => selection.pairingId),
      addedCreditMinutes,
      cost: {
        status: 'unavailable',
        amount: null,
        currencyCode: null,
        setLabel: null,
        setVersion: null,
        members: [],
      },
      violations: [],
    })
  }

  let hardViolations: BestFitViolation[] = []
  let softViolations: BestFitViolation[] = []
  let comparison: BestFitComparison = 'complete'
  let message: string | undefined

  try {
    const common = {
      contextType: 'live' as const,
      rulesetId: input.rulesetId,
      affectedCrewIds: [...byCrew.keys()],
      ...(input.rpFrom && input.rpTo ? { rpFrom: input.rpFrom, rpTo: input.rpTo } : {}),
    }
    // Baseline uses the SAME pairing-scoped overlay as the joint run, with no
    // placeholder items: it removes the shortlisted pairings from the temp roster
    // (they are open, so these crews are not on them) and keeps everything else
    // byte-identical. A window overlay would instead replace a date slice with the
    // loaded roster rows and could drop duties at the slice edges, inventing
    // "new" findings that the assignment did not cause.
    const [baseline, joint] = await Promise.all([
      baselineItems.length > 0
        ? deps.runLegality(fastify, { ...common, afterItems: baselineItems, focusPairingIds: pairingIds })
        : Promise.resolve({ allowed: true, violations: [] as LegalityPreviewViolation[] }),
      deps.runLegality(fastify, { ...common, afterItems, focusPairingIds: pairingIds }),
    ])
    const delta = classifyLegalityDelta(baseline.violations, joint.violations)
    const introduced = [...delta.newViolations, ...delta.changedViolations]
    hardViolations = introduced.filter((violation) => violation.severity >= 3)
    softViolations = introduced.filter((violation) => violation.severity < 3)
    for (const crewResult of crewResults) {
      crewResult.violations = introduced.filter((violation) => violation.crewId === crewResult.crewId)
    }
  } catch (err) {
    comparison = 'incomplete'
    message = `Combined legality check failed: ${(err as Error).message}`
  }

  // Combined cost: one evaluation per crew over ALL of that crew's added credit.
  let costAmount = 0
  let costStatus: BestFitCost['status'] = 'priced'
  let currencyCode: string | null = null
  let costNote: string | undefined
  const firstPairing = firstBundle

  for (const crewResult of crewResults) {
    const crew = {
      crewId: crewResult.crewId,
      name: crewResult.crewId,
      division: firstPairing.division,
      seniority: null,
      base: firstPairing.base,
      rank: '',
      fleets: [] as string[],
    }
    const cost = await deps.evaluateCost(
      fastify,
      {
        pairing: firstPairing,
        crew,
        pairingCreditMinutes: crewResult.addedCreditMinutes,
        monthCreditHours: (stats[crewResult.crewId]?.mcred ?? 0) / 60,
      },
      input.costSetId,
    )
    crewResult.cost = cost
    if (cost.status === 'priced' && cost.amount != null) {
      costAmount += cost.amount
      currencyCode = currencyCode ?? cost.currencyCode
      if (cost.currencyCode && currencyCode && cost.currencyCode !== currencyCode) {
        costStatus = 'unavailable'
        costNote = 'Selected crew evaluate in different currencies; a total cannot be summed'
      }
    } else if (cost.status === 'partial') {
      costStatus = costStatus === 'unavailable' ? 'unavailable' : 'partial'
      costNote = costNote ?? 'At least one crew cost is incomplete'
      if (cost.amount != null) costAmount += cost.amount
    } else {
      costStatus = 'unavailable'
      costNote = costNote ?? cost.note ?? 'At least one crew cost could not be evaluated'
    }
  }

  const blocked = hardViolations.length > 0 || conflicts.length > 0

  return {
    ok: !blocked && comparison === 'complete',
    hardViolations,
    softViolations,
    conflicts,
    crew: crewResults,
    totalCost: {
      amount: costStatus === 'unavailable' ? null : costAmount,
      currencyCode: costStatus === 'unavailable' ? null : currencyCode,
      status: costStatus,
      ...(costNote ? { note: costNote } : {}),
    },
    comparison,
    message,
    generatedAt,
  }
}
