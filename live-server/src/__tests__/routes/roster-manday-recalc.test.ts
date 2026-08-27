import { describe, it, expect, beforeEach, vi } from 'vitest'
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

// Regression for the reported bug: deleting (and creating) roster_flight in the Live Gantt
// left CrewManday stale because the mutation never recomputed. The fix made every /api/roster/*
// mutation recompute SYNCHRONOUSLY via the unified driver (replacing the old fire-and-forget
// `manday:recalc` queue whose jobId dedup silently dropped bursts). These tests drive the real
// route handlers and assert the driver is invoked for the affected crew + padded window.

const SCH = new Date('2026-06-15T10:00:00Z')

const remove = vi.fn(async (..._a: unknown[]) => ({ id: 1, crewId: '2737', pairingId: 100, schStrDtUtc: SCH }))
const create = vi.fn(async (..._a: unknown[]) => ({ id: 2, crewId: '2737', pairingId: 100, schStrDtUtc: SCH }))
const createGroundTask = vi.fn(async (..._a: unknown[]) => [{ id: 3, crewId: '2737', pairingId: null, schStrDtUtc: SCH }])
const swap = vi.fn(async (..._a: unknown[]) => ({
  taskA: { crewId: '2737', schStrDtUtc: SCH },
  taskB: { crewId: '1207', schStrDtUtc: SCH },
}))

vi.mock('../../services/roster/roster-service.js', () => ({
  rosterService: {
    remove: (...a: unknown[]) => remove(...a),
    create: (...a: unknown[]) => create(...a),
    createGroundTask: (...a: unknown[]) => createGroundTask(...a),
    swap: (...a: unknown[]) => swap(...a),
    getView: vi.fn(), getById: vi.fn(), update: vi.fn(),
    move: vi.fn(), assignPairing: vi.fn(), assignFlight: vi.fn(), removeByPairingAndCrew: vi.fn(),
  },
}))

// Mock the unified driver so we assert the route WIRING (called with the right crew + window),
// not the SQL — the real recompute is proven against the DB in manday-tool / roster-mutation tests.
const recomputeSpy = vi.fn(async (..._a: unknown[]) => ({ crews: 1, daily: 0, monthly: 0, yearly: 0 }))
vi.mock('../../services/manday/manday-operation-service.js', () => ({
  recomputeMandayAndNotify: (...a: unknown[]) => recomputeSpy(...a),
}))

import rosterRoutes from '../../routes/roster/roster.js'

function buildApp() {
  const app = Fastify({ logger: false })
  // pgPool is passed to recompute (mocked) and used by the rule-check trigger (swallowed on error).
  app.decorate('pgPool', { query: async () => ({ rows: [] }) } as never)
  app.decorate('realtimeQueue', { add: vi.fn().mockResolvedValue(undefined) } as never)
  app.decorate('wsBroadcastAll', vi.fn())
  return app
}

type Opts = { crewIds: string[]; startDt?: string; endDt?: string }
const mandayCalls = (): Opts[] => recomputeSpy.mock.calls.map((c) => c[1] as Opts)

type MandayBroadcast = [string, { type: string; crewIds: string[] }]
const mandayBroadcastCalls = (app: { wsBroadcastAll: { mock: { calls: MandayBroadcast[] } } }): MandayBroadcast[] =>
  app.wsBroadcastAll.mock.calls.filter(([, message]) => message.type === 'manday-updated')

describe('roster mutations recompute CrewManday synchronously via the driver', () => {
  beforeEach(() => vi.clearAllMocks())

  it('POST /api/roster/:id/delete recomputes manday for the crew (padded window)', async () => {
    const app = buildApp()
    await app.register(rosterRoutes, { prefix: '/api/roster' })
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/api/roster/1/delete', payload: {} })
    expect(res.statusCode).toBe(200)

    const calls = mandayCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].crewIds).toEqual(['2737'])
    expect(calls[0].startDt).toBe('2026-06-13')
    expect(calls[0].endDt).toBe('2026-06-25')
    // Every sync recompute path must ALSO broadcast manday-updated — roster-updated alone only
    // refreshes roster items; the frontend refreshes RpCred/RpDO/RpBH on manday-updated.
    const manday = mandayBroadcastCalls(app as never)
    expect(manday).toHaveLength(1)
    expect(manday[0][0]).toBe('f8')
    expect(manday[0][1].crewIds).toEqual(['2737'])
    await app.close()
  })

  it('POST /api/roster (create) recomputes manday', async () => {
    const app = buildApp()
    await app.register(rosterRoutes, { prefix: '/api/roster' })
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/api/roster', payload: { crewId: '2737' } })
    expect(res.statusCode).toBe(200)
    expect(mandayCalls()).toHaveLength(1)
    expect(mandayCalls()[0].crewIds).toEqual(['2737'])
    const manday = mandayBroadcastCalls(app as never)
    expect(manday).toHaveLength(1)
    expect(manday[0][1].crewIds).toEqual(['2737'])
    await app.close()
  })

  it('POST /api/roster/create-ground-task recomputes manday for all crew', async () => {
    const app = buildApp()
    await app.register(rosterRoutes, { prefix: '/api/roster' })
    await app.ready()

    const res = await app.inject({
      method: 'POST',
      url: '/api/roster/create-ground-task',
      payload: {
        crewIds: ['2737', '1207'],
        assignment: 'DO',
        depArp: 'YVR',
        arvArp: 'YYZ',
        startDtUtc: '2026-06-15T00:00:00Z',
        endDtUtc: '2026-06-16T00:00:00Z',
      },
    })
    expect(res.statusCode).toBe(200)
    const calls = mandayCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].crewIds).toEqual(['2737', '1207'])
    const manday = mandayBroadcastCalls(app as never)
    expect(manday).toHaveLength(1)
    expect(manday[0][1].crewIds).toEqual(['2737', '1207'])
    await app.close()
  })

  it('POST /api/roster/swap broadcasts manday-updated for both crews', async () => {
    const app = buildApp()
    await app.register(rosterRoutes, { prefix: '/api/roster' })
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/api/roster/swap', payload: { taskIdA: 1, taskIdB: 2 } })
    expect(res.statusCode).toBe(200)
    const manday = mandayBroadcastCalls(app as never)
    expect(manday).toHaveLength(2)
    for (const [, message] of manday) {
      expect(message.crewIds).toEqual(['2737', '1207'])
    }
    await app.close()
  })
})
