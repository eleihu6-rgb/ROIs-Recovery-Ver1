/**
 * Live/Scenario shared display-window for persisted violations.
 *
 * Query / client filter overlap (same as live-server roster-violations SQL):
 *   coalesce(window_start_dt, start_dt) < (end::date + 1)
 *   coalesce(window_end_dt, end_dt)     >= start::date
 *
 * Bounds = selected roster-period start/end when RPs are selected, otherwise the
 * toolbar dateRange. Do NOT expand ±1 calendar month: that pulled lead-in month
 * findings (e.g. July 1001 / June 7504) into an Aug–Sep RP view. Rolling-window
 * rules still surface when their effective `window_*` intersects the official view.
 *
 * Official view ≠ gantt `dateRange` under RP selection — dateRange is already
 * padded ±7d around the RPs for canvas lead-in; violations use the unpadded RP.
 */

export interface ViolationWindowFields {
  start_dt: string
  end_dt: string
  window_start_dt?: string | null
  window_end_dt?: string | null
}

export interface SelectedRosterPeriodRangeMs {
  startMs: number
  endMs: number
}

/**
 * Bounds for the violations query. Prefer official RP start/end when the toolbar
 * has a roster-period selection; otherwise use the free dateRange.
 */
export function resolveViolationViewBounds(
  dateRange: { start: Date; end: Date },
  selectedRosterPeriodRange: SelectedRosterPeriodRangeMs | null | undefined,
): { start: Date; end: Date } {
  if (selectedRosterPeriodRange) {
    return {
      start: new Date(selectedRosterPeriodRange.startMs),
      end: new Date(selectedRosterPeriodRange.endMs),
    }
  }
  return { start: dateRange.start, end: dateRange.end }
}

/**
 * @deprecated Kept for callers/tests that still name the old ±1-month helper.
 * Display window is now the view itself — no calendar-month expansion.
 */
export function expandViolationDisplayWindow(viewStart: Date, viewEnd: Date): { start: Date; end: Date } {
  return { start: viewStart, end: viewEnd }
}

/**
 * Parse YYYY-MM-DD (or ISO prefix) as a local calendar Date — scenarioStrDt/EndDt are
 * local-time-as-UTC wall clocks; slicing the calendar day avoids TZ month skew.
 */
export function calendarDateFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Same predicate as live-server roster-violations SQL (UTC date cast on range bounds). */
export function violationOverlapsDisplayWindow(
  v: ViolationWindowFields,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const vStart = new Date(v.window_start_dt ?? v.start_dt)
  const vEnd = new Date(v.window_end_dt ?? v.end_dt)
  if (Number.isNaN(vStart.getTime()) || Number.isNaN(vEnd.getTime())) return false

  const startDate = rangeStart.toISOString().slice(0, 10)
  const endDate = rangeEnd.toISOString().slice(0, 10)
  const startBound = new Date(`${startDate}T00:00:00.000Z`)
  const endExclusive = new Date(`${endDate}T00:00:00.000Z`)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)

  return vStart < endExclusive && vEnd >= startBound
}

/** Keep rows whose effective window overlaps the official view (no ±1 month pad). */
export function filterViolationsToDisplayWindow<T extends ViolationWindowFields>(
  rows: T[],
  viewStart: Date,
  viewEnd: Date,
): T[] {
  return rows.filter((r) => violationOverlapsDisplayWindow(r, viewStart, viewEnd))
}
