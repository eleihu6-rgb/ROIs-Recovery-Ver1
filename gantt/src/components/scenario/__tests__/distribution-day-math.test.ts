// gantt/src/components/scenario/__tests__/distribution-day-math.test.ts
// Ported from the Report's dayMath.test.ts, trimmed to the functions the
// distribution model actually uses (tzOffsetMs / floorLocalDay / nextLocalDay).
import { describe, expect, it } from 'vitest'
import { HOUR, UTC, floorLocalDay, nextLocalDay, tzOffsetMs } from '../distribution-day-math'

const ms = (iso: string): number => Date.parse(iso)

describe('tzOffsetMs', () => {
  it('is 0 for UTC at any instant', () => {
    expect(tzOffsetMs(UTC, ms('2026-06-22T18:50:00Z'))).toBe(0)
  })

  it('returns the offset in force at the instant (DST-aware)', () => {
    // Edmonton is UTC-6 in June (MDT).
    expect(tzOffsetMs('America/Edmonton', ms('2026-06-22T18:50:00Z'))).toBe(-6 * HOUR)
    // Toronto is UTC-4 in June (EDT).
    expect(tzOffsetMs('America/Toronto', ms('2026-06-22T03:20:00Z'))).toBe(-4 * HOUR)
  })

  it('switches at the DST transition instant, not a fixed offset', () => {
    // 2026-11-01: Edmonton leaves MDT (-6) for MST (-7) at 08:00 UTC.
    expect(tzOffsetMs('America/Edmonton', ms('2026-11-01T07:30:00Z'))).toBe(-6 * HOUR)
    expect(tzOffsetMs('America/Edmonton', ms('2026-11-01T09:30:00Z'))).toBe(-7 * HOUR)
  })
})

describe('floorLocalDay / nextLocalDay', () => {
  it('snaps an instant to the local-midnight opening its day', () => {
    // Edmonton 2026-06-22 12:50 local → local midnight = 2026-06-22T06:00:00Z.
    expect(floorLocalDay('America/Edmonton', ms('2026-06-22T18:50:00Z'))).toBe(ms('2026-06-22T06:00:00Z'))
    expect(floorLocalDay(UTC, ms('2026-06-22T18:50:00Z'))).toBe(ms('2026-06-22T00:00:00Z'))
  })

  it('advances one local day across a DST fall-back transition', () => {
    // Fall back: 2026-11-01 Edmonton 09:30 UTC is 02:30 MST; the local day is
    // 25 hours long (the repeated hour), so the next local midnight is 25h on.
    const midnight = floorLocalDay('America/Edmonton', ms('2026-11-01T09:30:00Z'))
    const next = nextLocalDay('America/Edmonton', midnight)
    expect(next - midnight).toBe(25 * HOUR)
    expect(new Date(next).toISOString()).toBe('2026-11-02T07:00:00.000Z')
  })

  it('a task ending exactly at local midnight does not open the next day', () => {
    // Edmonton day-off [07-01 06:00Z, 07-02 06:00Z) covers exactly Jul 1 local.
    const start = floorLocalDay('America/Edmonton', ms('2026-07-01T06:00:00Z'))
    const end = nextLocalDay('America/Edmonton', start)
    expect(end).toBe(ms('2026-07-02T06:00:00Z'))
  })
})
