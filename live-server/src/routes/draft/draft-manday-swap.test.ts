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

const swapSpy = vi.fn(async (..._args: unknown[]) => ({
  taskA: { id: 1, crewId: '390', pairingId: 11012, schStrDtUtc: '2026-06-12T03:00:00Z' },
  taskB: { id: 2, crewId: '391', pairingId: 11013, schStrDtUtc: '2026-06-13T04:00:00Z' },
}))

vi.mock('../../services/roster/roster-service.js', () => ({
  rosterService: {
    swap: (...args: unknown[]) => swapSpy(...args),
    move: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    removeByPairingAndCrew: vi.fn(),
    update: vi.fn(),
    assignPairing: vi.fn(),
    createGroundTask: vi.fn(),
  },
}))

vi.mock('../../services/pairing/pairing-service.js', () => ({
  pairingService: {
    remove: vi.fn(),
    addSegment: vi.fn(),
    createFromFlights: vi.fn(),
  },
}))

const releaseCrewLocksSpy = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock('../../services/lock/lock-service.js', () => ({
  lockService: {
    releaseCrewLocks: (...args: unknown[]) => releaseCrewLocksSpy(...args),
  },
}))

const recomputeQueueAddSpy = vi.fn(async (..._args: unknown[]) => undefined)

const recheckSpy = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock('../../services/rule/legality-recheck.js', () => ({
  recheckLiveRosterMutation: (...args: unknown[]) => recheckSpy(...args),
}))

import draftRoutes from './draft.js'

const buildApp = async () => {
  const app = Fastify({ logger: false })
  app.decorate('db', {
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn({}),
  } as never)
  app.decorate('redis', {
    get: vi.fn(async () => JSON.stringify({ userId: 'planner' })),
    scan: vi.fn(async () => ({ cursor: 0, keys: [] })),
    del: vi.fn(async () => undefined),
    incr: vi.fn(async () => 1),
  } as never)
  app.decorate('pgPool', {
    query: vi.fn(async () => ({
      rows: [
        { crew_id: '390', zone_id: 'America/Los_Angeles' },
        { crew_id: '391', zone_id: 'UTC' },
      ],
    })),
  } as never)
  app.decorate('mandayRecomputeQueue', {
    add: recomputeQueueAddSpy,
  } as never)
  app.decorate('wsBroadcastAll', vi.fn())
  app.decorate('wsBroadcast', vi.fn())
  await app.register(draftRoutes, { prefix: '/api/draft' })
  return app
}

describe('draft commit Manday recompute for swap operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses swapped roster dates to build the Manday recompute window', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/draft/commit',
      payload: {
        username: 'planner',
        affectedCrewIds: ['390', '391'],
        affectedPairingIds: [11012, 11013],
        operations: [{ type: 'swap', taskIdA: 1, taskIdB: 2 }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(recomputeQueueAddSpy).toHaveBeenCalledTimes(1)
    const [jobName, jobData, jobOpts] = recomputeQueueAddSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { jobId: string },
    ]
    expect(jobName).toBe('manday-recompute')
    expect(jobData).toMatchObject({
      kind: 'live',
      schema: 'f8',
      airlineSchema: 'f8',
      crewIds: ['390', '391'],
      window: { startDt: '2026-06-09', endDt: '2026-06-23' },
      updatedBy: 'planner',
    })
    expect(jobOpts.jobId).toMatch(/^manday-live-[0-9a-f-]{36}$/)
    expect(app.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:390')
    expect(app.redis.incr).toHaveBeenCalledWith('roster:v2:chunkver:391')
    expect(app.wsBroadcastAll).toHaveBeenCalledWith('f8', {
      type: 'roster-updated',
      crewIds: ['390', '391'],
    })
    expect(recheckSpy).toHaveBeenCalledTimes(1)
    expect(recheckSpy.mock.calls[0][1]).toBeUndefined()
    expect(recheckSpy.mock.calls[0][2]).toEqual([
      '2026-06-12T03:00:00Z',
      '2026-06-13T04:00:00Z',
    ])
    expect(recheckSpy.mock.calls[0][3]).toEqual(['390', '391'])
    await app.close()
  })

  it('passes rulesetId into the post-commit legality recheck when provided', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/draft/commit',
      payload: {
        username: 'planner',
        affectedCrewIds: ['390', '391'],
        affectedPairingIds: [11012, 11013],
        rulesetId: 103,
        operations: [{ type: 'swap', taskIdA: 1, taskIdB: 2 }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(recheckSpy).toHaveBeenCalledWith(
      expect.anything(),
      103,
      ['2026-06-12T03:00:00Z', '2026-06-13T04:00:00Z'],
      ['390', '391'],
    )
    await app.close()
  })

  it('uses a fresh BullMQ-safe job ID for repeated saves of the same crew set', async () => {
    const app = await buildApp()
    const payload = {
      username: 'planner',
      affectedCrewIds: ['390', '391'],
      affectedPairingIds: [11012, 11013],
      operations: [{ type: 'swap', taskIdA: 1, taskIdB: 2 }],
    }

    expect((await app.inject({ method: 'POST', url: '/api/draft/commit', payload })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/api/draft/commit', payload })).statusCode).toBe(200)

    const ids = recomputeQueueAddSpy.mock.calls.map((call) => (call[2] as { jobId: string }).jobId)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(/^manday-live-[0-9a-f-]{36}$/)
    expect(ids[1]).toMatch(/^manday-live-[0-9a-f-]{36}$/)
    expect(ids[0]).not.toBe(ids[1])
    await app.close()
  })
})
