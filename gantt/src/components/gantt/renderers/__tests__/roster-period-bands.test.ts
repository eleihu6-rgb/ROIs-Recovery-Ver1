import { describe, expect, it } from 'vitest'
import { getRosterPeriodBands } from '../base-renderer'
import type { RosterPeriodOption } from '@/services/roster-period-api'

const period = (rosterPeriod: string, rpStart: string, rpEnd: string): RosterPeriodOption => ({
  id: Number(rosterPeriod.replace(/\D/g, '')) || 1,
  rosterPeriod,
  name: rpStart.slice(0, 7),
  rpStart,
  rpEnd,
  isCurrent: false,
})

describe('getRosterPeriodBands', () => {
  it('resolves calendar dates in the display timezone and keeps chronological order', () => {
    const bands = getRosterPeriodBands(
      [
        period('2026RP08', '2026-08-01', '2026-08-31'),
        period('2026RP07', '2026-07-01', '2026-07-31'),
      ],
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-08-31T23:59:59.999Z'),
      'UTC',
    )

    expect(bands).toHaveLength(2)
    expect(bands[0].startMs).toBe(Date.parse('2026-07-01T00:00:00.000Z'))
    expect(bands[0].endMs).toBe(Date.parse('2026-07-31T23:59:59.999Z'))
    expect(bands[1].startMs).toBe(Date.parse('2026-08-01T00:00:00.000Z'))
  })

  it('clips by overlap and ignores reversed periods', () => {
    const bands = getRosterPeriodBands(
      [
        period('2026RP06', '2026-06-01', '2026-06-30'),
        period('2026RP07', '2026-07-20', '2026-07-10'),
        period('2026RP08', '2026-08-01', '2026-08-31'),
      ],
      new Date('2026-07-15T00:00:00.000Z'),
      new Date('2026-08-15T00:00:00.000Z'),
      'UTC',
    )

    expect(bands.map((band) => band.index)).toEqual([2])
  })

  it('uses timezone-local calendar boundaries', () => {
    const bands = getRosterPeriodBands(
      [period('2026RP07', '2026-07-01', '2026-07-01')],
      new Date('2026-06-30T00:00:00.000Z'),
      new Date('2026-07-02T00:00:00.000Z'),
      'Asia/Shanghai',
    )

    expect(bands[0].startMs).toBe(Date.parse('2026-06-30T16:00:00.000Z'))
    expect(bands[0].endMs).toBe(Date.parse('2026-07-01T15:59:59.999Z'))
  })
})
