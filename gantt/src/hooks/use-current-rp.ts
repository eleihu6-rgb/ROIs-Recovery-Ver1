import type { RosterPeriodOption } from '../services/roster-period-api'

/**
 * Map a UTC ms instant to the roster period whose [rp_start, rp_end] (treated as
 * UTC calendar dates) contains that day. Returns null if the day falls in no RP.
 *
 * RPs are seeded with date boundaries (e.g. F8: Feb RP ends Mar-01, Mar RP starts
 * Mar-02), so a given day maps to exactly one RP — this is the RP grouping used by
 * the crew_manday_*_period tables and the GO TO RPDate / header indicator logic.
 */
export function rpForTimestamp(items: readonly RosterPeriodOption[], ms: number): RosterPeriodOption | null {
  const day = new Date(ms)
  const ts = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  for (const rp of items) {
    const start = Date.parse(rp.rpStart + 'T00:00:00.000Z')
    const end = Date.parse(rp.rpEnd + 'T23:59:59.999Z')
    if (ts >= start && ts <= end) return rp
  }
  return null
}

export interface ScrollState {
  scrollX: number
  pxPerHour: number
  rangeStartMs: number
}

/**
 * Derive the RP of the leftmost visible gantt day from scroll state.
 * leftmost visible time = rangeStart + (scrollX / pxPerHour) hours. Pure — callers
 * subscribe to their store reactively and pass the current values so the indicator
 * re-renders on horizontal pan / RP-nav.
 */
export function rpForLeftmost(items: readonly RosterPeriodOption[], s: ScrollState): RosterPeriodOption | null {
  if (!items.length || s.pxPerHour <= 0) return null
  const leftmostMs = s.rangeStartMs + (s.scrollX / s.pxPerHour) * 3_600_000
  return rpForTimestamp(items, leftmostMs)
}
