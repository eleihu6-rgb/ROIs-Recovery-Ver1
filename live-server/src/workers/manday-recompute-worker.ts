// live-server/src/workers/manday-recompute-worker.ts
import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { recompute } from '../services/manday/manday-tool.js'
import { getBullmqRedisConnection } from '../utils/bullmq-redis.js'

export interface MandayRecomputeJobData {
  kind: 'live' | 'scenario'
  /** Value passed to recompute(): 'scenario' or the live schema name (e.g. 'f8'). */
  schema: string
  /** WS broadcast channel — the airline schema the client subscribed to (e.g. 'f8'). */
  airlineSchema: string
  scenarioId?: number
  crewIds: string[]
  window?: { startDt: string; endDt: string }
  updatedBy: string
}

/**
 * Recompute manday for the affected crews only, then broadcast a signal so clients
 * targeted-refresh crew stats (scenario) / MCred (live) instead of reloading everything.
 * Kept as a pure function so the worker can be unit-tested without a Redis connection.
 */
export const handleMandayRecomputeJob = async (
  fastify: FastifyInstance,
  data: MandayRecomputeJobData,
): Promise<void> => {
  const { kind, schema, airlineSchema, scenarioId, crewIds, window, updatedBy } = data
  await recompute(fastify.pgPool, {
    schema,
    scenarioId,
    crewIds,
    startDt: window?.startDt,
    endDt: window?.endDt,
    updatedBy,
  })
  if (kind === 'scenario' && scenarioId != null) {
    fastify.wsBroadcastAll(airlineSchema, { type: 'scenario-manday-updated', scenarioId, crewIds })
  } else {
    fastify.wsBroadcastAll(airlineSchema, { type: 'manday-updated', crewIds })
  }
}

export function startMandayRecomputeWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker<MandayRecomputeJobData>(withBullmqPrefix('manday-recompute'),
    async (job) => {
      await handleMandayRecomputeJob(fastify, job.data)
    },
    { connection: getBullmqRedisConnection(), concurrency: 2 },
  )
  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err: err.message }, 'manday-recompute worker failed')
  })
  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'manday-recompute worker error')
  })
  return worker
}
