import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

import { recomputeWindowTimes } from '../res-pairing-service'

describe('recomputeWindowTimes', () => {
  it('recomputes UTC start/end for a new window in base tz', () => {
    const r = recomputeWindowTimes('2026-06-01', { start: '09:00', end: '21:00' }, 'America/Vancouver')
    expect(r.schStrDtUtc.toISOString()).toBe('2026-06-01T16:00:00.000Z')
    expect(r.schEndDtUtc.toISOString()).toBe('2026-06-02T04:00:00.000Z')
    expect(r.durationDays).toBe(1)
  })

  it('PM crossing midnight: end UTC is next wall day, durationDays is 2', () => {
    const r = recomputeWindowTimes('2026-06-01', { start: '20:00', end: '05:59' }, 'America/Vancouver')
    expect(r.schStrDtUtc.toISOString()).toBe('2026-06-02T03:00:00.000Z')  // 20:00 PDT
    expect(r.schEndDtUtc.toISOString()).toBe('2026-06-02T12:59:00.000Z')  // 05:59 PDT next day
    expect(r.durationDays).toBe(2)
  })
})
