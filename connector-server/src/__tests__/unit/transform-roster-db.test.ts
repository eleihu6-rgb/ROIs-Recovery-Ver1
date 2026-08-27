import { describe, it, expect } from 'vitest'
import { transformF8RosterFlight } from '../../transform/f8/db/transform-roster.js'

const rawRecord = {
  pairingId: 1001,
  rosterId: 42,
  fltType: '',
  pairingStrUtc: '2026-06-01T06:00:00Z',
  crew: {
    crewId: '12345',
    actingRank: 'Captain',
    activeRank: 'Captain',
    division: 'P',
    seqOrder: 1,
    assignmentGroup: 'FLY',
  },
}

const crewSet = new Set(['12345', '99999'])

describe('transformF8RosterFlight', () => {
  it('maps valid record to RosterFlightRecord', () => {
    const { records, rejected } = transformF8RosterFlight([rawRecord], crewSet, 'F8')
    expect(records).toHaveLength(1)
    const r = records[0]
    expect(r.crewId).toBe('12345')
    expect(r.pairingInterfaceId).toBe('1001')
    expect(r.actingRank).toBe('CA')
    expect(r.source).toBe('PA')
    expect(rejected).toHaveLength(0)
  })

  it('filters out records where crew_id not in Set', () => {
    const { records, rejected } = transformF8RosterFlight([rawRecord], new Set(['other']), 'F8')
    expect(records).toHaveLength(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatch(/crew_id not found/)
  })

  it('skips records where pairingId === 0', () => {
    const { records, rejected } = transformF8RosterFlight([{ ...rawRecord, pairingId: 0 }], crewSet, 'F8')
    expect(records).toHaveLength(0)
    expect(rejected).toHaveLength(0)
  })

  it('deduplicates by (pairingId, crewId)', () => {
    const { records } = transformF8RosterFlight([rawRecord, rawRecord], crewSet, 'F8')
    expect(records).toHaveLength(1)
  })
})
