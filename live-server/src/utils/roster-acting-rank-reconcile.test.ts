import { describe, expect, it } from 'vitest'
import { computeActingRankMoves } from './roster-acting-rank-reconcile.js'

const dt = (s: string): Date => new Date(`${s}T00:00:00.000Z`)
const flightDate = dt('2026-07-04')

describe('computeActingRankMoves', () => {
  it('moves the most-recently-promoted crew in an over-filled rank into the short rank (38529 case)', () => {
    const moves = computeActingRankMoves({
      planByPairing: { 38529: { IFD: 1, FA: 3 } },
      fillByPairing: { 38529: { IFD: 2, FA: 2 } },
      rosterByPairing: {
        38529: [
          { pairingId: 38529, crewId: '776', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
          { pairingId: 38529, crewId: '2716', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
          { pairingId: 38529, crewId: '1519', activeRank: 'FA', rosterActingRank: 'FA', flightActingRank: 'FA' },
          { pairingId: 38529, crewId: '1719', activeRank: 'FA', rosterActingRank: 'FA', flightActingRank: 'FA' },
        ],
      },
      crewRankByCrew: {
        '776': [{ rank: 'IFD', effDt: dt('2022-06-23'), expDt: dt('2199-12-31') }],
        '2716': [{ rank: 'IFD', effDt: dt('2026-07-01'), expDt: dt('2056-05-28') }],
        '1519': [{ rank: 'FA', effDt: dt('2021-01-01'), expDt: null }],
        '1719': [{ rank: 'FA', effDt: dt('2021-01-01'), expDt: null }],
      },
      pairingDateByPairing: { 38529: flightDate },
    })
    // 2716 got IFD most recently (2026-07-01) → steps down to FA; 776 (2022) keeps IFD.
    expect(moves).toEqual([{ pairingId: 38529, crewId: '2716', toRank: 'FA' }])
  })

  it('moves a crew with NO rank record for the over rank before ranked crews', () => {
    const moves = computeActingRankMoves({
      planByPairing: { 38383: { CA: 1 } },
      fillByPairing: { 38383: { FO: 1 } },
      rosterByPairing: {
        38383: [{ pairingId: 38383, crewId: '1440', activeRank: 'FO', rosterActingRank: 'FO', flightActingRank: 'FO' }],
      },
      crewRankByCrew: { '1440': [] }, // no FO record covering the flight → anomaly, moved first
      pairingDateByPairing: { 38383: dt('2026-07-02') },
    })
    expect(moves).toEqual([{ pairingId: 38383, crewId: '1440', toRank: 'CA' }])
  })

  it('leaves pairings alone when totals do not match', () => {
    const moves = computeActingRankMoves({
      planByPairing: { 998: { IFD: 1, FA: 3 } },
      fillByPairing: { 998: { IFD: 2, FA: 1 } }, // total fill 3 != plan 4 → unbalanced
      rosterByPairing: {
        998: [
          { pairingId: 998, crewId: 'a', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
          { pairingId: 998, crewId: 'b', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
          { pairingId: 998, crewId: 'c', activeRank: 'FA', rosterActingRank: 'FA', flightActingRank: 'FA' },
        ],
      },
      crewRankByCrew: {
        a: [{ rank: 'IFD', effDt: dt('2022-01-01'), expDt: null }],
        b: [{ rank: 'IFD', effDt: dt('2026-07-01'), expDt: null }],
        c: [{ rank: 'FA', effDt: dt('2022-01-01'), expDt: null }],
      },
      pairingDateByPairing: { 998: flightDate },
    })
    expect(moves).toEqual([])
  })

  it('returns no moves for an already-balanced pairing', () => {
    const moves = computeActingRankMoves({
      planByPairing: { 1: { IFD: 1, FA: 3 } },
      fillByPairing: { 1: { IFD: 1, FA: 3 } },
      rosterByPairing: {
        1: [
          { pairingId: 1, crewId: 'a', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
          { pairingId: 1, crewId: 'b', activeRank: 'FA', rosterActingRank: 'FA', flightActingRank: 'FA' },
        ],
      },
      crewRankByCrew: {},
      pairingDateByPairing: { 1: flightDate },
    })
    expect(moves).toEqual([])
  })

  it('picks the most-recent start even when the pairing date is unknown', () => {
    const moves = computeActingRankMoves({
      planByPairing: { 2: { IFD: 1, FA: 3 } },
      fillByPairing: { 2: { IFD: 2, FA: 2 } },
      rosterByPairing: {
        2: [
          { pairingId: 2, crewId: 'old', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
          { pairingId: 2, crewId: 'new', activeRank: 'IFD', rosterActingRank: 'IFD', flightActingRank: 'IFD' },
        ],
      },
      crewRankByCrew: {
        old: [{ rank: 'IFD', effDt: dt('2022-01-01'), expDt: null }],
        new: [{ rank: 'IFD', effDt: dt('2026-07-01'), expDt: null }],
      },
      pairingDateByPairing: { 2: null },
    })
    expect(moves).toEqual([{ pairingId: 2, crewId: 'new', toRank: 'FA' }])
  })
})
