// gantt/src/utils/date-range-anchor.ts
//
// Re-anchor a stored UTC date range to the same calendar days in a new
// display timezone. Used by the timezone switcher (manual override) and
// by the base-filter auto-sync (Rule A in tz+attribution fix). Lives in
// /utils instead of a component module to avoid a circular import
// chain (timezone-switcher → filter-store → timezone-store).
import { useFilterStore } from '@/stores/filter-store'
import { calendarDateToUtcMidnight } from '@/components/gantt/gantt-utils'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Re-anchor the stored date range to local midnight in the new timezone.
 * Reads the calendar dates from the current range (in the old timezone),
 * then recomputes UTC timestamps using the new timezone.
 *
 * Exported so callers outside the switcher (e.g. apply-filters auto-timezone
 * sync from the first base in the crew filter) can keep the planning period
 * anchored to the same calendar days when the display timezone flips.
 */
export const reanchorDateRange = (oldTz: string, newTz: string): void => {
  const { start, end } = useFilterStore.getState().dateRange
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    // Defensive: reanchor against a fresh today-based default when the stored
    // range is invalid (can happen right after a fresh reload on first install).
    return
  }
  const oldFmt = new Intl.DateTimeFormat('en-CA', { timeZone: oldTz })
  const startStr = oldFmt.format(start)
  const endStr = oldFmt.format(end)

  const newStart = calendarDateToUtcMidnight(startStr, newTz)
  // End = midnight of the day after endStr, minus 1 ms
  const [ey, em, ed] = endStr.split('-').map(Number)
  const nextDay = new Date(Date.UTC(ey, em - 1, ed + 1))
  // Month-overflow guard: Date.UTC(2026, 1, 32) silently rolls into March; clamp to
  // the last day of the original end's month so we don't skip into the next month.
  const lastDayOfMonth = new Date(Date.UTC(ey, em, 0)).getUTCDate()
  const nextDayStr = (nextDay.getUTCMonth() === em - 1 || nextDay.getUTCDate() > lastDayOfMonth)
    ? `${ey}-${pad2(em)}-${pad2(lastDayOfMonth)}`
    : nextDay.toISOString().slice(0, 10)
  const newEnd = new Date(calendarDateToUtcMidnight(nextDayStr, newTz).getTime() - 1)

  useFilterStore.getState().setDateRange(newStart, newEnd)
}
