import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { invalidate, invalidatePattern } from '../utils/cache.js'
import { publishWriteRunning, publishWriteTerminal } from '../utils/import-progress-write.js'
import type { PairingImportJob, PairingSegmentRecord } from '../types/import-jobs.js'
import { refreshFlightCompositionFill, refreshPairingCompositionFillBulk } from '../utils/composition-fill.js'
import { refreshPairingTafb } from '../services/pairing/pairing-tafb-service.js'

interface PairingJobResult {
  entity: string
  imported: number
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  errors: Array<{ id: string; reason: string }>
  touchedPairingIds: number[]
}

interface FlightLookup {
  id: number
  schStrDtUtc: unknown
  schEndDtUtc: unknown
  fltNum: string
  fltDt: string
  depArp: string
  arvArp: string
}

const rowCount = (result: unknown): number => {
  if (result && typeof result === 'object' && 'rowCount' in result) {
    const value = (result as { rowCount?: unknown }).rowCount
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return 0
}

const returnedIds = (result: unknown): number[] => {
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows)) {
      return rows
        .map((row) => {
          const id = row && typeof row === 'object' && 'id' in row ? (row as { id: unknown }).id : null
          return typeof id === 'string' ? Number(id) : id
        })
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
    }
  }
  return []
}

// Segment assignment → flight_flag for flights synthesized from a pairing segment when no
// real flight matches. Mirrors data-migration f8/pairing.py so block-hour rules (e.g. 8002)
// can compute hours from the segment's own schedule instead of seeing a missing flight link.
const ASSIGNMENT_FLAG: Record<string, string> = { FLY: 'A', DH: 'D', DHD: 'D', SBY: 'B', SIM: 'S' }
const FLIGHT_BEARING_ASSIGNMENTS = new Set(Object.keys(ASSIGNMENT_FLAG))

// Composite fallback key: a flight is uniquely identified by route + scheduled departure.
const flightCompKey = (dep: string, arv: string, schDep: unknown): string | null => {
  if (!dep || !arv || !schDep) return null
  const t = new Date(schDep as string).getTime()
  return Number.isNaN(t) ? null : `${dep}|${arv}|${t}`
}

// Airline-prefixed fltNum → canonical number, e.g. "F8515" → "515", "F82653" → "2653".
// Both the flight feed and the pairing feed carry the "F8" prefix inconsistently, so
// normalize before comparing a segment's fltNum against a resolved flight's.
const normFltNum = (v: unknown): string => {
  const s = String(v ?? '').trim().toUpperCase()
  return /^[A-Z][A-Z0-9]/.test(s) ? s.slice(2) : s
}
const datePart = (v: unknown): string => String(v ?? '').slice(0, 10)
const segHasFlightFields = (seg: PairingSegmentRecord): boolean =>
  Boolean(seg.fltNum && seg.fltDt && seg.depArp && seg.arvArp)
// A fltId-resolved flight is only trusted when it actually corresponds to the segment's
// own fltNum / fltDt / depArp / arvArp. Upstream pairing feeds occasionally attach a wrong
// fltId (e.g. an April segment carrying the id of a January flight) — discard the match so
// the 5-field lookup / synthesis links the correct flight.
const segMatchesFlight = (seg: PairingSegmentRecord, f: FlightLookup): boolean =>
  normFltNum(f.fltNum) === normFltNum(seg.fltNum)
    && datePart(f.fltDt) === datePart(seg.fltDt)
    && String(f.depArp).toUpperCase() === String(seg.depArp).toUpperCase()
    && String(f.arvArp).toUpperCase() === String(seg.arvArp).toUpperCase()

/**
 * Synthesize a flight row from a pairing segment when no existing flight matched (by
 * interfaceFltId, route+sch departure, or the 5-field key). Self-created flights NEVER
 * carry interface_flt_id (so they can't hijack a later real flight's id); the source
 * segment fltId is preserved in origin_interface_flt_id for diagnosis. blk_min comes
 * from the segment's scheduled times so the RO rule engine can compute block hours.
 * Returns the new flight id, or null if the segment lacks the scheduled times needed.
 */
async function synthesizeSegmentFlight(
  tx: NodePgDatabase<Record<string, unknown>>,
  seg: PairingSegmentRecord,
): Promise<number | null> {
  if (!seg.schStrDtUtc || !seg.schEndDtUtc) return null
  // DH/DHD: crew repositioned as passenger — no block hours accrued for this crew.
  const isDh = seg.segAssignment === 'DH' || seg.segAssignment === 'DHD'
  // Prefer actual departure/arrival; fall back to scheduled when actual is not provided.
  const blkStart = seg.actStrDtUtc || seg.schStrDtUtc
  const blkEnd = seg.actEndDtUtc || seg.schEndDtUtc
  const blkMin = isDh
    ? 0
    : Math.max(0, Math.round((new Date(blkEnd).getTime() - new Date(blkStart).getTime()) / 60000))
  const flag = ASSIGNMENT_FLAG[seg.segAssignment] ?? 'A'
  // flight.flt_dt is NOT NULL; fall back to the scheduled-departure date when the segment
  // carries no fltDt.
  const fltDt = seg.fltDt ?? new Date(seg.schStrDtUtc).toISOString().slice(0, 10)
  const res = await tx.execute(sql`
    INSERT INTO flight (
      flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp, fleet, airline,
      blk_min, flt_type, seg_type, interface_flt_id, origin_interface_flt_id,
      flight_flag, flight_assignment, voyage_status, is_locked,
      sch_id, vr_add, is_deleted, manual_comp_flag,
      created_by, updated_by
    ) VALUES (
      ${fltDt}, ${seg.fltNum}, ${seg.depArp}, ${seg.arvArp},
      ${seg.schStrDtUtc}, ${seg.schEndDtUtc}, ${seg.actStrDtUtc}, ${seg.actEndDtUtc},
      ${seg.depArp}, ${seg.arvArp}, ${seg.fleet}, ${seg.airline},
      ${blkMin}, 'S', 'J', NULL, ${seg.interfaceFltId ?? null},
      ${flag}, ${seg.segAssignment}, 0, 0,
      0, 0, 0, 0,
      'F8_IMPORT', 'F8_IMPORT'
    )
    RETURNING id
  `)
  return (res.rows as Array<{ id: number }>)[0]?.id ?? null
}

export async function processPairingImportJob(
  job: PairingImportJob,
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<PairingJobResult> {
  const result: PairingJobResult = {
    entity: 'pairing',
    imported: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    touchedPairingIds: [],
  }

  // Build flight FK lookup: interfaceFltId → flight.id
  const fltRows = await db.execute(sql`
    SELECT id, interface_flt_id, sch_dep_dt_utc, sch_arv_dt_utc, flt_num, flt_dt, dep_arp, arv_arp
    FROM flight
    WHERE interface_flt_id IS NOT NULL
  `)
  const fltMap = new Map<string, FlightLookup>(
    (fltRows.rows as Array<{
      id: number; interface_flt_id: string; sch_dep_dt_utc: unknown; sch_arv_dt_utc: unknown
      flt_num: string | null; flt_dt: string | null; dep_arp: string | null; arv_arp: string | null
    }>)
      .map(r => [r.interface_flt_id, {
        id: r.id, schStrDtUtc: r.sch_dep_dt_utc, schEndDtUtc: r.sch_arv_dt_utc,
        fltNum: r.flt_num ?? '', fltDt: r.flt_dt ?? '', depArp: r.dep_arp ?? '', arvArp: r.arv_arp ?? '',
      }])
  )

  // Composite fallback lookup: route + scheduled departure → flight.id, for segments whose
  // interfaceFltId is absent or doesn't match an imported flight.
  const compRows = await db.execute(sql`
    SELECT id, dep_arp, arv_arp, flt_num, flt_dt, sch_dep_dt_utc, sch_arv_dt_utc FROM flight
    WHERE sch_dep_dt_utc IS NOT NULL AND (scenario_id = 0 OR scenario_id IS NULL)
      AND (is_deleted = 0 OR is_deleted IS NULL)
  `)
  const fltCompMap = new Map<string, FlightLookup>()
  for (const r of compRows.rows as Array<{ id: number; dep_arp: string; arv_arp: string; flt_num: string | null; flt_dt: string | null; sch_dep_dt_utc: unknown; sch_arv_dt_utc: unknown }>) {
    const k = flightCompKey(r.dep_arp, r.arv_arp, r.sch_dep_dt_utc)
    if (k && !fltCompMap.has(k)) {
      fltCompMap.set(k, { id: r.id, schStrDtUtc: r.sch_dep_dt_utc, schEndDtUtc: r.sch_arv_dt_utc, fltNum: r.flt_num ?? '', fltDt: r.flt_dt ?? '', depArp: r.dep_arp ?? '', arvArp: r.arv_arp ?? '' })
    }
  }

  // 5-field key lookup: (airline, flt_dt, flt_num, dep_arp, arv_arp) over ALL live flights
  // (connector-imported AND previously synthesized). 3rd fallback before synthesis: reuse an
  // existing flight for the same date/flight/route instead of creating a new one. Includes
  // synthesized flights (NULL interface_flt_id) so re-imports don't duplicate them.
  const flt5Rows = await db.execute(sql`
    SELECT id, airline, flt_dt, flt_num, dep_arp, arv_arp, sch_dep_dt_utc, sch_arv_dt_utc FROM flight
    WHERE (scenario_id = 0 OR scenario_id IS NULL)
      AND (is_deleted = 0 OR is_deleted IS NULL)
  `)
  const flt5Map = new Map<string, FlightLookup>()
  for (const r of flt5Rows.rows as Array<{ id: number; airline: string; flt_dt: string; flt_num: string; dep_arp: string; arv_arp: string; sch_dep_dt_utc: unknown; sch_arv_dt_utc: unknown }>) {
    const k = `${r.airline}|${String(r.flt_dt).slice(0, 10)}|${r.flt_num}|${r.dep_arp}|${r.arv_arp}`
    if (k && !flt5Map.has(k)) {
      flt5Map.set(k, { id: r.id, schStrDtUtc: r.sch_dep_dt_utc, schEndDtUtc: r.sch_arv_dt_utc, fltNum: r.flt_num ?? '', fltDt: r.flt_dt ?? '', depArp: r.dep_arp ?? '', arvArp: r.arv_arp ?? '' })
    }
  }

  const incomingInterfaceIds = [...new Set(job.pairings.map((pairing) => pairing.interfaceId).filter(Boolean))]
  const existingInterfaceIds = new Set<string>()
  if (incomingInterfaceIds.length > 0) {
    const idList = sql.join(incomingInterfaceIds.map((value) => sql`${value}`), sql`, `)
    const existingRows = await db.execute(sql`
      SELECT interface_id
      FROM pairing
      WHERE interface_id IN (${idList})
    `)
    for (const row of existingRows.rows as Array<{ interface_id: string | null }>) {
      if (row.interface_id) existingInterfaceIds.add(row.interface_id)
    }
  }

  const importedFltIds = new Set<number>()
  const importedPairingIds: number[] = []
  const deletedPairingIds: number[] = []

  await db.transaction(async (tx) => {
    const [startDt, endDt] = job.syncRangeDt
    if (job.purgeStalePairings || incomingInterfaceIds.length === 0) {
      const snapshotInterfaceIds = job.snapshotPairingInterfaceIds ?? incomingInterfaceIds
      const snapshotExclusion = snapshotInterfaceIds.length > 0
        ? sql`AND (interface_id IS NULL OR interface_id NOT IN (${sql.join(snapshotInterfaceIds.map((value) => sql`${value}`), sql`, `)}))`
        : sql``
      const stalePairings = await tx.execute(sql`
        UPDATE pairing
        SET is_deleted = 1,
            updated_by = 'F8_IMPORT',
            updated_at = now()
        WHERE (scenario_id = 0 OR scenario_id IS NULL)
          AND (is_deleted = 0 OR is_deleted IS NULL)
          AND sch_str_dt_utc >= ${startDt}::date
          AND sch_str_dt_utc < (${endDt}::date + interval '1 day')
          ${snapshotExclusion}
          AND NOT EXISTS (
            SELECT 1
            FROM roster_flight rf
            WHERE rf.pairing_id = pairing.id
              AND rf.is_deleted = 0
          )
        RETURNING id
      `)
      result.deleted += rowCount(stalePairings)
      deletedPairingIds.push(...returnedIds(stalePairings))
    }

    for (const pairing of job.pairings) {
      try {
        await tx.execute(sql`SAVEPOINT pair_sp`)

        // Upsert pairing
        const pairingRes = await tx.execute(sql`
          INSERT INTO pairing (
            pairing_label, filiale, division, base, fleet,
            assignment_group, assignment,
            sch_str_dt_utc, sch_end_dt_utc,
            act_str_dt_utc, act_end_dt_utc,
            duration_days, tafb,
            duty_count, seg_count,
            comments,
            per_diem_mins, per_diem_mins_adjustment,
            wp_mins, wp_mins_adjustment, fm_lh_per_diem_mins,
            source, interface_id, pairing_dt,
            created_by, updated_by
          ) VALUES (
            ${pairing.pairingLabel}, ${job.filiale}, ${pairing.division},
            ${pairing.base}, ${pairing.fleet},
            ${pairing.assignmentGroup}, ${pairing.assignment},
            ${pairing.schStrDtUtc}, ${pairing.schEndDtUtc},
            ${pairing.actStrDtUtc}, ${pairing.actEndDtUtc},
            ${pairing.durationDays}, ${pairing.durationDays},
            ${pairing.duties.length},
            ${pairing.duties.reduce((sum, d) => sum + d.segments.length, 0)},
            ${pairing.comments},
            ${pairing.perDiemMins}, ${pairing.perDiemMinsAdjustment},
            ${pairing.wpMins}, ${pairing.wpMinsAdjustment}, ${pairing.fmLhPerDiemMins},
            ${pairing.source}, ${pairing.interfaceId},
            COALESCE((
              SELECT ((${pairing.actStrDtUtc}::timestamp AT TIME ZONE 'UTC') AT TIME ZONE valid_timezone.name)::date
              FROM airport base_airport
              JOIN pg_timezone_names valid_timezone
                ON valid_timezone.name = NULLIF(BTRIM(base_airport.zone_id), '')
              WHERE base_airport.airport = ${pairing.base}
              LIMIT 1
            ), ${pairing.actStrDtUtc}::timestamp::date),
            'F8_IMPORT', 'F8_IMPORT'
          )
          ON CONFLICT (interface_id) WHERE interface_id IS NOT NULL
          DO UPDATE SET
            pairing_label  = EXCLUDED.pairing_label,
            base           = EXCLUDED.base,
            fleet          = EXCLUDED.fleet,
            sch_str_dt_utc = EXCLUDED.sch_str_dt_utc,
            sch_end_dt_utc = EXCLUDED.sch_end_dt_utc,
            act_str_dt_utc = EXCLUDED.act_str_dt_utc,
            act_end_dt_utc = EXCLUDED.act_end_dt_utc,
            duration_days  = EXCLUDED.duration_days,
            duty_count     = EXCLUDED.duty_count,
            seg_count      = EXCLUDED.seg_count,
            comments       = EXCLUDED.comments,
            per_diem_mins  = EXCLUDED.per_diem_mins,
            per_diem_mins_adjustment = EXCLUDED.per_diem_mins_adjustment,
            wp_mins        = EXCLUDED.wp_mins,
            wp_mins_adjustment = EXCLUDED.wp_mins_adjustment,
            fm_lh_per_diem_mins = EXCLUDED.fm_lh_per_diem_mins,
            pairing_dt     = EXCLUDED.pairing_dt,
            is_deleted     = 0,
            updated_by     = 'F8_IMPORT',
            updated_at     = now()
          RETURNING id
        `)

        const pairingId = (pairingRes.rows as Array<{ id: number }>)[0].id

        // Delete old segments then re-insert
        await tx.execute(sql`DELETE FROM pairing_segment WHERE pairing_id = ${pairingId}`)

        const segFltIds: number[] = []
        for (const duty of pairing.duties) {
          for (const seg of duty.segments) {
            // 1) primary: interfaceFltId → flight.id — but only trust the resolved flight if it
            //    actually matches the segment's own fltNum/fltDt/depArp/arvArp. Upstream pairing
            //    feeds sometimes attach a wrong fltId (e.g. an April segment carrying the id of
            //    a January flight); discard that match so the 5-field lookup / synthesis links
            //    the correct flight instead.
            let flightMatch = seg.interfaceFltId ? (fltMap.get(seg.interfaceFltId) ?? null) : null
            if (flightMatch && segHasFlightFields(seg) && !segMatchesFlight(seg, flightMatch)) {
              flightMatch = null
            }
            let fltId = flightMatch?.id ?? null
            // 2) fallback: route + scheduled departure
            if (!fltId) {
              const ck = flightCompKey(seg.depArp, seg.arvArp, seg.schStrDtUtc)
              if (ck) flightMatch = fltCompMap.get(ck) ?? null
              fltId = flightMatch?.id ?? null
            }
            // 3) fallback: 5-field key — connector-imported flight matched by (airline, flt_dt, flt_num, dep_arp, arv_arp)
            //    Prevents creating duplicate backfill flights when the flight connector already imported the flight.
            if (!fltId && seg.airline && seg.fltNum && seg.fltDt) {
              const k5 = `${seg.airline}|${seg.fltDt.slice(0, 10)}|${seg.fltNum}|${seg.depArp}|${seg.arvArp}`
              flightMatch = flt5Map.get(k5) ?? null
              fltId = flightMatch?.id ?? null
            }
            // 4) synthesize a flight when none matched and the segment is a real activity,
            //    so block-hour rules see its hours instead of a broken link. Register the
            //    new id so later identical segments reuse it.
            if (!fltId && FLIGHT_BEARING_ASSIGNMENTS.has(seg.segAssignment)) {
              fltId = await synthesizeSegmentFlight(tx, seg)
              if (fltId) {
                flightMatch = {
                  id: fltId, schStrDtUtc: seg.schStrDtUtc, schEndDtUtc: seg.schEndDtUtc,
                  fltNum: seg.fltNum ?? '', fltDt: seg.fltDt ?? '', depArp: seg.depArp ?? '', arvArp: seg.arvArp ?? '',
                }
                // Self-created flight has NO interface_flt_id — never register it in the
                // interface map, or later segments referencing that id would wrongly link
                // to this synthesized flight instead of the real one.
                const ck = flightCompKey(seg.depArp, seg.arvArp, seg.schStrDtUtc)
                if (ck) fltCompMap.set(ck, flightMatch)
                if (seg.airline && seg.fltNum && seg.fltDt) {
                  const k5 = `${seg.airline}|${seg.fltDt.slice(0, 10)}|${seg.fltNum}|${seg.depArp}|${seg.arvArp}`
                  if (!flt5Map.has(k5)) flt5Map.set(k5, flightMatch)
                }
              }
            }
            if (fltId) segFltIds.push(fltId)
            const segmentSchStrDtUtc = flightMatch?.schStrDtUtc ?? seg.schStrDtUtc
            const segmentSchEndDtUtc = flightMatch?.schEndDtUtc ?? seg.schEndDtUtc
            await tx.execute(sql`
              INSERT INTO pairing_segment (
                pairing_id, duty_seq, seg_seq,
                duty_str_arp, duty_end_arp,
                duty_sch_str_dt_utc, duty_sch_end_dt_utc,
                duty_act_str_dt_utc, duty_act_end_dt_utc,
                duty_acc_state,
                duty_fdp_discretion_min, duty_max_fdp_min,
                duty_sch_rest_min, duty_act_rest_min, duty_layover_nits,
                duty_sch_flt_min, duty_sch_fdp_min,
                duty_act_flt_min, duty_act_fdp_min, duty_act_duty_min,
                duty_act_credited_minutes, duty_brief_min, duty_debrief_min, duty_comments,
                pickup_start_utc, pickup_end_utc,
                brief_start_utc, brief_end_utc,
                debrief_start_utc, debrief_end_utc,
                dropoff_start_utc, dropoff_end_utc,
                flt_id, flt_num, flt_dt, airline, dep_arp, arv_arp, fleet_seg,
                sch_str_dt_utc, sch_end_dt_utc,
                act_str_dt_utc, act_end_dt_utc,
                seg_assignment, is_long_transit,
                created_by, updated_by
              ) VALUES (
                ${pairingId}, ${duty.dutySeq}, ${seg.segSeq},
                ${duty.strArp}, ${duty.endArp},
                ${duty.schStrDtUtc}, ${duty.schEndDtUtc},
                ${duty.actStrDtUtc}, ${duty.actEndDtUtc},
                'D',
                ${duty.fdpDiscretionMin}, ${duty.maxFdpMin},
                ${duty.minRestMin}, ${duty.actRestMin}, ${duty.layoverNits},
                ${duty.planFlightMin}, ${duty.planFdpMin},
                ${duty.actFlightMin}, ${duty.actFdpMin}, ${duty.actualDutyMinutes},
                ${duty.creditedMinutes}, ${duty.briefMin}, ${duty.debriefMin}, ${duty.comments},
                ${duty.pickupStartUtc ?? null}, ${duty.pickupEndUtc ?? null},
                ${duty.briefStartUtc ?? null}, ${duty.briefEndUtc ?? null},
                ${duty.debriefStartUtc ?? null}, ${duty.debriefEndUtc ?? null},
                ${duty.dropoffStartUtc ?? null}, ${duty.dropoffEndUtc ?? null},
                ${fltId}, ${seg.fltNum}, ${seg.fltDt ?? null}, ${seg.airline},
                ${seg.depArp}, ${seg.arvArp}, ${seg.fleet},
                ${segmentSchStrDtUtc}, ${segmentSchEndDtUtc},
                ${seg.actStrDtUtc}, ${seg.actEndDtUtc},
                ${seg.segAssignment}, ${seg.isLongTransit},
                'F8_IMPORT', 'F8_IMPORT'
              )
            `)
          }
        }

        // Delete old compositions then re-insert from import data
        await tx.execute(sql`DELETE FROM pairing_composition WHERE pairing_id = ${pairingId}`)
        for (const comp of (pairing.compositions ?? [])) {
          if (!comp.rank || comp.plan <= 0) continue
          await tx.execute(sql`
            INSERT INTO pairing_composition (pairing_id, division, acting_rank, plan, is_deleted, created_by, updated_by)
            VALUES (${pairingId}, ${pairing.division}, ${comp.rank}, ${comp.plan}, 0, 'F8_IMPORT', 'F8_IMPORT')
          `)
        }

        await refreshPairingTafb(tx, pairingId, 'F8_IMPORT')

        // Collect ids for post-transaction fill refresh
        importedPairingIds.push(pairingId)
        for (const fltId of segFltIds) importedFltIds.add(fltId)

        await tx.execute(sql`RELEASE SAVEPOINT pair_sp`)
        result.imported++
        result.success++
        if (existingInterfaceIds.has(pairing.interfaceId)) {
          result.updated++
        } else {
          result.added++
          existingInterfaceIds.add(pairing.interfaceId)
        }
      } catch (err) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT pair_sp`)
        result.failed++
        result.errors.push({
          id: pairing.interfaceId,
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }
  })

  // Refresh pairing_composition.fill (crew count per rank) for all imported pairings
  if (importedPairingIds.length > 0) {
    await refreshPairingCompositionFillBulk(db, importedPairingIds, 'F8_IMPORT')
  }
  result.touchedPairingIds = [...new Set([...importedPairingIds, ...deletedPairingIds])]

  // Refresh flight_composition.fill for all flights whose pairing plans changed
  if (importedFltIds.size > 0) {
    await refreshFlightCompositionFill(db, [...importedFltIds], 'F8_IMPORT')
      .catch(err => console.error('refreshFlightCompositionFill failed after pairing import', err))
  }

  return result
}

export function startPairingInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(withBullmqPrefix('connector.pairing.inbound'),
    async (job) => {
      const data = job.data as PairingImportJob
      fastify.log.info({ syncId: data.syncId }, 'pairing-inbound-worker processing')
      try {
        await publishWriteRunning(data.importId, 'pairing')
        const result = await processPairingImportJob(data, fastify.db)
        if (fastify.redis && result.touchedPairingIds.length > 0) {
          await Promise.all([
            invalidatePattern(fastify.redis, 'pairing:list:*'),
            invalidate(fastify.redis, ...result.touchedPairingIds.flatMap((id) => [`pairing:${id}`, `pairing:comp:${id}`])),
          ])
        }
        await publishWriteTerminal(data.importId, 'pairing', 'done', undefined, {
          processed: data.pairings.length,
          total: data.pairings.length,
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
          'pairing',
          'fail',
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }
    },
    { connection: getBullmqRedisConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'pairing-inbound job failed')
  })
  attachBullmqErrorLogger(worker, fastify.log, 'pairing-inbound worker')

  return worker
}
