// live-server/src/workers/scenario-kpi-recompute-worker.ts
import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { syncScenarioPairingKpisFromDb } from '../services/scenario/scenario-result-service.js'
import { getBullmqRedisConnection } from '../utils/bullmq-redis.js'

export interface ScenarioKpiRecomputeJobData {
  scenarioId: number
  strDtLoc: Date
  endDtLoc: Date
  filterParams: Record<string, unknown>
  division: string
  airlineSchema: string
  updatedBy: string
}

/** Recompute a scenario's pairing-coverage KPIs, then signal clients to refresh the KPI section. */
export const handleScenarioKpiRecomputeJob = async (
  fastify: FastifyInstance,
  data: ScenarioKpiRecomputeJobData,
): Promise<void> => {
  await syncScenarioPairingKpisFromDb(fastify, data.scenarioId, {
    strDtLoc: data.strDtLoc,
    endDtLoc: data.endDtLoc,
    filterParams: data.filterParams,
    division: data.division,
  }, data.updatedBy)
  fastify.wsBroadcastAll(data.airlineSchema, { type: 'scenario-kpi-updated', scenarioId: data.scenarioId })
}

export function startScenarioKpiRecomputeWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker<ScenarioKpiRecomputeJobData>(withBullmqPrefix('scenario-kpi-recompute'),
    async (job) => {
      await handleScenarioKpiRecomputeJob(fastify, job.data)
    },
    { connection: getBullmqRedisConnection(), concurrency: 2 },
  )
  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err: err.message }, 'scenario-kpi-recompute worker failed')
  })
  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'scenario-kpi-recompute worker error')
  })
  return worker
}
