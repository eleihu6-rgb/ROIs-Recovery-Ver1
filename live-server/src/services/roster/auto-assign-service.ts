import { and, asc, between, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { crew } from '../../models/crew/crew.js'
import { crewBase } from '../../models/crew/crew-base.js'
import { crewFleet } from '../../models/crew/crew-fleet.js'
import { pairing } from '../../models/pairing/pairing.js'
import { pairingSegment } from '../../models/pairing/pairing-segment.js'
import { rule } from '../../models/rule/rule.js'
import { notDeleted } from '../../utils/db.js'
import { precheckAssignment } from '../assignment/precheck-service.js'
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
}

export type StepKind = 'filter' | 'consider' | 'skip' | 'assign'
export type SkipReason = 'overlap' | 'no-slot' | 'rule'

export type Step =
  | { kind: 'filter'; found: number; message: string }
  | { kind: 'consider'; pairingId: number; label: string; startDt: string | null; endDt: string | null; rank: string }
  | {
      kind: 'skip'
      pairingId: number
      label: string
      reason: SkipReason
      ruleCode?: string
      ruleName?: string
      severity?: number
      message: string
    }
  | { kind: 'assign'; pairingId: number; label: string; rank: string; startDt: string | null; endDt: string | null }

export interface Assigned {
  pairingId: number
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
  skipped: Skipped[]
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
    args: { base: string; fleets: string[]; startDate: string; endDate: string },
  ) => Promise<CandidatePairing[]>
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

  async fetchCandidates(fastify, { base, fleets, startDate, endDate }) {
    if (fleets.length === 0) return []
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
          inArray(pairing.fleet, fleets),
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

let syntheticId = -1
const nextSyntheticId = (): number => syntheticId--

const expandAccepted = (
  cand: CandidatePairing,
  segs: SegmentRow[],
  crewId: string,
  actingRank: string,
): PreviewRosterItem[] =>
  segs.map((seg) => ({
    id: nextSyntheticId(),
    crewId,
    pairingId: cand.id,
    base: cand.base,
    label: `${seg.fltNum} ${seg.depArp}-${seg.arvArp}`,
    assignmentGroup: cand.assignmentGroup ?? 'FLY',
    assignment: seg.segAssignment ?? cand.assignment,
    division: cand.division,
    flightActingRank: actingRank,
    rosterActingRank: actingRank,
    dutySeq: seg.dutySeq,
    segSeq: seg.segSeq,
    fltId: seg.fltId,
    fltDt: toIso(seg.fltDt),
    schStrDtUtc: toIso(seg.schStrDtUtc),
    schEndDtUtc: toIso(seg.schEndDtUtc),
    actStrDtUtc: toIso(seg.actStrDtUtc),
    actEndDtUtc: toIso(seg.actEndDtUtc),
    schCreditedMinutes: seg.schCreditedMinutesSeg ?? null,
    source: 'MA',
  }))

// ── Per-crew planner ─────────────────────────────────────────────────────────

interface AcceptedEntry {
  cand: CandidatePairing
  actingRank: string
  items: PreviewRosterItem[]
  blockMinutes: number
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
  },
  deps: AutoAssignDeps,
): Promise<CrewPlan> => {
  const steps: Step[] = []
  const skipped: Skipped[] = []

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
      skipped,
      summary: { assignedCount: 0, skippedCount: 0, blockMinutes: 0 },
    }
  }

  if (!ctx.base) return emptyPlan(`Crew ${crewId} has no resolvable base — nothing to assign`)
  if (ctx.fleets.length === 0) return emptyPlan(`Crew ${crewId} has no fleet qualifications — nothing to assign`)

  const candidates = await deps.fetchCandidates(fastify, {
    base: ctx.base,
    fleets: ctx.fleets,
    startDate: input.startDate,
    endDate: input.endDate,
  })

  steps.push({
    kind: 'filter',
    found: candidates.length,
    message: `Found ${candidates.length} open pairing(s) at base ${ctx.base}, fleet(s) ${ctx.fleets.join('/')} in ${input.startDate}..${input.endDate}`,
  })

  const accepted: AcceptedEntry[] = []
  const occupied: Array<{ start: number; end: number }> = []

  // Seed occupancy from the existing running roster so we never double-book.
  const existing = await deps.fetchExistingRoster(
    fastify,
    crewId,
    minYmd(addDays(input.startDate, -2), addDays(input.rpFrom, -1)),
    maxYmd(addDays(input.endDate, 2), addDays(input.rpTo, 1)),
  )
  for (const it of existing) {
    const s = toMs(it.schStrDtUtc)
    const e = toMs(it.schEndDtUtc)
    if (s != null && e != null) occupied.push({ start: s, end: e })
  }

  // ── Eligibility pass (candidate order): cheap precheck + time parse ─────────
  // no-slot skips (division/open-slot/rank, or unscheduled) are emitted here;
  // survivors carry their parsed window for the selection stage below.
  const eligible: Array<{ cand: CandidatePairing; actingRank: string; startMs: number; endMs: number }> = []
  for (const cand of candidates) {
    const pre = await deps.precheck(fastify, crewId, cand.id)
    if (!pre.ok) {
      steps.push({ kind: 'skip', pairingId: cand.id, label: cand.label, reason: 'no-slot', message: pre.message })
      skipped.push({ pairingId: cand.id, label: cand.label, reason: 'no-slot', message: pre.message })
      continue
    }
    const startMs = toMs(cand.schStr)
    const endMs = toMs(cand.schEnd)
    if (startMs == null || endMs == null) {
      const msg = 'Pairing has no scheduled time'
      steps.push({ kind: 'skip', pairingId: cand.id, label: cand.label, reason: 'no-slot', message: msg })
      skipped.push({ pairingId: cand.id, label: cand.label, reason: 'no-slot', message: msg })
      continue
    }
    eligible.push({ cand, actingRank: pre.actingRank, startMs, endMs })
  }

  // Emit a consider step, then either reserve the window (accept) or overlap-skip.
  const evaluate = (e: (typeof eligible)[number]): boolean => {
    steps.push({
      kind: 'consider',
      pairingId: e.cand.id,
      label: e.cand.label,
      startDt: toIso(e.cand.schStr),
      endDt: toIso(e.cand.schEnd),
      rank: e.actingRank,
    })
    if (occupied.some((o) => timeRangesOverlap(e.startMs, e.endMs, o.start, o.end))) {
      const msg = 'Time-overlaps a duty already on the roster (existing or just-picked)'
      steps.push({ kind: 'skip', pairingId: e.cand.id, label: e.cand.label, reason: 'overlap', message: msg })
      skipped.push({ pairingId: e.cand.id, label: e.cand.label, reason: 'overlap', message: msg })
      return false
    }
    occupied.push({ start: e.startMs, end: e.endMs })
    accepted.push({ cand: e.cand, actingRank: e.actingRank, items: [], blockMinutes: 0 })
    return true
  }

  if (input.distribution === 'earliest') {
    // ── Legacy greedy earliest-first pack ────────────────────────────────────
    for (const e of eligible) {
      if (accepted.length >= input.maxPerCrew) break
      evaluate(e)
    }
  } else {
    // ── Even pack: level block hours across 7-day week buckets ───────────────
    // Bucket eligible by week index from startDate (candidate order = earliest-
    // first within a week), then repeatedly feed the currently lightest week so
    // flying hours spread across the month instead of front-loading week 1.
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const startDayMs = Date.parse(`${input.startDate}T00:00:00Z`)
    const weekOf = (ms: number): number => Math.max(0, Math.floor((ms - startDayMs) / WEEK_MS))

    const blockByPairing = await deps.fetchCandidateBlockMinutes(
      fastify,
      eligible.map((e) => e.cand.id),
    )

    const queues = new Map<number, Array<(typeof eligible)[number]>>()
    for (const e of eligible) {
      const w = weekOf(e.startMs)
      const q = queues.get(w)
      if (q) q.push(e)
      else queues.set(w, [e])
    }

    // Seed each week's load from the existing roster's block minutes so weeks
    // that already carry duty are treated as heavier.
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
      // Lightest week first; tie-break earliest week so the trace still reads
      // chronologically when loads are equal.
      openWeeks.sort((a, b) => (weekLoad.get(a) ?? 0) - (weekLoad.get(b) ?? 0) || a - b)
      const w = openWeeks[0]
      const e = queues.get(w)!.shift()!
      if (evaluate(e)) {
        weekLoad.set(w, (weekLoad.get(w) ?? 0) + (blockByPairing.get(e.cand.id) ?? 0))
      }
    }
  }

  // ── Expand accepted pairings to crew×segment PreviewRosterItem rows ────────
  const acceptedIds = accepted.map((a) => a.cand.id)
  const segMap = await deps.fetchSegments(fastify, acceptedIds)
  for (const a of accepted) {
    const segs = segMap.get(a.cand.id) ?? []
    a.items = expandAccepted(a.cand, segs, crewId, a.actingRank)
    a.blockMinutes = blockMinutesOf(segs)
  }

  // ── Validate assembled roster with the real engine, backtrack-trim ─────────
  const ruleSkipSteps: Array<{ step: Extract<Step, { kind: 'skip' }>; ruleCode: string }> = []
  let live = [...accepted]

  const buildAfterItems = (): PreviewRosterItem[] => [...existing, ...live.flatMap((a) => a.items)]

  if (live.length > 0) {
    for (let iter = 0; iter < MAX_TRIM_ITERATIONS; iter++) {
      const { violations } = await deps.runLegality(fastify, {
        contextType: 'live',
        affectedCrewIds: [crewId],
        afterItems: buildAfterItems(),
        focusPairingIds: live.map((a) => a.cand.id),
        rpFrom: input.rpFrom,
        rpTo: input.rpTo,
      })

      // severity 3 = hard (always remove); skipOnSoft also removes severity 1-2.
      const removable = violations.filter((v) => v.severity >= 3 || (input.skipOnSoft && v.severity >= 1))
      if (removable.length === 0) break

      const liveIds = new Set(live.map((a) => a.cand.id))
      const named = removable
        .map((v) => v.pairingId)
        .filter((id): id is number => id != null && liveIds.has(id))

      let target: AcceptedEntry | undefined
      let cause: LegalityPreviewViolation | undefined
      if (named.length > 0) {
        // Remove the latest-starting violating pairing (the most marginal add).
        target = live
          .filter((a) => named.includes(a.cand.id))
          .sort((x, y) => (toMs(y.cand.schStr) ?? 0) - (toMs(x.cand.schStr) ?? 0))[0]
        cause = removable.find((v) => v.pairingId === target!.cand.id) ?? removable[0]
      } else {
        // No violation names one of our adds — drop the latest add to make progress.
        target = [...live].sort((x, y) => (toMs(y.cand.schStr) ?? 0) - (toMs(x.cand.schStr) ?? 0))[0]
        cause = removable[0]
      }

      if (!target) break

      const step: Extract<Step, { kind: 'skip' }> = {
        kind: 'skip',
        pairingId: target.cand.id,
        label: target.cand.label,
        reason: 'rule',
        ruleCode: cause.ruleCode,
        severity: cause.severity,
        message: cause.message,
      }
      steps.push(step)
      ruleSkipSteps.push({ step, ruleCode: cause.ruleCode })
      skipped.push({
        pairingId: target.cand.id,
        label: target.cand.label,
        reason: 'rule',
        ruleCode: cause.ruleCode,
        message: cause.message,
      })

      live = live.filter((a) => a.cand.id !== target!.cand.id)
      if (live.length === 0) break
    }
  }

  // ── Resolve human-readable rule names for the rule-skip steps ──────────────
  if (ruleSkipSteps.length > 0) {
    const names = await deps.fetchRuleNames(fastify, ruleSkipSteps.map((r) => r.ruleCode))
    for (const { step, ruleCode } of ruleSkipSteps) {
      const name = names.get(ruleCode)
      if (name) step.ruleName = name
    }
  }

  // ── Final survivors → assigned[] + assign steps ────────────────────────────
  const assigned: Assigned[] = live.map((a) => ({
    pairingId: a.cand.id,
    rosterActingRank: a.actingRank,
    label: a.cand.label,
    startDt: toIso(a.cand.schStr),
    endDt: toIso(a.cand.schEnd),
    blockMinutes: a.blockMinutes,
  }))
  for (const a of live) {
    steps.push({
      kind: 'assign',
      pairingId: a.cand.id,
      label: a.cand.label,
      rank: a.actingRank,
      startDt: toIso(a.cand.schStr),
      endDt: toIso(a.cand.schEnd),
    })
  }

  const blockTotal = assigned.reduce((sum, a) => sum + a.blockMinutes, 0)
  return {
    crewId,
    crewName: ctx.crewName,
    base: ctx.base,
    fleets: ctx.fleets,
    steps,
    assigned,
    skipped,
    summary: { assignedCount: assigned.length, skippedCount: skipped.length, blockMinutes: blockTotal },
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Base+fleet-matched, legality-aware auto-assign PLANNER.
 *
 * Read-only: builds a decision trace + plan per crew but persists nothing —
 * `previewDraftLegality` runs in a rolled-back transaction. Callers apply the
 * plan via the existing `/assign-pairing` path.
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

  const crews: CrewPlan[] = []
  // Sequential (crew display order): each crew's plan is independent, but the
  // trace must read top-to-bottom like a real dispatcher working the list.
  for (const crewId of input.crewIds) {
    const plan = await planForCrew(
      fastify,
      crewId,
      { startDate: input.startDate, endDate: input.endDate, rpFrom, rpTo, fleets: input.fleets ?? null, skipOnSoft, maxPerCrew, distribution },
      deps,
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

export const __test = { defaultDeps, timeRangesOverlap, blockMinutesOf, expandAccepted }
