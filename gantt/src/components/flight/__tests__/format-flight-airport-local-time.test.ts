import { describe, expect, it } from 'vitest'
import { formatFlightAirportLocalTime } from '../format-flight-airport-local-time'

describe('formatFlightAirportLocalTime', () => {
  it('returns em dash when instant or zone is missing', () => {
    expect(formatFlightAirportLocalTime(null, 'America/Vancouver')).toBe('—')
    expect(formatFlightAirportLocalTime('', 'America/Vancouver')).toBe('—')
    expect(formatFlightAirportLocalTime('2026-09-08T02:15:00.000Z', undefined)).toBe('—')
    expect(formatFlightAirportLocalTime('2026-09-08T02:15:00.000Z', '')).toBe('—')
  })

  it('formats YVR STD in Pacific daylight time', () => {
    expect(formatFlightAirportLocalTime('2026-09-08T02:15:00.000Z', 'America/Vancouver')).toBe('19:15')
  })

  it('formats YUL STA in Eastern daylight time', () => {
    expect(formatFlightAirportLocalTime('2026-09-08T07:15:00.000Z', 'America/Montreal')).toBe('03:15')
  })
})
