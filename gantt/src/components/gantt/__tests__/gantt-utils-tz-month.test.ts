import { describe, it, expect } from 'vitest'
import { calendarDateInTimeZone, isDragAllowed, yearMonthInTimeZone } from '../gantt-utils'

describe('yearMonthInTimeZone', () => {
  it('returns the calendar month as seen in the given timezone (UTC)', () => {
    expect(yearMonthInTimeZone(new Date('2026-06-15T12:00:00Z'), 'UTC')).toBe('2026-06')
    expect(yearMonthInTimeZone(new Date('2026-06-01T00:00:00Z'), 'UTC')).toBe('2026-06')
  })

  it('resolves a UTC instant just after midnight to the PREVIOUS month in a western tz', () => {
    // 2026-06-01T03:00Z is still 2026-05-31 23:00 in Toronto (EDT, UTC-4) → May.
    expect(yearMonthInTimeZone(new Date('2026-06-01T03:00:00Z'), 'America/Toronto')).toBe('2026-05')
  })

  it('keeps a mid-month instant in the same month regardless of western offset', () => {
    expect(yearMonthInTimeZone(new Date('2026-06-15T12:00:00Z'), 'America/Vancouver')).toBe('2026-06')
  })

  it('rolls into the NEXT month for an end-of-month instant east of UTC', () => {
    // 2026-06-30T23:00Z is 2026-07-01 in Tokyo (UTC+9) → July.
    expect(yearMonthInTimeZone(new Date('2026-06-30T23:00:00Z'), 'Asia/Tokyo')).toBe('2026-07')
  })
})

describe('calendarDateInTimeZone', () => {
  it('resolves the visible calendar day instead of the host timezone day', () => {
    expect(calendarDateInTimeZone(new Date('2026-07-01T06:00:00Z'), 'America/Vancouver')).toBe('2026-06-30')
    expect(calendarDateInTimeZone(new Date('2026-07-01T07:00:00Z'), 'America/Vancouver')).toBe('2026-07-01')
  })
})

describe('isDragAllowed', () => {
  it('allows Scenario roster assignment and reassign drags', () => {
    expect(isDragAllowed('scenario-pairing', 'scenario-roster')).toBe(true)
    expect(isDragAllowed('scenario-roster', 'scenario-roster')).toBe(true)
    expect(isDragAllowed('pairing', 'scenario-roster')).toBe(true)
  })

  it('keeps Scenario pairing definition editing out of RO drag scope', () => {
    expect(isDragAllowed('scenario-pairing', 'pairing')).toBe(false)
    expect(isDragAllowed('scenario-pairing', 'scenario-pairing')).toBe(false)
    expect(isDragAllowed('flight', 'scenario-pairing')).toBe(false)
  })
})
