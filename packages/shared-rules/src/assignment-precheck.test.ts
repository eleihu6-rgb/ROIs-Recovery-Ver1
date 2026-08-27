import { describe, it, expect } from 'vitest'
import { validateAssignment, type RankActingMap } from './assignment-precheck'

const baseCrew = {
  id: 'C001',
  division: 'C',
  rank: 'FO',
}

const basePairing = {
  id: 1,
  division: 'C',
  composition: [
    { actingRank: 'CA', plan: 1, fill: 0 },
    { actingRank: 'FO', plan: 1, fill: 0 },
  ],
}

const emptyRankActing: RankActingMap = new Map()
const caToFo: RankActingMap = new Map([['CA', new Set(['FO'])]])

describe('validateAssignment - division', () => {
  it('returns DIVISION_MISMATCH when crew.division != pairing.division', () => {
    const result = validateAssignment(
      { ...baseCrew, division: 'C' },
      { ...basePairing, division: 'D' },
      emptyRankActing,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('DIVISION_MISMATCH')
  })
})

describe('validateAssignment - open position', () => {
  it('returns NO_OPEN_POSITION when no slot has plan > fill', () => {
    const result = validateAssignment(
      baseCrew,
      {
        ...basePairing,
        composition: [
          { actingRank: 'CA', plan: 1, fill: 1 },
          { actingRank: 'FO', plan: 1, fill: 1 },
        ],
      },
      emptyRankActing,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('NO_OPEN_POSITION')
  })
})

describe('validateAssignment - rank acting', () => {
  it('returns RANK_ACTING_DISALLOWED when crew rank has no matching open slot and no fallback', () => {
    const result = validateAssignment(
      { ...baseCrew, rank: 'FO' },
      { ...basePairing, composition: [{ actingRank: 'CA', plan: 1, fill: 0 }] },
      emptyRankActing,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('RANK_ACTING_DISALLOWED')
  })

  it('allows CA to fill FO slot when rank_acting maps CA → FO', () => {
    const result = validateAssignment(
      { ...baseCrew, rank: 'CA' },
      { ...basePairing, composition: [{ actingRank: 'FO', plan: 1, fill: 0 }] },
      caToFo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.actingRank).toBe('FO')
  })

  it('matches exact rank without rank_acting lookup when open slot exists', () => {
    const result = validateAssignment(
      { ...baseCrew, rank: 'FO' },
      basePairing,
      emptyRankActing,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.actingRank).toBe('FO')
  })
})