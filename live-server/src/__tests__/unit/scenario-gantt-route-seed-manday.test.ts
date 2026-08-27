import { describe, expect, it, vi, beforeEach } from 'vitest'
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
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    create: vi.fn(),
    getById: vi.fn(async () => ({
      id: 902,
      name: 'Empty RO',
      fileType: 'RO',
      status: 'DRAFT',
      taskId: null,
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
  buildGanttDataSeed: vi.fn(async () => ({
    scenarioId: 902,
    scenarioName: 'Empty RO',
    fileType: 'RO',
    capabilities: {},
    strDtLoc: '2026-06-01T00:00:00.000Z',
    endDtLoc: '2026-06-30T00:00:00.000Z',
    scenarioStrDt: '2026-06-01T00:00:00.000Z',
    scenarioEndDt: '2026-06-30T00:00:00.000Z',
    leadinLive: 0,
    dataSource: 'seed',
    readOnly: true,
    crew: [{ crewId: 'C1', base: 'YVR', division: 'P', rank: 'CA', seniorityNum: '1', crewName: 'One Crew' }],
    pairings: [],
    assignments: [],
    pairingSegments: [],
    flights: [],
    groundItems: [],
    crewStats: {},
  })),
}))

vi.mock('../../services/scenario/scenario-crew-stats-service.js', () => ({
  loadLiveMandayStatsForScenario: vi.fn(async () => ({
    C1: {
      '2026RP06': {
        credit: 1200,
        dayOffCount: 6,
        alCount: 1,
        leaveCount: 1,
        ybh: 3000,
        mbh: 900,
        mcred: 1200,
        yal: 2,
        mal: 1,
        ydo: 20,
        mdo: 6,
      },
    },
  })),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

vi.mock('../../services/scenario/scenario-capabilities.js', () => ({
  capabilitiesFromDict: vi.fn(() => ({
    panes: ['roster'],
    defaultPanes: ['roster'],
    roster: { canAssign: true, canRemove: true, canReassign: true },
    pairing: { canEditSegments: true },
  })),
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
import { buildGanttDataSeed } from '../../services/scenario/scenario-gantt-service.js'
import { loadLiveMandayStatsForScenario } from '../../services/scenario/scenario-crew-stats-service.js'

const build = async () => {
  const app = Fastify()
  app.decorate('db', { execute: vi.fn(async () => ({ rows: [{ n: 0 }] })) } as never)
  app.decorate('pgPool', {
    query: vi.fn(async (text: string) => {
      if (text.includes('roster_period')) return { rows: [{ roster_period: '2026RP06' }] }
      return { rows: [] }
    }),
  } as never)
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

describe('scenario gantt-data seed live manday', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads Live manday stats for empty RO seed views', async () => {
    const app = await build()

    const res = await app.inject({ method: 'GET', url: '/902/gantt-data' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      code: 200,
      data: {
        scenarioId: 902,
        dataSource: 'seed',
        crewStats: { C1: { '2026RP06': { mcred: 1200, mbh: 900, ybh: 3000, mdo: 6 } } },
      },
    })
    expect(buildGanttDataSeed).toHaveBeenCalledOnce()
    expect(loadLiveMandayStatsForScenario).toHaveBeenCalledWith(expect.anything(), ['C1'], '2026RP06')
  })
})
