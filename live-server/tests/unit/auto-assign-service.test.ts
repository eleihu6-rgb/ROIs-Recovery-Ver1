import { describe, it, expect, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Transitive imports (models → db → config/env) require these at load time.
vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
  process.env.LIVE_SCHEMA ||= 'f8'
})

import {
  planAutoAssign,
  type AutoAssignDeps,
  type CandidatePairing,
  type SegmentRow,
} from '../../src/services/roster/auto-assign-service.js'
import type { PreviewRosterItem } from '../../src/services/rule/legality-preview.js'

// ── Real business-case fixture: multi-segment ADD round-trip pairings ────────
// Mirrors the e2e batch spec — ADD-based 7M8 crew (J4001) picking the earliest
// open ET877/ET876 (ADD→DXB→ADD) round trip. §Real-Business-Case-Test: every
// pairing here is a genuine base→out→base round trip, never a single leg.

const fakeFastify = {} as unknown as FastifyInstance

const seg = (
  pairingId: number,
  dutySeq: number,
  fltNum: string,
  depArp: string,
  arvArp: string,
  schStr: string,
  schEnd: string,
): SegmentRow => ({
  pairingId,
  dutySeq,
  segSeq: 1,
  fltId: pairingId * 10 + dutySeq,
  fltDt: schStr.slice(0, 10),
  fltNum,
  depArp,
  arvArp,
  segAssignment: 'ADD',
  schStrDtUtc: new Date(schStr),
  schEndDtUtc: new Date(schEnd),
  actStrDtUtc: new Date(schStr),
  actEndDtUtc: new Date(schEnd),
  schCreditedMinutesSeg: null,
})

// A round-trip pairing = outbound ET877 ADD→DXB + return ET876 DXB→ADD.
const roundTrip = (
  id: number,
  label: string,
  outStr: string,
  outEnd: string,
  backStr: string,
  backEnd: string,
): { cand: CandidatePairing; segs: SegmentRow[] } => ({
  cand: {
    id,
    label,
    base: 'ADD',
    fleet: '7M8',
    division: 'P',
    assignmentGroup: 'FLY',
    assignment: 'ADD',
    schStr: new Date(outStr),
    schEnd: new Date(backEnd),
  },
  segs: [
    seg(id, 1, 'ET877', 'ADD', 'DXB', outStr, outEnd),
    seg(id, 2, 'ET876', 'DXB', 'ADD', backStr, backEnd),
  ],
})

// 151528: 2026-09-11 12:10Z → 2026-09-12 11:45Z (matches the e2e J4001 pick)
const P1 = roundTrip(151528, 'ET877/ET876 09-11', '2026-09-11T12:10:00Z', '2026-09-11T16:00:00Z', '2026-09-12T08:00:00Z', '2026-09-12T11:45:00Z')
// 151540: 2026-09-13 round trip (a day later, no overlap with P1)
const P2 = roundTrip(151540, 'ET877/ET876 09-13', '2026-09-13T12:10:00Z', '2026-09-13T16:00:00Z', '2026-09-14T08:00:00Z', '2026-09-14T11:45:00Z')

const baseInput = {
  crewIds: ['J4001'],
  startDate: '2026-09-10',
  endDate: '2026-09-14',
}

/** Build a full deps object with clean defaults, overridable per test. */
const makeDeps = (over: Partial<AutoAssignDeps> = {}): AutoAssignDeps => {
  const candSegs = new Map<number, SegmentRow[]>([
    [P1.cand.id, P1.segs],
    [P2.cand.id, P2.segs],
  ])
  return {
    resolveCrewContext: vi.fn(async (_f, crewId) => ({
      crewId,
      crewName: 'Test Crew',
      base: 'ADD',
      fleets: ['7M8'],
      division: 'P',
    })),
    fetchCandidates: vi.fn(async () => [P1.cand, P2.cand]),
    precheck: vi.fn(async () => ({ ok: true as const, actingRank: 'CA' })),
    fetchExistingRoster: vi.fn(async () => [] as PreviewRosterItem[]),
    fetchSegments: vi.fn(async (_f, ids: number[]) => {
      const m = new Map<number, SegmentRow[]>()
      for (const id of ids) m.set(id, candSegs.get(id) ?? [])
      return m
    }),
    fetchRuleNames: vi.fn(async (_f, codes: string[]) => {
      const names = new Map<string, string>([
        ['8002', 'Max Cumulative'],
        ['7505', 'Minimum Days Off'],
      ])
      const out = new Map<string, string>()
      for (const c of codes) if (names.has(c)) out.set(c, names.get(c)!)
      return out
    }),
    runLegality: vi.fn(async () => ({ allowed: true, violations: [] })),
    ...over,
  }
}

const violation = (pairingId: number | null, ruleCode: string, severity: number, message: string) => ({
  crewId: 'J4001',
  pairingId,
  dutySeq: null,
  ruleCode,
  ruleInstance: '001',
  scopeKey: 'x',
  severity,
  startDt: null,
  endDt: null,
  message,
})

describe('planAutoAssign', () => {
  it('(a) packs earliest-open pairings first, in date order', async () => {
    const deps = makeDeps()
    const plan = await planAutoAssign(fakeFastify, baseInput, deps)

    const crew = plan.crews[0]
    expect(crew.crewId).toBe('J4001')
    expect(crew.base).toBe('ADD')
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([151528, 151540])
    // Earliest-first: the 09-11 pairing is assigned before the 09-13 one.
    expect(crew.assigned[0].startDt).toBe('2026-09-11T12:10:00.000Z')
    // assign steps preserve earliest-first order
    const assignSteps = crew.steps.filter((s) => s.kind === 'assign')
    expect(assignSteps.map((s) => (s as { pairingId: number }).pairingId)).toEqual([151528, 151540])
    // block minutes accrue from both round-trip legs (230 + 225 = 455 per pairing)
    expect(crew.assigned[0].blockMinutes).toBe(455)
    expect(plan.summary).toEqual({ crewCount: 1, assignedTotal: 2, skippedTotal: 0 })
  })

  it('(b) skips a candidate overlapping an existing roster duty', async () => {
    // Existing duty spans the whole 09-11 pairing window → P1 must be skipped.
    const existing: PreviewRosterItem[] = [
      {
        id: 999,
        crewId: 'J4001',
        pairingId: 900001,
        schStrDtUtc: '2026-09-11T10:00:00.000Z',
        schEndDtUtc: '2026-09-12T12:00:00.000Z',
      },
    ]
    const deps = makeDeps({ fetchExistingRoster: vi.fn(async () => existing) })
    const plan = await planAutoAssign(fakeFastify, baseInput, deps)

    const crew = plan.crews[0]
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([151540])
    const overlapSkip = crew.skipped.find((s) => s.pairingId === 151528)
    expect(overlapSkip?.reason).toBe('overlap')
  })

  it('(c) skips a candidate with no fillable slot / disallowed rank', async () => {
    const deps = makeDeps({
      precheck: vi.fn(async (_f, _c, pairingId: number) =>
        pairingId === 151528
          ? { ok: false as const, reason: 'NO_OPEN_POSITION' as const, message: 'This pairing has no open positions' }
          : { ok: true as const, actingRank: 'CA' },
      ),
    })
    const plan = await planAutoAssign(fakeFastify, baseInput, deps)

    const crew = plan.crews[0]
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([151540])
    const noSlot = crew.skipped.find((s) => s.pairingId === 151528)
    expect(noSlot?.reason).toBe('no-slot')
    expect(noSlot?.message).toContain('no open positions')
  })

  it('(d) backtracks on a hard 8002 rule violation, trims the offender, re-previews', async () => {
    // First preview flags the LATER pairing (151540) with a sev-3 8002; after trim, clean.
    const runLegality = vi
      .fn()
      .mockResolvedValueOnce({
        allowed: false,
        violations: [violation(151540, '8002', 3, 'Max cumulative block hours exceeded')],
      })
      .mockResolvedValueOnce({ allowed: true, violations: [] })
    const deps = makeDeps({ runLegality })
    const plan = await planAutoAssign(fakeFastify, baseInput, deps)

    const crew = plan.crews[0]
    // Offender trimmed to skipped; the earlier pairing survives.
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([151528])
    const ruleSkip = crew.skipped.find((s) => s.pairingId === 151540)
    expect(ruleSkip?.reason).toBe('rule')
    expect(ruleSkip?.ruleCode).toBe('8002')
    // Re-preview actually happened after the trim.
    expect(runLegality).toHaveBeenCalledTimes(2)
    // The rule-skip step carries the resolved human-readable rule name + severity.
    const ruleStep = crew.steps.find((s) => s.kind === 'skip' && (s as { reason: string }).reason === 'rule') as
      | { ruleCode: string; ruleName?: string; severity?: number }
      | undefined
    expect(ruleStep?.ruleName).toBe('Max Cumulative')
    expect(ruleStep?.severity).toBe(3)
  })

  it('(e) 7505 soft violation: trimmed when skipOnSoft (default), kept when skipOnSoft=false', async () => {
    // skipOnSoft default (true) → warning-clean → the soft 7505 pairing is trimmed.
    const softThenClean = () =>
      vi
        .fn()
        .mockResolvedValueOnce({
          allowed: true, // sev < 3 → engine deems it allowed, but skipOnSoft still trims
          violations: [violation(151540, '7505', 2, 'Minimum days off not met')],
        })
        .mockResolvedValueOnce({ allowed: true, violations: [] })

    const trimmed = await planAutoAssign(fakeFastify, baseInput, makeDeps({ runLegality: softThenClean() }))
    const trimmedCrew = trimmed.crews[0]
    expect(trimmedCrew.assigned.map((a) => a.pairingId)).toEqual([151528])
    const softSkip = trimmedCrew.skipped.find((s) => s.pairingId === 151540)
    expect(softSkip?.reason).toBe('rule')
    expect(softSkip?.ruleCode).toBe('7505')

    // skipOnSoft = false → the soft 7505 is tolerated → both pairings kept, one preview only.
    const keptRun = softThenClean()
    const kept = await planAutoAssign(
      fakeFastify,
      { ...baseInput, policy: { skipOnSoft: false } },
      makeDeps({ runLegality: keptRun }),
    )
    const keptCrew = kept.crews[0]
    expect(keptCrew.assigned.map((a) => a.pairingId)).toEqual([151528, 151540])
    expect(keptCrew.skipped).toHaveLength(0)
    expect(keptRun).toHaveBeenCalledTimes(1)
  })
})
