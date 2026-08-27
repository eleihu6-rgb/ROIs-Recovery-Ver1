// live-server/src/__tests__/services/scenario-kpi-recompute-worker.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../services/scenario/scenario-result-service.js', () => ({
  syncScenarioPairingKpisFromDb: vi.fn(async () => undefined),
}))
vi.mock('../../utils/bullmq-redis.js', () => ({ getBullmqRedisConnection: vi.fn(() => ({})) }))

import { syncScenarioPairingKpisFromDb } from '../../services/scenario/scenario-result-service.js'
import { handleScenarioKpiRecomputeJob } from '../../workers/scenario-kpi-recompute-worker.js'

const makeFastify = (): FastifyInstance => ({
  pgPool: { query: vi.fn() },
  wsBroadcastAll: vi.fn(),
  log: { error: vi.fn() },
} as unknown as FastifyInstance)

describe('scenario-kpi-recompute worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recomputes scenario KPIs and broadcasts scenario-kpi-updated', async () => {
    const fastify = makeFastify()
    await handleScenarioKpiRecomputeJob(fastify, {
      scenarioId: 623,
      strDtLoc: new Date('2026-07-01T00:00:00Z'),
      endDtLoc: new Date('2026-07-31T00:00:00Z'),
      filterParams: { pairing: { bases: ['YVR'] } },
      division: 'P',
      airlineSchema: 'f8',
      updatedBy: 'planner',
    })

    expect(syncScenarioPairingKpisFromDb).toHaveBeenCalledWith(
      fastify,
      623,
      expect.objectContaining({ division: 'P' }),
      'planner',
    )
    expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', { type: 'scenario-kpi-updated', scenarioId: 623 })
  })
})
