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

vi.mock('../../services/roster/roster-service.js', () => ({
  rosterService: {
    swap: vi.fn(), move: vi.fn(), create: vi.fn(), remove: vi.fn(),
    removeByPairingAndCrew: vi.fn(), update: vi.fn(), assignPairing: vi.fn(), createGroundTask: vi.fn(),
  },
}))

vi.mock('../../services/pairing/pairing-service.js', () => ({
  pairingService: { remove: vi.fn(), addSegment: vi.fn(), createFromFlights: vi.fn() },
}))

// The Flight Delay recovery op must reuse the existing flight-edit service so the
// pairing_segment / roster_flight cascade and the duty-window recalculation stay
// in one place (§Flight-Change-Ripple-Required).
const flightUpdateSpy = vi.fn(async (..._args: unknown[]) => ({
  flight: { id: 78053 },
  affectedCrewIds: ['113'],
  affectedPairingIds: [136149],
  referenceDates: ['2026-09-16T14:50:00.000Z', '2026-09-16T18:30:00.000Z'],
}))

vi.mock('../../services/flight/flight-service.js', () => ({
  flightService: {
    update: (...args: unknown[]) => flightUpdateSpy(...args),
  },
}))

vi.mock('../../services/lock/lock-service.js', () => ({
  lockService: { releaseCrewLocks: vi.fn(async () => undefined) },
}))

const recheckSpy = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock('../../services/rule/legality-recheck.js', () => ({
  recheckLiveRosterMutation: (...args: unknown[]) => recheckSpy(...args),
}))

const recomputeQueueAddSpy = vi.fn(async (..._args: unknown[]) => undefined)

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
    query: vi.fn(async () => ({ rows: [{ crew_id: '113', zone_id: 'America/Vancouver' }] })),
  } as never)
  app.decorate('mandayRecomputeQueue', { add: recomputeQueueAddSpy } as never)
  app.decorate('wsBroadcastAll', vi.fn())
  app.decorate('wsBroadcast', vi.fn())
  await app.register(draftRoutes, { prefix: '/api/draft' })
  return app
}

/** Crew 113 / Pairing 136149 (V4127) on 2026-09-16 — ADM/MTG 14:00Z-15:00Z. */
const delayPayload = () => ({
  username: 'planner',
  affectedCrewIds: ['113'],
  affectedPairingIds: [136149],
  operations: [{
    type: 'edit-flight',
    flightTimes: [
      {
        flightId: 78053,
        schDepDtUtc: '2026-09-16T14:50:00.000Z',
        schArvDtUtc: '2026-09-16T17:45:00.000Z',
        actDepDtUtc: '2026-09-16T16:01:00.000Z',
        actArvDtUtc: '2026-09-16T18:56:00.000Z',
      },
      {
        flightId: 78059,
        schDepDtUtc: '2026-09-16T18:30:00.000Z',
        schArvDtUtc: '2026-09-16T21:30:00.000Z',
        actDepDtUtc: '2026-09-16T19:41:00.000Z',
        actArvDtUtc: '2026-09-16T22:41:00.000Z',
      },
    ],
  }],
})

describe('draft commit for the Flight Delay (edit-flight) recovery op', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('replays every delayed flight through the flight-edit service and recomputes Manday', async () => {
    const app = await buildApp()

    const response = await app.inject({ method: 'POST', url: '/api/draft/commit', payload: delayPayload() })

    expect(response.statusCode).toBe(200)
    expect(flightUpdateSpy).toHaveBeenCalledTimes(2)
    expect(flightUpdateSpy.mock.calls[0].slice(1, 3)).toEqual([
      78053,
      {
        schDepDtUtc: new Date('2026-09-16T14:50:00.000Z'),
        schArvDtUtc: new Date('2026-09-16T17:45:00.000Z'),
        actDepDtUtc: new Date('2026-09-16T16:01:00.000Z'),
        actArvDtUtc: new Date('2026-09-16T18:56:00.000Z'),
      },
    ])
    expect(flightUpdateSpy.mock.calls[1][1]).toBe(78059)
    expect(recomputeQueueAddSpy).toHaveBeenCalledTimes(1)
    expect((recomputeQueueAddSpy.mock.calls[0][1] as { crewIds: string[] }).crewIds).toEqual(['113'])
    // The mutated dates come from the flight propagation, so the recompute window
    // covers the delayed duty instead of defaulting to "today".
    expect(recheckSpy.mock.calls[0][2]).toEqual([
      '2026-09-16T14:50:00.000Z',
      '2026-09-16T18:30:00.000Z',
    ])
    await app.close()
  })

  it('fails the commit when a delayed flight no longer exists', async () => {
    const app = await buildApp()
    flightUpdateSpy.mockResolvedValueOnce(null as never)

    const response = await app.inject({ method: 'POST', url: '/api/draft/commit', payload: delayPayload() })

    // Shared API contract: failures ride on the envelope `code`, HTTP stays 200.
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ code: 500 })
    expect(response.json().message).toContain('78053')
    expect(recomputeQueueAddSpy).not.toHaveBeenCalled()
    await app.close()
  })

  it('rejects a malformed delay payload before touching any flight', async () => {
    const app = await buildApp()
    const payload = delayPayload()
    payload.operations[0].flightTimes[0].actArvDtUtc = 'not-a-timestamp'

    const response = await app.inject({ method: 'POST', url: '/api/draft/commit', payload })

    expect(response.json()).toMatchObject({ code: 400 })
    expect(response.json().message).toContain('Invalid datetime')
    expect(flightUpdateSpy).not.toHaveBeenCalled()
    await app.close()
  })
})
