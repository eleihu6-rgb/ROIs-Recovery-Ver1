import {
  calendarMonthBoundsFromYmd,
  enumerateYmdRange,
  formatMandayMinutes,
  type ViewportMonthBounds,
} from '@/utils/manday-info-window'
import { calendarDateInTimeZone, xToTime } from '@/components/gantt/gantt-utils'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { usePaneStore } from '@/stores/pane-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { getScenarioGanttStore } from '@/stores/scenario-gantt-store'

/** Resolve Manday Info month from leftmost visible gantt day (display timezone). */
export function resolveViewportMonthBounds(scenarioId?: number | null): ViewportMonthBounds {
  const timezone = useTimezoneStore.getState().timezone
  if (scenarioId != null) {
    const store = getScenarioGanttStore(scenarioId).getState()
    const rangeStart = store.data?.strDtLoc ? new Date(store.data.strDtLoc) : new Date()
    const leftmost = xToTime(store.scrollX, rangeStart, store.pxPerHour || 7)
    return calendarMonthBoundsFromYmd(calendarDateInTimeZone(leftmost, timezone))
  }
  const { scrollX, pxPerHour } = useGanttViewStore.getState()
  const rangeStart = usePaneStore.getState().dateRange.start
  const leftmost = xToTime(scrollX, rangeStart, pxPerHour || 7)
  return calendarMonthBoundsFromYmd(calendarDateInTimeZone(leftmost, timezone))
}

export { enumerateYmdRange, formatMandayMinutes }
