import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { getBullmqRedisConnection } from '../utils/bullmq-redis.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchOrchestratorJobData {
  batchRunId: number
  rulesetId: number
  filiale: string
  dateFrom: string
  dateTo: string
}

interface CountResult {
  total_crew: number
  total_pairings: number
}

interface CrewIdRow {
  crew_id: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startBatchOrchestratorWorker(
  fastify: FastifyInstance,
): Worker {
  const connection = getBullmqRedisConnection()

  const worker = new Worker<BatchOrchestratorJobData>(withBullmqPrefix('rule-check-batch'),
    async (job) => {
      // 1. Skip if not a batch orchestration job
      if (job.name !== 'rule:check:batch') return

      const { batchRunId, rulesetId, filiale, dateFrom, dateTo } = job.data

      fastify.log.info({ batchRunId, rulesetId, filiale, dateFrom, dateTo }, 'Starting batch orchestration')

      // 2. Count distinct crew and pairing pairs
      const countSql = `
        SELECT
          COUNT(DISTINCT rf.crew_id) AS total_crew,
          COUNT(DISTINCT (rf.crew_id, rf.pairing_id)) AS total_pairings
        FROM roster_flight rf
        JOIN pairing p ON p.id = rf.pairing_id AND p.is_deleted = 0
        WHERE rf.is_deleted = 0
          AND rf.assignment_group = 'FLY'
          AND rf.pairing_id IS NOT NULL
          AND p.filiale = UPPER($1)
          AND p.sch_str_dt_utc >= $2::date
          AND p.sch_str_dt_utc < $3::date + INTERVAL '1 day'
      `

      const countResult = await fastify.pgPool.query<CountResult>(countSql, [filiale, dateFrom, dateTo])
      const { total_crew, total_pairings } = countResult.rows[0] ?? { total_crew: 0, total_pairings: 0 }

      if (total_crew === 0 || total_pairings === 0) {
        // Nothing to process — mark as completed immediately
        await fastify.pgPool.query(
          `UPDATE rule_check_batch_run
           SET status = 'completed',
               total_crew = 0,
               total_pairings = 0,
               processed_crew = 0,
               processed_pairings = 0,
               started_at = now(),
               completed_at = now(),
               updated_at = now()
           WHERE id = $1`,
          [batchRunId],
        )
        fastify.log.info({ batchRunId }, 'Batch run has no work, marked as completed')
        return
      }

      // 3. Update batch_run with counts and 'running' status
      await fastify.pgPool.query(
        `UPDATE rule_check_batch_run
         SET status = 'running',
             total_crew = $2,
             total_pairings = $3,
             started_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [batchRunId, total_crew, total_pairings],
      )

      // 4. Get distinct crew IDs
      const crewSql = `
        SELECT DISTINCT rf.crew_id
        FROM roster_flight rf
        JOIN pairing p ON p.id = rf.pairing_id AND p.is_deleted = 0
        WHERE rf.is_deleted = 0
          AND rf.assignment_group = 'FLY'
          AND rf.pairing_id IS NOT NULL
          AND p.filiale = UPPER($1)
          AND p.sch_str_dt_utc >= $2::date
          AND p.sch_str_dt_utc < $3::date + INTERVAL '1 day'
        ORDER BY rf.crew_id
      `

      const crewResult = await fastify.pgPool.query<CrewIdRow>(crewSql, [filiale, dateFrom, dateTo])
      const crewIds = crewResult.rows.map((r) => r.crew_id)

      // 5. Enqueue one 'rule:batch:crew-full' job per crew
      const enqueued = await Promise.allSettled(
        crewIds.map((crewId) =>
          fastify.batchCrewQueue.add('rule:batch:crew-full', {
            crewId,
            rulesetId,
            filiale,
            dateFrom,
            dateTo,
            batchRunId,
          }),
        ),
      )

      const failedCount = enqueued.filter((r) => r.status === 'rejected').length
      if (failedCount > 0) {
        fastify.log.error({ batchRunId, failedCount }, 'Some crew jobs failed to enqueue')
      }

      fastify.log.info(
        { batchRunId, totalCrew: crewIds.length, totalPairings: total_pairings, failedCount },
        'Batch orchestration complete, crew jobs enqueued',
      )
    },
    { connection, concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    if (job?.name === 'rule:check:batch') {
      const data = job.data as BatchOrchestratorJobData
      fastify.pgPool.query(
        `UPDATE rule_check_batch_run
         SET status = 'failed',
             error_summary = $2::jsonb,
             updated_at = now()
         WHERE id = $1`,
        [data.batchRunId, JSON.stringify({ message: err.message, jobId: job.id })],
      ).catch((dbErr) => {
        fastify.log.error({ err: dbErr }, 'Failed to update batch_run to failed status')
      })
    }
    fastify.log.error({ jobId: job?.id, err: err.message }, 'Batch orchestrator worker failed')
  })

  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'Batch orchestrator worker error')
  })

  return worker
}
