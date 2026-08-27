import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker, Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { scenarioSchema } from '../utils/db-schema.js'

// Idle-TTL reclamation for persisted scenario legality: delete scenario.rule_violation rows
// for scenarios whose legality hasn't been touched in N days, and reset their status to
// PENDING so a later open recomputes lazily. N comes from the dictionary (not hardcoded).
// Spec: docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md §7.

export const SCENARIO_LEGALITY_SWEEP_QUEUE = 'scenario-legality-sweep'

const DEFAULT_TTL_DAYS = 7

async function getTtlDays(fastify: FastifyInstance): Promise<number> {
  const r = (
    await fastify.pgPool.query<{ code_value: string }>(
      `select code_value from dictionary where parent_code = 'SYS_PARAM' and code = 'SCENARIO_LEGALITY_TTL_DAYS' limit 1`,
    )
  ).rows[0]
  const n = Number(r?.code_value)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_DAYS
}

/** Delete idle scenario violations + reset their status. Returns the row count deleted. */
export async function sweepIdleScenarioLegality(fastify: FastifyInstance): Promise<number> {
  const ttlDays = await getTtlDays(fastify)
  const scenario = scenarioSchema()
  const del = await fastify.pgPool.query(
    `delete from ${scenario}.rule_violation
      where scenario_id in (
        select scenario_id from ${scenario}.legality_status
         where updated_at < now() - ($1 || ' days')::interval
      )`,
    [ttlDays],
  )
  await fastify.pgPool.query(
    `update ${scenario}.legality_status
        set status = 'PENDING', computed_version = -1, updated_at = now()
      where updated_at < now() - ($1 || ' days')::interval and status <> 'PENDING'`,
    [ttlDays],
  )
  fastify.log.info({ ttlDays, deleted: del.rowCount }, 'scenario legality idle sweep done')
  return del.rowCount ?? 0
}

export function startScenarioLegalitySweepWorker(fastify: FastifyInstance): { worker: Worker; queue: Queue } {
  const connection = getBullmqRedisConnection()
  const queue = new Queue(withBullmqPrefix(SCENARIO_LEGALITY_SWEEP_QUEUE), { connection })
  attachBullmqErrorLogger(queue, fastify.log, 'scenario-legality-sweep queue')
  const worker = new Worker(withBullmqPrefix(SCENARIO_LEGALITY_SWEEP_QUEUE),
    async () => {
      await sweepIdleScenarioLegality(fastify)
    },
    { connection },
  )
  worker.on('error', (err) => fastify.log.error({ err: err.message }, 'scenario legality sweep worker error'))
  return { worker, queue }
}
