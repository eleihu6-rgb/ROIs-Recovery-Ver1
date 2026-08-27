import { describe, expect, it } from 'vitest'
import { airportOffsetSuffix, formatUtcOffsetLabel } from '../format-airport-utc-offset'

describe('formatUtcOffsetLabel', () => {
  it('formats west of UTC without zero-padded hours', () => {
    expect(formatUtcOffsetLabel(-240)).toBe('(-4:00)')
  })

  it('formats east of UTC', () => {
    expect(formatUtcOffsetLabel(480)).toBe('(+8:00)')
  })

  it('formats half-hour offsets', () => {
    expect(formatUtcOffsetLabel(-150)).toBe('(-2:30)')
  })

  it('formats UTC as (+0:00)', () => {
    expect(formatUtcOffsetLabel(0)).toBe('(+0:00)')
  })
})

describe('airportOffsetSuffix', () => {
  const zoneIdFor = (airport: string): string | undefined =>
    ({ YYZ: 'America/Toronto', YVR: 'America/Vancouver', UTC: 'UTC' })[airport]

  it('returns empty when airport zone unknown', () => {
    expect(airportOffsetSuffix('XXX', '2026-09-07T09:40:00.000Z', zoneIdFor)).toBe('')
  })

  it('returns empty when instant missing', () => {
    expect(airportOffsetSuffix('YYZ', null, zoneIdFor)).toBe('')
  })

  it('YYZ on Sep (EDT) is (-4:00)', () => {
    expect(airportOffsetSuffix('YYZ', '2026-09-07T09:40:00.000Z', zoneIdFor)).toBe(' (-4:00)')
  })

  it('YVR on Sep (PDT) is (-7:00)', () => {
    expect(airportOffsetSuffix('YVR', '2026-09-07T14:50:00.000Z', zoneIdFor)).toBe(' (-7:00)')
  })
})
