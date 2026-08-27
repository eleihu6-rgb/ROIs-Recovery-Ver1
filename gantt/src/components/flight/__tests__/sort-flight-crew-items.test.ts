import { describe, expect, it } from 'vitest'
import type { FlightCrewItem } from '@/types'
import { sortFlightCrewItems } from '../sort-flight-crew-items'

const item = (crewId: string, actingRank: string, seniorityNum: string | null = crewId): FlightCrewItem => ({
  seqOrder: 0,
  crewId,
  crewName: `Name ${crewId}`,
  base: null,
  seniorityNum,
  crewRank: actingRank,
  actingRank,
  label: '',
  source: 'SYSTEM',
  mbh: '0:00',
  mfdp: null,
})

describe('sortFlightCrewItems', () => {
  it('orders by acting rank CA → FO → IFD → FA', () => {
    const sorted = sortFlightCrewItems([
      item('3', 'FA'),
      item('1', 'CA'),
      item('4', 'IFD'),
      item('2', 'FO'),
    ])
    expect(sorted.map((i) => i.actingRank)).toEqual(['CA', 'FO', 'IFD', 'FA'])
  })

  it('sorts within the same acting rank by seniorityNum ascending (lower = more senior)', () => {
    const sorted = sortFlightCrewItems([
      item('911', 'CA', '9'),
      item('788', 'CA', '2'),
      item('656', 'CA', '5'),
    ])
    expect(sorted.map((i) => i.crewId)).toEqual(['788', '656', '911'])
  })

  it('treats seniorityNum numerically, not lexically', () => {
    const sorted = sortFlightCrewItems([
      item('a', 'CA', '10'),
      item('b', 'CA', '9'),
    ])
    expect(sorted.map((i) => i.crewId)).toEqual(['b', 'a'])
  })

  it('keeps unknown seniorityNum last within a rank', () => {
    const sorted = sortFlightCrewItems([
      item('a', 'CA', null),
      item('b', 'CA', '5'),
    ])
    expect(sorted.map((i) => i.crewId)).toEqual(['b', 'a'])
  })

  it('keeps unknown acting ranks after known ranks', () => {
    const sorted = sortFlightCrewItems([
      item('10', ''),
      item('1', 'CA'),
      item('2', 'Z'),
    ])
    expect(sorted.map((i) => i.actingRank)).toEqual(['CA', 'Z', ''])
  })

  it('does not mutate the input array', () => {
    const input = [item('2', 'FO'), item('1', 'CA')]
    sortFlightCrewItems(input)
    expect(input.map((i) => i.crewId)).toEqual(['2', '1'])
  })
})
