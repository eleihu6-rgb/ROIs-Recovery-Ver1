import { describe, expect, it } from 'vitest'
import {
  calendarMonthBoundsFromYmd,
  enumerateYmdRange,
  formatMandayMinutes,
} from '../manday-info-window'

describe('manday-info-window', () => {
  it('calendarMonthBoundsFromYmd covers full August', () => {
    expect(calendarMonthBoundsFromYmd('2026-08-12')).toEqual({
      yearMonth: '2026-08',
      start: '2026-08-01',
      end: '2026-08-31',
    })
  })

  it('enumerateYmdRange lists every day', () => {
    expect(enumerateYmdRange('2026-09-03', '2026-09-05')).toEqual([
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ])
  })

  it('formatMandayMinutes matches HH:MM style used in manday readouts', () => {
    expect(formatMandayMinutes(235)).toBe('3:55')
    expect(formatMandayMinutes(240)).toBe('4:00')
    expect(formatMandayMinutes(0)).toBe('0:00')
  })
})
