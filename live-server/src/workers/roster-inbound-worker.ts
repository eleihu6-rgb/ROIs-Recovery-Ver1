import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { invalidate, invalidatePattern } from '../utils/cache.js'
import { publishWriteRunning, publishWriteTerminal } from '../utils/import-progress-write.js'
import type { RosterImportJob } from '../types/import-jobs.js'
import { refreshPairingCompositionFillBulk } from '../utils/composition-fill.js'
import { reconcilePairingActingRanks } from '../utils/roster-acting-rank-reconcile.js'
import { refreshLiveLegalityAndManday } from '../services/manday/manday-operation-service.js'

interface RosterJobResult {
  entity: string
  imported: number
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  warnings: string[]
  errors: Array<{ id: string; reason: string }>
  touchedPairingIds: number[]
}

const assignmentKey = (pairingId: number, crewId: string): string => `${pairingId}:${crewId}`

const rowCount = (result: unknown): number => {
  if (result && typeof result === 'object' && 'rowCount' in result) {
    const value = (result as { rowCount?: unknown }).rowCount
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return 0
}

const rankKey = (rank: string | null | undefined): string => String(rank ?? '').trim().toUpperCase()

const loadRankPositionMap = async (
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<Map<string, string>> => {
  const rows = await db.execute(sql`SELECT rank, position FROM rank_position ORDER BY rank, display_order`)
  const map = new Map<string, string>()
  for (const row of rows.rows as Array<{ rank: string; position: string | null }>) {
    const key = rankKey(row.rank)
    if (key && row.position && !map.has(key)) map.set(key, String(row.position).slice(0, 10))
  }
  return map
}

export async function processRosterImportJob(
  job: RosterImportJob,
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<RosterJobResult> {
  const result: RosterJobResult = {
    entity: 'roster_flight',
    imported: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    warnings: [],
    errors: [],
    touchedPairingIds: [],
  }

  // Build pairing FK lookup: interface_id → pairing.id
  interface PairingRef {
    id: number
    base: string
    isDeleted: boolean
  }
  const pairingRows = await db.execute(sql`
    SELECT id, interface_id, base, is_deleted
    FROM pairing
    WHERE interface_id IS NOT NULL
  `)
  const pairingMap = new Map<string, PairingRef>(
    (pairingRows.rows as Array<{ id: number; interface_id: string; base: string | null; is_deleted: number | null }>)
      .map(r => [
        r.interface_id,
        {
          id: r.id,
          base: r.base ?? '',
          isDeleted: r.is_deleted === 1,
        },
      ])
  )
  const rankPositionMap = await loadRankPositionMap(db)

  // Build pairing_segment lookup: pairing_id → segments
  const allPairingIds = [...new Set(
    job.records
      .map(r => pairingMap.get(r.pairingInterfaceId)?.id)
      .filter((id): id is number => id !== undefined)
  )]

  interface SegRow {
    id: number
    pairing_id: number
    duty_seq: number
    seg_seq: number
    flt_id: number | null
    flt_dt: string | null
    flt_num: string
    dep_arp: string
    arv_arp: string
    sch_str_dt_utc: Date | null
    sch_end_dt_utc: Date | null
    act_str_dt_utc: Date | null
    act_end_dt_utc: Date | null
    flight_sch_str_dt_utc: Date | null
    flight_sch_end_dt_utc: Date | null
    duty_act_rest_min: number | null
    duty_act_credited_minutes: number | null
    duty_sch_credited_minutes: number | null
  }

  const segMap = new Map<number, SegRow[]>()
  if (allPairingIds.length > 0) {
    const pairingIdList = sql.join(allPairingIds.map(v => sql`${v}`), sql`, `)
    const segRows = await db.execute(sql`
      SELECT ps.id, ps.pairing_id, ps.duty_seq, ps.seg_seq, ps.flt_id, ps.flt_dt,
             ps.flt_num, ps.dep_arp, ps.arv_arp,
             ps.sch_str_dt_utc, ps.sch_end_dt_utc, ps.act_str_dt_utc, ps.act_end_dt_utc,
             f.sch_dep_dt_utc AS flight_sch_str_dt_utc,
             f.sch_arv_dt_utc AS flight_sch_end_dt_utc,
             ps.duty_act_rest_min, ps.duty_act_credited_minutes, ps.duty_sch_credited_minutes
      FROM pairing_segment ps
      LEFT JOIN flight f
        ON f.id = ps.flt_id
       AND (f.scenario_id = 0 OR f.scenario_id IS NULL)
       AND (f.is_deleted = 0 OR f.is_deleted IS NULL)
      WHERE ps.pairing_id IN (${pairingIdList})
      ORDER BY ps.pairing_id, ps.duty_seq, ps.seg_seq
    `)
    for (const row of segRows.rows as unknown as SegRow[]) {
      if (!segMap.has(row.pairing_id)) segMap.set(row.pairing_id, [])
      segMap.get(row.pairing_id)!.push(row)
    }
  }

  const touchedPairingIds = new Set<number>()
  const incomingAssignmentKeys = new Set<string>()
  for (const rec of job.records) {
    const pairingId = pairingMap.get(rec.pairingInterfaceId)?.id
    if (pairingId) incomingAssignmentKeys.add(assignmentKey(pairingId, rec.crewId))
  }
  const existingAssignmentKeys = new Set<string>()
  if (allPairingIds.length > 0) {
    const pairingIdList = sql.join(allPairingIds.map(v => sql`${v}`), sql`, `)
    const existingRows = await db.execute(sql`
      SELECT DISTINCT pairing_id, crew_id
      FROM roster_flight
      WHERE pairing_id IN (${pairingIdList})
    `)
    for (const row of existingRows.rows as Array<{ pairing_id: number; crew_id: string }>) {
      const key = assignmentKey(row.pairing_id, row.crew_id)
      if (incomingAssignmentKeys.has(key)) existingAssignmentKeys.add(key)
    }
  }

  await db.transaction(async (tx) => {
    const [startDt, endDt] = job.syncRangeDt
    const reactivatedPairingIds = new Set<number>()
    const staleRosterRows = await tx.execute(sql`
      DELETE FROM roster_flight AS rf
      USING pairing AS p
      WHERE rf.pairing_id = p.id
        AND (p.scenario_id = 0 OR p.scenario_id IS NULL)
        AND p.sch_str_dt_utc >= ${startDt}::date
        AND p.sch_str_dt_utc < (${endDt}::date + interval '1 day')
    `)
    result.deleted += rowCount(staleRosterRows)

    for (const rec of job.records) {
      const pairingRef = pairingMap.get(rec.pairingInterfaceId)
      const pairingId = pairingRef?.id
      if (!pairingId) {
        result.warnings.push(`pairing ${rec.pairingInterfaceId} not found, skipping crew ${rec.crewId}`)
        result.skipped++
        continue
      }

      const segments = segMap.get(pairingId) ?? []
      if (segments.length === 0) {
        result.warnings.push(`pairing ${rec.pairingInterfaceId} (id=${pairingId}) has no segments`)
        result.skipped++
        continue
      }

      try {
        await tx.execute(sql`SAVEPOINT roster_sp`)
        const position = rankPositionMap.get(rankKey(rec.activeRank)) ?? null

        await tx.execute(sql`
          DELETE FROM roster_flight
          WHERE pairing_id = ${pairingId}
            AND crew_id = ${rec.crewId}
        `)

        for (const seg of segments) {
          const label = `${seg.flt_num} ${seg.dep_arp}-${seg.arv_arp}`
          // Duty-level credit is denormalized onto every segment row of the duty.
          // Manday aggregates with MAX(act_credited_minutes) per (crew, pairing, duty_seq).
          const actCredit = seg.duty_act_credited_minutes ?? null
          const schCredit = seg.duty_sch_credited_minutes ?? seg.duty_act_credited_minutes ?? null
          const schStrDtUtc = seg.flight_sch_str_dt_utc ?? seg.sch_str_dt_utc
          const schEndDtUtc = seg.flight_sch_end_dt_utc ?? seg.sch_end_dt_utc
          await tx.execute(sql`
            INSERT INTO roster_flight (
              crew_id, pairing_id, ver, base,
              label, assignment_group, assignment,
              flight_acting_rank, roster_acting_rank, active_rank,
              position, division, seq_order,
              flt_id, flt_dt, duty_seq, seg_seq,
              dep_arp, arv_arp,
              sch_str_dt_utc, sch_end_dt_utc,
              act_str_dt_utc, act_end_dt_utc,
              act_rest_min,
              sch_credited_minutes, act_credited_minutes,
              source, is_requested, is_deleted, is_swapped,
              created_by, updated_by
            ) VALUES (
              ${rec.crewId}, ${pairingId}, 1, ${pairingRef.base},
              ${label}, ${rec.assignmentGroup}, ${rec.assignment},
              ${rec.actingRank}, ${rec.actingRank}, ${rec.activeRank},
              ${position}, ${rec.division}, ${rec.seqOrder},
              ${seg.flt_id}, ${seg.flt_dt}, ${seg.duty_seq}, ${seg.seg_seq},
              ${seg.dep_arp || null}, ${seg.arv_arp || null},
              ${schStrDtUtc}, ${schEndDtUtc},
              ${seg.act_str_dt_utc}, ${seg.act_end_dt_utc},
              ${seg.duty_act_rest_min ?? null},
              ${schCredit}, ${actCredit},
              'IMP', 0, 0, 0,
              'F8_IMPORT', 'F8_IMPORT'
            )
          `)
          result.imported++
          result.success++
        }

        touchedPairingIds.add(pairingId)
        if (pairingRef.isDeleted) reactivatedPairingIds.add(pairingId)
        const key = assignmentKey(pairingId, rec.crewId)
        if (existingAssignmentKeys.has(key)) {
          result.updated++
        } else {
          result.added++
          existingAssignmentKeys.add(key)
        }
        await tx.execute(sql`RELEASE SAVEPOINT roster_sp`)
      } catch (err) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT roster_sp`)
        result.failed++
        result.errors.push({
          id: `${rec.pairingInterfaceId}:${rec.crewId}`,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // A pairing purge can run before roster import and soft-delete a pairing that
    // is still referenced by the incoming roster payload. Restore that same row
    // after its roster segments are successfully materialized so pairing.id stays
    // stable and downstream joins do not see a deleted pairing.
    if (reactivatedPairingIds.size > 0) {
      const pairingIdList = sql.join([...reactivatedPairingIds].map(id => sql`${id}`), sql`, `)
      await tx.execute(sql`
        UPDATE pairing
        SET is_deleted = 0,
            updated_by = 'F8_IMPORT',
            updated_at = now()
        WHERE id IN (${pairingIdList})
          AND is_deleted = 1
      `)
    }
  })

  // Refresh pairing_composition.fill for all pairings whose roster changed
  if (touchedPairingIds.size > 0) {
    const touchedIds = [...touchedPairingIds]
    // Self-heal acting-rank mismatches (total headcount matches plan but a rank is
    // over/under by one) so the corrected acting ranks flow into ro_input and the
    // composition fill balances without blocking optimization.
    const reconcile = await reconcilePairingActingRanks(db, touchedIds, 'F8_IMPORT')
    if (reconcile.correctedRows > 0) {
      result.warnings.push(
        `acting-rank reconcile: ${reconcile.correctedPairings} pairings, ${reconcile.correctedRows} roster rows corrected`,
      )
    }
    await refreshPairingCompositionFillBulk(db, touchedIds, 'F8_IMPORT')
    result.touchedPairingIds = touchedIds
  }

  return result
}

export function startRosterInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(withBullmqPrefix('connector.roster.inbound'),
    async (job) => {
      const data = job.data as RosterImportJob
      fastify.log.info({ syncId: data.syncId }, 'roster-inbound-worker processing')
      try {
        await publishWriteRunning(data.importId, 'roster')
        const result = await processRosterImportJob(data, fastify.db)
        if (fastify.redis && result.touchedPairingIds.length > 0) {
          await Promise.all([
            invalidatePattern(fastify.redis, 'pairing:list:*'),
            invalidate(fastify.redis, ...result.touchedPairingIds.flatMap((id) => [`pairing:${id}`, `pairing:comp:${id}`])),
          ])
        }
        const [startDt, endDt] = data.syncRangeDt
        await refreshLiveLegalityAndManday(fastify, {
          legalityDates: [startDt, endDt],
          startDt,
          endDt,
          updatedBy: 'ROSTER_IMPORT',
        })
        await publishWriteTerminal(data.importId, 'roster', 'done', undefined, {
          processed: result.added + result.updated + result.failed + result.skipped,
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
          'roster',
          'fail',
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }
    },
    { connection: getBullmqRedisConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'roster-inbound job failed')
  })
  attachBullmqErrorLogger(worker, fastify.log, 'roster-inbound worker')

  return worker
}
