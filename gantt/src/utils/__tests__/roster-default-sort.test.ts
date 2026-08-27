import { describe, it, expect } from 'vitest'
import {
  buildRankOrderMap,
  compareCrewId,
  compareRosterDefault,
  type RankOrderRow,
} from '../roster-default-sort'

const RANKS = [
  { rank: 'CA', displayOrder: 1 },
  { rank: 'FO', displayOrder: 2 },
  { rank: 'SO', displayOrder: 3 },
]
const ORDER = buildRankOrderMap(RANKS)

const sortRows = (rows: RankOrderRow[]): string[] =>
  [...rows].sort((a, b) => compareRosterDefault(a, b, ORDER)).map((r) => r.crewId)

describe('compareCrewId', () => {
  it('orders numeric crew ids ascending (small id on top)', () => {
    expect(compareCrewId('100', '20')).toBeGreaterThan(0)
    expect(compareCrewId('20', '100')).toBeLessThan(0)
  })

  it('falls back to lexicographic for non-numeric ids', () => {
    expect(compareCrewId('A1', 'A2')).toBeLessThan(0)
  })
})

describe('compareRosterDefault', () => {
  it('orders primarily by rank displayOrder', () => {
    const rows: RankOrderRow[] = [
      { crewId: '5', rank: 'SO' },
      { crewId: '5', rank: 'CA' },
      { crewId: '5', rank: 'FO' },
    ]
    expect([...rows].sort((a, b) => compareRosterDefault(a, b, ORDER)).map((r) => r.rank))
      .toEqual(['CA', 'FO', 'SO'])
  })

  it('breaks rank ties by crewId ascending', () => {
    const rows: RankOrderRow[] = [
      { crewId: '300', rank: 'CA' },
      { crewId: '40', rank: 'CA' },
      { crewId: '200', rank: 'CA' },
    ]
    expect(sortRows(rows)).toEqual(['40', '200', '300'])
  })

  it('applies rank first, then crewId within each rank', () => {
    const rows: RankOrderRow[] = [
      { crewId: '2', rank: 'FO' },
      { crewId: '9', rank: 'CA' },
      { crewId: '1', rank: 'FO' },
      { crewId: '3', rank: 'CA' },
    ]
    expect(sortRows(rows)).toEqual(['3', '9', '1', '2'])
  })

  it('uses the first token of a composite rank string', () => {
    const rows: RankOrderRow[] = [
      { crewId: '1', rank: 'FO | CA' },
      { crewId: '2', rank: 'CA | FO' },
    ]
    // row 2 primary = CA (order 1), row 1 primary = FO (order 2)
    expect(sortRows(rows)).toEqual(['2', '1'])
  })

  it('sorts unknown/empty ranks last', () => {
    const rows: RankOrderRow[] = [
      { crewId: '1', rank: '' },
      { crewId: '2', rank: 'XX' },
      { crewId: '3', rank: 'CA' },
    ]
    // CA first; unknown ranks ('' and 'XX') after, tie-broken by crewId
    expect(sortRows(rows)).toEqual(['3', '1', '2'])
  })

  it('prefers a stable sortRank over the viewport-dependent rank', () => {
    const rows: RankOrderRow[] = [
      // viewport left date shows SO, but the window-start stable rank is CA → sort by CA
      { crewId: 'a', rank: 'SO', sortRank: 'CA' },
      // no sortRank → falls back to rank (CA)
      { crewId: 'b', rank: 'CA' },
    ]
    // Both land in the CA tier (order 1); tie broken by crewId ascending → a, b.
    expect(sortRows(rows)).toEqual(['a', 'b'])
  })
})
