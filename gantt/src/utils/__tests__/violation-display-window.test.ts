import { describe, expect, it } from 'vitest'
import {
  calendarDateFromYmd,
  filterViolationsToDisplayWindow,
  resolveViolationViewBounds,
  violationOverlapsDisplayWindow,
} from '../violation-display-window'

describe('violation-display-window', () => {
  it('excludes a March 1001 from an August scenario display window', () => {
    const march1001 = {
      start_dt: '2026-03-07T07:59:00.000Z',
      end_dt: '2026-03-07T07:59:59.000Z',
      window_start_dt: null,
      window_end_dt: null,
    }
    const filtered = filterViolationsToDisplayWindow(
      [march1001],
      calendarDateFromYmd('2026-08-01'),
      calendarDateFromYmd('2026-08-31'),
    )
    expect(filtered).toHaveLength(0)
  })

  it('keeps an August violation inside the official August view', () => {
    const aug = {
      start_dt: '2026-08-15T12:00:00.000Z',
      end_dt: '2026-08-15T18:00:00.000Z',
      window_start_dt: null,
      window_end_dt: null,
    }
    const filtered = filterViolationsToDisplayWindow(
      [aug],
      calendarDateFromYmd('2026-08-01'),
      calendarDateFromYmd('2026-08-31'),
    )
    expect(filtered).toHaveLength(1)
  })

  it('keeps a rolling window that overlaps the official August view (coalesce rule)', () => {
    const rolling = {
      start_dt: '2026-07-13T12:00:00.000Z',
      end_dt: '2026-07-13T18:00:00.000Z',
      window_start_dt: '2026-07-20T00:00:00.000Z',
      window_end_dt: '2026-08-10T00:00:00.000Z',
    }
    expect(
      violationOverlapsDisplayWindow(
        rolling,
        calendarDateFromYmd('2026-08-01'),
        calendarDateFromYmd('2026-08-31'),
      ),
    ).toBe(true)
  })

  it('excludes July-only 1001 from an Aug–Sep official RP view', () => {
    const july1001 = {
      start_dt: '2026-07-03T07:01:00.000Z',
      end_dt: '2026-07-03T20:31:00.000Z',
      window_start_dt: null,
      window_end_dt: null,
    }
    const filtered = filterViolationsToDisplayWindow(
      [july1001],
      calendarDateFromYmd('2026-08-01'),
      new Date(2026, 8, 30, 23, 59, 59),
    )
    expect(filtered).toHaveLength(0)
  })

  it('excludes July 7505 Americas end_dt spill when calendar window_* is set', () => {
    // Crew-local July RP end spills into Aug 1 UTC; without window_* the row would
    // overlap an August view. Calendar window_* matches message (2026-07-01, 2026-07-31).
    const july7505 = {
      start_dt: '2026-07-01T07:00:00.000Z',
      end_dt: '2026-08-01T06:59:59.000Z',
      window_start_dt: '2026-07-01T00:00:00.000Z',
      window_end_dt: '2026-07-31T23:59:59.999Z',
    }
    expect(
      violationOverlapsDisplayWindow(
        july7505,
        calendarDateFromYmd('2026-08-01'),
        calendarDateFromYmd('2026-08-31'),
      ),
    ).toBe(false)
    expect(
      violationOverlapsDisplayWindow(
        july7505,
        calendarDateFromYmd('2026-07-01'),
        calendarDateFromYmd('2026-07-31'),
      ),
    ).toBe(true)
  })

  it('resolveViolationViewBounds prefers official RP over ±7d padded dateRange', () => {
    const DAY = 86_400_000
    const rpStart = calendarDateFromYmd('2026-08-01')
    const rpEnd = new Date(2026, 8, 30, 23, 59, 59) // Sep 30
    const padded = {
      start: new Date(rpStart.getTime() - 7 * DAY),
      end: new Date(rpEnd.getTime() + 7 * DAY),
    }
    const bounds = resolveViolationViewBounds(padded, {
      startMs: rpStart.getTime(),
      endMs: rpEnd.getTime(),
    })
    expect(bounds.start.getTime()).toBe(rpStart.getTime())
    expect(bounds.end.getTime()).toBe(rpEnd.getTime())

    const june7504 = {
      start_dt: '2026-06-11T12:03:00.000Z',
      end_dt: '2026-06-12T00:30:00.000Z',
      window_start_dt: null,
      window_end_dt: null,
    }
    expect(violationOverlapsDisplayWindow(june7504, bounds.start, bounds.end)).toBe(false)
    // Padded gantt dateRange alone would still miss early June, but would include late July.
    expect(violationOverlapsDisplayWindow(june7504, padded.start, padded.end)).toBe(false)
  })
})
