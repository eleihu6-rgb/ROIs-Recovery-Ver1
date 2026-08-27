import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { Queue } from 'bullmq'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import type { ViolationsInitCrewData, ViolationsInitStartData } from '../workers/violations-init-worker.js'
import type { RosterBulkDeleteJobData, RosterBulkDeleteJobResult } from '../workers/roster-bulk-delete-worker.js'
import type { MandayRecomputeJobData } from '../workers/manday-recompute-worker.js'
import type { ScenarioKpiRecomputeJobData } from '../workers/scenario-kpi-recompute-worker.js'

declare module 'fastify' {
  interface FastifyInstance {
    realtimeQueue: Queue
    batchQueue: Queue
    batchCrewQueue: Queue
    violationsInitQueue: Queue<ViolationsInitCrewData | ViolationsInitStartData>
    rosterBulkDeleteQueue: Queue<RosterBulkDeleteJobData, RosterBulkDeleteJobResult>
    mandayRecomputeQueue: Queue<MandayRecomputeJobData>
    scenarioKpiRecomputeQueue: Queue<ScenarioKpiRecomputeJobData>
  }
}

export default fp(async function bullmqPlugin(fastify: FastifyInstance) {
  const connection = getBullmqRedisConnection()

  const realtimeQueue = new Queue(withBullmqPrefix('rule-check-realtime'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  })

  const batchQueue = new Queue(withBullmqPrefix('rule-check-batch'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 20 },
    },
  })

  const batchCrewQueue = new Queue(withBullmqPrefix('rule-batch-crew'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    },
  })

  const violationsInitQueue = new Queue<ViolationsInitCrewData | ViolationsInitStartData>(withBullmqPrefix('violations-init'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  })
  const rosterBulkDeleteQueue = new Queue<RosterBulkDeleteJobData, RosterBulkDeleteJobResult>(withBullmqPrefix('roster-bulk-delete'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
      attempts: 1,
    },
  })
  const mandayRecomputeQueue = new Queue<MandayRecomputeJobData>(withBullmqPrefix('manday-recompute'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
    },
  })
  const scenarioKpiRecomputeQueue = new Queue<ScenarioKpiRecomputeJobData>(withBullmqPrefix('scenario-kpi-recompute'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
    },
  })

  attachBullmqErrorLogger(realtimeQueue, fastify.log, 'rule-check-realtime queue')
  attachBullmqErrorLogger(batchQueue, fastify.log, 'rule-check-batch queue')
  attachBullmqErrorLogger(batchCrewQueue, fastify.log, 'rule-batch-crew queue')
  attachBullmqErrorLogger(violationsInitQueue, fastify.log, 'violations-init queue')
  attachBullmqErrorLogger(rosterBulkDeleteQueue, fastify.log, 'roster bulk delete queue')
  attachBullmqErrorLogger(mandayRecomputeQueue, fastify.log, 'manday-recompute queue')
  attachBullmqErrorLogger(scenarioKpiRecomputeQueue, fastify.log, 'scenario-kpi-recompute queue')

  fastify.decorate('realtimeQueue', realtimeQueue)
  fastify.decorate('batchQueue', batchQueue)
  fastify.decorate('batchCrewQueue', batchCrewQueue)
  fastify.decorate('violationsInitQueue', violationsInitQueue)
  fastify.decorate('rosterBulkDeleteQueue', rosterBulkDeleteQueue)
  fastify.decorate('mandayRecomputeQueue', mandayRecomputeQueue)
  fastify.decorate('scenarioKpiRecomputeQueue', scenarioKpiRecomputeQueue)

  fastify.addHook('onClose', async () => {
    await realtimeQueue.close()
    await batchQueue.close()
    await batchCrewQueue.close()
    await violationsInitQueue.close()
    await rosterBulkDeleteQueue.close()
    await mandayRecomputeQueue.close()
    await scenarioKpiRecomputeQueue.close()
  })
})
