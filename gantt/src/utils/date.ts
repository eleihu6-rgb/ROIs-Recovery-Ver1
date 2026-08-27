import {
  format,
  differenceInHours,
  differenceInMinutes,
  addDays,
  addHours,
  startOfDay,
  eachDayOfInterval,
  eachHourOfInterval,
  isWithinInterval,
  parseISO,
} from 'date-fns'

/** Format a date to YYYY-MM-DD */
export const formatDate = (d: Date): string => format(d, 'yyyy-MM-dd')

/** Format a date to HH:mm */
export const formatTime = (d: Date): string => format(d, 'HH:mm')

/** Format a date-time per the UI date standard: "Jun 7, 2026 14:30" */
export const formatDateTime = (d: Date): string => format(d, 'MMM d, yyyy HH:mm')

/** Parse ISO string safely */
export const safeParseISO = (s: string | null | undefined): Date | null => {
  if (!s) return null
  try {
    return parseISO(s)
  } catch {
    return null
  }
}

/** Get all days in a date range (inclusive) */
export const getDaysInRange = (start: Date, end: Date): Date[] => {
  return eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) })
}

/** Get all hours in a date range */
export const getHoursInRange = (start: Date, end: Date): Date[] => {
  return eachHourOfInterval({ start, end })
}

/** Calculate the duration string like "2h 30m" */
export const formatDuration = (startStr: string, endStr: string): string => {
  const start = parseISO(startStr)
  const end = parseISO(endStr)
  const totalMinutes = differenceInMinutes(end, start)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export {
  differenceInHours,
  differenceInMinutes,
  addDays,
  addHours,
  startOfDay,
  isWithinInterval,
  parseISO,
  format,
}
