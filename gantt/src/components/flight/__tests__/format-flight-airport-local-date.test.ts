import { describe, expect, it } from 'vitest'
import { formatFlightAirportLocalDate } from '../format-flight-airport-local-date'

describe('formatFlightAirportLocalDate', () => {
  it('returns null when instant or zone is missing', () => {
    expect(formatFlightAirportLocalDate(null, 'America/Vancouver')).toBeNull()
    expect(formatFlightAirportLocalDate('', 'America/Vancouver')).toBeNull()
    expect(formatFlightAirportLocalDate('2026-08-19T05:45:00.000Z', undefined)).toBeNull()
    expect(formatFlightAirportLocalDate('2026-08-19T05:45:00.000Z', '')).toBeNull()
  })

  it('uses departure-local calendar day when UTC is already the next day', () => {
    // YVR STD 22:45 on Aug 18 = 2026-08-19T05:45:00Z
    expect(formatFlightAirportLocalDate('2026-08-19T05:45:00.000Z', 'America/Vancouver')).toBe(
      '2026-08-18',
    )
  })

  it('formats YYZ morning departure on the same UTC calendar day', () => {
    expect(formatFlightAirportLocalDate('2026-08-18T14:00:00.000Z', 'America/Toronto')).toBe(
      '2026-08-18',
    )
  })
})
