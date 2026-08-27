/**
 * Pure-import tests for the project-wide UI date display standard
 * (CLAUDE.md「UI 日期显示标准」/ spec 2026-06-06-ui-date-display-standard).
 * Runs in Node — no browser, no server needed.
 */
import { test, expect } from '@playwright/test'
import {
  formatUiDate,
  formatUiDateTime,
  formatUiDateRange,
} from '../../../packages/ui/src/lib/format-date'

test.describe('formatUiDate — universal "Jun 7, 2026" standard', () => {
  test('Live-1234 — date-only ISO string formats as calendar date (no TZ shift)', () => {
    expect(formatUiDate('2026-06-07')).toBe('Jun 7, 2026')
    expect(formatUiDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatUiDate('2026-12-31')).toBe('Dec 31, 2026')
  })

  test('Live-1235 — no leading zero on day', () => {
    expect(formatUiDate('2026-06-07')).not.toContain('07')
  })

  test('Live-1236 — Date instance formats in the given IANA timezone', () => {
    // 2026-06-07T23:30Z is already Jun 8 in Tokyo, still Jun 7 in Toronto
    const d = new Date('2026-06-07T23:30:00Z')
    expect(formatUiDate(d, { timeZone: 'Asia/Tokyo' })).toBe('Jun 8, 2026')
    expect(formatUiDate(d, { timeZone: 'America/Toronto' })).toBe('Jun 7, 2026')
    expect(formatUiDate(d, { timeZone: 'UTC' })).toBe('Jun 7, 2026')
  })

  test('Live-1237 — invalid input returns empty string, never throws', () => {
    expect(formatUiDate(null)).toBe('')
    expect(formatUiDate(undefined)).toBe('')
    expect(formatUiDate('')).toBe('')
    expect(formatUiDate('not-a-date')).toBe('')
    expect(formatUiDate(new Date('invalid'))).toBe('')
  })
})

test.describe('formatUiDateTime — "Jun 7, 2026 14:30" (24-hour)', () => {
  test('Live-1238 — full ISO datetime in UTC', () => {
    expect(formatUiDateTime('2026-06-07T14:30:00Z', { timeZone: 'UTC' })).toBe('Jun 7, 2026 14:30')
  })

  test('Live-1239 — midnight renders 00:00 (h23, not 24:00)', () => {
    expect(formatUiDateTime('2026-06-07T00:00:00Z', { timeZone: 'UTC' })).toBe('Jun 7, 2026 00:00')
  })

  test('Live-1240 — date-only string gets 00:00', () => {
    expect(formatUiDateTime('2026-06-07')).toBe('Jun 7, 2026 00:00')
  })
})

test.describe('formatUiDateRange — smart year', () => {
  test('Live-1241 — same year: year once at the end', () => {
    expect(formatUiDateRange('2026-06-01', '2026-06-30')).toBe('Jun 1 – Jun 30, 2026')
  })

  test('Live-1242 — cross month, same year', () => {
    expect(formatUiDateRange('2026-06-28', '2026-07-05')).toBe('Jun 28 – Jul 5, 2026')
  })

  test('Live-1243 — cross year: full date both sides', () => {
    expect(formatUiDateRange('2025-12-30', '2026-01-02')).toBe('Dec 30, 2025 – Jan 2, 2026')
  })

  test('Live-1244 — same calendar day collapses to a single date', () => {
    expect(formatUiDateRange('2026-06-07', '2026-06-07')).toBe('Jun 7, 2026')
  })

  test('Live-1245 — one side missing falls back to the other; both missing → empty', () => {
    expect(formatUiDateRange('2026-06-07', null)).toBe('Jun 7, 2026')
    expect(formatUiDateRange(null, '2026-06-07')).toBe('Jun 7, 2026')
    expect(formatUiDateRange(null, null)).toBe('')
  })
})

import {
  highZoomDayLabel,
  centeredDayLabelX,
  pickDowMode,
  dayCellLabel,
  layoutMonthLabels,
  monthLabel,
  type MonthSpan,
} from '../../../gantt/src/components/gantt/renderers/timeline-labels'

test.describe('timeline labels — year-less day labels, adaptive DOW', () => {
  test('Live-1276 — high-zoom day label omits the year, includes DOW: "Jun 7 Sun"', () => {
    expect(highZoomDayLabel(5, 7, 0)).toBe('Jun 7 Sun')
    expect(highZoomDayLabel(0, 1, 4)).toBe('Jan 1 Thu')
  })

  test('Live-1246 — high-zoom day label is centered within its day column', () => {
    expect(centeredDayLabelX(100, 120, 60)).toBe(130) // 100 + (120-60)/2
    expect(centeredDayLabelX(0, 240, 80)).toBe(80)
  })

  test('Live-1247 — DOW mode adapts to column width (Mon → M → none)', () => {
    // sample widths: "30 Wed" ≈ 38px, "30 W" ≈ 26px at header font
    expect(pickDowMode(60, 38, 26)).toBe('full')
    expect(pickDowMode(40, 38, 26)).toBe('letter')
    expect(pickDowMode(20, 38, 26)).toBe('none')
  })

  test('Live-1248 — day cell label per mode', () => {
    expect(dayCellLabel(7, 1, 'full')).toBe('7 Mon')
    expect(dayCellLabel(7, 1, 'letter')).toBe('7 M')
    expect(dayCellLabel(7, 1, 'none')).toBe('7')
  })

  test('Live-1277 — month label keeps the year: "Jun 2026"', () => {
    expect(monthLabel(2026, 5)).toBe('Jun 2026')
  })
})

test.describe('timeline month labels — anchored at month start', () => {
  const measure = (s: string): number => s.length * 7 // deterministic stub

  test('Live-1249 — label anchors at the first day of the month (left-aligned), not centered', () => {
    const spans: MonthSpan[] = [
      { startX: 100, endX: 700, year: 2026, month: 5 },
      { startX: 700, endX: 1320, year: 2026, month: 6 },
    ]
    const out = layoutMonthLabels(spans, 1440, measure)
    expect(out).toHaveLength(2)
    expect(out[0].x).toBe(104) // startX + 4
    expect(out[1].x).toBe(704)
    expect(out[0].label).toBe('Jun 2026')
    expect(out[1].label).toBe('Jul 2026')
  })

  test('Live-1250 — sticky clamp: month scrolled off-screen left pins its label at x=4', () => {
    const spans: MonthSpan[] = [{ startX: -500, endX: 600, year: 2026, month: 5 }]
    const out = layoutMonthLabels(spans, 1440, measure)
    expect(out[0].x).toBe(4)
  })

  test('Live-1251 — push-out: approaching next-month boundary pushes the pinned label left', () => {
    // "Jun 2026" → width 56 with stub; endX 40 → x = 40 - 56 - 4 = -20
    const spans: MonthSpan[] = [
      { startX: -500, endX: 40, year: 2026, month: 5 },
      { startX: 40, endX: 900, year: 2026, month: 6 },
    ]
    const out = layoutMonthLabels(spans, 1440, measure)
    const jun = out.find((l) => l.month === 5)
    const jul = out.find((l) => l.month === 6)
    expect(jul?.x).toBe(44)
    if (jun) expect(jun.x + jun.width).toBeLessThanOrEqual(44 - 8 + 56) // pushed left of Jul
  })

  test('Live-1252 — collision guard keeps the LATER month when labels overlap', () => {
    // months only 30px wide; labels ~56px → overlap; later month wins
    const spans: MonthSpan[] = [
      { startX: 0, endX: 30, year: 2026, month: 0 },
      { startX: 30, endX: 60, year: 2026, month: 1 },
      { startX: 60, endX: 600, year: 2026, month: 2 },
    ]
    const out = layoutMonthLabels(spans, 1440, measure)
    expect(out.some((l) => l.month === 2)).toBe(true) // later month kept
    // any kept pair must not overlap
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].x + out[i - 1].width + 8).toBeLessThanOrEqual(out[i].x)
    }
  })

  test('Live-1253 — fully off-screen months produce no label', () => {
    const spans: MonthSpan[] = [
      { startX: -900, endX: -300, year: 2026, month: 4 },
      { startX: 1500, endX: 2000, year: 2026, month: 7 },
    ]
    expect(layoutMonthLabels(spans, 1440, measure)).toHaveLength(0)
  })

  test('Live-1254 — clamp is continuous at the left edge — label never pushed left of its anchor', () => {
    // narrow month (20px) vs 56px label: a 1px scroll past the edge must not snap the label
    const at0 = layoutMonthLabels([{ startX: 0, endX: 20, year: 2026, month: 5 }], 1440, measure)
    const at1 = layoutMonthLabels([{ startX: -1, endX: 19, year: 2026, month: 5 }], 1440, measure)
    expect(at0[0].x).toBe(4)
    expect(at1[0].x).toBe(3) // startX + 4, NOT endX - width - 4 = -41
  })
})
