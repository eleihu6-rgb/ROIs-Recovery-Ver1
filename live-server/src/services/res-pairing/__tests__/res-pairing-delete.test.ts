import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test'
  process.env.FILIALE ||= 'F8'
})

import * as svc from '../res-pairing-service'

vi.mock('../../../services/pairing/pairing-service', () => ({
  pairingService: {
    remove: vi.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { pairingService } from '../../../services/pairing/pairing-service'

describe('batchDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects blocked ids when remove throws a 409', async () => {
    const removeMock = vi.mocked(pairingService.remove)
    removeMock
      .mockResolvedValueOnce(undefined)                       // id 1 ok
      .mockRejectedValueOnce(Object.assign(new Error('crew assigned'), { statusCode: 409 })) // id 2 blocked

    const fastify: any = {}
    const res = await svc.batchDelete(fastify, [1, 2])
    expect(res.deleted).toBe(1)
    expect(res.blocked).toEqual([{ id: 2, reason: 'crew assigned' }])
  })
})
