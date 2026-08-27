import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { ruleCheckDataService } from '../services/rule-check/rule-check-data-service.js'
import { ruleCheckResultService } from '../services/rule-check/rule-check-result-service.js'
import { getBullmqRedisConnection } from '../utils/bullmq-redis.js'

// ---------------------------------------------------------------------------
// Job data type
// ---------------------------------------------------------------------------

export interface BatchCrewJobData {
  crewId: string
  rulesetId: number
  filiale: string
  dateFrom: string
  dateTo: string
  batchRunId: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startBatchCrewWorker(fastify: FastifyInstance): Worker {
  const connection = getBullmqRedisConnection()

  const worker = new Worker<BatchCrewJobData>(withBullmqPrefix('rule-batch-crew'),
    async (job) => {
      if (job.name !== 'rule:batch:crew-full') return

      const { crewId, rulesetId: _rulesetId, filiale: _filiale, dateFrom, dateTo, batchRunId } = job.data

      const pairs = await ruleCheckDataService.loadCrewPairingsForPeriod(
        fastify,
        crewId,
        dateFrom,
        dateTo,
      )

      if (pairs.length === 0) {
        fastify.log.info({ crewId, batchRunId }, 'No pairings for crew in batch range')
        await ruleCheckResultService.incrementBatchProgress(fastify, batchRunId, 0)
        return
      }

      await ruleCheckResultService.incrementBatchProgress(fastify, batchRunId, pairs.length)

      const batchRow = await fastify.pgPool.query<{
        processed_crew: number
        total_crew: number
      }>(
        'SELECT processed_crew, total_crew FROM rule_check_batch_run WHERE id = $1',
        [batchRunId],
      )

      if (batchRow.rows.length > 0) {
        const { processed_crew, total_crew } = batchRow.rows[0]
        if (processed_crew >= total_crew) {
          await fastify.pgPool.query(
            `UPDATE rule_check_batch_run SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1 AND status = 'running'`,
            [batchRunId],
          )
          fastify.log.info({ batchRunId }, 'Batch run completed')
        }
      }
    },
    { connection, concurrency: 5 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, batchRunId: job?.data?.batchRunId, err: err.message }, 'Batch crew worker failed')
  })

  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'Batch crew worker error')
  })

  return worker
}
