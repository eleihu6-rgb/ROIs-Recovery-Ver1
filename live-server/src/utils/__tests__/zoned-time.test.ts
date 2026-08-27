import { describe, it, expect } from 'vitest'
import { localWallTimeToUtc } from '../zoned-time'

describe('localWallTimeToUtc', () => {
  it('converts YVR (PDT, UTC-7 in June) 10:00 to 17:00Z', () => {
    const d = localWallTimeToUtc(2026, 6, 1, 10, 0, 'America/Vancouver')
    expect(d.toISOString()).toBe('2026-06-01T17:00:00.000Z')
  })
  it('converts YYZ (EDT, UTC-4 in June) 20:00 to 00:00Z next day', () => {
    const d = localWallTimeToUtc(2026, 6, 1, 20, 0, 'America/Toronto')
    expect(d.toISOString()).toBe('2026-06-02T00:00:00.000Z')
  })
  it('handles standard time (YEG, MST UTC-7 in January) 10:00 to 17:00Z', () => {
    const d = localWallTimeToUtc(2026, 1, 1, 10, 0, 'America/Edmonton')
    expect(d.toISOString()).toBe('2026-01-01T17:00:00.000Z')
  })
})
