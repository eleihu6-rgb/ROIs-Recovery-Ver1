// live-server/src/__tests__/services/manday-recompute-worker.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../services/manday/manday-tool.js', () => ({
  recompute: vi.fn(async () => ({ crews: 1, daily: 1, monthly: 1, yearly: 1 })),
}))
vi.mock('../../utils/bullmq-redis.js', () => ({ getBullmqRedisConnection: vi.fn(() => ({})) }))

import { recompute } from '../../services/manday/manday-tool.js'
import { handleMandayRecomputeJob } from '../../workers/manday-recompute-worker.js'

const makeFastify = (): FastifyInstance => ({
  pgPool: { query: vi.fn() },
  wsBroadcastAll: vi.fn(),
  log: { error: vi.fn() },
} as unknown as FastifyInstance)

describe('manday-recompute worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recomputes scoped crews and broadcasts scenario-manday-updated', async () => {
    const fastify = makeFastify()
    await handleMandayRecomputeJob(fastify, {
      kind: 'scenario', schema: 'scenario', airlineSchema: 'f8', scenarioId: 623,
      crewIds: ['F80001'], updatedBy: 'planner',
    })
    expect(recompute).toHaveBeenCalledWith(fastify.pgPool, expect.objectContaining({
      schema: 'scenario', scenarioId: 623, crewIds: ['F80001'],
    }))
    expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', {
      type: 'scenario-manday-updated', scenarioId: 623, crewIds: ['F80001'],
    })
  })

  it('live job broadcasts manday-updated without scenarioId', async () => {
    const fastify = makeFastify()
    await handleMandayRecomputeJob(fastify, {
      kind: 'live', schema: 'f8', airlineSchema: 'f8', crewIds: ['386'], updatedBy: 'planner',
    })
    expect(fastify.wsBroadcastAll).toHaveBeenCalledWith('f8', { type: 'manday-updated', crewIds: ['386'] })
  })

  it('passes the recompute window when provided', async () => {
    const fastify = makeFastify()
    await handleMandayRecomputeJob(fastify, {
      kind: 'live', schema: 'f8', airlineSchema: 'f8', crewIds: ['386'],
      window: { startDt: '2026-07-01', endDt: '2026-07-10' }, updatedBy: 'planner',
    })
    expect(recompute).toHaveBeenCalledWith(fastify.pgPool, expect.objectContaining({
      startDt: '2026-07-01', endDt: '2026-07-10',
    }))
  })
})
