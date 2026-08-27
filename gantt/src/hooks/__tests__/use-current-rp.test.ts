import { describe, it, expect } from 'vitest'
import { rpForTimestamp } from '../use-current-rp'
import type { RosterPeriodOption } from '../../services/roster-period-api'

const items: RosterPeriodOption[] = [
  { id: 1, rosterPeriod: '2026RP02', name: '2026-02', rpStart: '2026-02-01', rpEnd: '2026-03-01', isCurrent: false },
  { id: 2, rosterPeriod: '2026RP03', name: '2026-03', rpStart: '2026-03-02', rpEnd: '2026-03-31', isCurrent: true },
]

describe('rpForTimestamp', () => {
  it('maps a mid-month date to its RP', () => {
    expect(rpForTimestamp(items, Date.UTC(2026, 1, 15))?.rosterPeriod).toBe('2026RP02') // Feb-15
    expect(rpForTimestamp(items, Date.UTC(2026, 2, 17))?.rosterPeriod).toBe('2026RP03') // Mar-17
  })

  it('maps the Feb/Mar boundary (Mar-01) to Feb RP, not Mar', () => {
    // F8 seed: Feb RP ends Mar-01, Mar RP starts Mar-02 → Mar-01 belongs to 2026RP02
    expect(rpForTimestamp(items, Date.UTC(2026, 2, 1))?.rosterPeriod).toBe('2026RP02')
    expect(rpForTimestamp(items, Date.UTC(2026, 2, 2))?.rosterPeriod).toBe('2026RP03')
  })

  it('honors rp_end inclusively on the last day of an RP', () => {
    expect(rpForTimestamp(items, Date.UTC(2026, 2, 31))?.rosterPeriod).toBe('2026RP03') // Mar-31 last day
  })

  it('returns null outside all RPs', () => {
    expect(rpForTimestamp(items, Date.UTC(2025, 0, 1))).toBeNull()
    expect(rpForTimestamp(items, Date.UTC(2026, 5, 10))).toBeNull()
  })

  it('returns null for empty items', () => {
    expect(rpForTimestamp([], Date.UTC(2026, 2, 1))).toBeNull()
  })
})
