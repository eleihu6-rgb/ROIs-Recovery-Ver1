/**
 * Pure label/layout rules for the gantt timeline header (Live + Scenario).
 * Extracted from base-renderer so the date-display standard is unit-testable
 * (root CLAUDE.md「UI 日期显示標準」): day labels omit the year ("Jun 7"),
 * DOW adapts to column width ("Mon" → "M" → hidden), and month labels anchor
 * at the first day of the month with sticky clamping at the viewport edge.
 *
 * No Canvas/DOM access here — drawTimelineHeader passes a measure() callback.
 */

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
export const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/**
 * High-zoom per-day label: "Jun 7 Sun" — the year lives in the month row only.
 * At dayWidth >= 120px the full DOW always fits, so no adaptive shrinking here.
 */
export const highZoomDayLabel = (month: number, date: number, dow: number): string =>
  `${MON_SHORT[month]} ${date} ${DOW_SHORT[dow]}`

/** High zoom only: x at which a day label of labelWidth is centered in its column. */
export const centeredDayLabelX = (dayStartX: number, dayWidth: number, labelWidth: number): number =>
  dayStartX + (dayWidth - labelWidth) / 2

export type DowMode = 'full' | 'letter' | 'none'

/**
 * How much day-of-week fits beside the day number at the current column
 * width. fullW / letterW are measured widths of the widest samples
 * ("30 Wed" / "30 W") at the bottom-row font.
 */
export const pickDowMode = (dayWidth: number, fullW: number, letterW: number): DowMode =>
  dayWidth >= fullW + 8 ? 'full' : dayWidth >= letterW + 6 ? 'letter' : 'none'

/** Bottom-row day cell: "7 Mon" / "7 M" / "7" per available width. */
export const dayCellLabel = (date: number, dow: number, mode: DowMode): string =>
  mode === 'full' ? `${date} ${DOW_SHORT[dow]}`
    : mode === 'letter' ? `${date} ${DOW_LETTER[dow]}`
    : String(date)

/** Month row label: "Jun 2026" — the only place the year appears on the axis. */
export const monthLabel = (year: number, month: number): string =>
  `${MON_SHORT[month]} ${year}`

export interface MonthSpan {
  /** x of the month's first rendered day (may be negative when scrolled off) */
  startX: number
  /** x of the next month's first day (or range end for the last span) */
  endX: number
  year: number
  month: number // 0-11
}

export interface MonthLabelPos {
  x: number
  width: number
  year: number
  month: number
  label: string
}

/**
 * Anchor each month label left-aligned at the month's first day, with:
 * - sticky clamp: a month scrolled past the left edge pins its label at x=4,
 *   pushed back out leftward by the approaching next-month boundary
 * - collision guard: overlapping labels are resolved right-to-left keeping
 *   the LATER month (its start boundary is the informative one)
 */
export const layoutMonthLabels = (
  spans: MonthSpan[],
  viewportWidth: number,
  measure: (label: string) => number,
): MonthLabelPos[] => {
  const placed: MonthLabelPos[] = []
  for (const s of spans) {
    if (s.endX <= 0 || s.startX >= viewportWidth) continue
    const label = monthLabel(s.year, s.month)
    const width = measure(label)
    let x = s.startX + 4
    // Sticky clamp: pin at the viewport edge, pushed back out by the
    // approaching next-month boundary — but never left of the natural anchor
    // (keeps the position continuous as the month start crosses the edge).
    if (x < 4) x = Math.max(Math.min(4, s.endX - width - 4), x)
    placed.push({ x, width, year: s.year, month: s.month, label })
  }
  // Collision guard — keep the later month's label on overlap
  const out: MonthLabelPos[] = []
  let minRightX = Infinity
  for (let i = placed.length - 1; i >= 0; i--) {
    const l = placed[i]
    if (l.x + l.width + 8 > minRightX) continue
    out.unshift(l)
    minRightX = l.x
  }
  return out
}
