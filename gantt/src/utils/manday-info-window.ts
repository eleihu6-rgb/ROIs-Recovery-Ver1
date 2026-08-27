/**
 * Viewport leftmost calendar-month bounds for Manday Info.
 * Same notion as live-gantt-source viewportLeftDayMs → display-tz calendar date.
 */

export interface ViewportMonthBounds {
  /** YYYY-MM */
  yearMonth: string
  /** YYYY-MM-DD first day of month */
  start: string
  /** YYYY-MM-DD last day of month */
  end: string
}

/** First/last calendar day of the month containing `ymd` (YYYY-MM-DD). */
export function calendarMonthBoundsFromYmd(ymd: string): ViewportMonthBounds {
  const [y, m] = ymd.slice(0, 10).split('-').map(Number)
  const yearMonth = `${y}-${String(m).padStart(2, '0')}`
  const lastDay = new Date(y, m, 0).getDate()
  return {
    yearMonth,
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Enumerate every YYYY-MM-DD from start through end inclusive. */
export function enumerateYmdRange(start: string, end: string): string[] {
  const out: string[] = []
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const last = new Date(ey, em - 1, ed)
  while (cur <= last) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** Format minutes as H:MM (no leading zero on hours). */
export function formatMandayMinutes(min: number): string {
  const n = Math.round(Number(min) || 0)
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}
