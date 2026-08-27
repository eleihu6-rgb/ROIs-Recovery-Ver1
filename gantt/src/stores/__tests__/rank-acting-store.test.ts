import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the api module so we can control the response
vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

import { api } from '@/services/api'
import { useRankActingStore } from '../rank-acting-store'

describe('useRankActingStore', () => {
  beforeEach(() => {
    useRankActingStore.setState({ byFiliale: new Map(), loading: false, error: null })
    vi.mocked(api.get).mockReset()
  })

  it('returns empty Map when not loaded yet', () => {
    const map = useRankActingStore.getState().getForFiliale('F8')
    expect(map.size).toBe(0)
  })

  it('loadForFiliale fetches and indexes rows by activeRank', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { activeRank: 'CA', actingRank: 'FO', qual: null },
      { activeRank: 'CA', actingRank: 'FO', qual: 'TR' },
    ])

    await useRankActingStore.getState().loadForFiliale('F8')
    const map = useRankActingStore.getState().getForFiliale('F8')
    expect(map.get('CA')?.has('FO')).toBe(true)
  })

  it('loadForFiliale is idempotent — second call is a no-op', async () => {
    vi.mocked(api.get).mockResolvedValue([])
    await useRankActingStore.getState().loadForFiliale('F8')
    await useRankActingStore.getState().loadForFiliale('F8')
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('loadForFiliale with empty filiale is a no-op', async () => {
    await useRankActingStore.getState().loadForFiliale('')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('invalidate clears cached rows for a filiale', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { activeRank: 'CA', actingRank: 'FO', qual: null },
    ])
    await useRankActingStore.getState().loadForFiliale('F8')
    useRankActingStore.getState().invalidate('F8')
    expect(useRankActingStore.getState().getForFiliale('F8').size).toBe(0)
  })
})