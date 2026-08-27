import { describe, expect, it } from 'vitest'
import { localDateInZone, localWallTimeToUtc } from '../../utils/zoned-time.js'

describe('localDateInZone', () => {
  it('formats UTC ISO in the given IANA zone (PDT = UTC-7)', () => {
    // 2026-08-01 00:00 UTC = 2026-07-31 17:00 PDT
    expect(localDateInZone('2026-08-01T00:00:00Z', 'America/Vancouver')).toBe('2026-07-31')
    // 2026-08-01 12:00 UTC = 2026-08-01 05:00 PDT
    expect(localDateInZone('2026-08-01T12:00:00Z', 'America/Vancouver')).toBe('2026-08-01')
    expect(localDateInZone('2026-07-01T12:00:00Z', 'UTC')).toBe('2026-07-01')
  })

  it('cached output is identical to a fresh per-call formatter', () => {
    const zone = 'America/Toronto'
    for (const iso of ['2026-07-01T03:00:00Z', '2026-07-01T06:00:00Z', '2026-12-31T23:30:00Z']) {
      const expected = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
      expect(localDateInZone(iso, zone)).toBe(expected)
    }
  })

  it('localWallTimeToUtc stays DST-correct (Vancouver PDT = UTC-7)', () => {
    // 2026-07-01 12:00 PDT = 19:00 UTC
    expect(localWallTimeToUtc(2026, 7, 1, 12, 0, 'America/Vancouver').toISOString()).toBe('2026-07-01T19:00:00.000Z')
    // Winter PST = UTC-8: 2026-01-01 12:00 PST = 20:00 UTC
    expect(localWallTimeToUtc(2026, 1, 1, 12, 0, 'America/Vancouver').toISOString()).toBe('2026-01-01T20:00:00.000Z')
  })
})
