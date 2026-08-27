/**
 * Unified UI date display formatters — project-wide standard
 * (root CLAUDE.md「UI 日期显示标准」). All user-visible dates render as
 * "Jun 7, 2026"; date-times as "Jun 7, 2026 14:30" (24-hour); ranges as
 * "Jun 1 – Jun 30, 2026" (year once when shared).
 *
 * Accepts Date or ISO string. Date-only strings ("2026-06-07") are treated
 * as calendar dates — no timezone shift. Invalid input returns '' so render
 * paths never throw.
 */

const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface UiDateOptions {
  /** IANA zone id (e.g. "America/Toronto"); defaults to the runtime's local timezone */
  timeZone?: string
}

interface DateParts {
  year: number
  month: number // 0-11
  day: number
  hour: string // '00'-'23'
  minute: string // '00'-'59'
}

// Intl.DateTimeFormat construction is expensive — cache one per timezone
// (same pattern as gantt's timezone-store).
const partsFmtCache = new Map<string, Intl.DateTimeFormat>()

const getPartsFormatter = (timeZone?: string): Intl.DateTimeFormat => {
  const key = timeZone ?? '__local__'
  let fmt = partsFmtCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    partsFmtCache.set(key, fmt)
  }
  return fmt
}

const resolveParts = (input: Date | string | null | undefined, timeZone?: string): DateParts | null => {
  if (input == null || input === '') return null
  if (typeof input === 'string') {
    const m = DATE_ONLY_RE.exec(input)
    if (m) {
      const month = Number(m[2]) - 1
      const day = Number(m[3])
      if (month < 0 || month > 11 || day < 1 || day > 31) return null
      return { year: Number(m[1]), month, day, hour: '00', minute: '00' }
    }
  }
  const d = input instanceof Date ? input : new Date(input as string)
  if (Number.isNaN(d.getTime())) return null
  const parts: Record<string, string> = {}
  for (const p of getPartsFormatter(timeZone).formatToParts(d)) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    hour: parts.hour ?? '00',
    minute: parts.minute ?? '00',
  }
}

const dateStr = (p: DateParts): string => `${MON_SHORT[p.month]} ${p.day}, ${p.year}`
const monthDayStr = (p: DateParts): string => `${MON_SHORT[p.month]} ${p.day}`

/** "Jun 7, 2026" */
export const formatUiDate = (input: Date | string | null | undefined, opts?: UiDateOptions): string => {
  const p = resolveParts(input, opts?.timeZone)
  return p ? dateStr(p) : ''
}

/** "Jun 7, 2026 14:30" (24-hour) */
export const formatUiDateTime = (input: Date | string | null | undefined, opts?: UiDateOptions): string => {
  const p = resolveParts(input, opts?.timeZone)
  return p ? `${dateStr(p)} ${p.hour}:${p.minute}` : ''
}

/**
 * "Jun 1 – Jun 30, 2026" (same year: year once) ·
 * "Dec 30, 2025 – Jan 2, 2026" (cross-year: full both sides) ·
 * same calendar day collapses to a single date.
 */
export const formatUiDateRange = (
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  opts?: UiDateOptions,
): string => {
  const a = resolveParts(start, opts?.timeZone)
  const b = resolveParts(end, opts?.timeZone)
  if (!a && !b) return ''
  if (!a) return dateStr(b as DateParts)
  if (!b) return dateStr(a)
  if (a.year === b.year && a.month === b.month && a.day === b.day) return dateStr(a)
  if (a.year === b.year) return `${monthDayStr(a)} – ${monthDayStr(b)}, ${a.year}`
  return `${dateStr(a)} – ${dateStr(b)}`
}
