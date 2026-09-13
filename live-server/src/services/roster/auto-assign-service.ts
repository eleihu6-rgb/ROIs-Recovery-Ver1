import { and, asc, between, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crew } from '../../models/crew/crew.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { crewFleet } from '../../models/crew/crew-fleet.js'
import { airport } from '../../models/base/airport.js'
import { assignment as assignmentModel, assignmentGroup as assignmentGroupModel } from '../../models/base/assignment.js'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { pairingComposition } from '../../models/pairing/pairing-composition.js'
import { rule } from '../../models/rule/rule.js'
import { notDeleted } from '../../utils/db.js'
import { precheckAssignment } from '../assignment/precheck-service.js'
import { buildPairingPreviewItems } from '../assignment/preview-roster-items.js'
import {
  previewDraftLegality,
  type LegalityPreviewViolation,
  type PreviewRosterItem,
} from '../rule/legality-preview.js'
import { rosterService } from './roster-service.js'

// ── Public request / response types ──────────────────────────────────────────

export interface AutoAssignInput {
  /** Crew ids in display (top-to-bottom) order. Assigned in this order. */
  crewIds: string[]
  /** Inclusive candidate window (YYYY-MM-DD). */
  startDate: string
  endDate: string
  /** Inclusive rostering-period calendar bounds for 7505/7507 (default = start/end). */
  rpFrom?: string
  rpTo?: string
  /** Optional global fleet override (else each crew's own fleet quals). */
  fleets?: string[]
  policy?: { skipOnSoft?: boolean }
  /** Safety cap on pairings packed per crew. */
  maxPerCrew?: number
  /**
   * Packing strategy across the month:
   *  - 'even' (default): level block hours across 7-day week buckets so the
   *    roster is spread evenly instead of front-loaded on the first days.
   *  - 'earliest': legacy greedy earliest-first pack.
   */
  distribution?: 'even' | 'earliest'
  /**
   * Duty-type configuration (Auto-assign Duties). Omitted ⇒ legacy behaviour:
   * a single un-grouped pairing pass (base+fleet, no window/period limits).
   * Rows are processed in order (default FLY → RES → DO).
   */
  dutyTypes?: DutyTypeConfig[]
}

export interface DutyTypeConfig {
  /** assignment_group code, e.g. 'FLY' | 'RES' | 'DO'. */
  group: string
  /** Max occurrences across the whole date range (null = no limit). */
  periodMax?: number | null
  /** Min occurrences in EVERY rolling 7-day window inside the range (max-gap rule). */
  every7Min?: number | null
  /** Max occurrences in ANY rolling 7-day window inside the range. */
  every7Max?: number | null
}

export interface DutyWindowOutcome {
  start: string
  end: string
  count: number
  minUnmet: boolean
  maxHit: boolean
}

export interface DutyOutcome {
  group: string
  existing: number
  assigned: number
  periodMax: number | null
  every7Min: number | null
  every7Max: number | null
  windows: DutyWindowOutcome[]
}

export interface PlanWarning {
  ruleCode: string
  severity: number
  message: string
}

export interface AssignedGround {
  group: string
  assignment: string
  /** Base-local calendar day (YYYY-MM-DD). */
  day: string
  base: string
  startDtUtc: string
  endDtUtc: string
}

export type StepKind = 'filter' | 'consider' | 'skip' | 'assign' | 'ground' | 'unmet'
export type SkipReason = 'overlap' | 'no-slot' | 'rule' | 'period-max' | 'every7-max' | 'reserve-day'

export type Step =
  | { kind: 'filter'; group?: string; found: number; message: string }
  | { kind: 'consider'; group?: string; pairingId: number; label: string; startDt: string | null; endDt: string | null; rank: string }
  | {
      kind: 'skip'
      group?: string
      pairingId: number
      label: string
      reason: SkipReason
      ruleCode?: string
      ruleName?: string
      severity?: number
      message: string
    }
  | { kind: 'assign'; group?: string; pairingId: number; label: string; rank: string; startDt: string | null; endDt: string | null }
  /** A ground duty (e.g. DO) planned as a base-local full day. */
  | { kind: 'ground'; group: string; assignment: string; day: string; startDt: string; endDt: string; message: string }
  /** A rolling window whose every7Min could not be satisfied. */
  | { kind: 'unmet'; group: string; start: string; end: string; count: number; message: string }

export interface Assigned {
  pairingId: number
  group?: string
  rosterActingRank: string
  label: string
  startDt: string | null
  endDt: string | null
  blockMinutes: number
}

export interface Skipped {
  pairingId: number
  label: string
  reason: SkipReason
  ruleCode?: string
  message: string
}

export interface CrewPlan {
  crewId: string
  crewName: string
  base: string | null
  fleets: string[]
  steps: Step[]
  assigned: Assigned[]
  /** Ground duties (DO, ...) to create via add-ground-task, in plan order. */
  assignedGround: AssignedGround[]
  skipped: Skipped[]
  /** Per duty-type accounting vs the configured limits (empty on the legacy path). */
  outcome: DutyOutcome[]
  /**
   * Soft legality violations left standing on purpose (e.g. 7505 min days off
   * raised once DO rows exist): they name no planned duty, removing a day off
   * cannot fix them, so the dispatcher accepts them at Apply.
   */
  warnings: PlanWarning[]
  summary: { assignedCount: number; skippedCount: number; blockMinutes: number }
}

export interface AutoAssignPlan {
  crews: CrewPlan[]
  summary: { crewCount: number; assignedTotal: number; skippedTotal: number }
}

// ── Internal data shapes ─────────────────────────────────────────────────────

export interface CrewContext {
  crewId: string
  crewName: string
  base: string | null
  fleets: string[]
  division: string | null
}

export interface CandidatePairing {
  id: number
  label: string
  base: string
  fleet: string
  division: string
  assignmentGroup: string | null
  assignment: string
  schStr: Date
  schEnd: Date
}

export interface SegmentRow {
  pairingId: number
  dutySeq: number
  segSeq: number
  fltId: number | null
  fltDt: string | Date | null
  fltNum: string
  depArp: string
  arvArp: string
  segAssignment: string
  schStrDtUtc: Date
  schEndDtUtc: Date
  actStrDtUtc: Date | null
  actEndDtUtc: Date | null
  schCreditedMinutesSeg: string | number | null
}

/**
 * IO boundary. Grouped so the mandated Vitest suite can drive `planAutoAssign`
 * with fakes (no DB, no Rust engine) while the route uses the real implementations.
 */
export interface AutoAssignDeps {
  resolveCrewContext: (
    fastify: FastifyInstance,
    crewId: string,
    overrideFleets: string[] | null,
    refDate: string,
  ) => Promise<CrewContext>
  fetchCandidates: (
    fastify: FastifyInstance,
    args: {
      base: string
      fleets: string[]
      startDate: string
      endDate: string
      /** assignment_group filter (null = any group, legacy). */
      group?: string | null
      /** When false the pool ignores fleet and matches crew division instead (RES). */
      matchFleet?: boolean
      division?: string | null
    },
  ) => Promise<CandidatePairing[]>
  /** IANA zone of a base airport (airport.zone_id), for base-local day maths. */
  resolveBaseZone: (fastify: FastifyInstance, base: string) => Promise<string | null>
  /** Open slots per pairing per acting rank (plan − fill), so one plan never hands one slot to two crew. */
  fetchOpenSlots: (fastify: FastifyInstance, pairingIds: number[]) => Promise<Map<number, Map<string, number>>>
  precheck: typeof precheckAssignment
  fetchExistingRoster: (
    fastify: FastifyInstance,
    crewId: string,
    from: string,
    to: string,
  ) => Promise<PreviewRosterItem[]>
  fetchSegments: (fastify: FastifyInstance, pairingIds: number[]) => Promise<Map<number, SegmentRow[]>>
  /**
   * Scheduled block minutes per pairing (Σ segment sch-end − sch-str), computed
   * in SQL so the 'even' packer can level flying hours across weeks WITHOUT
   * pulling every segment row for every candidate. Matches `blockMinutesOf`.
   */
  fetchCandidateBlockMinutes: (fastify: FastifyInstance, pairingIds: number[]) => Promise<Map<number, number>>
  fetchRuleNames: (fastify: FastifyInstance, ruleCodes: string[]) => Promise<Map<string, string>>
  runLegality: typeof previewDraftLegality
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_TRIM_ITERATIONS = 8

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : null
}

const toMs = (value: Date | string | null | undefined): number | null => {
  const iso = toIso(value)
  if (iso == null) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : null
}

const timeRangesOverlap = (startA: number, endA: number, startB: number, endB: number): boolean =>
  startA < endB && endA > startB

const addDays = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const minYmd = (a: string, b: string): string => (a <= b ? a : b)
const maxYmd = (a: string, b: string): string => (a >= b ? a : b)

const blockMinutesOf = (segs: SegmentRow[]): number => {
  let total = 0
  for (const s of segs) {
    const start = toMs(s.schStrDtUtc)
    const end = toMs(s.schEndDtUtc)
    if (start != null && end != null && end > start) total += (end - start) / 60_000
  }
  return Math.round(total)
}

/** Flight-duty assignment groups: both codes carry the name "Flight Duties" in F8 data. */
const FLY_FAMILY = new Set(['FLY', 'FLT'])

// ── Default (real) IO implementations ────────────────────────────────────────

const defaultDeps: AutoAssignDeps = {
  async resolveCrewContext(fastify, crewId, overrideFleets, refDate) {
    const ref = new Date(`${refDate}T00:00:00Z`)

    const [crewRow] = await fastify.db
      .select({
        firstName: crew.firstName,
        lastName: crew.lastName,
        division: crew.division,
      })
      .from(crew)
      .where(eq(crew.crewId, crewId))
      .limit(1)

    const [baseRow] = await fastify.db
      .select({ base: crewBase.base })
      .from(crewBase)
      .where(
        and(
          eq(crewBase.crewId, crewId),
          lte(crewBase.effDt, ref),
          or(gt(crewBase.expDt, ref), isNull(crewBase.expDt)),
        ),
      )
      .orderBy(desc(crewBase.effDt))
      .limit(1)

    let fleets: string[]
    if (overrideFleets && overrideFleets.length > 0) {
      fleets = [...new Set(overrideFleets)]
    } else {
      const fleetRows = await fastify.db
        .select({ fleet: crewFleet.fleetSpecific })
        .from(crewFleet)
        .where(
          and(
            eq(crewFleet.crewId, crewId),
            lte(crewFleet.effDt, ref),
            or(gt(crewFleet.expDt, ref), isNull(crewFleet.expDt)),
          ),
        )
      fleets = [...new Set(fleetRows.map((r) => r.fleet).filter(Boolean))]
    }

    const crewName = crewRow
      ? `${crewRow.firstName ?? ''} ${crewRow.lastName ?? ''}`.trim() || crewId
      : crewId

    return {
      crewId,
      crewName,
      base: baseRow?.base ?? null,
      fleets,
      division: crewRow?.division ?? null,
    }
  },

  async fetchCandidates(fastify, { base, fleets, startDate, endDate, group = null, matchFleet = true, division = null }) {
    if (matchFleet && fleets.length === 0) return []
    const rows = await fastify.db
      .select({
        id: pairing.id,
        label: pairing.pairingLabel,
        base: pairing.base,
        fleet: pairing.fleet,
        division: pairing.division,
        assignmentGroup: pairing.assignmentGroup,
        assignment: pairing.assignment,
        schStr: pairing.schStrDtUtc,
        schEnd: pairing.schEndDtUtc,
      })
      .from(pairing)
      .where(
        and(
          notDeleted(pairing.isDeleted),
          eq(pairing.base, base),
          matchFleet ? inArray(pairing.fleet, fleets) : undefined,
          !matchFleet && division ? eq(pairing.division, division) : undefined,
          // FLY row = the flight-duty family (FLY + FLT are both "Flight Duties" in data),
          // matching the legacy un-grouped pool; other groups match exactly.
          group ? (group === 'FLY' ? inArray(pairing.assignmentGroup, [...FLY_FAMILY]) : eq(pairing.assignmentGroup, group)) : undefined,
          // Same window semantics as pairing-service.list / the pairing pane:
          // a pairing belongs to the window if it STARTS inside it.
          between(pairing.schStrDtUtc, new Date(`${startDate}T00:00:00Z`), new Date(`${endDate}T23:59:59Z`)),
        ),
      )
      .orderBy(asc(pairing.schStrDtUtc))

    return rows.map((r) => ({
      id: r.id,
      label: r.label ?? `Pairing #${r.id}`,
      base: r.base,
      fleet: r.fleet,
      division: r.division,
      assignmentGroup: r.assignmentGroup,
      assignment: r.assignment,
      schStr: r.schStr,
      schEnd: r.schEnd,
    }))
  },

  async resolveBaseZone(fastify, base) {
    const [row] = await fastify.db
      .select({ zoneId: airport.zoneId })
      .from(airport)
      .where(eq(airport.airport, base))
      .limit(1)
    return row?.zoneId ?? null
  },

  async fetchOpenSlots(fastify, pairingIds) {
    const map = new Map<number, Map<string, number>>()
    if (pairingIds.length === 0) return map
    const rows = await fastify.db
      .select({ pairingId: pairingComposition.pairingId, rank: pairingComposition.actingRank, plan: pairingComposition.plan, fill: pairingComposition.fill })
      .from(pairingComposition)
      .where(and(inArray(pairingComposition.pairingId, pairingIds), notDeleted(pairingComposition.isDeleted)))
    for (const r of rows) {
      if (!r.rank) continue
      const m = map.get(r.pairingId) ?? new Map<string, number>()
      m.set(r.rank, (m.get(r.rank) ?? 0) + Math.max(0, (r.plan ?? 0) - (r.fill ?? 0)))
      map.set(r.pairingId, m)
    }
    return map
  },

  precheck: precheckAssignment,

  async fetchExistingRoster(fastify, crewId, from, to) {
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
      rosterActingRank: (it.flightActingRank as string | null) ?? null,
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
      source: (it.source as string | null) ?? null,
    }))
  },

  async fetchSegments(fastify, pairingIds) {
    const map = new Map<number, SegmentRow[]>()
    if (pairingIds.length === 0) return map
    const rows = await fastify.db
      .select({
        pairingId: pairingSegment.pairingId,
        dutySeq: pairingSegment.dutySeq,
        segSeq: pairingSegment.segSeq,
        fltId: pairingSegment.fltId,
        fltDt: pairingSegment.fltDt,
        fltNum: pairingSegment.fltNum,
        depArp: pairingSegment.depArp,
        arvArp: pairingSegment.arvArp,
        segAssignment: pairingSegment.segAssignment,
        schStrDtUtc: pairingSegment.schStrDtUtc,
        schEndDtUtc: pairingSegment.schEndDtUtc,
        actStrDtUtc: pairingSegment.actStrDtUtc,
        actEndDtUtc: pairingSegment.actEndDtUtc,
        schCreditedMinutesSeg: pairingSegment.schCreditedMinutesSeg,
      })
      .from(pairingSegment)
      .where(and(inArray(pairingSegment.pairingId, pairingIds), notDeleted(pairingSegment.isDeleted)))
      .orderBy(asc(pairingSegment.pairingId), asc(pairingSegment.dutySeq), asc(pairingSegment.segSeq))

    for (const r of rows) {
      const list = map.get(r.pairingId) ?? []
      list.push(r as SegmentRow)
      map.set(r.pairingId, list)
    }
    return map
  },

  async fetchCandidateBlockMinutes(fastify, pairingIds) {
    const map = new Map<number, number>()
    if (pairingIds.length === 0) return map
    const rows = await fastify.db
      .select({
        pairingId: pairingSegment.pairingId,
        blockMinutes: sql<number>`coalesce(sum(greatest(extract(epoch from (${pairingSegment.schEndDtUtc} - ${pairingSegment.schStrDtUtc})) / 60, 0)), 0)`,
      })
      .from(pairingSegment)
      .where(and(inArray(pairingSegment.pairingId, pairingIds), notDeleted(pairingSegment.isDeleted)))
      .groupBy(pairingSegment.pairingId)
    for (const r of rows) map.set(r.pairingId, Math.round(Number(r.blockMinutes)))
    return map
  },

  async fetchRuleNames(fastify, ruleCodes) {
    const map = new Map<string, string>()
    const codes = [...new Set(ruleCodes.map((c) => Number(c)).filter((n) => Number.isFinite(n)))]
    if (codes.length === 0) return map
    const rows = await fastify.db
      .select({ function: rule.function, description: rule.description })
      .from(rule)
      .where(inArray(rule.function, codes))
    for (const r of rows) {
      if (r.description) map.set(String(r.function), r.description)
    }
    return map
  },

  runLegality: previewDraftLegality,
}

// ── Segment → PreviewRosterItem expansion for an accepted pairing ────────────
// Shared with the Best-fit crew planner so both ask the rule engine about an
// assignment in one identical shape (see services/assignment/preview-roster-items.ts).

const expandAccepted = (
  cand: CandidatePairing,
  segs: SegmentRow[],
  crewId: string,
  actingRank: string,
): PreviewRosterItem[] => buildPairingPreviewItems(cand, segs, crewId, actingRank)

// ── Base-local day maths ─────────────────────────────────────────────────────
// Ground duties (DO) are full base-local days and window/period counters are
// keyed by the base-local calendar day a duty starts on.

const fmtCache = new Map<string, Intl.DateTimeFormat>()
const zoneFmt = (zone: string): Intl.DateTimeFormat => {
  let f = fmtCache.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    fmtCache.set(zone, f)
  }
  return f
}

const zoneParts = (ms: number, zone: string): { ymd: string; wallMs: number } => {
  const parts = zoneFmt(zone).formatToParts(new Date(ms))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const y = get('year')
  const mo = get('month')
  const d = get('day')
  const ymd = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { ymd, wallMs: Date.UTC(y, mo - 1, d, get('hour'), get('minute'), get('second')) }
}

/** Base-local calendar day (YYYY-MM-DD) of a UTC instant. */
export const localYmd = (ms: number, zone: string): string => zoneParts(ms, zone).ymd

/** UTC instant of base-local midnight starting `ymd`. */
export const localMidnightUtcMs = (ymd: string, zone: string): number => {
  const guess = Date.parse(`${ymd}T00:00:00Z`)
  const off1 = zoneParts(guess, zone).wallMs - guess
  let r = guess - off1
  const off2 = zoneParts(r, zone).wallMs - r
  if (off2 !== off1) r = guess - off2
  return r
}

const dayList = (from: string, to: string): string[] => {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

// ── Per-crew planner ─────────────────────────────────────────────────────────

interface AcceptedEntry {
  /** Stable key: pairing id for pairings, `ground:<group>:<day>` for ground duties. */
  key: string
  group: string
  cand?: CandidatePairing
  ground?: AssignedGround
  actingRank: string
  items: PreviewRosterItem[]
  blockMinutes: number
  startMs: number
  endMs: number
  /** Base-local day index inside the range (−1 when outside). */
  dayIdx: number
}

/** Legacy path marker: one un-grouped pairing pass, base+fleet, no limits. */
const LEGACY_GROUP = '*'
const isFlyFamily = (g: string): boolean => g === LEGACY_GROUP || FLY_FAMILY.has(g)
/** Pairing-backed duty groups; everything else is placed as a ground duty (DO, …). */
const isPairingGroup = (g: string): boolean => isFlyFamily(g) || g === 'RES' || g === 'SBY'

/** Rolling-window / period counters for one duty type. */
class DutyCounter {
  readonly counts: number[]
  total = 0
  constructor(
    readonly cfg: DutyTypeConfig,
    readonly nDays: number,
  ) {
    this.counts = new Array<number>(nDays).fill(0)
  }
  /** Windows are 7 consecutive days fully inside the range; a short range is one window. */
  get windows(): Array<[number, number]> {
    if (this.nDays <= 7) return [[0, this.nDays - 1]]
    const out: Array<[number, number]> = []
    for (let i = 0; i + 6 < this.nDays; i++) out.push([i, i + 6])
    return out
  }
  windowCount(w: [number, number]): number {
    let c = 0
    for (let i = w[0]; i <= w[1]; i++) c += this.counts[i]
    return c
  }
  windowsContaining(dayIdx: number): Array<[number, number]> {
    return this.windows.filter(([a, b]) => dayIdx >= a && dayIdx <= b)
  }
  /** Why adding one occurrence on `dayIdx` would break a limit, or null when allowed. */
  blocker(dayIdx: number): { reason: 'period-max' | 'every7-max'; message: string } | null {
    const { periodMax, every7Max } = this.cfg
    if (periodMax != null && this.total + 1 > periodMax) {
      return { reason: 'period-max', message: `${this.cfg.group} period max ${periodMax} already reached` }
    }
    if (every7Max != null && dayIdx >= 0) {
      for (const w of this.windowsContaining(dayIdx)) {
        if (this.windowCount(w) + 1 > every7Max) {
          return { reason: 'every7-max', message: `${this.cfg.group} every-7-days max ${every7Max} hit in window day ${w[0] + 1}..${w[1] + 1}` }
        }
      }
    }
    return null
  }
  add(dayIdx: number): void {
    this.total++
    if (dayIdx >= 0) this.counts[dayIdx]++
  }
  remove(dayIdx: number): void {
    this.total--
    if (dayIdx >= 0) this.counts[dayIdx]--
  }
}

const planForCrew = async (
  fastify: FastifyInstance,
  crewId: string,
  input: Required<Pick<AutoAssignInput, 'startDate' | 'endDate'>> & {
    rpFrom: string
    rpTo: string
    fleets: string[] | null
    skipOnSoft: boolean
    maxPerCrew: number
    distribution: 'even' | 'earliest'
    dutyTypes: DutyTypeConfig[] | null
  },
  deps: AutoAssignDeps,
  /** Slots consumed by earlier crew in the same plan: pairingId → rank → count. */
  taken: Map<number, Map<string, number>> = new Map(),
): Promise<CrewPlan> => {
  const takenCount = (pairingId: number, rank: string): number => taken.get(pairingId)?.get(rank) ?? 0
  const takeSlot = (pairingId: number, rank: string, delta: number): void => {
    const m = taken.get(pairingId) ?? new Map<string, number>()
    m.set(rank, Math.max(0, (m.get(rank) ?? 0) + delta))
    taken.set(pairingId, m)
  }
  const steps: Step[] = []
  const skipped: Skipped[] = []
  const legacy = input.dutyTypes == null
  const dutyTypes: DutyTypeConfig[] = legacy ? [{ group: LEGACY_GROUP }] : input.dutyTypes!
  const tag = (g: string): string | undefined => (g === LEGACY_GROUP ? undefined : g)

  const ctx = await deps.resolveCrewContext(fastify, crewId, input.fleets, input.startDate)

  const emptyPlan = (message: string): CrewPlan => {
    steps.push({ kind: 'filter', found: 0, message })
    return {
      crewId,
      crewName: ctx.crewName,
      base: ctx.base,
      fleets: ctx.fleets,
      steps,
      assigned: [],
      assignedGround: [],
      skipped,
      outcome: [],
      warnings: [],
      summary: { assignedCount: 0, skippedCount: 0, blockMinutes: 0 },
    }
  }

  if (!ctx.base) return emptyPlan(`Crew ${crewId} has no resolvable base — nothing to assign`)
  if (legacy && ctx.fleets.length === 0) return emptyPlan(`Crew ${crewId} has no fleet qualifications — nothing to assign`)

  const zone = (await deps.resolveBaseZone(fastify, ctx.base)) ?? 'UTC'
  const days = dayList(input.startDate, input.endDate)
  const dayIndex = new Map<string, number>(days.map((d, i) => [d, i]))
  const dayIdxOf = (ms: number): number => dayIndex.get(localYmd(ms, zone)) ?? -1

  const occupied: Array<{ start: number; end: number }> = []
  /** Base-local days touched by any occupied interval (for free-day reservation). */
  const occupiedDays = new Map<string, number>()
  const spanDays = (startMs: number, endMs: number): string[] => {
    const out: string[] = []
    const last = localYmd(Math.max(startMs, endMs - 1), zone)
    for (let d = localYmd(startMs, zone); d <= last; d = addDays(d, 1)) out.push(d)
    return out
  }
  const occupy = (startMs: number, endMs: number): void => {
    occupied.push({ start: startMs, end: endMs })
    for (const d of spanDays(startMs, endMs)) occupiedDays.set(d, (occupiedDays.get(d) ?? 0) + 1)
  }
  const release = (startMs: number, endMs: number): void => {
    const i = occupied.findIndex((o) => o.start === startMs && o.end === endMs)
    if (i >= 0) occupied.splice(i, 1)
    for (const d of spanDays(startMs, endMs)) {
      const n = (occupiedDays.get(d) ?? 1) - 1
      if (n <= 0) occupiedDays.delete(d)
      else occupiedDays.set(d, n)
    }
  }
  const counters = new Map<string, DutyCounter>()
  const existingCount = new Map<string, number>()
  for (const t of dutyTypes) {
    counters.set(t.group, new DutyCounter(t, days.length))
    existingCount.set(t.group, 0)
  }

  // Seed occupancy + per-type counters from the existing running roster.
  const existing = await deps.fetchExistingRoster(
    fastify,
    crewId,
    minYmd(addDays(input.startDate, -2), addDays(input.rpFrom, -1)),
    maxYmd(addDays(input.endDate, 2), addDays(input.rpTo, 1)),
  )
  const seenPairing = new Set<number>()
  for (const it of existing) {
    const s = toMs(it.schStrDtUtc)
    const e = toMs(it.schEndDtUtc)
    if (s == null || e == null) continue
    occupy(s, e)
    if (legacy) continue
    // One occurrence per pairing (roster_flight is crew×segment), one per ground row.
    if (it.pairingId != null) {
      if (seenPairing.has(it.pairingId)) continue
      seenPairing.add(it.pairingId)
    }
    const g = (it.assignmentGroup ?? '').toUpperCase()
    const a = (it.assignment ?? '').toUpperCase()
    const t = dutyTypes.find((d) => d.group === g || d.group === a)
    if (!t) continue
    const idx = dayIdxOf(s)
    if (idx < 0) continue
    counters.get(t.group)!.add(idx)
    existingCount.set(t.group, (existingCount.get(t.group) ?? 0) + 1)
  }

  /**
   * Free-day reservation: a pairing may not consume days that a later ground
   * type (DO, …) still needs to reach its every-7-days min in any window it
   * touches. Keeps "FLY first, DO into leftovers" while guaranteeing leftovers.
   */
  const groundNeeds = legacy ? [] : dutyTypes.filter((t) => !isPairingGroup(t.group) && t.every7Min != null)
  const reserveBlocker = (startMs: number, endMs: number): string | null => {
    if (groundNeeds.length === 0) return null
    const newDays = spanDays(startMs, endMs).filter((d) => !occupiedDays.has(d) && dayIndex.has(d))
    if (newDays.length === 0) return null
    const newIdx = new Set(newDays.map((d) => dayIndex.get(d)!))
    for (const g of groundNeeds) {
      const c = counters.get(g.group)!
      for (const w of c.windows) {
        let touches = false
        for (const i of newIdx) if (i >= w[0] && i <= w[1]) { touches = true; break }
        if (!touches) continue
        const need = Math.max(0, g.every7Min! - c.windowCount(w))
        if (need === 0) continue
        let freeAfter = 0
        for (let i = w[0]; i <= w[1]; i++) if (!occupiedDays.has(days[i]) && !newIdx.has(i)) freeAfter++
        if (freeAfter < need) {
          return `would leave no free day for ${g.group} (min ${g.every7Min}) in ${days[w[0]]}..${days[w[1]]}`
        }
      }
    }
    return null
  }

  const fixed: AcceptedEntry[] = [] // survivors of earlier duty-type passes
  const warnings: PlanWarning[] = []
  const ruleSkipSteps: Array<{ step: Extract<Step, { kind: 'skip' }>; ruleCode: string }> = []

  /** Validate existing + fixed + `live` with the real engine; trim `live` until clean. */
  const validateAndTrim = async (live: AcceptedEntry[]): Promise<AcceptedEntry[]> => {
    let cur = [...live]
    if (cur.length === 0) return cur
    for (let iter = 0; iter < MAX_TRIM_ITERATIONS; iter++) {
      const { violations } = await deps.runLegality(fastify, {
        contextType: 'live',
        affectedCrewIds: [crewId],
        afterItems: [...existing, ...fixed.flatMap((a) => a.items), ...cur.flatMap((a) => a.items)],
        focusPairingIds: cur.map((a) => a.cand?.id).filter((id): id is number => id != null),
        rpFrom: input.rpFrom,
        rpTo: input.rpTo,
      })
      // severity 3 = hard (always remove); skipOnSoft also removes severity 1-2.
      const removable = violations.filter((v) => v.severity >= 3 || (input.skipOnSoft && v.severity >= 1))
      if (removable.length === 0) break

      const liveIds = new Set(cur.map((a) => a.cand?.id).filter((id): id is number => id != null))
      const named = removable.map((v) => v.pairingId).filter((id): id is number => id != null && liveIds.has(id))
      const byLatest = (x: AcceptedEntry, y: AcceptedEntry): number => y.startMs - x.startMs

      let target: AcceptedEntry | undefined
      let cause: LegalityPreviewViolation | undefined
      if (named.length > 0) {
        // Remove the latest-starting violating pairing (the most marginal add).
        target = cur.filter((a) => a.cand != null && named.includes(a.cand.id)).sort(byLatest)[0]
        cause = removable.find((v) => v.pairingId === target!.cand!.id) ?? removable[0]
      } else {
        // No violation names one of our adds. For pairings, drop the latest add to
        // make progress. For ground days (DO) an unnamed violation (e.g. 7505 min
        // days off) is not caused by the day off and cannot be fixed by removing
        // it — keep them and let the gantt show the warning.
        const pairingsLive = cur.filter((a) => a.cand != null)
        if (pairingsLive.length === 0) {
          for (const v of removable) {
            if (!warnings.some((w) => w.ruleCode === v.ruleCode && w.message === v.message)) {
              warnings.push({ ruleCode: v.ruleCode, severity: v.severity, message: v.message })
            }
          }
          break
        }
        target = [...pairingsLive].sort(byLatest)[0]
        cause = removable[0]
      }
      if (!target) break

      const pairingId = target.cand?.id ?? 0
      const label = target.cand?.label ?? `${target.ground!.assignment} ${target.ground!.day}`
      const step: Extract<Step, { kind: 'skip' }> = {
        kind: 'skip',
        group: tag(target.group),
        pairingId,
        label,
        reason: 'rule',
        ruleCode: cause.ruleCode,
        severity: cause.severity,
        message: cause.message,
      }
      steps.push(step)
      ruleSkipSteps.push({ step, ruleCode: cause.ruleCode })
      skipped.push({ pairingId, label, reason: 'rule', ruleCode: cause.ruleCode, message: cause.message })
      counters.get(target.group)?.remove(target.dayIdx)
      release(target.startMs, target.endMs)
      if (target.cand) takeSlot(target.cand.id, target.actingRank, -1)
      cur = cur.filter((a) => a.key !== target!.key)
      if (cur.length === 0) break
    }
    return cur
  }

  // ── Pairing-backed pass (FLY / RES / …) ────────────────────────────────────
  const runPairingPass = async (t: DutyTypeConfig): Promise<void> => {
    const group = t.group
    const counter = counters.get(group)!
    const matchFleet = isFlyFamily(group)
    if (matchFleet && ctx.fleets.length === 0) {
      steps.push({ kind: 'filter', group: tag(group), found: 0, message: `Crew ${crewId} has no fleet qualifications — no ${group} pool` })
      return
    }
    const candidates = await deps.fetchCandidates(fastify, {
      base: ctx.base!,
      fleets: ctx.fleets,
      startDate: input.startDate,
      endDate: input.endDate,
      group: group === LEGACY_GROUP ? null : group,
      matchFleet,
      division: ctx.division,
    })
    steps.push({
      kind: 'filter',
      group: tag(group),
      found: candidates.length,
      message: legacy
        ? `Found ${candidates.length} open pairing(s) at base ${ctx.base}, fleet(s) ${ctx.fleets.join('/')} in ${input.startDate}..${input.endDate}`
        : matchFleet
          ? `${group}: found ${candidates.length} open pairing(s) at base ${ctx.base}, fleet(s) ${ctx.fleets.join('/')} in ${input.startDate}..${input.endDate}`
          : `${group}: found ${candidates.length} open pairing(s) at base ${ctx.base}, division ${ctx.division ?? '?'} (fleet ignored) in ${input.startDate}..${input.endDate}`,
    })

    // Eligibility pass (candidate order): cheap precheck + time parse.
    const eligible: Array<{ cand: CandidatePairing; actingRank: string; startMs: number; endMs: number }> = []
    for (const cand of candidates) {
      const pre = await deps.precheck(fastify, crewId, cand.id)
      if (!pre.ok) {
        steps.push({ kind: 'skip', group: tag(group), pairingId: cand.id, label: cand.label, reason: 'no-slot', message: pre.message })
        skipped.push({ pairingId: cand.id, label: cand.label, reason: 'no-slot', message: pre.message })
        continue
      }
      const startMs = toMs(cand.schStr)
      const endMs = toMs(cand.schEnd)
      if (startMs == null || endMs == null) {
        const msg = 'Pairing has no scheduled time'
        steps.push({ kind: 'skip', group: tag(group), pairingId: cand.id, label: cand.label, reason: 'no-slot', message: msg })
        skipped.push({ pairingId: cand.id, label: cand.label, reason: 'no-slot', message: msg })
        continue
      }
      eligible.push({ cand, actingRank: pre.actingRank, startMs, endMs })
    }

    const openSlots = await deps.fetchOpenSlots(fastify, eligible.map((e) => e.cand.id))
    const accepted: AcceptedEntry[] = []
    const evaluate = (e: (typeof eligible)[number]): boolean => {
      steps.push({ kind: 'consider', group: tag(group), pairingId: e.cand.id, label: e.cand.label, startDt: toIso(e.cand.schStr), endDt: toIso(e.cand.schEnd), rank: e.actingRank })
      const open = openSlots.get(e.cand.id)?.get(e.actingRank)
      if (open != null && takenCount(e.cand.id, e.actingRank) >= open) {
        const msg = `Open ${e.actingRank} slot already taken by an earlier crew in this plan`
        steps.push({ kind: 'skip', group: tag(group), pairingId: e.cand.id, label: e.cand.label, reason: 'no-slot', message: msg })
        skipped.push({ pairingId: e.cand.id, label: e.cand.label, reason: 'no-slot', message: msg })
        return false
      }
      if (occupied.some((o) => timeRangesOverlap(e.startMs, e.endMs, o.start, o.end))) {
        const msg = 'Time-overlaps a duty already on the roster (existing or just-picked)'
        steps.push({ kind: 'skip', group: tag(group), pairingId: e.cand.id, label: e.cand.label, reason: 'overlap', message: msg })
        skipped.push({ pairingId: e.cand.id, label: e.cand.label, reason: 'overlap', message: msg })
        return false
      }
      const dayIdx = dayIdxOf(e.startMs)
      const blocked = counter.blocker(dayIdx)
      if (blocked) {
        steps.push({ kind: 'skip', group: tag(group), pairingId: e.cand.id, label: e.cand.label, reason: blocked.reason, message: blocked.message })
        skipped.push({ pairingId: e.cand.id, label: e.cand.label, reason: blocked.reason, message: blocked.message })
        return false
      }
      const reserve = reserveBlocker(e.startMs, e.endMs)
      if (reserve) {
        steps.push({ kind: 'skip', group: tag(group), pairingId: e.cand.id, label: e.cand.label, reason: 'reserve-day', message: reserve })
        skipped.push({ pairingId: e.cand.id, label: e.cand.label, reason: 'reserve-day', message: reserve })
        return false
      }
      occupy(e.startMs, e.endMs)
      counter.add(dayIdx)
      takeSlot(e.cand.id, e.actingRank, 1)
      accepted.push({ key: String(e.cand.id), group, cand: e.cand, actingRank: e.actingRank, items: [], blockMinutes: 0, startMs: e.startMs, endMs: e.endMs, dayIdx })
      return true
    }

    // FLY packs as much as the caps allow; other types fill only to their min
    // (RES stays a gap-filler) unless no min is set, in which case they pack too.
    const fillToMinOnly = !isFlyFamily(group) && t.every7Min != null
    const picked = new Set<number>()

    if (!fillToMinOnly) {
      if (input.distribution === 'earliest') {
        for (const e of eligible) {
          if (accepted.length >= input.maxPerCrew) break
          evaluate(e)
        }
      } else {
        // Even pack: level block hours across 7-day week buckets from startDate.
        const WEEK_MS = 7 * 24 * 60 * 60 * 1000
        const startDayMs = Date.parse(`${input.startDate}T00:00:00Z`)
        const weekOf = (ms: number): number => Math.max(0, Math.floor((ms - startDayMs) / WEEK_MS))
        const blockByPairing = await deps.fetchCandidateBlockMinutes(fastify, eligible.map((e) => e.cand.id))
        const queues = new Map<number, Array<(typeof eligible)[number]>>()
        for (const e of eligible) {
          const w = weekOf(e.startMs)
          const q = queues.get(w)
          if (q) q.push(e)
          else queues.set(w, [e])
        }
        const weekLoad = new Map<number, number>()
        for (const it of existing) {
          const s = toMs(it.schStrDtUtc)
          const en = toMs(it.schEndDtUtc)
          if (s != null && en != null && en > s) {
            const w = weekOf(s)
            weekLoad.set(w, (weekLoad.get(w) ?? 0) + (en - s) / 60_000)
          }
        }
        while (accepted.length < input.maxPerCrew) {
          const openWeeks = [...queues.entries()].filter(([, q]) => q.length > 0).map(([w]) => w)
          if (openWeeks.length === 0) break
          openWeeks.sort((a, b) => (weekLoad.get(a) ?? 0) - (weekLoad.get(b) ?? 0) || a - b)
          const w = openWeeks[0]
          const e = queues.get(w)!.shift()!
          if (evaluate(e)) weekLoad.set(w, (weekLoad.get(w) ?? 0) + (blockByPairing.get(e.cand.id) ?? 0))
        }
      }
    } else {
      // Min-fill: walk rolling windows in order; feed the first unmet window with
      // the earliest eligible candidate starting inside it.
      const min = t.every7Min!
      for (const w of counter.windows) {
        while (counter.windowCount(w) < min && accepted.length < input.maxPerCrew) {
          const next = eligible.find((e) => {
            if (picked.has(e.cand.id)) return false
            const idx = dayIdxOf(e.startMs)
            return idx >= w[0] && idx <= w[1]
          })
          if (!next) break
          picked.add(next.cand.id)
          evaluate(next)
        }
      }
    }

    // Expand accepted pairings to crew×segment rows, then engine-validate + trim.
    const segMap = await deps.fetchSegments(fastify, accepted.map((a) => a.cand!.id))
    for (const a of accepted) {
      const segs = segMap.get(a.cand!.id) ?? []
      a.items = expandAccepted(a.cand!, segs, crewId, a.actingRank)
      a.blockMinutes = blockMinutesOf(segs)
    }
    const survivors = await validateAndTrim(accepted)
    fixed.push(...survivors)
  }

  // ── Ground pass (DO / …): base-local full days into leftover free days ──────
  const runGroundPass = async (t: DutyTypeConfig): Promise<void> => {
    const group = t.group
    const counter = counters.get(group)!
    const min = t.every7Min
    if (min == null) {
      steps.push({ kind: 'filter', group, found: 0, message: `${group}: no every-7-days min set — nothing to place` })
      return
    }
    const dayBounds = (idx: number): { start: number; end: number } => ({
      start: localMidnightUtcMs(days[idx], zone),
      end: localMidnightUtcMs(addDays(days[idx], 1), zone),
    })
    const isFree = (idx: number): boolean => !occupiedDays.has(days[idx])
    const accepted: AcceptedEntry[] = []
    for (const w of counter.windows) {
      while (counter.windowCount(w) < min) {
        // Latest free day in the window that respects every7Max/periodMax.
        let pickIdx = -1
        for (let i = w[1]; i >= w[0]; i--) {
          if (!isFree(i)) continue
          if (counter.blocker(i)) continue
          pickIdx = i
          break
        }
        if (pickIdx < 0) {
          const reason = counter.blocker(w[0]) ? counter.blocker(w[0])!.message : 'no free day left in window'
          steps.push({ kind: 'unmet', group, start: days[w[0]], end: days[w[1]], count: counter.windowCount(w), message: `${group} min ${min} unmet in ${days[w[0]]}..${days[w[1]]}: ${reason}` })
          break
        }
        const b = dayBounds(pickIdx)
        const startDtUtc = new Date(b.start).toISOString()
        const endDtUtc = new Date(b.end - 1000).toISOString()
        const ground: AssignedGround = { group, assignment: group, day: days[pickIdx], base: ctx.base!, startDtUtc, endDtUtc }
        occupy(b.start, b.end)
        counter.add(pickIdx)
        accepted.push({
          key: `ground:${group}:${days[pickIdx]}`,
          group,
          ground,
          actingRank: '',
          blockMinutes: 0,
          startMs: b.start,
          endMs: b.end,
          dayIdx: pickIdx,
          items: [{
            id: -(pickIdx + 1),
            crewId,
            pairingId: null,
            base: ctx.base,
            assignmentGroup: group,
            assignment: group,
            division: ctx.division,
            schStrDtUtc: startDtUtc,
            schEndDtUtc: endDtUtc,
          }],
        })
        steps.push({ kind: 'ground', group, assignment: group, day: days[pickIdx], startDt: startDtUtc, endDt: endDtUtc, message: `${group} ${days[pickIdx]} ${ctx.base} local full day (latest free day in ${days[w[0]]}..${days[w[1]]})` })
      }
    }
    const survivors = await validateAndTrim(accepted)
    fixed.push(...survivors)
  }

  // Order = table order (default FLY → RES → DO). Pairing-backed types are those
  // whose group appears on open pairings; DO (no pairings) is a ground type.
  for (const t of dutyTypes) {
    if (t.group === LEGACY_GROUP || isPairingGroup(t.group)) {
      await runPairingPass(t)
    } else {
      await runGroundPass(t)
    }
  }

  // Report unmet windows for pairing-backed types (ground types report inline).
  if (!legacy) {
    for (const t of dutyTypes) {
      if (t.every7Min == null || t.group === 'DO') continue
      const c = counters.get(t.group)!
      if (!isPairingGroup(t.group)) continue
      for (const w of c.windows) {
        const n = c.windowCount(w)
        if (n < t.every7Min) {
          steps.push({ kind: 'unmet', group: t.group, start: days[w[0]], end: days[w[1]], count: n, message: `${t.group} min ${t.every7Min} unmet in ${days[w[0]]}..${days[w[1]]}: ${n} placed (pool/limits exhausted)` })
        }
      }
    }
  }

  // Resolve human-readable rule names for the rule-skip steps.
  if (ruleSkipSteps.length > 0) {
    const names = await deps.fetchRuleNames(fastify, ruleSkipSteps.map((r) => r.ruleCode))
    for (const { step, ruleCode } of ruleSkipSteps) {
      const name = names.get(ruleCode)
      if (name) step.ruleName = name
    }
  }

  // Final survivors → assigned[] / assignedGround[] + assign steps (plan order).
  const assigned: Assigned[] = []
  const assignedGround: AssignedGround[] = []
  for (const a of fixed) {
    if (a.cand) {
      assigned.push({
        pairingId: a.cand.id,
        group: tag(a.group),
        rosterActingRank: a.actingRank,
        label: a.cand.label,
        startDt: toIso(a.cand.schStr),
        endDt: toIso(a.cand.schEnd),
        blockMinutes: a.blockMinutes,
      })
      steps.push({ kind: 'assign', group: tag(a.group), pairingId: a.cand.id, label: a.cand.label, rank: a.actingRank, startDt: toIso(a.cand.schStr), endDt: toIso(a.cand.schEnd) })
    } else if (a.ground) {
      assignedGround.push(a.ground)
    }
  }

  const outcome: DutyOutcome[] = legacy
    ? []
    : dutyTypes.map((t) => {
        const c = counters.get(t.group)!
        return {
          group: t.group,
          existing: existingCount.get(t.group) ?? 0,
          assigned: c.total - (existingCount.get(t.group) ?? 0),
          periodMax: t.periodMax ?? null,
          every7Min: t.every7Min ?? null,
          every7Max: t.every7Max ?? null,
          windows: c.windows.map((w) => {
            const n = c.windowCount(w)
            return {
              start: days[w[0]],
              end: days[w[1]],
              count: n,
              minUnmet: t.every7Min != null && n < t.every7Min,
              maxHit: t.every7Max != null && n >= t.every7Max,
            }
          }),
        }
      })

  const blockTotal = assigned.reduce((sum, a) => sum + a.blockMinutes, 0)
  return {
    crewId,
    crewName: ctx.crewName,
    base: ctx.base,
    fleets: ctx.fleets,
    steps,
    assigned,
    assignedGround,
    skipped,
    outcome,
    warnings,
    summary: { assignedCount: assigned.length + assignedGround.length, skippedCount: skipped.length, blockMinutes: blockTotal },
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Duty-type aware, legality-aware auto-assign PLANNER.
 *
 * Read-only: builds a decision trace + plan per crew but persists nothing —
 * `previewDraftLegality` runs in a rolled-back transaction. Callers apply the
 * plan via the existing `/assign-pairing` and `add-ground-task` draft paths.
 */
export async function planAutoAssign(
  fastify: FastifyInstance,
  input: AutoAssignInput,
  deps: AutoAssignDeps = defaultDeps,
): Promise<AutoAssignPlan> {
  const rpFrom = input.rpFrom ?? input.startDate
  const rpTo = input.rpTo ?? input.endDate
  const skipOnSoft = input.policy?.skipOnSoft ?? true
  const maxPerCrew = input.maxPerCrew ?? 50
  const distribution = input.distribution ?? 'even'
  const dutyTypes = input.dutyTypes
    ? input.dutyTypes.map((t) => ({ ...t, group: t.group.trim().toUpperCase() }))
    : null

  const crews: CrewPlan[] = []
  // Sequential (crew display order): the trace reads top-to-bottom like a real
  // dispatcher working the list, and open slots consumed by an earlier crew are
  // not offered again to a later one (shared `taken` map).
  const taken = new Map<number, Map<string, number>>()
  for (const crewId of input.crewIds) {
    const plan = await planForCrew(
      fastify,
      crewId,
      { startDate: input.startDate, endDate: input.endDate, rpFrom, rpTo, fleets: input.fleets ?? null, skipOnSoft, maxPerCrew, distribution, dutyTypes },
      deps,
      taken,
    )
    crews.push(plan)
  }

  return {
    crews,
    summary: {
      crewCount: crews.length,
      assignedTotal: crews.reduce((s, c) => s + c.summary.assignedCount, 0),
      skippedTotal: crews.reduce((s, c) => s + c.summary.skippedCount, 0),
    },
  }
}

// ── Duty-group catalogue + pool sizes (dialog configure step) ────────────────

export interface DutyGroupInfo {
  group: string
  name: string | null
  /** True when open pairings with this assignment_group exist in range. */
  pairingBacked: boolean
  /** Union pool size across the selected crew (null for ground-only groups). */
  poolSize: number | null
  /** Assignment code used when the group is placed as a ground duty (null = cannot). */
  groundAssignment: string | null
}

/**
 * Catalogue of assignment groups for the dialog's duty-type table, with the
 * per-crew-matched open-pairing pool size for the selected crew + date range.
 */
export async function listDutyGroups(
  fastify: FastifyInstance,
  input: { crewIds: string[]; startDate: string; endDate: string },
  deps: AutoAssignDeps = defaultDeps,
): Promise<DutyGroupInfo[]> {
  const master = await fastify.db
    .select({ group: assignmentGroupModel.assignmentGroup, name: assignmentGroupModel.name })
    .from(assignmentGroupModel)
  // Groups that only exist as values on pairings (e.g. RES from the RES Pairing
  // Creator) have no master row; union them in so they are addable/poolable.
  const onPairings = await fastify.db
    .selectDistinct({ group: pairing.assignmentGroup })
    .from(pairing)
    .where(notDeleted(pairing.isDeleted))
  const byCode = new Map<string, { group: string; name: string | null }>()
  for (const m of master) byCode.set(m.group, { group: m.group, name: m.name ?? null })
  for (const p of onPairings) if (p.group && !byCode.has(p.group)) byCode.set(p.group, { group: p.group, name: null })
  const groups = [...byCode.values()].sort((a, b) => a.group.localeCompare(b.group))
  const codes = await fastify.db.select({ code: assignmentModel.assignment }).from(assignmentModel)
  const assignmentCodes = new Set(codes.map((c) => c.code))

  const ctxs = await Promise.all(input.crewIds.map((id) => deps.resolveCrewContext(fastify, id, null, input.startDate)))
  const out: DutyGroupInfo[] = []
  for (const g of groups) {
    const pool = new Set<number>()
    const matchFleet = isFlyFamily(g.group)
    for (const c of ctxs) {
      if (!c.base) continue
      const cands = await deps.fetchCandidates(fastify, {
        base: c.base,
        fleets: c.fleets,
        startDate: input.startDate,
        endDate: input.endDate,
        group: g.group,
        matchFleet,
        division: c.division,
      })
      for (const p of cands) pool.add(p.id)
    }
    const pairingBacked = pool.size > 0
    out.push({
      group: g.group,
      name: g.name ?? null,
      pairingBacked,
      poolSize: pairingBacked ? pool.size : null,
      groundAssignment: assignmentCodes.has(g.group) ? g.group : null,
    })
  }
  return out
}

export const __test = { defaultDeps, timeRangesOverlap, blockMinutesOf, expandAccepted, DutyCounter }
