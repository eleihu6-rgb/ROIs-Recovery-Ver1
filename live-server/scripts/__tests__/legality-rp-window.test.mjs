import { describe, expect, it } from 'vitest'
import {
  calendarRpDisplayWindow,
  crewLocalRpWindowUtc,
  listInclusiveCalendarMonths,
  nextIsoDate,
  parseRpDatesFrom7505Message,
} from '../legality-rp-window.mjs'

describe('crewLocalRpWindowUtc', () => {
  it('computes the Toronto June 2026 local RP window in UTC', () => {
    expect(crewLocalRpWindowUtc('2026-06-01', '2026-06-30', -240)).toEqual({
      startUtcSec: 1_780_286_400,
      endUtcSec: 1_782_878_400,
    })
  })

  it('computes the Vancouver June 2026 local RP window in UTC', () => {
    expect(crewLocalRpWindowUtc('2026-06-01', '2026-06-30', -420)).toEqual({
      startUtcSec: 1_780_297_200,
      endUtcSec: 1_782_889_200,
    })
  })
})

describe('calendarRpDisplayWindow', () => {
  it('uses calendar midnight bounds matching message RP labels', () => {
    expect(calendarRpDisplayWindow('2026-07-01', '2026-07-31')).toEqual({
      window_start_dt: '2026-07-01T00:00:00.000Z',
      window_end_dt: '2026-07-31T23:59:59.999Z',
    })
  })
})

describe('parseRpDatesFrom7505Message', () => {
  it('extracts trailing calendar RP labels from a 7505 warning', () => {
    expect(
      parseRpDatesFrom7505Message(
        'The number of days off(12) must be at least 13 in 1 RP (2026-07-01, 2026-07-31).',
      ),
    ).toEqual({ rpFrom: '2026-07-01', rpTo: '2026-07-31' })
  })

  it('returns null when the message has no RP date suffix', () => {
    expect(parseRpDatesFrom7505Message('The number of days off(3) must be at least 12 in 1 RP.')).toBeNull()
  })
})

describe('nextIsoDate', () => {
  it('rolls an ISO day label forward without timezone drift', () => {
    expect(nextIsoDate('2026-06-30')).toBe('2026-07-01')
  })
})

describe('listInclusiveCalendarMonths', () => {
  it('keeps a single calendar month intact', () => {
    expect(listInclusiveCalendarMonths('2026-07-01', '2026-07-31')).toEqual([
      { rpFrom: '2026-07-01', rpTo: '2026-07-31' },
    ])
  })

  it('splits a padded mutation window into full calendar months', () => {
    expect(listInclusiveCalendarMonths('2026-06-29', '2026-08-01')).toEqual([
      { rpFrom: '2026-06-01', rpTo: '2026-06-30' },
      { rpFrom: '2026-07-01', rpTo: '2026-07-31' },
      { rpFrom: '2026-08-01', rpTo: '2026-08-31' },
    ])
  })
})
