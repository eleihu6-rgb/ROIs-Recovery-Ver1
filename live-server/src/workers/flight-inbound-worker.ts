import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { publishWriteRunning, publishWriteTerminal } from '../utils/import-progress-write.js'
import type { FlightImportJob } from '../types/import-jobs.js'

interface FlightJobResult {
  entity: string
  imported: number
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  errors: Array<{ id: string; reason: string }>
}

const rowCount = (result: unknown): number => {
  if (result && typeof result === 'object' && 'rowCount' in result) {
    const value = (result as { rowCount?: unknown }).rowCount
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return 0
}

export async function processFlightImportJob(
  job: FlightImportJob,
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<FlightJobResult> {
  const result: FlightJobResult = {
    entity: 'flight',
    imported: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }
  const incomingInterfaceIds = [...new Set(job.records.map((rec) => rec.interfaceFltId).filter(Boolean))]
  const existingInterfaceIds = new Set<string>()
  if (incomingInterfaceIds.length > 0) {
    const idList = sql.join(incomingInterfaceIds.map((value) => sql`${value}`), sql`, `)
    const existingRows = await db.execute(sql`
      SELECT interface_flt_id
      FROM flight
      WHERE interface_flt_id IN (${idList})
    `)
    for (const row of existingRows.rows as Array<{ interface_flt_id: string | null }>) {
      if (row.interface_flt_id) existingInterfaceIds.add(row.interface_flt_id)
    }
  }

  await db.transaction(async (tx) => {
    const [startDt, endDt] = job.syncRangeDt
    const purgeResult = await tx.execute(sql`
      UPDATE flight
      SET is_deleted = 1,
          updated_by = 'F8_IMPORT',
          updated_at = now()
      WHERE interface_flt_id IS NOT NULL
        AND (scenario_id = 0 OR scenario_id IS NULL)
        AND (is_deleted = 0 OR is_deleted IS NULL)
        AND sch_dep_dt_utc >= ${startDt}::date
        AND sch_dep_dt_utc < (${endDt}::date + interval '1 day')
        AND NOT EXISTS (
          SELECT 1
          FROM pairing_segment ps
          JOIN pairing p ON p.id = ps.pairing_id
          WHERE ps.flt_id = flight.id
            AND (ps.is_deleted = 0 OR ps.is_deleted IS NULL)
            AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
            AND (p.scenario_id = 0 OR p.scenario_id IS NULL)
        )
    `)
    result.deleted += rowCount(purgeResult)

    for (const rec of job.records) {
      try {
        await tx.execute(sql`SAVEPOINT flt_sp`)
        await tx.execute(sql`
          INSERT INTO flight (
            flt_dt, flt_num, dep_arp, arv_arp,
            sch_dep_dt_utc, sch_arv_dt_utc,
            act_dep_dt_utc, act_arv_dt_utc,
            est_dep_dt_utc, est_arv_dt_utc,
            act_take_off_utc, act_touch_down_utc,
            act_dep_arp, act_arv_arp,
            fleet, register, airline,
            ac_owner, pilot_owner, cabin_owner,
            blk_min, flt_type, seg_type, device_code, interface_flt_id,
            flt_dt_utc, flight_flag, flight_assignment, voyage_status, is_locked,
            sch_id, vr_add, is_deleted, manual_comp_flag,
            created_by, updated_by
          ) VALUES (
            ${rec.fltDt}, ${rec.fltNum}, ${rec.depArp}, ${rec.arvArp},
            ${rec.schStrDtUtc}, ${rec.schEndDtUtc},
            ${rec.actStrDtUtc}, ${rec.actEndDtUtc},
            ${rec.estStrDtUtc}, ${rec.estEndDtUtc},
            ${rec.actTakeOffUtc}, ${rec.actTouchDownUtc},
            ${rec.depArp}, ${rec.arvArp},
            ${rec.fleet}, ${rec.tailNum}, ${rec.airline},
            'F8', 'F8', 'F8',
            ${rec.blkMin}, ${rec.fltType}, ${rec.segType}, ${rec.deviceCode}, ${rec.interfaceFltId},
            ${rec.schStrDtUtc}::timestamp::date, 'A', 'FLY', 0, 0,
            0, 0, 0, 0,
            'F8_IMPORT', 'F8_IMPORT'
          )
          ON CONFLICT (interface_flt_id) WHERE interface_flt_id IS NOT NULL
          DO UPDATE SET
            flt_num       = EXCLUDED.flt_num,
            dep_arp       = EXCLUDED.dep_arp,
            arv_arp       = EXCLUDED.arv_arp,
            sch_dep_dt_utc = EXCLUDED.sch_dep_dt_utc,
            sch_arv_dt_utc = EXCLUDED.sch_arv_dt_utc,
            act_dep_dt_utc = EXCLUDED.act_dep_dt_utc,
            act_arv_dt_utc = EXCLUDED.act_arv_dt_utc,
            est_dep_dt_utc = EXCLUDED.est_dep_dt_utc,
            est_arv_dt_utc = EXCLUDED.est_arv_dt_utc,
            act_take_off_utc = EXCLUDED.act_take_off_utc,
            act_touch_down_utc = EXCLUDED.act_touch_down_utc,
            fleet          = EXCLUDED.fleet,
            register       = EXCLUDED.register,
            ac_owner       = EXCLUDED.ac_owner,
            pilot_owner    = EXCLUDED.pilot_owner,
            cabin_owner    = EXCLUDED.cabin_owner,
            seg_type       = EXCLUDED.seg_type,
            device_code    = EXCLUDED.device_code,
            flt_dt_utc     = EXCLUDED.flt_dt_utc,
            flight_assignment = CASE
              WHEN EXCLUDED.flight_flag = 'A' THEN 'FLY'
              ELSE EXCLUDED.flight_assignment
            END,
            blk_min        = EXCLUDED.blk_min,
            is_deleted     = 0,
            updated_by     = 'F8_IMPORT',
            updated_at     = now()
        `)
        await tx.execute(sql`RELEASE SAVEPOINT flt_sp`)
        result.imported++
        result.success++
        if (existingInterfaceIds.has(rec.interfaceFltId)) {
          result.updated++
        } else {
          result.added++
          existingInterfaceIds.add(rec.interfaceFltId)
        }
      } catch (err) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT flt_sp`)
        result.failed++
        result.errors.push({
          id: rec.interfaceFltId,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }
  })

  return result
}

export function startFlightInboundWorker(fastify: FastifyInstance): Worker {
  const redisOpts = getBullmqRedisConnection()

  const worker = new Worker(withBullmqPrefix('connector.flight.inbound'),
    async (job) => {
      const data = job.data as FlightImportJob
      fastify.log.info({ syncId: data.syncId }, 'flight-inbound-worker processing')
      try {
        await publishWriteRunning(data.importId, 'flight')
        const result = await processFlightImportJob(data, fastify.db)
        await publishWriteTerminal(data.importId, 'flight', 'done', undefined, {
          processed: data.records.length,
          total: data.records.length,
          added: result.added,
          updated: result.updated,
          deleted: result.deleted,
          success: result.success,
          failed: result.failed,
          skipped: result.skipped,
        })
        return result
      } catch (err) {
        await publishWriteTerminal(
          data.importId,
          'flight',
          'fail',
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }
    },
    { connection: redisOpts, concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'flight-inbound job failed')
  })
  attachBullmqErrorLogger(worker, fastify.log, 'flight-inbound worker')

  return worker
}
