/**
 * Backfill pairing_segment.flt_id for existing rows where it is NULL.
 *
 * Mirrors the pairing-inbound-worker fallback (and data-migration f8/pairing.py): for each
 * flight-bearing segment with a NULL flt_id, resolve the flight by route + scheduled
 * departure (dep_arp + arv_arp + sch_str_dt_utc); if no flight matches, synthesize one from
 * the segment's own schedule (blk_min = sch_end - sch_str) and link it. Without this link the
 * RO rule engine can't compute a pairing's block hours, so block-hour rules (e.g. 8002,
 * 85h/28d) never fire and the optimizer over-assigns crews.
 *
 * Usage:
 *   node live-server/scripts/backfill-pairing-segment-flt-id.mjs [--schema f8] [--dry-run]
 *
 * Connection: DATABASE_URL env. --schema sets search_path.
 */
import pg from 'pg'

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const schema = getArg('schema', process.env.LIVE_SCHEMA ?? 'f8')
const dryRun = args.includes('--dry-run')
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  throw new Error('DATABASE_URL is required')
}
const IDENTIFIER = /^[a-z][a-z0-9_]*$/
const quoteIdentifier = (value) => {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid schema identifier: ${value}`)
  return `"${value}"`
}

const ASSIGNMENT_FLAG = { FLY: 'A', DH: 'D', DHD: 'D', SBY: 'B', SIM: 'S' }
const FLIGHT_BEARING = new Set(Object.keys(ASSIGNMENT_FLAG))

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 })

const compKey = (dep, arv, schDep) => {
  if (!dep || !arv || !schDep) return null
  const t = new Date(schDep).getTime()
  return Number.isNaN(t) ? null : `${dep}|${arv}|${t}`
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}, public`)
    // Composite lookup of existing flights: route + scheduled departure → id
    const { rows: fltRows } = await client.query(`
      SELECT id, dep_arp, arv_arp, sch_dep_dt_utc FROM flight
      WHERE sch_dep_dt_utc IS NOT NULL AND (scenario_id = 0 OR scenario_id IS NULL)
        AND (is_deleted = 0 OR is_deleted IS NULL)
    `)
    const fltCompMap = new Map()
    for (const r of fltRows) {
      const k = compKey(r.dep_arp, r.arv_arp, r.sch_dep_dt_utc)
      if (k && !fltCompMap.has(k)) fltCompMap.set(k, r.id)
    }

    const { rows: segs } = await client.query(`
      SELECT id, dep_arp, arv_arp, flt_num, airline, fleet_seg, flt_dt,
             sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, seg_assignment
      FROM pairing_segment
      WHERE flt_id IS NULL AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY id
    `)

    let resolved = 0
    let synthesized = 0
    let skipped = 0

    for (const s of segs) {
      if (!FLIGHT_BEARING.has(s.seg_assignment)) {
        skipped++
        continue
      }
      let fltId = null
      const ck = compKey(s.dep_arp, s.arv_arp, s.sch_str_dt_utc)
      if (ck) fltId = fltCompMap.get(ck) ?? null

      let viaSynthesis = false
      if (!fltId) {
        if (!s.sch_str_dt_utc || !s.sch_end_dt_utc) {
          skipped++
          continue
        }
        viaSynthesis = true
        if (!dryRun) {
          const blkMin = Math.max(
            0,
            Math.round((new Date(s.sch_end_dt_utc).getTime() - new Date(s.sch_str_dt_utc).getTime()) / 60000),
          )
          const flag = ASSIGNMENT_FLAG[s.seg_assignment] ?? 'A'
          // flight.flt_dt is NOT NULL; fall back to the scheduled-departure date.
          const fltDt = s.flt_dt ?? new Date(s.sch_str_dt_utc).toISOString().slice(0, 10)
          const ins = await client.query(
            `INSERT INTO flight (
               flt_dt, flt_num, dep_arp, arv_arp,
               sch_dep_dt_utc, sch_arv_dt_utc, act_dep_dt_utc, act_arv_dt_utc,
               act_dep_arp, act_arv_arp, fleet, airline,
               blk_min, flt_type, seg_type, flight_flag, flight_assignment,
               voyage_status, is_locked, sch_id, vr_add, is_deleted, manual_comp_flag,
               created_by, updated_by
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'S','J',$14,$15,
                       0,0,0,0,0,0,'BACKFILL_FLT_ID','BACKFILL_FLT_ID')
             RETURNING id`,
            [
              fltDt, s.flt_num, s.dep_arp, s.arv_arp,
              s.sch_str_dt_utc, s.sch_end_dt_utc, s.act_str_dt_utc, s.act_end_dt_utc,
              s.dep_arp, s.arv_arp, s.fleet_seg, s.airline,
              blkMin, flag, s.seg_assignment,
            ],
          )
          fltId = ins.rows[0]?.id ?? null
          if (ck && fltId) fltCompMap.set(ck, fltId) // reuse for later identical segments
        }
      }

      if (!dryRun && fltId) {
        await client.query(`UPDATE pairing_segment SET flt_id = $1 WHERE id = $2`, [fltId, s.id])
      }
      if (viaSynthesis) synthesized++
      else if (fltId || dryRun) resolved++
    }

    console.log(JSON.stringify({
      schema, dryRun,
      nullSegments: segs.length,
      resolvedByLookup: resolved,
      synthesizedFlights: synthesized,
      skipped,
    }, null, 2))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
