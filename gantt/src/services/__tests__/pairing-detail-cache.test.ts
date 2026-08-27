import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pairing-Info popup cache (Asia↔Canada WAN perf, Tier-2 quick win).
 *
 * Re-opening the same pairing must not re-issue the detail + crew-detail round-trips.
 * Pins: cache hit on repeat open; both endpoints fetched in parallel exactly once;
 * clearPairingInfoCache() (called on every pairing-list reload) forces a fresh fetch
 * so an edited pairing never serves a stale popup.
 */

const getDetail = vi.fn()
const getCrewDetail = vi.fn()
vi.mock('@/services/pairing-api', () => ({
  pairingApi: {
    getDetail: (...a: unknown[]) => getDetail(...a),
    getCrewDetail: (...a: unknown[]) => getCrewDetail(...a),
  },
}))

import { getPairingInfo, clearPairingInfoCache } from '@/services/pairing-detail-cache'

beforeEach(() => {
  getDetail.mockReset().mockResolvedValue({ pairing: { id: 1 }, segments: [], compositions: [] })
  getCrewDetail.mockReset().mockResolvedValue([{ crewId: 'C1' }])
  clearPairingInfoCache()
})

describe('pairing-detail-cache', () => {
  it('fetches both endpoints once, then serves repeat opens from cache', async () => {
    const a = await getPairingInfo(1)
    const b = await getPairingInfo(1)

    expect(getDetail).toHaveBeenCalledTimes(1)
    expect(getCrewDetail).toHaveBeenCalledTimes(1)
    expect(b).toBe(a) // same cached bundle reference
    expect(a.crew).toEqual([{ crewId: 'C1' }])
  })

  it('fetches a different pairing independently', async () => {
    await getPairingInfo(1)
    await getPairingInfo(2)
    expect(getDetail).toHaveBeenCalledTimes(2)
  })

  it('clearPairingInfoCache() forces a refetch on next open', async () => {
    await getPairingInfo(1)
    clearPairingInfoCache()
    await getPairingInfo(1)
    expect(getDetail).toHaveBeenCalledTimes(2)
  })
})
