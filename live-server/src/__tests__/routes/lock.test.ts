import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

const locks = vi.hoisted(() => ({
  acquireCrewLocks: vi.fn(),
  releaseCrewLocks: vi.fn(),
  renewLocks: vi.fn(),
  getAllLocks: vi.fn(),
}))

vi.mock('../../services/lock/lock-service.js', () => ({ lockService: locks }))

import lockRoutes from '../../routes/lock/lock.js'

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.decorate('redis', {} as never)
  app.decorate('wsBroadcast', vi.fn())
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as { authUser?: unknown }).authUser = { schema: 'f8' }
  })
  await app.register(lockRoutes, { prefix: '/api/locks' })
  return app
}

describe('lock routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  it('rejects an invalid crew ID before acquiring or broadcasting a lock', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/locks/acquire',
      payload: { crewId: 'invalid crew id', pairingIds: [], username: 'planner' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().code).toBe(400)
    expect(locks.acquireCrewLocks).not.toHaveBeenCalled()
    expect(app.wsBroadcast).not.toHaveBeenCalled()
  })

  it('accepts a valid crew ID and acquires the lock', async () => {
    locks.acquireCrewLocks.mockResolvedValue({ success: true, conflicts: [] })

    const response = await app.inject({
      method: 'POST',
      url: '/api/locks/acquire',
      payload: { crewId: 'CREW_7-A', pairingIds: [11], username: 'planner' },
    })

    expect(response.statusCode).toBe(200)
    expect(locks.acquireCrewLocks).toHaveBeenCalledWith(expect.anything(), 'CREW_7-A', [11], 'planner', 300)
  })
})
