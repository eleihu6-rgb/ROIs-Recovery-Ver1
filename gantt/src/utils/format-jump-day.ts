// gantt/src/utils/format-jump-day.ts
//
// Formats a base-tz calendar date (YYYY-MM-DD, as returned by
// `calendarDateInTimeZone`) as a compact English "Aug 04" — month abbreviation +
// zero-padded day. Used in the right-click "Scroll to <date> pairings" menu
// label. No year: the Gantt view is normally scoped to one roster period at a
// time, so month+day is enough to identify which day the user is jumping to.
//
// Keep this in lockstep with how `calendarDateInTimeZone` shapes its output —
// if that helper ever changes format, update the splitter here.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export const formatJumpDay = (dateYYYYMMDD: string): string => {
  const parts = dateYYYYMMDD.split('-')
  if (parts.length !== 3) return dateYYYYMMDD
  const monthIdx = Number(parts[1]) - 1
  const day = Number(parts[2])
  if (monthIdx < 0 || monthIdx > 11 || Number.isNaN(day)) return dateYYYYMMDD
  return `${MONTHS_SHORT[monthIdx]} ${String(day).padStart(2, '0')}`
}
