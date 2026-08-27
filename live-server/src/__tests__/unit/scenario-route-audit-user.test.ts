import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    SCENARIO_GANTT_SOURCE: 'db',
  },
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    create: vi.fn(async () => ({ id: 701, status: 'DRAFT' })),
    update: vi.fn(async () => ({ id: 701, status: 'DRAFT' })),
    duplicate: vi.fn(async () => ({ id: 702, status: 'DRAFT' })),
    transition: vi.fn(async () => ({ id: 701, status: 'DRAFT' })),
    createSchedulePublishRecord: vi.fn(async () => ({ id: 801, published: 0 })),
  },
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import { scenarioService } from '../../services/scenario/scenario-service.js'

const build = async () => {
  const app = Fastify()
  app.decorate('db', {} as never)
  app.decorate('pgPool', {} as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'kevin',
      userName: 'Kevin Zhang',
      schema: 'f8',
      isAdmin: 1,
    }
  })
  await app.register(scenarioRoutes)
  return app
}

describe('scenario routes audit username', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses authenticated user for scenario create even when body username is system', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/',
      payload: { name: 'User Created Scenario', username: 'system' },
    })

    expect(res.statusCode).toBe(200)
    expect(scenarioService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'User Created Scenario' }),
      'kevin',
    )
  })

  it('uses authenticated user for scenario update even when body username is system', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'PUT',
      url: '/701',
      payload: { name: 'Renamed Scenario', username: 'system' },
    })

    expect(res.statusCode).toBe(200)
    expect(scenarioService.update).toHaveBeenCalledWith(
      expect.anything(),
      701,
      expect.objectContaining({ name: 'Renamed Scenario' }),
      'kevin',
    )
  })

  it('uses authenticated user for scenario duplicate even when body username is system', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/701/duplicate',
      payload: { username: 'system' },
    })

    expect(res.statusCode).toBe(200)
    expect(scenarioService.duplicate).toHaveBeenCalledWith(expect.anything(), 701, 'kevin')
  })

  it('uses authenticated user for status transition even when body username is system', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/701/transition',
      payload: { status: 'DRAFT', username: 'system' },
    })

    expect(res.statusCode).toBe(200)
    expect(scenarioService.transition).toHaveBeenCalledWith(
      expect.anything(),
      701,
      'DRAFT',
      'kevin',
      expect.objectContaining({ deleteVersionFiles: false }),
    )
  })

  it('uses the authenticated user when creating a non-published schedule draft', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/schedule-publish',
      payload: {
        strDt: '2026-06-01T00:00:00.000Z',
        endDt: '2026-06-30T23:59:59.000Z',
        division: 'P',
        published: '0',
      },
    })

    expect(res.statusCode).toBe(200)
    expect(scenarioService.createSchedulePublishRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ division: 'P', published: 0 }),
      'kevin',
    )
  })

  it.each([1, '1', true])('rejects published success state %j from the generic route', async (published) => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/schedule-publish',
      payload: {
        strDt: '2026-06-01T00:00:00.000Z',
        endDt: '2026-06-30T23:59:59.000Z',
        division: 'P',
        published,
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({
      message: 'Published schedule records can only be created by Publish Roster.',
    })
    expect(scenarioService.createSchedulePublishRecord).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied file metadata from the generic route', async () => {
    const app = await build()

    const res = await app.inject({
      method: 'POST',
      url: '/schedule-publish',
      payload: {
        strDt: '2026-06-01T00:00:00.000Z',
        endDt: '2026-06-30T23:59:59.000Z',
        division: 'P',
        published: 0,
        filePath: 'caller-controlled.schedule.gz',
      },
    })

    expect(res.statusCode).toBe(400)
    expect(scenarioService.createSchedulePublishRecord).not.toHaveBeenCalled()
  })
})
