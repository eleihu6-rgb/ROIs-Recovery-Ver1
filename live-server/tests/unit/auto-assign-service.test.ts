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
    resolveBaseZone: vi.fn(async () => 'Africa/Addis_Ababa'),
    // One open CA slot per fixture pairing (plan 1 / fill 0), like the seeded ET877/ET876 trips.
    fetchOpenSlots: vi.fn(async (_f, ids: number[]) => new Map(ids.map((id) => [id, new Map([['CA', 1]])]))),
    precheck: vi.fn(async () => ({ ok: true as const, actingRank: 'CA' })),
    fetchExistingRoster: vi.fn(async () => [] as PreviewRosterItem[]),
    fetchSegments: vi.fn(async (_f, ids: number[]) => {
      const m = new Map<number, SegmentRow[]>()
      for (const id of ids) m.set(id, candSegs.get(id) ?? [])
      return m
    }),
    // Block minutes per candidate = Σ segment (schEnd − schStr), same basis as
    // the SQL aggregate the 'even' packer uses to level flying hours by week.
    fetchCandidateBlockMinutes: vi.fn(async (_f, ids: number[]) => {
      const m = new Map<number, number>()
      for (const id of ids) {
        const segs = candSegs.get(id) ?? []
        const mins = segs.reduce((sum, s) => {
          const a = new Date(s.schStrDtUtc as Date).getTime()
          const b = new Date(s.schEndDtUtc as Date).getTime()
          return b > a ? sum + (b - a) / 60_000 : sum
        }, 0)
        m.set(id, Math.round(mins))
      }
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

  it('(f) even distribution spreads picks across week buckets; earliest front-loads', async () => {
    // Month starting 2026-09-01 → week0 [09-01,09-08), week1 [09-08,09-15),
    // week2 [09-15,09-22). Three open round trips in week0, one in week1, one
    // in week2 — all equal block hours. With maxPerCrew=3, earliest-first would
    // grab the three week0 pairings (front-loaded); even distribution should
    // take one from each week so flying hours spread across the month.
    const W0a = roundTrip(200, 'W0a 09-02', '2026-09-02T06:00:00Z', '2026-09-02T08:00:00Z', '2026-09-02T10:00:00Z', '2026-09-02T12:00:00Z')
    const W0b = roundTrip(201, 'W0b 09-04', '2026-09-04T06:00:00Z', '2026-09-04T08:00:00Z', '2026-09-04T10:00:00Z', '2026-09-04T12:00:00Z')
    const W0c = roundTrip(202, 'W0c 09-06', '2026-09-06T06:00:00Z', '2026-09-06T08:00:00Z', '2026-09-06T10:00:00Z', '2026-09-06T12:00:00Z')
    const W1 = roundTrip(210, 'W1 09-10', '2026-09-10T06:00:00Z', '2026-09-10T08:00:00Z', '2026-09-10T10:00:00Z', '2026-09-10T12:00:00Z')
    const W2 = roundTrip(220, 'W2 09-17', '2026-09-17T06:00:00Z', '2026-09-17T08:00:00Z', '2026-09-17T10:00:00Z', '2026-09-17T12:00:00Z')
    const pairs = [W0a, W0b, W0c, W1, W2]
    const segMap = new Map<number, SegmentRow[]>(pairs.map((p) => [p.cand.id, p.segs]))
    const blk = (segs: SegmentRow[]): number =>
      Math.round(
        segs.reduce((sum, s) => {
          const a = new Date(s.schStrDtUtc as Date).getTime()
          const b = new Date(s.schEndDtUtc as Date).getTime()
          return b > a ? sum + (b - a) / 60_000 : sum
        }, 0),
      )

    const spreadDeps = () =>
      makeDeps({
        fetchCandidates: vi.fn(async () => pairs.map((p) => p.cand)),
        fetchSegments: vi.fn(async (_f, ids: number[]) => {
          const m = new Map<number, SegmentRow[]>()
          for (const id of ids) m.set(id, segMap.get(id) ?? [])
          return m
        }),
        fetchCandidateBlockMinutes: vi.fn(async (_f, ids: number[]) => {
          const m = new Map<number, number>()
          for (const id of ids) m.set(id, blk(segMap.get(id) ?? []))
          return m
        }),
      })

    const monthInput = { crewIds: ['J4001'], startDate: '2026-09-01', endDate: '2026-09-30', maxPerCrew: 3 }

    // Default (even): one pairing from each of week 0, 1, 2 — spread, not clustered.
    const even = await planAutoAssign(fakeFastify, monthInput, spreadDeps())
    expect(even.crews[0].assigned.map((a) => a.pairingId)).toEqual([200, 210, 220])

    // Explicit earliest: the three week-0 pairings, front-loaded.
    const earliest = await planAutoAssign(fakeFastify, { ...monthInput, distribution: 'earliest' }, spreadDeps())
    expect(earliest.crews[0].assigned.map((a) => a.pairingId)).toEqual([200, 201, 202])
  })

  // ── Auto-assign Duties: duty-type limits, RES pool, DO ground pass ─────────

  const RES_AM = (id: number, day: string): CandidatePairing => ({
    id,
    label: `PRAM-1000-2200 ${day.slice(5)}`,
    base: 'ADD',
    fleet: '737',
    division: 'P',
    assignmentGroup: 'RES',
    assignment: 'PRAM',
    schStr: new Date(`${day}T07:00:00Z`),
    schEnd: new Date(`${day}T19:00:00Z`),
  })

  /** Candidates by group, the way the real SQL filter would answer. */
  const groupedCandidates = (res: CandidatePairing[] = []) =>
    vi.fn(async (_f: unknown, args: { group?: string | null }) =>
      args.group === 'RES' ? res : args.group === 'FLY' || args.group == null ? [P1.cand, P2.cand] : [],
    )

  const weekInput = { crewIds: ['J4001'], startDate: '2026-09-10', endDate: '2026-09-16' } // 7 days = one window

  it('(g) legacy request (no dutyTypes) yields no outcome and no ground duties', async () => {
    const plan = await planAutoAssign(fakeFastify, baseInput, makeDeps())
    expect(plan.crews[0].outcome).toEqual([])
    expect(plan.crews[0].assignedGround).toEqual([])
    expect(plan.crews[0].assigned.map((a) => a.pairingId)).toEqual([151528, 151540])
  })

  it('(h) FLY every-7-days max blocks the second pairing in the same rolling window', async () => {
    const deps = makeDeps({ fetchCandidates: groupedCandidates() as unknown as AutoAssignDeps['fetchCandidates'] })
    const plan = await planAutoAssign(fakeFastify, { ...weekInput, dutyTypes: [{ group: 'FLY', every7Max: 1 }] }, deps)
    const crew = plan.crews[0]
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([151528])
    const skip = crew.skipped.find((s) => s.pairingId === 151540)
    expect(skip?.reason).toBe('every7-max')
    expect(crew.outcome[0]).toMatchObject({ group: 'FLY', existing: 0, assigned: 1, every7Max: 1 })
    expect(crew.outcome[0].windows[0]).toMatchObject({ start: '2026-09-10', end: '2026-09-16', count: 1, maxHit: true })
  })

  it('(i) period max caps the whole range', async () => {
    const deps = makeDeps({ fetchCandidates: groupedCandidates() as unknown as AutoAssignDeps['fetchCandidates'] })
    const plan = await planAutoAssign(fakeFastify, { ...weekInput, dutyTypes: [{ group: 'FLY', periodMax: 1 }] }, deps)
    expect(plan.crews[0].assigned).toHaveLength(1)
    expect(plan.crews[0].skipped.find((s) => s.pairingId === 151540)?.reason).toBe('period-max')
  })

  it('(j) RES pool matches base + division (fleet ignored) and fills only to its every-7-days min', async () => {
    const res = [RES_AM(9001, '2026-09-10'), RES_AM(9002, '2026-09-15')]
    const fetchCandidates = groupedCandidates(res)
    const deps = makeDeps({ fetchCandidates: fetchCandidates as unknown as AutoAssignDeps['fetchCandidates'] })
    const plan = await planAutoAssign(
      fakeFastify,
      { ...weekInput, dutyTypes: [{ group: 'FLY' }, { group: 'RES', every7Min: 1, periodMax: 2 }] },
      deps,
    )
    const resCall = fetchCandidates.mock.calls.find((c) => (c[1] as { group?: string }).group === 'RES')?.[1] as Record<string, unknown>
    expect(resCall).toMatchObject({ group: 'RES', matchFleet: false, division: 'P', base: 'ADD' })
    const crew = plan.crews[0]
    // FLY first (both), then exactly one RES to satisfy min 1 in the single window.
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([151528, 151540, 9001])
    expect(crew.assigned[2].group).toBe('RES')
    expect(crew.outcome.find((o) => o.group === 'RES')).toMatchObject({ assigned: 1, windows: [{ count: 1, minUnmet: false }] })
  })

  it('(k) DO is placed on the latest free ADD-local day of the window as a full-day ground duty', async () => {
    const deps = makeDeps({ fetchCandidates: groupedCandidates() as unknown as AutoAssignDeps['fetchCandidates'] })
    const plan = await planAutoAssign(
      fakeFastify,
      { ...weekInput, dutyTypes: [{ group: 'FLY' }, { group: 'DO', every7Min: 1, every7Max: 2, periodMax: 8 }] },
      deps,
    )
    const crew = plan.crews[0]
    // FLY occupies 09-11..09-12 and 09-13..09-14; latest free day is 09-16.
    expect(crew.assignedGround).toEqual([
      {
        group: 'DO',
        assignment: 'DO',
        day: '2026-09-16',
        base: 'ADD',
        startDtUtc: '2026-09-15T21:00:00.000Z', // ADD = UTC+3
        endDtUtc: '2026-09-16T20:59:59.000Z',
      },
    ])
    expect(crew.steps.some((s) => s.kind === 'ground')).toBe(true)
    // The DO went through the engine together with the FLY survivors.
    const lastCall = (deps.runLegality as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as { afterItems: PreviewRosterItem[] }
    expect(lastCall.afterItems.some((it) => it.pairingId == null && it.assignment === 'DO')).toBe(true)
    expect(crew.summary.assignedCount).toBe(3)
  })

  it('(l) existing roster DO counts toward the min, so no new DO is added', async () => {
    const existing: PreviewRosterItem[] = [
      { id: 5, crewId: 'J4001', pairingId: null, assignmentGroup: 'GRD', assignment: 'DO', schStrDtUtc: '2026-09-14T21:00:00.000Z', schEndDtUtc: '2026-09-15T20:59:59.000Z' },
    ]
    const deps = makeDeps({
      fetchCandidates: groupedCandidates() as unknown as AutoAssignDeps['fetchCandidates'],
      fetchExistingRoster: vi.fn(async () => existing),
    })
    const plan = await planAutoAssign(fakeFastify, { ...weekInput, dutyTypes: [{ group: 'DO', every7Min: 1 }] }, deps)
    expect(plan.crews[0].assignedGround).toEqual([])
    expect(plan.crews[0].outcome[0]).toMatchObject({ group: 'DO', existing: 1, assigned: 0, windows: [{ count: 1, minUnmet: false }] })
  })

  it('(m) DO min stays unmet (warning step) when every day is occupied', async () => {
    const busy: PreviewRosterItem[] = [
      { id: 7, crewId: 'J4001', pairingId: 800, schStrDtUtc: '2026-09-09T21:00:00.000Z', schEndDtUtc: '2026-09-16T21:00:00.000Z' },
    ]
    const deps = makeDeps({
      fetchCandidates: groupedCandidates() as unknown as AutoAssignDeps['fetchCandidates'],
      fetchExistingRoster: vi.fn(async () => busy),
    })
    const plan = await planAutoAssign(fakeFastify, { ...weekInput, dutyTypes: [{ group: 'DO', every7Min: 1 }] }, deps)
    const crew = plan.crews[0]
    expect(crew.assignedGround).toEqual([])
    const unmet = crew.steps.find((s) => s.kind === 'unmet') as { group: string; message: string } | undefined
    expect(unmet?.group).toBe('DO')
    expect(unmet?.message).toContain('no free day')
    expect(crew.outcome[0].windows[0].minUnmet).toBe(true)
  })

  it('(n) FLY leaves the free day a later DO min needs (reserve-day skip), so DO min 1 holds', async () => {
    // Four round trips would cover all seven days 09-10..09-16; with DO min 1 the
    // packer must skip the one that would consume the last free day.
    const R1 = roundTrip(7001, 'RT 09-10', '2026-09-10T06:00:00Z', '2026-09-10T10:00:00Z', '2026-09-11T06:00:00Z', '2026-09-11T10:00:00Z')
    const R2 = roundTrip(7002, 'RT 09-12', '2026-09-12T06:00:00Z', '2026-09-12T10:00:00Z', '2026-09-13T06:00:00Z', '2026-09-13T10:00:00Z')
    const R3 = roundTrip(7003, 'RT 09-14', '2026-09-14T06:00:00Z', '2026-09-14T10:00:00Z', '2026-09-15T06:00:00Z', '2026-09-15T10:00:00Z')
    const R4 = roundTrip(7004, 'RT 09-16', '2026-09-16T06:00:00Z', '2026-09-16T10:00:00Z', '2026-09-16T12:00:00Z', '2026-09-16T16:00:00Z')
    const all = [R1, R2, R3, R4]
    const deps = makeDeps({
      fetchCandidates: vi.fn(async (_f: unknown, args: { group?: string | null }) => (args.group === 'FLY' ? all.map((r) => r.cand) : [])) as unknown as AutoAssignDeps['fetchCandidates'],
      fetchSegments: vi.fn(async (_f, ids: number[]) => new Map(ids.map((id) => [id, all.find((r) => r.cand.id === id)?.segs ?? []]))),
      fetchCandidateBlockMinutes: vi.fn(async (_f, ids: number[]) => new Map(ids.map((id) => [id, 240]))),
    })
    const plan = await planAutoAssign(
      fakeFastify,
      { ...weekInput, distribution: 'earliest', dutyTypes: [{ group: 'FLY', every7Min: 1, every7Max: 4 }, { group: 'DO', every7Min: 1, every7Max: 2, periodMax: 8 }] },
      deps,
    )
    const crew = plan.crews[0]
    expect(crew.assigned.map((a) => a.pairingId)).toEqual([7001, 7002, 7003])
    expect(crew.skipped.find((s) => s.pairingId === 7004)).toMatchObject({ reason: 'reserve-day' })
    expect(crew.assignedGround.map((g) => g.day)).toEqual(['2026-09-16'])
    expect(crew.outcome.find((o) => o.group === 'DO')?.windows[0]).toMatchObject({ count: 1, minUnmet: false })
  })

  it('(o) a soft violation naming no pairing does not trim DO days (7505 min days off is not fixed by removing a day off)', async () => {
    const runLegality = vi.fn().mockResolvedValue({
      allowed: false,
      violations: [violation(null, '7505', 2, 'The number of days off(11) must be at least 12 in 1 RP')],
    })
    const deps = makeDeps({
      fetchCandidates: groupedCandidates() as unknown as AutoAssignDeps['fetchCandidates'],
      runLegality,
    })
    const plan = await planAutoAssign(fakeFastify, { ...weekInput, dutyTypes: [{ group: 'DO', every7Min: 1 }] }, deps)
    const crew = plan.crews[0]
    expect(crew.assignedGround.map((g) => g.day)).toEqual(['2026-09-16'])
    expect(crew.skipped).toEqual([])
    expect(crew.outcome[0].windows[0]).toMatchObject({ count: 1, minUnmet: false })
    expect(crew.warnings).toEqual([{ ruleCode: '7505', severity: 2, message: 'The number of days off(11) must be at least 12 in 1 RP' }])
  })

  it('(p) two crew in one plan never share a single open slot: the second crew skips it (no-slot)', async () => {
    const deps = makeDeps()
    const plan = await planAutoAssign(fakeFastify, { ...baseInput, crewIds: ['J4001', 'J4002'] }, deps)
    expect(plan.crews[0].assigned.map((a) => a.pairingId)).toEqual([151528, 151540])
    expect(plan.crews[1].assigned).toEqual([])
    const skips = plan.crews[1].skipped
    expect(skips.map((s) => s.reason)).toEqual(['no-slot', 'no-slot'])
    expect(skips[0].message).toContain('already taken by an earlier crew')
  })
})
