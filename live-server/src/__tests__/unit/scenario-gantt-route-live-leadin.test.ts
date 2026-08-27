import { describe, expect, it, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    FILIALE: 'F8',
    SCENARIO_GANTT_SOURCE: 'gz',
  },
}))

vi.mock('../../services/scenario/scenario-run-health-service.js', () => ({
  getScenarioRunHealth: vi.fn(async () => ({ overall: 'healthy', services: [], checkedAt: new Date().toISOString() })),
}))

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    create: vi.fn(),
    getById: vi.fn(async () => ({
      id: 901,
      name: 'Legacy lead-in off',
      fileType: 'RO',
      status: 'DONE',
      taskId: 'task-901',
      worksetId: 1,
      strDtLoc: new Date('2026-06-01T00:00:00Z'),
      endDtLoc: new Date('2026-06-30T00:00:00Z'),
      leadinLive: 0,
      filterParams: {},
      rulesetId: 103,
      pairingScenarioId: 0,
      flightScenarioId: 0,
    })),
    update: vi.fn(),
    duplicate: vi.fn(),
    transition: vi.fn(),
  },
}))

vi.mock('../../services/scenario/scenario-gantt-service.js', () => ({
  buildGanttDataLiveRefresh: vi.fn(async () => ({
    scenarioId: 901,
    scenarioName: 'Legacy lead-in off',
    fileType: 'RO',
    capabilities: {},
    strDtLoc: '2026-06-01T00:00:00.000Z',
    endDtLoc: '2026-06-30T00:00:00.000Z',
    scenarioStrDt: '2026-06-01T00:00:00.000Z',
    scenarioEndDt: '2026-06-30T00:00:00.000Z',
    leadinLive: 0,
    dataSource: 'live-refresh',
    crew: [],
    pairings: [],
    assignments: [],
    pairingSegments: [],
    flights: [],
    groundItems: [],
    crewStats: {},
  })),
  buildGanttDataSnapshot: vi.fn(async () => {
    throw new Error('snapshot path should not be used')
  }),
}))

vi.mock('../../services/scenario/scenario-crew-stats-service.js', () => ({
  computeScenarioCrewStats: vi.fn(async () => ({})),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

vi.mock('../../services/scenario/scenario-capabilities.js', () => ({
  capabilitiesFromDict: vi.fn(() => ({ panes: [], defaultPanes: [], roster: {}, pairing: {} })),
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/scenario/scenario-parameter-service.js', () => ({
  scenarioParameterService: {
    getMerged: vi.fn(),
    saveValues: vi.fn(),
  },
}))

import scenarioRoutes from '../../routes/scenario/scenario.js'
import { buildGanttDataLiveRefresh, buildGanttDataSnapshot } from '../../services/scenario/scenario-gantt-service.js'

const build = async () => {
  const app = Fastify()
  app.decorate('db', { execute: vi.fn(async () => ({ rows: [] })) } as never)
  app.decorate('pgPool', { query: vi.fn(async () => ({ rows: [] })) } as never)
  app.decorate('redis', {} as never)
  app.decorateRequest('authUser', undefined)
  app.addHook('onRequest', async (req) => {
    ;(req as { authUser?: unknown }).authUser = {
      userCode: 'kevin',
      schema: 'f8',
      isAdmin: 1,
    }
  })
  await app.register(scenarioRoutes)
  return app
}

describe('scenario gantt-data route live lead-in default', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses live-refresh even for historical leadinLive=0 rows', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: '/901/gantt-data' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: { scenarioId: 901, dataSource: 'live-refresh' },
    })
    expect(buildGanttDataLiveRefresh).toHaveBeenCalledOnce()
    expect(buildGanttDataSnapshot).not.toHaveBeenCalled()
  })
})
