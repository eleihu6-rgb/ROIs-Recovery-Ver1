import { describe, expect, it } from 'vitest'
import {
  buildCalendarCells,
  formatEnglishDate,
  formatEnglishMonth,
  getInitialCalendarMonth,
  parseIsoDate,
  shiftCalendarMonth,
} from '@rois/ui'

describe('English date helpers', () => {
  it('formats ISO dates with fixed English month labels', () => {
    expect(formatEnglishDate('2026-07-30')).toBe('Jul 30, 2026')
    expect(formatEnglishDate('')).toBe('')
    expect(formatEnglishDate('2026-02-31')).toBe('')
  })

  it('parses ISO dates without local timezone conversion', () => {
    expect(parseIsoDate('2026-07-30')).toEqual({ year: 2026, monthIndex: 6, day: 30 })
    expect(parseIsoDate('2026-7-30')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
  })

  it('builds English calendar months with disabled min/max bounds', () => {
    const month = getInitialCalendarMonth('2026-07-15')
    const cells = buildCalendarCells(month, '2026-07-10', '2026-07-20')

    expect(formatEnglishMonth(month)).toBe('July 2026')
    expect(cells.find((cell) => cell.isoDate === '2026-07-09')?.disabled).toBe(true)
    expect(cells.find((cell) => cell.isoDate === '2026-07-10')?.disabled).toBe(false)
    expect(cells.find((cell) => cell.isoDate === '2026-07-20')?.disabled).toBe(false)
    expect(cells.find((cell) => cell.isoDate === '2026-07-21')?.disabled).toBe(true)
  })

  it('shifts months through year boundaries', () => {
    expect(shiftCalendarMonth({ year: 2026, monthIndex: 0 }, -1)).toEqual({ year: 2025, monthIndex: 11 })
    expect(shiftCalendarMonth({ year: 2026, monthIndex: 11 }, 1)).toEqual({ year: 2027, monthIndex: 0 })
  })
})
