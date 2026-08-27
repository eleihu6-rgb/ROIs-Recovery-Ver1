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

vi.mock('../../services/scenario/scenario-service.js', () => ({
  scenarioService: {
    getById: vi.fn(async () => ({
      id: 702,
      name: 'RO Scenario',
      fileType: 'RO',
      status: 'DONE',
      taskId: null,
      strDtLoc: new Date('2026-07-01T00:00:00Z'),
      endDtLoc: new Date('2026-07-31T00:00:00Z'),
      leadinLive: 1,
      pairingScenarioId: 0,
      flightScenarioId: 0,
      rulesetId: 103,
    })),
  },
}))

const accRefMocks = vi.hoisted(() => ({
  recalculateAccRefTz: vi.fn(async () => []),
}))

vi.mock('../../services/rule-check/acc-ref-tz-service.js', () => ({
  recalculateAccRefTz: accRefMocks.recalculateAccRefTz,
}))

vi.mock('../../services/scenario/scenario-lock-service.js', () => ({
  scenarioLockService: {
    status: vi.fn(async () => ({ locked: true, isOwner: true, owner: 'planner' })),
  },
}))

const patchServiceMocks = vi.hoisted(() => ({
  validateScenarioRosterPatches: vi.fn(async () => undefined),
  applyScenarioRosterPatches: vi.fn(async () => undefined),
  applyOutputPatch: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/scenario-patch-service.js', () => ({
  validateScenarioRosterPatches: patchServiceMocks.validateScenarioRosterPatches,
  applyScenarioRosterPatches: patchServiceMocks.applyScenarioRosterPatches,
  applyOutputPatch: patchServiceMocks.applyOutputPatch,
}))

const legalityMocks = vi.hoisted(() => ({
  ensureLegality: vi.fn(async () => undefined),
}))

vi.mock('../../services/scenario/legality-status.js', () => ({
  ensureLegality: legalityMocks.ensureLegality,
}))

vi.mock('../../services/scenario/s3-pairing-import-service.js', () => ({
  importS3PairingPrg: vi.fn(),
}))

vi.mock('../../services/base/dictionary-service.js', () => ({
  dictionaryService: {
    getByParentCode: vi.fn(async () => []),
  },
}))

vi.mock('../../services/scenario/scenario-parameter-service.js', () => ({
  scenarioParameterService: {
    getMerged: vi.fn(),
    saveValues: vi.fn(),
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

describe('scenario patch-output route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves roster deletes through scenario DB without requiring an engine output file', async () => {
    const app = await build()
    const patches = [{
      op: 'remove',
      crewId: 'F80001',
      pairingId: null,
      startDtUtc: '2026-07-01T08:00:00Z',
      endDtUtc: '2026-07-01T16:00:00Z',
      assignmentGroup: 'GRD',
      assignment: 'SIM',
    }]

    const res = await app.inject({
      method: 'POST',
      url: '/702/patch-output',
      payload: { patches },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ code: 200, data: { patched: 1 } })
    expect(patchServiceMocks.validateScenarioRosterPatches).toHaveBeenCalledWith(expect.anything(), 702, patches)
    expect(patchServiceMocks.applyScenarioRosterPatches).toHaveBeenCalledWith(expect.anything(), 702, patches, 'planner')
    expect(accRefMocks.recalculateAccRefTz).toHaveBeenCalledWith(
      expect.anything(),
      { schema: 'scenario', scenarioId: 702, rulesetId: 103 },
    )
    expect(legalityMocks.ensureLegality).toHaveBeenCalledWith(
      expect.anything(),
      702,
      expect.objectContaining({ airlineSchema: 'f8' }),
    )
    expect(patchServiceMocks.applyOutputPatch).not.toHaveBeenCalled()
    // Broadcast applied patches to OTHER clients (editor excluded by userId).
    const broadcast = app.wsBroadcast as unknown as ReturnType<typeof vi.fn>
    expect(broadcast).toHaveBeenCalledWith(
      'f8',
      { type: 'scenario-roster-updated', scenarioId: 702, patches },
      'planner',
    )
  })

  it('enqueues an async manday recompute for the patched crews', async () => {
    const app = await build()
    const add = vi.mocked(app.mandayRecomputeQueue.add)
    await app.inject({
      method: 'POST',
      url: '/702/patch-output',
      payload: { patches: [{
        op: 'remove',
        crewId: 'F80001',
        pairingId: null,
        startDtUtc: '2026-07-01T08:00:00Z',
        endDtUtc: '2026-07-01T16:00:00Z',
        assignmentGroup: 'GRD',
        assignment: 'SIM',
      }] },
    })

    expect(add).toHaveBeenCalledWith(
      'manday-recompute',
      expect.objectContaining({
        kind: 'scenario',
        schema: 'scenario',
        airlineSchema: 'f8',
        scenarioId: 702,
        crewIds: ['F80001'],
        updatedBy: 'planner',
      }),
      expect.objectContaining({ jobId: 'manday-scenario-702-F80001' }),
    )
    expectBullmqSafeJobId(add.mock.calls[0]?.[2]?.jobId)

    const kpiAdd = vi.mocked(app.scenarioKpiRecomputeQueue.add)
    expect(kpiAdd).toHaveBeenCalledWith(
      'scenario-kpi-recompute',
      expect.objectContaining({ scenarioId: 702, airlineSchema: 'f8', updatedBy: 'planner' }),
      expect.objectContaining({ jobId: 'scenario-kpi-702' }),
    )
    expectBullmqSafeJobId(kpiAdd.mock.calls[0]?.[2]?.jobId)
  })

  // Regression for the SIT scenario-save failure (scenario 623 DO delete): BullMQ's
  // validateOptions rejects custom jobIds containing ':' unless they split into exactly
  // 3 parts (legacy repeatable-job compat). The pre-fix jobIds 'manday:scenario:702:F80001'
  // (4 parts) and 'scenario-kpi:702' (2 parts) made every patch-output queue.add throw
  // 'Custom Id cannot contain :' after the async-recompute refactor (3ede8a44/05f601e1).
  const expectBullmqSafeJobId = (jobId: unknown): void => {
    expect(typeof jobId).toBe('string')
    const s = jobId as string
    if (s.includes(':')) expect(s.split(':')).toHaveLength(3)
  }
})
