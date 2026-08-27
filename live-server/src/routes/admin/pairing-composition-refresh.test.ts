import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

import pairingCompositionRefreshAdminRoutes from './pairing-composition-refresh.js'

const buildApp = async (isAdmin = 1) => {
  const app = Fastify({ logger: false })
  const db = {
    execute: vi.fn(async () => ({ rowCount: 2 })),
  }
  const redis = {
    scan: vi.fn(async () => ({ cursor: 0, keys: ['pairing:list:test'] })),
    del: vi.fn(async () => 1),
  }

  app.decorate('db', db as never)
  app.decorate('redis', redis as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (request) => {
    ;(request as { authUser?: unknown }).authUser = {
      userCode: isAdmin ? 'admin' : 'crew',
      userName: isAdmin ? 'Admin' : 'Crew',
      schema: 'f8',
      isAdmin,
    }
  })
  await app.register(pairingCompositionRefreshAdminRoutes, { prefix: '/api/admin' })
  return { app, db, redis }
}

describe('pairing composition refresh admin route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('recomputes pairing composition fill and invalidates pairing list cache', async () => {
    const { app, db, redis } = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/pairing-composition-refresh?startDt=2026-06-01&endDt=2026-06-30',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 200,
      data: { updatedCount: 2, startDt: '2026-06-01', endDt: '2026-06-30' },
      message: 'ok',
    })
    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(redis.scan).toHaveBeenCalledWith(0, { MATCH: 'pairing:list:*', COUNT: 200 })
    expect(redis.del).toHaveBeenCalledWith(['pairing:list:test'])

    await app.close()
  })

  it('rejects non-admin users', async () => {
    const { app, redis } = await buildApp(0)

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/pairing-composition-refresh',
    })

    expect(response.statusCode).toBe(403)
    expect(redis.scan).not.toHaveBeenCalled()

    await app.close()
  })
})
