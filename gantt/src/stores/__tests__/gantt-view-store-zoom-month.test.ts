import { describe, expect, it } from 'vitest'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useTimezoneStore } from '@/stores/timezone-store'
import { xToTime, yearMonthInTimeZone } from '@/components/gantt/gantt-utils'

describe('gantt-view-store zoomToMonth', () => {
  it('anchors zoomed month inside the target month for header stats', () => {
    useTimezoneStore.setState({ timezone: 'UTC', timezoneAirport: 'UTC' })
    useGanttViewStore.setState({
      zoomMin: 0.1,
      zoomMax: 10_000,
      contentHours: (Date.parse('2026-09-01T00:00:00.000Z') - Date.parse('2026-07-01T00:00:00.000Z')) / 3_600_000,
      viewportWidth: 1000,
      scrollX: 0,
    })

    const rangeStart = new Date('2026-07-01T00:00:00.000Z')
    useGanttViewStore.getState().zoomToMonth(2026, 7, rangeStart, 1000)
    const state = useGanttViewStore.getState()

    expect(yearMonthInTimeZone(xToTime(state.scrollX, rangeStart, state.pxPerHour), 'UTC')).toBe('2026-08')
  })
})
