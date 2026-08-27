import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Per-month crew-stats cache (Asia↔Canada WAN perf, Tier-1 quick win).
 *
 * loadCrewStats() fetches manday stats for the viewport month. Over a ~150-250ms link,
 * re-visiting an already loaded month must NOT re-hit the server. This pins:
 *  - first view of a month fetches; immediate re-view of the SAME month does not
 *  - a different month fetches (the cache is per crewId+month)
 *  - re-visiting an earlier month serves from cache AND repopulates the display map
 *    with that month's numbers (crewStatsMap is keyed by crewId only)
 *  - clearCrewStatsCache() (called on roster commit) forces a fresh fetch
 */

const getCrewStats = vi.fn()
vi.mock('@/services/crew-api', () => ({ crewApi: { getCrewStats: (...a: unknown[]) => getCrewStats(...a) } }))

import { useCrewStore } from '@/stores/crew-store'

const stat = (mbh: number) => ({ mbhMin: mbh } as never)

beforeEach(() => {
  getCrewStats.mockReset()
  useCrewStore.setState({ crewStatsMap: new Map(), crewStatsYearMonth: null, crewStatsByMonth: new Map() })
})

describe('loadCrewStats per-month cache', () => {
  it('fetches a month once, then serves repeat views from cache', async () => {
    getCrewStats.mockResolvedValue({ C1: stat(100) })

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06')
    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06') // same month again

    expect(getCrewStats).toHaveBeenCalledTimes(1)
    expect(useCrewStore.getState().crewStatsMap.get('C1')).toEqual(stat(100))
  })

  it('fetches a different month (cache is keyed by crewId+month)', async () => {
    getCrewStats.mockResolvedValueOnce({ C1: stat(100) }).mockResolvedValueOnce({ C1: stat(200) })

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06')
    await useCrewStore.getState().loadCrewStats(['C1'], '2026-07')

    expect(getCrewStats).toHaveBeenCalledTimes(2)
  })

  it('clears stale display stats immediately when switching to an uncached month', async () => {
    let resolveJuly!: (value: Record<string, never>) => void
    getCrewStats
      .mockResolvedValueOnce({ C1: stat(100) })
      .mockReturnValueOnce(new Promise((resolve) => { resolveJuly = resolve }))

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06')
    const julyLoad = useCrewStore.getState().loadCrewStats(['C1'], '2026-07')

    expect(useCrewStore.getState().crewStatsYearMonth).toBe('2026-07')
    expect(useCrewStore.getState().crewStatsMap.has('C1')).toBe(false)

    resolveJuly({ C1: stat(200) } as never)
    await julyLoad
    expect(useCrewStore.getState().crewStatsMap.get('C1')).toEqual(stat(200))
  })

  it('does not let a slower old-month response overwrite the current month display', async () => {
    let resolveJune!: (value: Record<string, never>) => void
    getCrewStats
      .mockReturnValueOnce(new Promise((resolve) => { resolveJune = resolve }))
      .mockResolvedValueOnce({ C1: stat(200) })

    const juneLoad = useCrewStore.getState().loadCrewStats(['C1'], '2026-06')
    await useCrewStore.getState().loadCrewStats(['C1'], '2026-07')
    expect(useCrewStore.getState().crewStatsMap.get('C1')).toEqual(stat(200))

    resolveJune({ C1: stat(100) } as never)
    await juneLoad

    expect(useCrewStore.getState().crewStatsYearMonth).toBe('2026-07')
    expect(useCrewStore.getState().crewStatsMap.get('C1')).toEqual(stat(200))
  })

  it('revisiting an earlier month serves cache and restores that month into the display map', async () => {
    getCrewStats.mockResolvedValueOnce({ C1: stat(100) }).mockResolvedValueOnce({ C1: stat(200) })

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06') // June -> 100
    await useCrewStore.getState().loadCrewStats(['C1'], '2026-07') // July -> 200 (display now 200)
    expect(useCrewStore.getState().crewStatsMap.get('C1')).toEqual(stat(200))

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06') // back to June, no fetch

    expect(getCrewStats).toHaveBeenCalledTimes(2) // still 2 — June served from cache
    expect(useCrewStore.getState().crewStatsMap.get('C1')).toEqual(stat(100)) // display restored
  })

  it('only fetches the crews missing from the cache', async () => {
    getCrewStats.mockResolvedValueOnce({ C1: stat(100) }).mockResolvedValueOnce({ C2: stat(150) })

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06')
    await useCrewStore.getState().loadCrewStats(['C1', 'C2'], '2026-06') // C1 cached, C2 new

    expect(getCrewStats).toHaveBeenCalledTimes(2)
    expect(getCrewStats).toHaveBeenLastCalledWith(['C2'], '2026-06') // only the missing crew
  })

  it('clearCrewStatsCache() forces a refetch (invalidation on commit)', async () => {
    getCrewStats.mockResolvedValue({ C1: stat(100) })

    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06')
    useCrewStore.getState().clearCrewStatsCache()
    await useCrewStore.getState().loadCrewStats(['C1'], '2026-06')

    expect(getCrewStats).toHaveBeenCalledTimes(2)
  })
})
