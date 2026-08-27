import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const scenarioServiceMocks = vi.hoisted(() => ({
  getById: vi.fn(async () => ({ id: 702, name: 'RO Scenario', fileType: 'RO', status: 'PUBLISHED', taskId: null as string | null })),
  update: vi.fn(async () => ({ id: 702, name: 'RO Scenario', fileType: 'RO', status: 'PUBLISHED' })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    getById: scenarioServiceMocks.getById,
    update: scenarioServiceMocks.update,
  },
}))

vi.mock('../../services/rule-check/acc-ref-tz-service.js', () => ({
  recalculateAccRefTz: vi.fn(async () => []),
}))

vi.mock('../../services/scenario/scenario-lock-service.js', () => ({
  scenarioLockService: {
    status: vi.fn(async () => ({ locked: true, isOwner: true, owner: 'planner' })),
  },
}))

vi.mock('../../services/scenario/scenario-patch-service.js', () => ({
  validateScenarioRosterPatches: vi.fn(async () => undefined),
  applyScenarioRosterPatches: vi.fn(async () => undefined),
  applyOutputPatch: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/legality-status.js', () => ({
  ensureLegality: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

const parameterMocks = vi.hoisted(() => ({
  getMerged: vi.fn(async () => ({ items: [], summary: { templateCount: 0, configuredCount: 0 } })),
  saveValues: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/scenario-parameter-service.js', () => ({
  scenarioParameterService: {
    getMerged: parameterMocks.getMerged,
    saveValues: parameterMocks.saveValues,
  },
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'

const build = async () => {
  const app = Fastify()
  app.decorate('db', { execute: vi.fn(async () => ({ rows: [] })) } as never)
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never)
  app.decorate('redis', {} as never)
  app.decorate('mandayRecomputeQueue', { add: vi.fn(async () => undefined) } as never)
  app.decorate('scenarioKpiRecomputeQueue', { add: vi.fn(async () => undefined) } as never)
  app.decorate('wsBroadcast', vi.fn() as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'planner',
      userName: 'Planner',
      schema: 'f8',
      isAdmin: 1,
    }
  })
  await app.register(scenarioRoutes)
  return app
}

describe('scenario parameters readonly guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scenarioServiceMocks.getById.mockResolvedValue({
      id: 702, name: 'RO Scenario', fileType: 'RO', status: 'PUBLISHED', taskId: null,
    })
  })

  it('rejects parameter edits on the dedicated route for PUBLISHED scenarios (409)', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702/parameters',
      payload: { items: [{ code: 'credit_range', value: { min: {}, max: {} } }] },
    })
    expect(res.json()).toMatchObject({ code: 409 })
    expect(parameterMocks.saveValues).not.toHaveBeenCalled()
  })

  it('rejects parameter edits on the generic update route for PUBLISHED scenarios (409)', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702',
      payload: { name: 'R', algorithmParameters: [{ code: 'credit_range', value: { min: {}, max: {} } }] },
    })
    expect(res.json()).toMatchObject({ code: 409 })
    expect(scenarioServiceMocks.update).not.toHaveBeenCalled()
  })

  it('rejects parameter edits on the generic update route for RUNNING scenarios (409)', async () => {
    scenarioServiceMocks.getById.mockResolvedValue({
      id: 702, name: 'RO Scenario', fileType: 'RO', status: 'RUNNING', taskId: 't1',
    })
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702',
      payload: { algorithmParameters: [{ code: 'credit_range', value: { min: {}, max: {} } }] },
    })
    expect(res.json()).toMatchObject({ code: 409 })
    expect(scenarioServiceMocks.update).not.toHaveBeenCalled()
  })

  it('still allows non-parameter updates for PUBLISHED scenarios through the generic route', async () => {
    const app = await build()
    const res = await app.inject({
      method: 'PUT',
      url: '/702',
      payload: { comments: 'note' },
    })
    expect(res.statusCode).toBe(200)
    expect(scenarioServiceMocks.update).toHaveBeenCalled()
  })
})
