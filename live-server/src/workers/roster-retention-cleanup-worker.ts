import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Queue, Worker } from 'bullmq'
import type { PoolClient } from 'pg'
import type { FastifyInstance } from 'fastify'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { liveSchema, scenarioSchema } from '../utils/db-schema.js'

export const ROSTER_RETENTION_CLEANUP_QUEUE = 'roster-retention-cleanup'

export interface RosterRetentionCleanupResult {
  skipped: boolean
  deleted: {
    rosterFlight: number
    pairingComposition: number
    pairingSegment: number
    pairingMemo: number
    pairing: number
    flightComposition: number
    flight: number
  }
}

const ADVISORY_LOCK_KEY = 'roster-retention-cleanup'

const rowCount = (result: { rowCount?: number | null }): number => result.rowCount ?? 0

const deleteBatch = async (
  client: PoolClient,
  statement: string,
  retentionMonths: number,
  batchSize: number,
): Promise<number> => rowCount(await client.query(statement, [retentionMonths, batchSize]))

const repeatDelete = async (
  client: PoolClient,
  statement: string,
  retentionMonths: number,
  batchSize: number,
): Promise<number> => {
  let total = 0
  while (true) {
    const deleted = await deleteBatch(client, statement, retentionMonths, batchSize)
    total += deleted
    if (deleted < batchSize) return total
  }
}

export const processRosterRetentionCleanup = async (
  fastify: FastifyInstance,
): Promise<RosterRetentionCleanupResult> => {
  const retentionMonths = env.ROSTER_SOFT_DELETE_RETENTION_MONTHS
  const batchSize = env.ROSTER_SOFT_DELETE_CLEANUP_BATCH_SIZE
  const live = liveSchema()
  const scenario = scenarioSchema()
  const client = await fastify.pgPool.connect()
  const deleted: RosterRetentionCleanupResult['deleted'] = {
    rosterFlight: 0,
    pairingComposition: 0,
    pairingSegment: 0,
    pairingMemo: 0,
    pairing: 0,
    flightComposition: 0,
    flight: 0,
  }

  try {
    const lock = await client.query<{ acquired: boolean }>(
      'select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired',
      [ADVISORY_LOCK_KEY],
    )
    if (!lock.rows[0]?.acquired) return { skipped: true, deleted }

    await client.query('set lock_timeout = \'5s\'')
    await client.query('set statement_timeout = \'10min\'')

    deleted.rosterFlight = await repeatDelete(client, `
      with candidates as (
        select rf.id
        from ${live}.roster_flight rf
        where rf.is_deleted = 1
          and rf.updated_at < now() - ($1::int * interval '1 month')
          and not exists (
            select 1 from ${live}.roster_publish rp
            where rp.roster_flight_id = rf.id
          )
          and not exists (
            select 1 from ${live}.roster_publish_adjust rpa
            where rpa.old_roster_flight_id = rf.id
               or rpa.new_roster_flight_id = rf.id
          )
          and not exists (
            select 1 from ${scenario}.roster_flight srf
            where srf.live_id = rf.id
          )
        order by rf.id
        limit $2::int
      )
      delete from ${live}.roster_flight rf
      using candidates
      where rf.id = candidates.id
    `, retentionMonths, batchSize)

    deleted.pairingComposition = await repeatDelete(client, `
      with candidates as (
        select pc.id
        from ${live}.pairing_composition pc
        join ${live}.pairing p on p.id = pc.pairing_id
        where pc.is_deleted = 1
          and pc.updated_at < now() - ($1::int * interval '1 month')
          and p.is_deleted = 1
          and not exists (select 1 from ${live}.roster_flight rf where rf.pairing_id = pc.pairing_id)
          and not exists (select 1 from ${live}.pairing_segment ps where ps.pairing_id = pc.pairing_id)
        order by pc.id
        limit $2::int
      )
      delete from ${live}.pairing_composition pc
      using candidates
      where pc.id = candidates.id
    `, retentionMonths, batchSize)

    deleted.pairingSegment = await repeatDelete(client, `
      with candidates as (
        select ps.id
        from ${live}.pairing_segment ps
        join ${live}.pairing p on p.id = ps.pairing_id
        where ps.is_deleted = 1
          and ps.updated_at < now() - ($1::int * interval '1 month')
          and p.is_deleted = 1
          and not exists (select 1 from ${live}.roster_flight rf where rf.pairing_id = ps.pairing_id)
        order by ps.id
        limit $2::int
      )
      delete from ${live}.pairing_segment ps
      using candidates
      where ps.id = candidates.id
    `, retentionMonths, batchSize)

    deleted.pairingMemo = await repeatDelete(client, `
      with candidates as (
        select pm.id
        from ${live}.pairing_memo pm
        join ${live}.pairing p on p.id = pm.pairing_id
        where p.is_deleted = 1
          and pm.tmst < now() - ($1::int * interval '1 month')
          and not exists (select 1 from ${live}.roster_flight rf where rf.pairing_id = pm.pairing_id)
          and not exists (select 1 from ${live}.pairing_segment ps where ps.pairing_id = pm.pairing_id)
        order by pm.id
        limit $2::int
      )
      delete from ${live}.pairing_memo pm
      using candidates
      where pm.id = candidates.id
    `, retentionMonths, batchSize)

    deleted.pairing = await repeatDelete(client, `
      with candidates as (
        select p.id
        from ${live}.pairing p
        where p.is_deleted = 1
          and p.updated_at < now() - ($1::int * interval '1 month')
          and not exists (select 1 from ${live}.roster_flight rf where rf.pairing_id = p.id)
          and not exists (select 1 from ${live}.pairing_segment ps where ps.pairing_id = p.id)
          and not exists (select 1 from ${live}.pairing_composition pc where pc.pairing_id = p.id)
          and not exists (select 1 from ${live}.pairing_memo pm where pm.pairing_id = p.id)
          and not exists (select 1 from ${live}.roster_publish rp where rp.pairing_id = p.id)
          and not exists (
            select 1 from ${live}.roster_publish_adjust rpa
            where rpa.old_pairing_id = p.id or rpa.new_pairing_id = p.id
          )
          and not exists (select 1 from ${scenario}.pairing sp where sp.live_id = p.id)
        order by p.id
        limit $2::int
      )
      delete from ${live}.pairing p
      using candidates
      where p.id = candidates.id
    `, retentionMonths, batchSize)

    deleted.flightComposition = await repeatDelete(client, `
      with candidates as (
        select fc.id
        from ${live}.flight_composition fc
        join ${live}.flight f on f.id = fc.flt_id
        where f.is_deleted = 1
          and f.updated_at < now() - ($1::int * interval '1 month')
          and not exists (select 1 from ${live}.pairing_segment ps where ps.flt_id = fc.flt_id)
          and not exists (select 1 from ${live}.roster_flight rf where rf.flt_id = fc.flt_id)
        order by fc.id
        limit $2::int
      )
      delete from ${live}.flight_composition fc
      using candidates
      where fc.id = candidates.id
    `, retentionMonths, batchSize)

    deleted.flight = await repeatDelete(client, `
      with candidates as (
        select f.id
        from ${live}.flight f
        where f.is_deleted = 1
          and f.updated_at < now() - ($1::int * interval '1 month')
          and not exists (select 1 from ${live}.pairing_segment ps where ps.flt_id = f.id)
          and not exists (select 1 from ${live}.flight_composition fc where fc.flt_id = f.id)
          and not exists (select 1 from ${live}.roster_flight rf where rf.flt_id = f.id)
          and not exists (select 1 from ${live}.roster_publish rp where rp.flt_id = f.id)
          and not exists (select 1 from ${scenario}.flight sf where sf.live_id = f.id)
        order by f.id
        limit $2::int
      )
      delete from ${live}.flight f
      using candidates
      where f.id = candidates.id
    `, retentionMonths, batchSize)

    fastify.log.info({ retentionMonths, batchSize, deleted }, 'roster retention cleanup complete')
    return { skipped: false, deleted }
  } finally {
    await client.query('reset lock_timeout').catch(() => undefined)
    await client.query('reset statement_timeout').catch(() => undefined)
    await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [ADVISORY_LOCK_KEY]).catch(() => undefined)
    client.release()
  }
}

export function startRosterRetentionCleanupWorker(fastify: FastifyInstance): { worker: Worker; queue: Queue } {
  const connection = getBullmqRedisConnection()
  const queue = new Queue(withBullmqPrefix(ROSTER_RETENTION_CLEANUP_QUEUE), {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
    },
  })
  attachBullmqErrorLogger(queue, fastify.log, 'roster retention cleanup queue')
  const worker = new Worker(withBullmqPrefix(ROSTER_RETENTION_CLEANUP_QUEUE),
    async () => processRosterRetentionCleanup(fastify),
    { connection, concurrency: 1 },
  )
  worker.on('error', (err) => fastify.log.error({ err: err.message }, 'roster retention cleanup worker error'))
  attachBullmqErrorLogger(worker, fastify.log, 'roster retention cleanup worker')
  return { worker, queue }
}
