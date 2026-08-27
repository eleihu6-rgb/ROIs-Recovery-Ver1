import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker, Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-padded two-digit string */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Partition table name for a given year + month (1-indexed) */
function partitionName(year: number, month: number): string {
  return `rule_violation_${year}_${pad2(month)}`
}

/** Lower bound (inclusive) ISO date for a partition */
function partitionFrom(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`
}

/** Upper bound (exclusive) ISO date — first day of the following month */
function partitionTo(year: number, month: number): string {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${next.year}-${pad2(next.month)}-01`
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

/**
 * CREATE TABLE IF NOT EXISTS for a single monthly partition.
 * Idempotent — safe to call even if the partition already exists.
 */
async function ensurePartition(
  fastify: FastifyInstance,
  year: number,
  month: number,
): Promise<void> {
  const name = partitionName(year, month)
  const from = partitionFrom(year, month)
  const to   = partitionTo(year, month)

  await fastify.pgPool.query(
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF rule_violation
       FOR VALUES FROM ('${from}') TO ('${to}')`,
  )
  fastify.log.info({ partition: name, from, to }, 'Partition ensured')
}

/**
 * DROP partitions whose upper bound is older than `cutoffDate`.
 * Only drops partitions that follow the naming convention `rule_violation_YYYY_MM`.
 */
async function dropOldPartitions(
  fastify: FastifyInstance,
  cutoffDate: Date,
): Promise<void> {
  // Query pg_inherits to find all child partitions of rule_violation
  const result = await fastify.pgPool.query<{ tablename: string }>(`
    SELECT c.relname AS tablename
    FROM pg_inherits i
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE p.relname = 'rule_violation'
      AND c.relname ~ '^rule_violation_\\d{4}_\\d{2}$'
  `)

  const cutoffYM = cutoffDate.getUTCFullYear() * 100 + (cutoffDate.getUTCMonth() + 1)

  for (const row of result.rows) {
    // Extract YYYY and MM from table name
    const match = row.tablename.match(/rule_violation_(\d{4})_(\d{2})/)
    if (!match) continue

    const partYM = Number(match[1]) * 100 + Number(match[2])
    if (partYM < cutoffYM) {
      await fastify.pgPool.query(`DROP TABLE IF EXISTS ${row.tablename}`)
      fastify.log.info({ partition: row.tablename }, 'Old partition dropped')
    }
  }
}

// ---------------------------------------------------------------------------
// Job data type
// ---------------------------------------------------------------------------

export interface PartitionManagerJobData {
  action: 'manage'
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function startPartitionManagerWorker(fastify: FastifyInstance): {
  worker: Worker
  queue: Queue
} {
  const connection = getBullmqRedisConnection()

  const queue = new Queue<PartitionManagerJobData>(withBullmqPrefix('partition-manager'), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail:     { count: 10 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    },
  })
  attachBullmqErrorLogger(queue, fastify.log, 'partition-manager queue')

  const worker = new Worker<PartitionManagerJobData>(withBullmqPrefix('partition-manager'),
    async (_job) => {
      const now = new Date()

      // 1. Ensure current month's partition exists (idempotent guard)
      await ensurePartition(fastify, now.getUTCFullYear(), now.getUTCMonth() + 1)

      // 2. Pre-create next month's partition
      const next = now.getUTCMonth() === 11
        ? { year: now.getUTCFullYear() + 1, month: 1 }
        : { year: now.getUTCFullYear(), month: now.getUTCMonth() + 2 }
      await ensurePartition(fastify, next.year, next.month)

      // 3. Drop partitions older than 2 years
      const cutoff = new Date(now)
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2)
      await dropOldPartitions(fastify, cutoff)

      fastify.log.info('Partition management run complete')
    },
    { connection, concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err: err.message }, 'Partition manager worker failed')
  })
  worker.on('error', (err) => {
    fastify.log.error({ err: err.message }, 'Partition manager worker error')
  })

  return { worker, queue }
}
