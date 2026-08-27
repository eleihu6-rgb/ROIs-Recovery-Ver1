import { usePaneStore } from '@/stores/pane-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'
import { rpForTimestamp } from '@/hooks/use-current-rp'
import { xToTime, yearMonthInTimeZone } from '@/components/gantt/gantt-utils'

/**
 * Current Live gantt viewport month (`YYYY-MM`) in the DISPLAY timezone — the month shown at the
 * left edge of the canvas. Read once from store snapshots (NOT reactive); use it from imperative
 * code (e.g. the cross-user `roster-updated` handler) that needs "the month the user is viewing"
 * to refetch month-scoped data like crew MCred.
 *
 * The reactive equivalent lives inline in `live-gantt-source.ts` (`useRosterModel`); both funnel
 * through `yearMonthInTimeZone` so the "month is the DISPLAY tz, never the host/OS tz" rule has a
 * single source of truth (a host tz west of the display tz otherwise resolves the viewport to the
 * previous month — see playbook §13(h)).
 */
export const getLiveViewportYearMonth = (): string => {
  const rangeStart = usePaneStore.getState().dateRange.start
  const { scrollX, pxPerHour } = useGanttViewStore.getState()
  const tz = useTimezoneStore.getState().timezone
  return yearMonthInTimeZone(xToTime(scrollX, rangeStart, pxPerHour), tz)
}

/**
 * Current Live gantt roster period (`YYYYRPnn`) for imperative refreshes.
 * The crew stats endpoint is RP-scoped; do not substitute the calendar month here.
 */
export const getLiveViewportRosterPeriod = (): string | null => {
  const rangeStart = usePaneStore.getState().dateRange.start
  const { scrollX, pxPerHour } = useGanttViewStore.getState()
  const viewportMs = xToTime(scrollX, rangeStart, pxPerHour).getTime()
  return rpForTimestamp(useRosterPeriodStore.getState().items, viewportMs)?.rosterPeriod ?? null
}
