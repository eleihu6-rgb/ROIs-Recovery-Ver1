import { afterEach, describe, expect, it } from 'vitest'
import { getLiveViewportRosterPeriod } from '@/utils/viewport-month'
import { usePaneStore } from '@/stores/pane-store'
import { useGanttViewStore } from '@/stores/gantt-view-store'
import { useRosterPeriodStore } from '@/stores/roster-period-store'

describe('getLiveViewportRosterPeriod', () => {
  afterEach(() => {
    useRosterPeriodStore.setState({ items: [], loaded: false, loading: false })
  })

  it('returns the RP key for the current viewport instead of a calendar month', () => {
    usePaneStore.setState({
      dateRange: {
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-07-31T23:59:59.999Z'),
      },
    })
    useGanttViewStore.setState({ scrollX: 0, pxPerHour: 10 })
    useRosterPeriodStore.setState({
      items: [{
        id: 7,
        rosterPeriod: '2026RP07',
        name: '2026-07',
        rpStart: '2026-07-01',
        rpEnd: '2026-07-31',
        isCurrent: false,
      }],
      loaded: true,
      loading: false,
    })

    expect(getLiveViewportRosterPeriod()).toBe('2026RP07')
  })

  it('returns null until roster periods are available', () => {
    usePaneStore.setState({
      dateRange: {
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-07-31T23:59:59.999Z'),
      },
    })
    useGanttViewStore.setState({ scrollX: 0, pxPerHour: 10 })
    useRosterPeriodStore.setState({ items: [] })

    expect(getLiveViewportRosterPeriod()).toBeNull()
  })
})
