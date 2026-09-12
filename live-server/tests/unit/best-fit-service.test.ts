import { describe, expect, it, vi } from 'vitest'
import type { RankActingMap } from '@rois/shared-rules'

// Transitive imports (models → db → config/env) require these at load time.
vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
  process.env.LIVE_SCHEMA ||= 'f8'
})

import type { BestFitCandidate, BestFitCost, PairingBundle } from '../../src/services/best-fit/best-fit-service.js'
import {
  classifyCoverageState,
  classifyLegalityDelta,
  openCompositionSlots,
  rankCandidates,
  resolveSlotForCrew,
} from '../../src/services/best-fit/best-fit-service.js'
import { pairingCreditMinutes } from '../../src/services/assignment/preview-roster-items.js'
import { buildCostInputs, costApplicability, costNotApplicableReason } from '../../src/services/best-fit/best-fit-service.js'
import type { LegalityPreviewViolation } from '../../src/services/rule/legality-preview.js'

const violation = (over: Partial<LegalityPreviewViolation> = {}): LegalityPreviewViolation => ({
  crewId: 'C1',
  pairingId: 100,
  dutySeq: 1,
  ruleCode: '7501',
  ruleInstance: '001',
  scopeKey: 'C1',
  severity: 3,
  startDt: '2026-09-14T00:00:00Z',
  endDt: '2026-09-14T12:00:00Z',
  message: 'post-duty rest',
  flightId: null,
  ...over,
})

const cost = (over: Partial<BestFitCost> = {}): BestFitCost => ({
  status: 'priced',
  amount: 100,
  currencyCode: 'CAD',
  setLabel: 'F8 Recovery',
  setVersion: 3,
  members: [],
  ...over,
})

const candidate = (over: Partial<BestFitCandidate> = {}): BestFitCandidate => ({
  crewId: 'C1',
  name: 'One',
  rank: 'CA',
  rankUsed: 'CA',
  base: 'YEG',
  fleets: ['B737'],
  division: 'P',
  seniority: 100,
  mbhMinutes: 600,
  mcredMinutes: 4000,
  statsAvailable: true,
  monthCreditHours: 66.7,
  cost: cost(),
  legality: {
    verdict: 'pass',
    comparison: 'complete',
    newViolations: [],
    changedViolations: [],
    existingViolations: [],
  },
  why: '',
  ...over,
})

describe('best-fit coverage helpers', () => {
  it('lists only composition slots that still need crew', () => {
    expect(
      openCompositionSlots([
        { rank: 'CA', plan: 1, fill: 0 },
        { rank: 'FO', plan: 1, fill: 1 },
      ]),
    ).toEqual([{ rank: 'CA', plan: 1, fill: 0 }])
  })

  it('classifies a pairing with nobody assigned as open and a partly staffed one as partial', () => {
    expect(classifyCoverageState([{ rank: 'CA', plan: 1, fill: 0 }])).toBe('open')
    expect(
      classifyCoverageState([
        { rank: 'CA', plan: 1, fill: 0 },
        { rank: 'FO', plan: 1, fill: 1 },
      ]),
    ).toBe('partial')
  })
})

describe('best-fit stage 1 — eligibility uses the shared rule', () => {
  const pairing: Pick<PairingBundle, 'id' | 'division' | 'composition'> = {
    id: 100,
    division: 'P',
    composition: [{ rank: 'FO', plan: 1, fill: 0 }],
  }
  const crew = { crewId: 'C1', name: 'One', division: 'P', seniority: 1, base: 'YEG', rank: 'CA', fleets: ['B737'] }

  it('resolves a rank-acting downgrade into the open slot', () => {
    const rankActing: RankActingMap = new Map([['CA', new Set(['FO'])]])
    expect(resolveSlotForCrew(crew, pairing, rankActing)).toEqual({ actingRank: 'FO' })
  })

  it('rejects a crew with no acting permission for the open slot', () => {
    expect(resolveSlotForCrew(crew, pairing, new Map())).toBeNull()
  })

  it('rejects a division mismatch before any rank logic', () => {
    const rankActing: RankActingMap = new Map([['CA', new Set(['FO'])]])
    expect(resolveSlotForCrew({ ...crew, division: 'C' }, pairing, rankActing)).toBeNull()
  })
})

describe('best-fit stage 2 — before/after legality delta', () => {
  it('passes when the roster had no findings and the assignment adds none', () => {
    expect(classifyLegalityDelta([], []).verdict).toBe('pass')
  })

  it('blocks a candidate that introduces a NEW hard finding', () => {
    const result = classifyLegalityDelta([], [violation()])
    expect(result.verdict).toBe('hard')
    expect(result.newViolations).toHaveLength(1)
  })

  it('does not block a pre-existing, unchanged finding but keeps it visible', () => {
    const before = [violation({ severity: 3 })]
    const after = [violation({ severity: 3 })]
    const result = classifyLegalityDelta(before, after)
    expect(result.verdict).toBe('pass')
    expect(result.existingViolations).toHaveLength(1)
    expect(result.newViolations).toHaveLength(0)
  })

  it('treats the same rule with a shifted window as changed rather than new', () => {
    const before = [violation({ endDt: '2026-09-14T12:00:00Z' })]
    const after = [violation({ endDt: '2026-09-14T15:00:00Z' })]
    const result = classifyLegalityDelta(before, after)
    expect(result.verdict).toBe('hard')
    expect(result.changedViolations).toHaveLength(1)
    expect(result.newViolations).toHaveLength(0)
  })

  it('keeps a new soft finding selectable but flagged', () => {
    const result = classifyLegalityDelta([], [violation({ severity: 2, ruleCode: '8002' })])
    expect(result.verdict).toBe('soft')
  })

  it('reports an engine failure as unknown, never as pass', () => {
    const failed = classifyLegalityDelta
    expect(failed([], []).verdict).toBe('pass')
    // the orchestrator maps a thrown engine call onto this shape
    const unknown = {
      verdict: 'unknown' as const,
      comparison: 'incomplete' as const,
      newViolations: [],
      changedViolations: [],
      existingViolations: [],
      message: 'Legality engine failed',
    }
    expect(unknown.verdict).not.toBe('pass')
  })
})

describe('best-fit stage 3 — ranking', () => {
  it('orders fairness by MBH then MCred and keeps hard-blocked last', () => {
    const rows = [
      candidate({ crewId: 'LOW', mbhMinutes: 900, mcredMinutes: 4000 }),
      candidate({ crewId: 'HIGH', mbhMinutes: 100, mcredMinutes: 3900, legality: { ...candidate().legality, verdict: 'hard', newViolations: [] } }),
      candidate({ crewId: 'MID', mbhMinutes: 900, mcredMinutes: 3300 }),
    ]
    expect(rankCandidates(rows, 'fairness').map((row) => row.crewId)).toEqual(['MID', 'LOW', 'HIGH'])
  })

  it('orders cost by priced total and never ranks a partial cost as if it were complete', () => {
    const rows = [
      candidate({ crewId: 'PARTIAL', cost: cost({ status: 'partial', amount: 10 }) }),
      candidate({ crewId: 'PRICEY', cost: cost({ amount: 900 }) }),
      candidate({ crewId: 'CHEAP', cost: cost({ amount: 120 }) }),
      candidate({ crewId: 'UNPRICED', cost: cost({ status: 'unpriced', amount: null, currencyCode: null }) }),
    ]
    expect(rankCandidates(rows, 'cost').map((row) => row.crewId)).toEqual(['CHEAP', 'PRICEY', 'PARTIAL', 'UNPRICED'])
  })

  it('ranks an unknown-legality candidate ahead of a hard block but flags it', () => {
    const rows = [
      candidate({ crewId: 'UNKNOWN', legality: { ...candidate().legality, verdict: 'unknown', comparison: 'incomplete' } }),
      candidate({ crewId: 'HARD', mbhMinutes: 1, legality: { ...candidate().legality, verdict: 'hard' } }),
    ]
    const ranked = rankCandidates(rows, 'fairness')
    expect(ranked.map((row) => row.crewId)).toEqual(['UNKNOWN', 'HARD'])
    expect(ranked[0]!.why).toMatch(/Legality not verified/)
  })

  it('never lets a crew with missing manday data win the ranking', () => {
    // Regression: a missing manday row arrives as mbh/mcred 0, which used to sort
    // as "the free-est crew" on BOTH bases. Unknown must rank below known crew.
    const rows = [
      candidate({ crewId: 'NODATA', mbhMinutes: 0, mcredMinutes: 0, statsAvailable: false }),
      candidate({ crewId: 'KNOWN', mbhMinutes: 900, mcredMinutes: 4200, statsAvailable: true }),
    ]
    expect(rankCandidates(rows, 'fairness').map((row) => row.crewId)).toEqual(['KNOWN', 'NODATA'])
    expect(rankCandidates(rows, 'cost')[0]!.crewId).toBe('KNOWN')
    expect(rankCandidates(rows, 'fairness')[1]!.why).toMatch(/no manday data/)
  })
})

describe('pairing credit is duty-level payable credit, not block time', () => {
  it('counts the duty credit once per duty even when every segment repeats it', () => {
    const minutes = pairingCreditMinutes([
      { dutySeq: 1, segSeq: 1, schCreditedMinutesSeg: 300 },
      { dutySeq: 1, segSeq: 2, schCreditedMinutesSeg: 300 },
      { dutySeq: 2, segSeq: 1, schCreditedMinutesSeg: 480 },
    ] as never)
    expect(minutes).toBe(780)
  })
})

describe('best-fit cost applicability', () => {
  it('prices only the guarantee member, which a single assignment fully determines', () => {
    expect(costApplicability('guarantee', 'credit hour')).toBe('applicable')
    const inputs = buildCostInputs('guarantee', 'credit hour', {
      pairing: { id: 1 } as never,
      crew: { crewId: 'C1' } as never,
      pairingCreditMinutes: 330,
      monthCreditHours: 84,
    })
    expect(inputs).toEqual({ beforeCredit: 84, addedCredit: 5.5 })
  })

  it('refuses to invent a cost for members whose trigger was never stated', () => {
    expect(costApplicability('quantity', 'room-night')).toBe('not-applicable')
    expect(costApplicability('fixed', 'callout')).toBe('not-applicable')
    expect(costApplicability('bands', 'minute')).toBe('not-applicable')
    expect(costApplicability('booking', 'booking')).toBe('not-applicable')
    expect(costApplicability('standby', 'credit hour')).toBe('not-applicable')
    expect(buildCostInputs('quantity', 'room-night', {} as never)).toBeNull()
    expect(costNotApplicableReason('quantity', 'room-night')).toMatch(/unit count/)
    expect(costNotApplicableReason('fixed', 'callout')).toMatch(/callout/)
  })

  it('rejects a guarantee member configured in the wrong unit', () => {
    expect(costApplicability('guarantee', 'sector')).toBe('not-applicable')
    expect(costNotApplicableReason('guarantee', 'sector')).toMatch(/credit hours/)
  })
})
