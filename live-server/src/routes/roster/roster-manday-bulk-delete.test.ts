import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    LIVE_SCHEMA: 'f8',
    SCENARIO_SCHEMA: 'scenario',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

import rosterRoutes from './roster.js'

const buildApp = async () => {
  const app = Fastify({ logger: false })
  app.decorate('pgPool', { query: vi.fn() } as never)
  app.decorate('redis', {
    scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
    del: vi.fn(async () => undefined),
    incr: vi.fn(async () => 1),
    set: vi.fn(async () => 'OK'),
    get: vi.fn(async () => null),
    eval: vi.fn(async () => 1),
  } as never)
  app.decorate('rosterBulkDeleteQueue', {
    add: vi.fn().mockResolvedValue({ id: 'task-123' }),
    getJob: vi.fn(),
  } as never)
  await app.register(rosterRoutes, { prefix: '/api/roster' })
  return app
}

describe('roster bulk-delete task submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a task id without holding the HTTP request open for deletion or Manday', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/roster/bulk-delete',
      payload: {
        username: 'planner',
        ids: [101, 102],
        pairingCrewKeys: [],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual({ taskId: 'task-123' })

    const queued = (app as never as { rosterBulkDeleteQueue: { add: ReturnType<typeof vi.fn> } }).rosterBulkDeleteQueue
    expect(queued.add).toHaveBeenCalledWith('bulk-delete', expect.objectContaining({
      schema: 'f8',
      mutationLeaseToken: expect.any(String),
    }))

    await app.close()
  })

  it('returns an immediate 409 without creating a task when another mutation owns the lease', async () => {
    const app = await buildApp()
    const redis = (app as never as { redis: { set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } }).redis
    const queue = (app as never as { rosterBulkDeleteQueue: { add: ReturnType<typeof vi.fn> } }).rosterBulkDeleteQueue
    redis.set.mockResolvedValue(null)
    redis.get.mockResolvedValue(JSON.stringify({
      token: 'import-token',
      operation: 'import-pbs-material',
      userCode: 'planner-2',
      acquiredAt: 1,
    }))

    const response = await app.inject({
      method: 'POST',
      url: '/api/roster/bulk-delete',
      payload: { username: 'planner-1', ids: [101], pairingCrewKeys: [] },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({
      code: 409,
      message: expect.stringContaining('Import PBS Material'),
    })
    expect(queue.add).not.toHaveBeenCalled()

    await app.close()
  })
})
