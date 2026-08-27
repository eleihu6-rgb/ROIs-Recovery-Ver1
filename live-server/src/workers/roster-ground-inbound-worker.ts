import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import { publishWriteRunning, publishWriteTerminal } from '../utils/import-progress-write.js'
import type {
  RosterGroundImportJob, RosterGroundRecord, SingleLegFlightRecord,
} from '../types/import-jobs.js'
import { refreshLiveLegalityAndManday } from '../services/manday/manday-operation-service.js'

interface RosterGroundJobResult {
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
}

const SINGLE_LEG_CHECKIN_MIN = 60 // 1-hour check-in (brief) before departure

// No rank in rosterGround payload: P→CA, else FA.
const divisionDefaultRank = (division: string): string =>
  division.trim().toUpperCase().startsWith('P') ? 'CA' : 'FA'

const rankKey = (rank: string | null | undefined): string => String(rank ?? '').trim().toUpperCase()

const rankAtKey = (crewId: string, startUtc: string | Date): string => {
  const start = startUtc instanceof Date ? startUtc.toISOString() : new Date(startUtc).toISOString()
  return `${crewId}|${start}`
}

const UTC_DAY_MS = 24 * 60 * 60 * 1000

const dateOnlyUtcMs = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

const isInsideSyncWindow = (record: RosterGroundRecord, range: [string, string]): boolean => {
  const startMs = dateOnlyUtcMs(range[0])
  const endExclusiveMs = dateOnlyUtcMs(range[1]) + UTC_DAY_MS
  const recordStartMs = Date.parse(record.strDtUtc)
  if (!Number.isFinite(recordStartMs)) return false
  return recordStartMs >= startMs && recordStartMs < endExclusiveMs
}

interface FlightRow {
  id: number
  interface_flt_id: string | null
  flt_num: string
  dep_arp: string
  arv_arp: string
  flt_dt: string
  fleet: string
  airline: string
  sch_dep_dt_utc: string | Date
  sch_arv_dt_utc: string | Date
  act_dep_dt_utc: string | Date | null
  act_arv_dt_utc: string | Date | null
}

const iso = (v: string | Date | null | undefined): string | null =>
  v ? new Date(v).toISOString() : null

/**
 * 5-tuple business key for matching rosterGround single-leg flights against the
 * `flight` table: airline / flt_dt / dep_arp / arv_arp / flt_num.
 *
 * The RosterGround import splits the 2-char airline prefix off the F8 flight
 * label up-front (see connector-server transform), so `airline` here is the
 * prefix and `fltNum` is the post-prefix part. Matching on this 5-tuple lets us
 * update only the act_* times of an already-imported flight without touching
 * its sch_* times.
 */
const flightLookupKey = (airline: string, fltDt: string, depArp: string, arvArp: string, fltNum: string): string =>
  `${airline}|${fltDt}|${depArp}|${arvArp}|${fltNum}`


const rowCount = (result: unknown): number => {
  if (result && typeof result === 'object' && 'rowCount' in result) {
    const value = (result as { rowCount?: unknown }).rowCount
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }
  return 0
}

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

const loadEffectiveGroundRanks = async (
  db: NodePgDatabase<Record<string, unknown>>,
  records: RosterGroundRecord[],
): Promise<Map<string, string>> => {
  const map = new Map<string, string>()
  const chunks = 1000
  for (let i = 0; i < records.length; i += chunks) {
    const chunk = records.slice(i, i + chunks)
    if (chunk.length === 0) continue
    const values = chunk.map((record) => sql`(${record.crewId}, ${record.strDtUtc}::timestamptz)`)
    const rows = await db.execute(sql`
      WITH incoming(crew_id, task_start) AS (
        VALUES ${sql.join(values, sql`, `)}
      )
      SELECT i.crew_id, i.task_start, cr.rank
      FROM incoming AS i
      LEFT JOIN LATERAL (
        SELECT rank
        FROM crew_rank
        WHERE crew_id = i.crew_id
          AND eff_dt <= i.task_start
          AND (exp_dt IS NULL OR exp_dt > i.task_start)
        ORDER BY eff_dt DESC
        LIMIT 1
      ) AS cr ON true
    `)
    for (const row of rows.rows as Array<{ crew_id: string; task_start: string | Date; rank: string | null }>) {
      if (row.rank) map.set(rankAtKey(row.crew_id, row.task_start), row.rank)
    }
  }
  return map
}

/**
 * Insert non-Flight ground tasks as roster_flight rows with pairing_id = NULL.
 * Mirrors the data-migration behaviour: physically replace F8 ground rows in
 * the sync date range, then insert the fetched set.
 */
async function importGroundRecords(
  tx: NodePgDatabase<Record<string, unknown>>,
  records: RosterGroundRecord[],
  range: [string, string],
  effectiveGroundRanks: Map<string, string>,
  rankPositionMap: Map<string, string>,
  result: RosterGroundJobResult,
): Promise<void> {
  const [startDt, endDt] = range
  // Purge F8 ground rows whose UTC start falls inside the sync window (handles cancellations
  // that dropped out of the new payload).
  const rangeDelete = await tx.execute(sql`
    DELETE FROM roster_flight
    WHERE pairing_id IS NULL
      AND sch_str_dt_utc >= ${startDt}::date
      AND sch_str_dt_utc < (${endDt}::date + interval '1 day')
  `)
  result.deleted += rowCount(rangeDelete)

  // Idempotency guard. The range DELETE above is scoped by sch_str_dt_utc, so it MISSES
  // records whose UTC start lands just outside [startDt,endDt] — e.g. a local-midnight
  // day-off whose UTC sch_str is the prior day (2025-12-31 08:00Z for a Jan-1 local DO).
  // Those escaped the delete yet were re-INSERTed every run → stacked duplicates. Also delete
  // any existing ground row that exactly matches an incoming record key (crew + assignment
  // + window) so a re-import replaces it regardless of the range boundary.
  // The full material import owns the selected period, so this replaces any existing
  // ground row with the same natural key regardless of provenance.
  const exactDeleteRecords = records.filter((record) => !isInsideSyncWindow(record, range))
  if (exactDeleteRecords.length > 0) {
    const KEY_CHUNK = 1000
    await tx.execute(sql`
      CREATE TEMP TABLE IF NOT EXISTS tmp_roster_ground_import_keys (
        crew_id text NOT NULL,
        assignment text NOT NULL,
        sch_str_dt_utc timestamp NOT NULL,
        sch_end_dt_utc timestamp NOT NULL
      ) ON COMMIT DROP
    `)

    for (let i = 0; i < exactDeleteRecords.length; i += KEY_CHUNK) {
      const chunk = exactDeleteRecords.slice(i, i + KEY_CHUNK)
      const keys = chunk.map(
      (r) => sql`(${r.crewId}, ${r.assignment}, ${r.strDtUtc}::timestamp, ${r.endDtUtc}::timestamp)`,
      )

      await tx.execute(sql`TRUNCATE tmp_roster_ground_import_keys`)
      await tx.execute(sql`
        INSERT INTO tmp_roster_ground_import_keys (
          crew_id, assignment, sch_str_dt_utc, sch_end_dt_utc
        ) VALUES ${sql.join(keys, sql`, `)}
      `)
      const keyedDelete = await tx.execute(sql`
        DELETE FROM roster_flight AS rf
        USING tmp_roster_ground_import_keys AS k
        WHERE rf.pairing_id IS NULL
          AND rf.crew_id = k.crew_id
          AND rf.assignment = k.assignment
          AND rf.sch_str_dt_utc = k.sch_str_dt_utc
          AND rf.sch_end_dt_utc = k.sch_end_dt_utc
      `)
      result.deleted += rowCount(keyedDelete)
    }
  }

  for (const rec of records) {
    try {
      await tx.execute(sql`SAVEPOINT rg_sp`)
      const activeRank = effectiveGroundRanks.get(rankAtKey(rec.crewId, rec.strDtUtc))
        ?? divisionDefaultRank(rec.division)
      const position = rankPositionMap.get(rankKey(activeRank)) ?? null
      await tx.execute(sql`
        INSERT INTO roster_flight (
          crew_id, pairing_id, base, label,
          assignment_group, assignment, role,
          division, flight_acting_rank, roster_acting_rank,
          active_rank, position,
          sch_str_dt_utc, sch_end_dt_utc,
          act_str_dt_utc, act_end_dt_utc,
          dep_arp, arv_arp, sch_credited_minutes, act_credited_minutes, dp_min,
          source, is_requested, is_deleted, is_swapped,
          created_by, updated_by
        ) VALUES (
          ${rec.crewId}, NULL, ${rec.depArp || ''}, ${rec.label},
          ${rec.assignmentGroup}, ${rec.assignment}, ${rec.role},
          ${rec.division}, ${activeRank}, ${activeRank},
          ${activeRank}, ${position},
          ${rec.strDtUtc}, ${rec.endDtUtc},
          ${rec.strDtUtc}, ${rec.endDtUtc},
          ${rec.depArp || null}, ${rec.arvArp || null}, ${rec.credit ?? null}, ${rec.credit ?? null},
          ROUND(EXTRACT(EPOCH FROM (${rec.endDtUtc}::timestamptz - ${rec.strDtUtc}::timestamptz)) / 60
            * COALESCE((SELECT dp_pct FROM assignment WHERE assignment = ${rec.assignment} LIMIT 1), 0)),
          'IMP', 0, 0, 0,
          'F8_IMPORT', 'F8_IMPORT'
        )
      `)
      await tx.execute(sql`RELEASE SAVEPOINT rg_sp`)
      result.imported++
      result.added++
      result.success++
    } catch (err) {
      await tx.execute(sql`ROLLBACK TO SAVEPOINT rg_sp`)
      result.failed++
      result.errors.push({
        id: `${rec.crewId}:${rec.assignment}:${rec.strDtUtc}`,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Build a 5-tuple key for a single-leg rosterGround record.
 * The F8 rosterGround import path splits the airline prefix off the label so
 * that `rec.airline` and `rec.label` are the canonical 2-char airline + numeric
 * part. When the split failed (codeshare / malformed label) the transform falls
 * back to the configured filiale for `airline` and keeps the raw label.
 */
const singleLegLookupKey = (rec: SingleLegFlightRecord): string | null => {
  const depArp = (rec.startLocation || '').toUpperCase()
  const arvArp = (rec.endLocation || '').toUpperCase()
  if (!rec.label || !rec.strDtUtc || !depArp || !arvArp || !rec.airline) return null
  const fltDt = rec.strDtUtc.slice(0, 10)
  return flightLookupKey(rec.airline, fltDt, depArp, arvArp, rec.label)
}

/**
 * Batch-load flight rows that match any of the 5-tuples derived from the
 * incoming single-leg records. Returns a map keyed by the 5-tuple so the
 * downstream resolver does a single O(1) lookup per record.
 */
async function loadFlightLookups(
  tx: NodePgDatabase<Record<string, unknown>>,
  records: SingleLegFlightRecord[],
): Promise<{ byKey: Map<string, FlightRow> }> {
  const byKey = new Map<string, FlightRow>()

  const tuples: Array<{ airline: string; fltDt: string; depArp: string; arvArp: string; fltNum: string }> = []
  for (const rec of records) {
    const depArp = (rec.startLocation || '').toUpperCase()
    const arvArp = (rec.endLocation || '').toUpperCase()
    if (!rec.label || !rec.strDtUtc || !depArp || !arvArp || !rec.airline) continue
    tuples.push({ airline: rec.airline, fltDt: rec.strDtUtc.slice(0, 10), depArp, arvArp, fltNum: rec.label })
  }
  if (tuples.length === 0) return { byKey }

  const airlines = [...new Set(tuples.map(t => t.airline))]
  const fltDts = [...new Set(tuples.map(t => t.fltDt))]
  const depArps = [...new Set(tuples.map(t => t.depArp))]
  const arvArps = [...new Set(tuples.map(t => t.arvArp))]
  const fltNums = [...new Set(tuples.map(t => t.fltNum))]

  const aList = sql.join(airlines.map(v => sql`${v}`), sql`, `)
  const dList = sql.join(fltDts.map(v => sql`${v}`), sql`, `)
  const depList = sql.join(depArps.map(v => sql`${v}`), sql`, `)
  const arvList = sql.join(arvArps.map(v => sql`${v}`), sql`, `)
  const nList = sql.join(fltNums.map(v => sql`${v}`), sql`, `)

  const rows = await tx.execute(sql`
    SELECT id, interface_flt_id, flt_num, dep_arp, arv_arp, flt_dt, fleet, airline,
           sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc
    FROM flight
    WHERE airline IN (${aList})
      AND flt_dt   IN (${dList})
      AND dep_arp  IN (${depList})
      AND arv_arp  IN (${arvList})
      AND flt_num  IN (${nList})
      AND (scenario_id = 0 OR scenario_id IS NULL)
      AND (is_deleted = 0 OR is_deleted IS NULL)
  `)
  for (const r of ((rows as { rows?: unknown[] } | undefined)?.rows ?? []) as unknown as FlightRow[]) {
    const key = flightLookupKey(r.airline, r.flt_dt, r.dep_arp, r.arv_arp, r.flt_num)
    if (!byKey.has(key)) byKey.set(key, r)
  }
  return { byKey }
}

function resolveFlight(
  rec: SingleLegFlightRecord,
  byKey: Map<string, FlightRow>,
): FlightRow | null {
  const key = singleLegLookupKey(rec)
  if (!key) return null
  return byKey.get(key) ?? null
}

/**
 * Materialize single-leg (pairingId=0) Flight assignments into a synthetic
 * pairing + pairing_segment + roster_flight per crew, grouped by resolved flight.
 * Idempotent via interface_id = 'GND-{interfaceFltId}'.
 */
async function importSingleLegFlights(
  tx: NodePgDatabase<Record<string, unknown>>,
  records: SingleLegFlightRecord[],
  filiale: string,
  range: [string, string],
  rankPositionMap: Map<string, string>,
  result: RosterGroundJobResult,
): Promise<void> {
  const [startDt, endDt] = range
  const staleRows = await tx.execute(sql`
    SELECT id
    FROM pairing
    WHERE created_by = 'F8_IMPORT'
      AND source = 'F8'
      AND interface_id LIKE 'GND-%'
      AND (scenario_id = 0 OR scenario_id IS NULL)
      AND sch_str_dt_utc >= ${startDt}::date
      AND sch_str_dt_utc < (${endDt}::date + interval '1 day')
  `)
  const stalePairingIds = ((staleRows.rows ?? []) as Array<{ id: number }>).map((row) => row.id)
  if (stalePairingIds.length > 0) {
    const staleIdList = sql.join(stalePairingIds.map((id) => sql`${id}`), sql`, `)
    await tx.execute(sql`DELETE FROM roster_flight WHERE pairing_id IN (${staleIdList}) AND created_by = 'F8_IMPORT'`)
    await tx.execute(sql`DELETE FROM pairing_segment WHERE pairing_id IN (${staleIdList})`)
    await tx.execute(sql`DELETE FROM pairing_composition WHERE pairing_id IN (${staleIdList})`)
    const deletedPairings = await tx.execute(sql`DELETE FROM pairing WHERE id IN (${staleIdList})`)
    result.deleted += rowCount(deletedPairings)
  }

  if (records.length === 0) return

  const { byKey } = await loadFlightLookups(tx, records)

  // Group resolved crew records by the real flight (keyed by interface_flt_id
  // so we can build one synthetic pairing per flight).
  // For an existing flight we only refresh act_*; for a missing flight we
  // create a minimal row from the rosterGround data so the pairing ring can
  // still be built.
  const crewsByFlight = new Map<string, SingleLegFlightRecord[]>()
  const flightByKey = new Map<string, FlightRow>()
  const pendingCreate = new Map<string, SingleLegFlightRecord>()  // key → representative record

  for (const rec of records) {
    const flight = resolveFlight(rec, byKey)
    if (flight) {
      const key = String(flight.interface_flt_id ?? flight.id)
      flightByKey.set(key, flight)
      if (!crewsByFlight.has(key)) crewsByFlight.set(key, [])
      crewsByFlight.get(key)!.push(rec)
    } else if (rec.interfaceFltId) {
      // Flight not found by 5-tuple — queue for creation; group crew by interfaceFltId.
      if (!pendingCreate.has(rec.interfaceFltId)) pendingCreate.set(rec.interfaceFltId, rec)
      if (!crewsByFlight.has(rec.interfaceFltId)) crewsByFlight.set(rec.interfaceFltId, [])
      crewsByFlight.get(rec.interfaceFltId)!.push(rec)
    } else {
      result.warnings.push(`single-leg Flight: missing 5-tuple components for crew ${rec.crewId}, skipped`)
      result.skipped++
    }
  }

  // Refresh act_* times for flights already in the DB. We do this BEFORE
  // inserting any new flight rows to keep the sch_* on existing rows intact.
  for (const [key, flight] of flightByKey) {
    const crews = crewsByFlight.get(key) ?? []
    if (crews.length === 0) continue
    const rep = crews[0]
    try {
      const ok = await updateFlightActTimes(tx, flight.id, rep)
      if (ok) {
        result.imported++
        result.updated++
        result.success++
      }
    } catch (err) {
      result.warnings.push(
        `single-leg Flight: could not refresh act_* for flight id=${flight.id}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Create missing flights and add them to the lookup.
  for (const [ifaceId, rep] of pendingCreate) {
    try {
      const created = await createMissingFlight(tx, ifaceId, rep, filiale)
      flightByKey.set(ifaceId, created)
    } catch (err) {
      result.warnings.push(
        `single-leg Flight: could not create flight ${ifaceId}: ${err instanceof Error ? err.message : String(err)}`,
      )
      result.skipped++
      crewsByFlight.delete(ifaceId)
    }
  }

  for (const [key, crews] of crewsByFlight) {
    try {
      await tx.execute(sql`SAVEPOINT slf_sp`)
      await buildSingleLegPairing(tx, key, flightByKey.get(key)!, crews, filiale, rankPositionMap, result)
      await tx.execute(sql`RELEASE SAVEPOINT slf_sp`)
    } catch (err) {
      await tx.execute(sql`ROLLBACK TO SAVEPOINT slf_sp`)
      result.failed++
      result.errors.push({
        id: `single-leg:${key}`,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/**
 * Refresh only the act_* time fields of an existing flight row. The sch_*
 * fields are preserved from the original record — the proper F8 flight
 * import owns scheduled times. The rosterGround single-leg payload is
 * treated as an "actual times update".
 *
 * Returns true when the row was found and updated, false when no matching
 * flight id was found (caller should fall back to createMissingFlight).
 */
async function updateFlightActTimes(
  tx: NodePgDatabase<Record<string, unknown>>,
  flightId: number,
  rec: SingleLegFlightRecord,
): Promise<boolean> {
  const actDep = rec.strDtUtc || null
  const actArv = rec.endTimeUtc || null
  if (!actDep || !actArv) return false
  const result = await tx.execute(sql`
    UPDATE flight
    SET act_dep_dt_utc = ${actDep},
        act_arv_dt_utc = ${actArv},
        updated_by     = 'F8_IMPORT_GND',
        updated_at     = now()
    WHERE id = ${flightId}
      AND (scenario_id = 0 OR scenario_id IS NULL)
      AND (is_deleted = 0 OR is_deleted IS NULL)
  `)
  return rowCount(result) > 0
}

/**
 * Create a minimal flight row from rosterGround data when the flight has not
 * been imported via the flight connector yet.  Uses the same upsert key
 * (interface_flt_id) so a later proper import will overwrite this record.
 *
 * `rep.airline` and `rep.label` are the post-split values produced by the
 * connector transform (2-char airline + numeric flight number). `filiale` is
 * only used as a last-resort fallback when the transform could not split
 * (codeshare / malformed label) AND airline is empty.
 */
async function createMissingFlight(
  tx: NodePgDatabase<Record<string, unknown>>,
  interfaceFltId: string,
  rep: SingleLegFlightRecord,
  filiale: string,
): Promise<FlightRow> {
  const schDep = rep.strDtUtc || null
  const schArv = rep.endTimeUtc || null
  if (!schDep || !schArv) throw new Error('missing strDtUtc / endTimeUtc')

  const fltDt = schDep.slice(0, 10)
  const fltNum = rep.label || interfaceFltId
  const depArp = rep.startLocation || ''
  const arvArp = rep.endLocation || ''
  const airline = rep.airline || filiale
  const blkMin = schArv
    ? Math.max(0, Math.round((new Date(schArv).getTime() - new Date(schDep).getTime()) / 60_000))
    : 0

  const rows = await tx.execute(sql`
    INSERT INTO flight (
      flt_dt, flt_num, dep_arp, arv_arp,
      sch_dep_dt_utc, sch_arv_dt_utc,
      act_dep_dt_utc, act_arv_dt_utc,
      act_dep_arp, act_arv_arp,
      blk_min, fleet, airline, flt_type, seg_type,
      interface_flt_id, flight_flag, voyage_status,
      is_locked, sch_id, vr_add, is_deleted, manual_comp_flag,
      created_by, updated_by
    ) VALUES (
      ${fltDt}, ${fltNum}, ${depArp}, ${arvArp},
      ${schDep}, ${schArv}, ${schDep}, ${schArv},
      ${depArp}, ${arvArp},
      ${blkMin}, '', ${airline}, 'PAX', 'J',
      ${interfaceFltId}, 'A', 0,
      0, 0, 0, 0, 0,
      'F8_IMPORT_GND', 'F8_IMPORT_GND'
    )
    ON CONFLICT (interface_flt_id) WHERE interface_flt_id IS NOT NULL
    DO UPDATE SET
      flt_num        = EXCLUDED.flt_num,
      dep_arp        = EXCLUDED.dep_arp,
      arv_arp        = EXCLUDED.arv_arp,
      airline        = EXCLUDED.airline,
      sch_dep_dt_utc = EXCLUDED.sch_dep_dt_utc,
      sch_arv_dt_utc = EXCLUDED.sch_arv_dt_utc,
      act_dep_dt_utc = EXCLUDED.act_dep_dt_utc,
      act_arv_dt_utc = EXCLUDED.act_arv_dt_utc,
      updated_by     = 'F8_IMPORT_GND',
      updated_at     = now()
    RETURNING id, interface_flt_id, flt_num, dep_arp, arv_arp, flt_dt,
              fleet, airline, sch_dep_dt_utc, sch_arv_dt_utc,
              act_dep_dt_utc, act_arv_dt_utc
  `)
  return (rows.rows as unknown as FlightRow[])[0]
}

async function buildSingleLegPairing(
  tx: NodePgDatabase<Record<string, unknown>>,
  fltKey: string,
  flight: FlightRow,
  crews: SingleLegFlightRecord[],
  filiale: string,
  rankPositionMap: Map<string, string>,
  result: RosterGroundJobResult,
): Promise<void> {
  // Dedup crew (same crew may map to one flight via several rosterGround ids).
  const seen = new Set<string>()
  const uniqueCrews = crews.filter(c => {
    if (!c.crewId || seen.has(c.crewId)) return false
    seen.add(c.crewId)
    return true
  })
  if (uniqueCrews.length === 0) return

  const depDt = iso(flight.act_dep_dt_utc) ?? iso(flight.sch_dep_dt_utc)
  const arvDt = iso(flight.act_arv_dt_utc) ?? iso(flight.sch_arv_dt_utc)
  if (!depDt || !arvDt) throw new Error('matched flight missing dep/arv datetime')

  // Use API-provided check-in / duty-end times if present; fall back to calculated.
  const firstCrew = uniqueCrews[0]
  const briefStart = firstCrew.checkInUtc
    || new Date(new Date(depDt).getTime() - SINGLE_LEG_CHECKIN_MIN * 60_000).toISOString()
  const dutyEnd = firstCrew.dutyEndUtc || arvDt

  const blkMin = Math.round((new Date(arvDt).getTime() - new Date(depDt).getTime()) / 60_000)
  const depArp = flight.dep_arp ?? ''
  const arvArp = flight.arv_arp ?? ''
  const fltNum = flight.flt_num ?? ''
  const airline = flight.airline || 'F8'
  const fleet = flight.fleet || '-'
  const fltDt = flight.flt_dt
  const segmentCredit = firstCrew.credit ?? null
  const division = (() => {
    const d = uniqueCrews[0].division.trim().toUpperCase().slice(0, 1)
    return d === 'P' || d === 'C' ? d : 'P'
  })()
  const interfaceId = `GND-${fltKey}`

  // Upsert synthetic pairing.
  // sch_str/act_str = checkInUtc (brief start); sch_end/act_end = dutyEndUtc.
  const pairingRes = await tx.execute(sql`
    INSERT INTO pairing (
      pairing_label, filiale, division, base, fleet,
      assignment_group, assignment,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      duration_days, tafb, duty_count, seg_count,
      source, interface_id, created_by, updated_by
    ) VALUES (
      ${fltNum}, ${filiale}, ${division}, ${depArp}, ${fleet},
      'FLY', 'FLY',
      ${briefStart}, ${dutyEnd}, ${briefStart}, ${dutyEnd},
      1, 1, 1, 1,
      'F8', ${interfaceId}, 'F8_IMPORT', 'F8_IMPORT'
    )
    ON CONFLICT (interface_id) WHERE interface_id IS NOT NULL
    DO UPDATE SET
      pairing_label  = EXCLUDED.pairing_label,
      division       = EXCLUDED.division,
      base           = EXCLUDED.base,
      fleet          = EXCLUDED.fleet,
      sch_str_dt_utc = EXCLUDED.sch_str_dt_utc,
      sch_end_dt_utc = EXCLUDED.sch_end_dt_utc,
      act_str_dt_utc = EXCLUDED.act_str_dt_utc,
      act_end_dt_utc = EXCLUDED.act_end_dt_utc,
      updated_by     = 'F8_IMPORT',
      updated_at     = now()
    RETURNING id
  `)
  const pairingId = (pairingRes.rows as Array<{ id: number }>)[0].id

  // Clear existing children before re-inserting (idempotent).
  await tx.execute(sql`DELETE FROM roster_flight WHERE pairing_id = ${pairingId}`)
  await tx.execute(sql`DELETE FROM pairing_segment WHERE pairing_id = ${pairingId}`)
  await tx.execute(sql`DELETE FROM pairing_composition WHERE pairing_id = ${pairingId}`)

  // pairing_composition: one per crew division (plan_value = crew count).
  const divCounts = new Map<string, number>()
  for (const c of uniqueCrews) {
    const d = c.division.trim().toUpperCase().slice(0, 1)
    const div = d === 'P' || d === 'C' ? d : 'P'
    divCounts.set(div, (divCounts.get(div) ?? 0) + 1)
  }
  for (const [div, cnt] of divCounts) {
    await tx.execute(sql`
      INSERT INTO pairing_composition (pairing_id, division, acting_rank, plan, created_by, updated_by)
      VALUES (${pairingId}, ${div}, ${divisionDefaultRank(div)}, ${cnt}, 'F8_IMPORT', 'F8_IMPORT')
    `)
  }

  // pairing_segment: duty times span briefStart→dutyEnd; segment times span dep→arv.
  const briefMinActual = Math.max(
    0,
    Math.round((new Date(depDt).getTime() - new Date(briefStart).getTime()) / 60_000),
  )
  const dutyMin = Math.max(
    0,
    Math.round((new Date(dutyEnd).getTime() - new Date(briefStart).getTime()) / 60_000),
  )
  await tx.execute(sql`
    INSERT INTO pairing_segment (
      pairing_id, duty_seq, duty_str_arp, duty_end_arp,
      duty_sch_str_dt_utc, duty_sch_end_dt_utc, duty_act_str_dt_utc, duty_act_end_dt_utc,
      duty_acc_state, duty_brief_min, duty_act_flt_min, duty_act_duty_min,
      duty_act_credited_minutes,
      pickup_start_utc, pickup_end_utc, brief_start_utc, brief_end_utc,
      debrief_start_utc, debrief_end_utc, dropoff_start_utc, dropoff_end_utc,
      seg_seq, flt_id, flt_dt, flt_num, airline, dep_arp, arv_arp, fleet_seg,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
      seg_assignment, is_long_transit, created_by, updated_by
    ) VALUES (
      ${pairingId}, 1, ${depArp}, ${arvArp},
      ${briefStart}, ${dutyEnd}, ${briefStart}, ${dutyEnd},
      'D', ${briefMinActual}, ${blkMin}, ${dutyMin},
      ${segmentCredit},
      ${briefStart}, ${briefStart}, ${briefStart}, ${depDt},
      ${arvDt}, ${dutyEnd}, ${dutyEnd}, ${dutyEnd},
      1, ${flight.id}, ${fltDt}, ${fltNum}, ${airline}, ${depArp}, ${arvArp}, ${fleet},
      ${depDt}, ${arvDt}, ${depDt}, ${arvDt},
      'FLY', 0, 'F8_IMPORT', 'F8_IMPORT'
    )
  `)

  // roster_flight: one per crew.
  for (const crew of uniqueCrews) {
    const d = crew.division.trim().toUpperCase().slice(0, 1)
    const div = d === 'P' || d === 'C' ? d : 'P'
    const rank = divisionDefaultRank(div)
    const position = rankPositionMap.get(rankKey(rank)) ?? null
    await tx.execute(sql`
      INSERT INTO roster_flight (
        crew_id, pairing_id, base, assignment_group, assignment,
        division, flight_acting_rank, roster_acting_rank, active_rank, position, seq_order,
        flt_id, duty_seq, seg_seq, flt_dt,
        dep_arp, arv_arp,
        sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc,
        sch_credited_minutes, act_credited_minutes,
        source, is_requested, is_deleted, is_swapped, created_by, updated_by
      ) VALUES (
        ${crew.crewId}, ${pairingId}, ${depArp}, 'FLY', 'FLY',
        ${div}, ${rank}, ${rank}, ${rank}, ${position}, 0,
        ${flight.id}, 1, 1, ${fltDt},
        ${depArp}, ${arvArp},
        ${briefStart}, ${dutyEnd}, ${depDt}, ${arvDt},
        ${crew.credit ?? null}, ${crew.credit ?? null},
        'IMP', 0, 0, 0, 'F8_IMPORT', 'F8_IMPORT'
      )
    `)
    result.imported++
    result.added++
    result.success++
  }
}

export async function processRosterGroundImportJob(
  job: RosterGroundImportJob,
  db: NodePgDatabase<Record<string, unknown>>,
): Promise<RosterGroundJobResult> {
  const result: RosterGroundJobResult = {
    entity: 'roster_ground',
    imported: 0,
    added: 0,
    updated: 0,
    deleted: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    warnings: [],
    errors: [],
  }

  const rankPositionMap = await loadRankPositionMap(db)
  const effectiveGroundRanks = await loadEffectiveGroundRanks(db, job.groundRecords)

  await db.transaction(async (tx) => {
    await importGroundRecords(tx, job.groundRecords, job.syncRangeDt, effectiveGroundRanks, rankPositionMap, result)
    await importSingleLegFlights(tx, job.singleLegRecords, job.filiale, job.syncRangeDt, rankPositionMap, result)
  })

  return result
}

export function startRosterGroundInboundWorker(fastify: FastifyInstance): Worker {
  const worker = new Worker(withBullmqPrefix('connector.roster_ground.inbound'),
    async (job) => {
      const data = job.data as RosterGroundImportJob
      fastify.log.info({
        syncId: data.syncId,
        groundRecords: data.groundRecords.length,
        singleLegRecords: data.singleLegRecords.length,
        range: data.syncRangeDt,
      }, 'roster-ground-inbound-worker processing')
      try {
        await publishWriteRunning(data.importId, 'rosterGround')
        const result = await processRosterGroundImportJob(data, fastify.db)
        fastify.log.info({
          syncId: data.syncId,
          imported: result.imported,
          warnings: result.warnings.length,
          errors: result.errors.length,
        }, 'roster-ground-inbound-worker completed')
        const [startDt, endDt] = data.syncRangeDt
        await refreshLiveLegalityAndManday(fastify, {
          legalityDates: [data.syncRangeDt[0], data.syncRangeDt[1]],
          startDt,
          endDt,
          updatedBy: 'ROSTER_GND_IMPORT',
        })
        await publishWriteTerminal(data.importId, 'rosterGround', 'done', undefined, {
          processed: result.success + result.failed + result.skipped,
          total: data.groundRecords.length + data.singleLegRecords.length,
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
          'rosterGround',
          'fail',
          err instanceof Error ? err.message : String(err),
        )
        throw err
      }
    },
    { connection: getBullmqRedisConnection(), concurrency: 1 },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, error: err.message }, 'roster-ground-inbound job failed')
  })
  attachBullmqErrorLogger(worker, fastify.log, 'roster-ground-inbound worker')

  return worker
}
