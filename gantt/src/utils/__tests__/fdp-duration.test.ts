import { describe, expect, it } from 'vitest'
import { fdpHoursToMin, formatFdpHm, formatFdpHours, formatFdpHoursDelta, formatUtcStamp } from '../fdp-duration'

describe('fdp-duration — controllers read FDP in hours, never raw minutes', () => {
  it('formats whole duty length as Hh MMm', () => {
    expect(formatFdpHm(840)).toBe('14h 00m')
    expect(formatFdpHm(930)).toBe('15h 30m')
    expect(formatFdpHm(660)).toBe('11h 00m')
    expect(formatFdpHm(0)).toBe('0h 00m')
  })

  it('formats extension/discretion in decimal hours, trimmed', () => {
    expect(formatFdpHours(90)).toBe('1.5 h')   // the ET2682 1.5h discretion
    expect(formatFdpHours(60)).toBe('1 h')
    expect(formatFdpHours(75)).toBe('1.25 h')
    expect(formatFdpHours(15)).toBe('0.25 h')
  })

  it('signs the Before → Proposed delta', () => {
    expect(formatFdpHoursDelta(90)).toBe('+1.5 h')
    expect(formatFdpHoursDelta(-30)).toBe('-0.5 h')
  })

  it('converts an hours input back to minutes for the API', () => {
    expect(fdpHoursToMin('1.5')).toBe(90)
    expect(fdpHoursToMin('1')).toBe(60)
    expect(fdpHoursToMin(2)).toBe(120)
    expect(fdpHoursToMin('')).toBe(0)
  })

  it('renders report/release as a compact UTC stamp, keeping the day', () => {
    // Before release 16:15Z vs Proposed release 17:45Z — the delay pushes the release.
    expect(formatUtcStamp('2026-09-29T16:15:00.000Z')).toBe('29 Sep 16:15Z')
    expect(formatUtcStamp('2026-09-29T17:45:00.000Z')).toBe('29 Sep 17:45Z')
    // A delay past midnight must stay legible (day rolls to the 30th).
    expect(formatUtcStamp('2026-09-30T00:45:00.000Z')).toBe('30 Sep 00:45Z')
    // Uses UTC fields, not the local browser zone.
    expect(formatUtcStamp('2026-09-29T02:00:00.000Z')).toBe('29 Sep 02:00Z')
    // Unparseable input is passed through untouched.
    expect(formatUtcStamp('not-a-date')).toBe('not-a-date')
  })
})
