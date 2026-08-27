import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RosterPeriodOption } from '@/services/roster-period-api'
import { useRosterPeriodStore } from '../roster-period-store'

const { fetchRosterPeriodsMock, fetchOlderRosterPeriodsMock } = vi.hoisted(() => ({
  fetchRosterPeriodsMock: vi.fn(),
  fetchOlderRosterPeriodsMock: vi.fn(),
}))

vi.mock('@/services/roster-period-api', () => ({
  fetchRosterPeriods: fetchRosterPeriodsMock,
  fetchOlderRosterPeriods: fetchOlderRosterPeriodsMock,
}))

const rp = (id: number, code: string, rpStart: string): RosterPeriodOption => ({
  id, rosterPeriod: code, name: code, rpStart, rpEnd: rpStart, isCurrent: false,
})

describe('useRosterPeriodStore', () => {
  beforeEach(() => {
    useRosterPeriodStore.setState({
      items: [], maxSpan: 6, loadMoreCount: 12, hasOlder: false,
      loaded: false, loading: false, loadingMore: false,
    })
    fetchRosterPeriodsMock.mockReset()
    fetchOlderRosterPeriodsMock.mockReset()
  })

  it('loadRosterPeriods caches maxSpan/loadMoreCount/hasOlder', async () => {
    fetchRosterPeriodsMock.mockResolvedValue({
      items: [rp(8, '2026RP08', '2026-08-01')], maxSpan: 6, loadMoreCount: 12, hasMore: true,
    })
    await useRosterPeriodStore.getState().loadRosterPeriods()
    const s = useRosterPeriodStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.items).toHaveLength(1)
    expect(s.items[0].rosterPeriod).toBe('2026RP08')
    expect(s.maxSpan).toBe(6)
    expect(s.loadMoreCount).toBe(12)
    expect(s.hasOlder).toBe(true)
  })

  it('does not refetch once loaded', async () => {
    fetchRosterPeriodsMock.mockResolvedValue({
      items: [], maxSpan: 6, loadMoreCount: 12, hasMore: false,
    })
    await useRosterPeriodStore.getState().loadRosterPeriods()
    await useRosterPeriodStore.getState().loadRosterPeriods()
    expect(fetchRosterPeriodsMock).toHaveBeenCalledTimes(1)
  })

  it('loadOlderRosterPeriods prepends older items, dedupes, and tracks hasOlder', async () => {
    useRosterPeriodStore.setState({
      items: [rp(7, '2026RP07', '2026-07-01'), rp(8, '2026RP08', '2026-08-01')],
    })
    fetchOlderRosterPeriodsMock.mockResolvedValue({
      items: [rp(6, '2026RP06', '2026-06-01'), rp(8, '2026RP08', '2026-08-01')],
      maxSpan: 6, loadMoreCount: 12, hasMore: false,
    })
    await useRosterPeriodStore.getState().loadOlderRosterPeriods()
    const s = useRosterPeriodStore.getState()
    expect(fetchOlderRosterPeriodsMock).toHaveBeenCalledWith('2026-07-01', 12)
    expect(s.items.map((i) => i.id)).toEqual([6, 7, 8]) // 8 deduped, still ascending
    expect(s.hasOlder).toBe(false)
  })
})
