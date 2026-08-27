import { describe, it, expect } from 'vitest'
import { computeWindowSums } from '../../../services/rule-check/flight-history.js'

describe('computeWindowSums', () => {
  const ref = new Date('2026-05-10T08:00:00Z')

  it('returns zeros when flights array is empty', () => {
    const result = computeWindowSums(ref, [])
    expect(result).toEqual({ last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 })
  })

  it('counts a flight that ended before ref and started within 24h', () => {
    const flight = {
      stdUtc: new Date('2026-05-09T20:00:00Z'),  // within 24h
      staUtc: new Date('2026-05-09T23:00:00Z'),  // before ref
      blkMin: 180,
    }
    const result = computeWindowSums(ref, [flight])
    expect(result.last24h).toBe(180)
    expect(result.last7d).toBe(180)
    expect(result.last28d).toBe(180)
  })

  it('excludes a flight that started within window but landed after ref', () => {
    const flight = {
      stdUtc: new Date('2026-05-09T20:00:00Z'),
      staUtc: new Date('2026-05-10T09:00:00Z'),  // after ref
      blkMin: 180,
    }
    const result = computeWindowSums(ref, [flight])
    expect(result.last24h).toBe(0)
  })

  it('does not break early when a short flight has later stdUtc but earlier staUtc than a preceding long flight', () => {
    // Flights sorted by stdUtc (the invariant), but staUtc is NOT monotonic.
    // Flight A: long flight, departs early, lands after ref. Flight B: short flight, departs later but lands before ref.
    const ref2 = new Date('2026-05-10T05:00:00Z')
    const flights = [
      { stdUtc: new Date('2026-05-10T00:00:00Z'), staUtc: new Date('2026-05-10T10:00:00Z'), blkMin: 600 },  // A: long, lands after ref
      { stdUtc: new Date('2026-05-10T01:00:00Z'), staUtc: new Date('2026-05-10T02:00:00Z'), blkMin: 60 },   // B: short, lands before ref
    ]
    const result = computeWindowSums(ref2, flights)
    // A is excluded (staUtc after ref). B should count if stdUtc-based break is used.
    // If break used staUtc (wrong), A's staUtc > ref would break and skip B entirely.
    expect(result.last24h).toBe(60)  // only B counts
    expect(result.last7d).toBe(60)
  })

  it('correctly buckets flights into different windows', () => {
    const flights = [
      { stdUtc: new Date('2026-05-09T10:00:00Z'), staUtc: new Date('2026-05-09T13:00:00Z'), blkMin: 60 },   // within 24h
      { stdUtc: new Date('2026-05-05T10:00:00Z'), staUtc: new Date('2026-05-05T13:00:00Z'), blkMin: 120 },  // within 7d, not 24h
      { stdUtc: new Date('2026-04-15T10:00:00Z'), staUtc: new Date('2026-04-15T13:00:00Z'), blkMin: 90 },   // within 28d, not 7d
    ]
    const result = computeWindowSums(ref, flights)
    expect(result.last24h).toBe(60)
    expect(result.last7d).toBe(60 + 120)
    expect(result.last28d).toBe(60 + 120 + 90)
    expect(result.last365d).toBe(60 + 120 + 90)
  })
})
