import { beforeEach, describe, expect, it, vi } from 'vitest'

const { list } = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('@/services/pairing-api', () => ({ pairingApi: { list } }))

import { usePairingStore } from '../pairing-store'

const pairing = (id: number, schStrDtUtc: string) => ({
  id,
  schStrDtUtc,
  composition: [],
  pairingLabel: String(id),
})

describe('pairing-store batched loading', () => {
  beforeEach(() => {
    list.mockReset()
    usePairingStore.setState({
      items: [],
      sortBy: 'schStrDtUtc',
      sortOrder: 'asc',
      loading: false,
      progress: null,
    })
  })

  it('uses the active sort after concurrent date windows finish out of order', async () => {
    list.mockImplementation((query: { startDate: string }) => new Promise((resolve) => {
      const laterWindow = query.startDate === '2026-10-01'
      setTimeout(() => resolve({
        total: 1,
        items: [pairing(laterWindow ? 2 : 1, laterWindow ? '2026-10-02T08:00:00Z' : '2026-09-02T08:00:00Z')],
      }), laterWindow ? 0 : 15)
    }))

    await usePairingStore.getState().fetchPairingsBatched({
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T23:59:59Z'),
    })

    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      sortBy: 'schStrDtUtc',
      sortOrder: 'asc',
    }))
    expect(usePairingStore.getState().items.map((item) => item.pairing.id)).toEqual([1, 2])
  })
})
