import { useCallback } from 'react'
import { useFilterStore } from '@/stores/filter-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { calendarDateToUtcMidnight, endOfCalendarDayUtc } from '@/components/gantt/gantt-utils'
import { applyGanttFilters } from '@/utils/apply-filters'
import { GanttEnglishDateRangePicker } from '@/components/common/gantt-date-fields'

/**
 * Changing the date range must reload pane data (the Canvas re-anchors to the new
 * range immediately, so stale data ends up off-screen and the gantt looks empty).
 * Debounced because a native date input can fire several change events while the
 * user edits segments; module-level timer so multiple picker instances share it.
 * Skipped before the first pull (Live empty start — Apply Filters drives that).
 */
const APPLY_DEBOUNCE_MS = 600
let applyTimer: number | undefined
const scheduleAutoApply = (): void => {
  window.clearTimeout(applyTimer)
  applyTimer = window.setTimeout(() => {
    if (useFilterStore.getState().appliedFilters !== null) void applyGanttFilters()
  }, APPLY_DEBOUNCE_MS)
}

/** Maximum user-selectable planning window: end must be within N calendar months of start. */
const MAX_WINDOW_MONTHS = 3

/** Format a UTC Date as "YYYY-MM-DD" in the given IANA timezone for shared picker values. */
const formatDateInTz = (date: Date, timezone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date)

/**
 * Shift a calendar date string ("YYYY-MM-DD") by N months (negative = backwards),
 * clamping the day to the target month's length (e.g. Jan 31 +1mo → Feb 28/29).
 * Pure calendar arithmetic — used to derive the picker's min/max bounds.
 */
const shiftYmdMonths = (ymd: string, months: number): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)).toISOString().slice(0, 10)
}

export const DateRangePicker = () => {
  const dateRange = useFilterStore((s) => s.dateRange)
  const setDateRange = useFilterStore((s) => s.setDateRange)
  const timezone = useTimezoneStore((s) => s.timezone)

  const handleStartValueChange = useCallback(
    (value: string) => {
      const tz = useTimezoneStore.getState().timezone
      const newStart = calendarDateToUtcMidnight(value, tz)
      if (isNaN(newStart.getTime())) return
      // Req 1: start must not be after end (end can never be earlier than start).
      if (newStart.getTime() > dateRange.end.getTime()) return
      // Req 3: window must not exceed MAX_WINDOW_MONTHS — start can't be earlier than end-3mo.
      const endYmd = formatDateInTz(dateRange.end, tz)
      const minStart = calendarDateToUtcMidnight(shiftYmdMonths(endYmd, -MAX_WINDOW_MONTHS), tz)
      if (newStart.getTime() < minStart.getTime()) return
      setDateRange(newStart, dateRange.end)
      scheduleAutoApply()
    },
    [dateRange.end, setDateRange],
  )

  const handleEndValueChange = useCallback(
    (value: string) => {
      const tz = useTimezoneStore.getState().timezone
      const newEnd = endOfCalendarDayUtc(value, tz)
      if (isNaN(newEnd.getTime())) return
      // Req 1: end must not be earlier than start.
      if (newEnd.getTime() < dateRange.start.getTime()) return
      // Req 3: window must not exceed MAX_WINDOW_MONTHS — end can't be later than start+3mo.
      const startYmd = formatDateInTz(dateRange.start, tz)
      const maxEnd = endOfCalendarDayUtc(shiftYmdMonths(startYmd, MAX_WINDOW_MONTHS), tz)
      if (newEnd.getTime() > maxEnd.getTime()) return
      setDateRange(dateRange.start, newEnd)
      scheduleAutoApply()
    },
    [dateRange.start, setDateRange],
  )

  // Display dates in the current display timezone (not browser timezone)
  const startDisplay = formatDateInTz(dateRange.start, timezone)
  const endDisplay = formatDateInTz(dateRange.end, timezone)

  // Native min/max bounds enforce Req 1 (end ≥ start) and Req 3 (≤ 3-month window)
  // directly in the picker UI, so invalid dates can't be selected in the first place.
  const startMin = shiftYmdMonths(endDisplay, -MAX_WINDOW_MONTHS)
  const startMax = endDisplay
  const endMin = startDisplay
  const endMax = shiftYmdMonths(startDisplay, MAX_WINDOW_MONTHS)

  return (
    <GanttEnglishDateRangePicker
      ariaLabel="Gantt date range"
      endTestId="date-range-to"
      endValue={endDisplay}
      max={endMax}
      min={startMin}
      startTestId="date-range-from"
      startValue={startDisplay}
      onEndValueChange={handleEndValueChange}
      onStartValueChange={handleStartValueChange}
    />
  )
}
