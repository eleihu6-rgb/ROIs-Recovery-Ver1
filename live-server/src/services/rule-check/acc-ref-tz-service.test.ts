import { describe, expect, it, vi } from 'vitest'
import {
  applyAccRefTzRows,
  buildAccRefTzInput,
  type AccRefDutyRow,
} from './acc-ref-tz-service.js'

const row = (overrides: Partial<AccRefDutyRow>): AccRefDutyRow => ({
  crewId: 'C1',
  pairingId: 10,
  dutySeq: 1,
  startUtc: new Date('2026-01-01T00:00:00Z'),
  endUtc: new Date('2026-01-01T04:00:00Z'),
  depZoneId: 'UTC',
  arrZoneId: 'UTC',
  ...overrides,
})

describe('acc-ref-tz-service', () => {
  it('builds one independent chronological line per crew and preserves pairing+duty identity', () => {
    const input = buildAccRefTzInput([
      row({
        crewId: 'C1',
        pairingId: 20,
        dutySeq: 2,
        startUtc: new Date('2026-01-03T00:00:00Z'),
        endUtc: new Date('2026-01-03T04:00:00Z'),
      }),
      row({ crewId: 'C2', pairingId: 10, dutySeq: 1, depZoneId: 'America/Toronto', arrZoneId: 'America/Toronto' }),
      row({ crewId: 'C1', pairingId: 10, dutySeq: 1 }),
    ], { stayPerMin: 1440, adjustMin: 60 })

    expect(input).toEqual([
      {
        crewId: 'C1',
        duties: [
          { pairingId: 10, dutySeq: 1, startUtc: 1767225600, endUtc: 1767240000, depTzMin: 0, arrTzMin: 0 },
          { pairingId: 20, dutySeq: 2, startUtc: 1767398400, endUtc: 1767412800, depTzMin: 0, arrTzMin: 0 },
        ],
      },
      {
        crewId: 'C2',
        duties: [
          { pairingId: 10, dutySeq: 1, startUtc: 1767225600, endUtc: 1767240000, depTzMin: -300, arrTzMin: -300 },
        ],
      },
    ])
  })

  it('writes the calculated ref to every segment row in the same crew duty', () => {
    const rows = [
      row({ dutySeq: 1 }),
      row({ dutySeq: 1, pairingId: 10 }),
      row({ dutySeq: 2, pairingId: 20, startUtc: new Date('2026-01-03T00:00:00Z'), endUtc: new Date('2026-01-03T04:00:00Z') }),
    ]
    const run = vi.fn(() => new Map([
      ['C1|10|1', { dutyRefTz: -240, dutyEndRefTz: -210 }],
      ['C1|20|2', { dutyRefTz: -180, dutyEndRefTz: -180 }],
    ]))

    expect(applyAccRefTzRows(rows, { stayPerMin: 1440, adjustMin: 60 }, run)).toEqual([
      { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -240, dutyEndRefTz: -210 },
      { crewId: 'C1', pairingId: 10, dutySeq: 1, dutyRefTz: -240, dutyEndRefTz: -210 },
      { crewId: 'C1', pairingId: 20, dutySeq: 2, dutyRefTz: -180, dutyEndRefTz: -180 },
    ])
    expect(run).toHaveBeenCalledOnce()
  })
})
