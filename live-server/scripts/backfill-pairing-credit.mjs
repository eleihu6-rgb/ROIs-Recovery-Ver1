/**
 * Backfill pairing_segment credit for ET/EK "skeleton" pairings whose duty credit was never
 * computed (duty_act_credited_minutes IS NULL). These pairings were imported without the
 * duty-level credit aggregate, so a freshly-viewed pairing shows Total Credit 00:00 and, once
 * assigned, the crew-head RpCred reads 0 (manday reads COALESCE(duty_act, duty_sch, 0)).
 *
 * For each target duty (pairing_id, duty_seq) we:
 *   1. sum scheduled block minutes across the duty's legs via pairing_segment.flt_id → flight.blk_min,
 *   2. run the SAME Rust rule-7502 CARS credit engine used by pairing-build-service
 *      (rule-engine-rs/target/release/check-7502 --emit-tsv), group FLY →
 *      credit = max(240 floor, Σblk×FT=1.0),
 *   3. UPDATE duty_sch_credited_minutes + duty_act_credited_minutes on every segment of the duty
 *      (duty-level value, mirroring the build service).
 *
 * Manday/crew RpCred is a downstream read of this credit; recompute crew manday separately
 * (POST /api/admin/manday-credit-refresh) so Redis cache invalidation + websocket notify run
 * through live-server machinery. This script reports the affected assigned-crew set + date
 * window so that recompute can be scoped.
 *
 * Usage:
 *   node live-server/scripts/backfill-pairing-credit.mjs [--schema f8_sit_live] [--apply]
 * Default is DRY-RUN (no writes). Pass --apply to write.
 * Connection: DATABASE_URL env. --schema sets search_path.
 */
import pg from 'pg'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const schema = getArg('schema', process.env.LIVE_SCHEMA ?? 'f8_sit_live')
const apply = args.includes('--apply')
const DB_URL = process.env.DATABASE_URL
if (!DB_URL) throw new Error('DATABASE_URL is required')

const IDENTIFIER = /^[a-z][a-z0-9_]*$/
const quoteIdentifier = (v) => {
  if (!IDENTIFIER.test(v)) throw new Error(`Invalid schema identifier: ${v}`)
  return `"${v}"`
}

// ── Rust rule-7502 CARS credit bridge (same binary + TSV protocol as pairing-credit.ts) ──
const RELEASE_BIN = path.resolve(__dirname, '../../rule-engine-rs/target/release/check-7502')
const DEBUG_BIN = path.resolve(__dirname, '../../rule-engine-rs/target/debug/check-7502')
const resolveBin = () =>
  fs.existsSync(RELEASE_BIN) ? RELEASE_BIN : fs.existsSync(DEBUG_BIN) ? DEBUG_BIN : null

/** duties: [{key, blkMin, dpMin}] → Map(key → creditMin) via one batched --emit-tsv call. */
const computeDutyCreditMin = (duties) => {
  if (duties.length === 0) return new Map()
  const bin = resolveBin()
  if (!bin) throw new Error('check-7502 binary not found (build rule-engine-rs release)')
  const input =
    duties.map((d) => [d.key, 'FLY', Math.round(d.blkMin), Math.round(d.dpMin)].join('\t')).join('\n') + '\n'
  const res = spawnSync(bin, ['--emit-tsv'], { input, encoding: 'utf-8', maxBuffer: 1 << 22 })
  if (res.status !== 0) throw new Error(`check-7502 exited ${res.status}: ${res.stderr}`)
  const out = new Map()
  for (const line of (res.stdout ?? '').split('\n')) {
    const f = line.split('\t')
    if (f.length < 2 || !f[0]) continue
    const n = Number(f[1])
    if (Number.isFinite(n)) out.set(f[0], n)
  }
  return out
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 4 })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}, public`)

    // Target duties: ET/EK/'' segments whose duty credit was never computed. Block from
    // flight.blk_min via flt_id (skeleton rows have NULL duty_sch_flt_min). dpMin from the
    // duty's own seg schedule span (irrelevant to FLY credit, which is block+floor only).
    const { rows: duties } = await client.query(`
      SELECT ps.pairing_id, ps.duty_seq,
             COUNT(*)                          AS seg_count,
             SUM(COALESCE(f.blk_min, 0))       AS blk_min,
             COUNT(*) FILTER (WHERE ps.flt_id IS NULL) AS null_flt_segs,
             EXTRACT(EPOCH FROM (MAX(ps.sch_end_dt_utc) - MIN(ps.sch_str_dt_utc))) / 60 AS dp_min
        FROM pairing_segment ps
        LEFT JOIN flight f ON f.id = ps.flt_id
       WHERE ps.is_deleted = 0
         AND ps.airline IN ('ET','EK','')
         AND ps.duty_act_credited_minutes IS NULL
       GROUP BY ps.pairing_id, ps.duty_seq
       ORDER BY ps.pairing_id, ps.duty_seq
    `)

    if (duties.length === 0) {
      console.log(JSON.stringify({ schema, apply, targetDuties: 0, note: 'nothing to backfill' }, null, 2))
      return
    }

    const creditIn = duties.map((d, i) => ({
      key: `k${i}`,
      blkMin: Number(d.blk_min || 0),
      dpMin: Math.max(0, Number(d.dp_min || 0)),
    }))
    const creditMap = computeDutyCreditMin(creditIn)

    // Distribution + preview
    let floorCount = 0
    let aboveFloor = 0
    let zeroBlk = 0
    const preview = []
    const rows = duties.map((d, i) => {
      const credit = creditMap.get(`k${i}`) ?? null
      const blk = Number(d.blk_min || 0)
      if (blk === 0) zeroBlk++
      if (credit === 240) floorCount++
      else if (credit != null && credit > 240) aboveFloor++
      if (preview.length < 12) preview.push({ pairingId: Number(d.pairing_id), dutySeq: d.duty_seq, segs: Number(d.seg_count), blkMin: blk, credit })
      return { pairingId: Number(d.pairing_id), dutySeq: d.duty_seq, credit }
    })

    const pairingIds = [...new Set(rows.map((r) => r.pairingId))]

    // Assigned-crew impact + date window (for scoping the manday recompute).
    const { rows: impact } = await client.query(
      `SELECT COUNT(DISTINCT rf.crew_id) AS crew_count,
              MIN(rf.sch_str_dt_utc)::date AS min_dt,
              MAX(rf.sch_str_dt_utc)::date AS max_dt
         FROM roster_flight rf
        WHERE rf.is_deleted = 0 AND rf.pairing_id = ANY($1)`,
      [pairingIds],
    )
    const assignedCrew = Number(impact[0]?.crew_count || 0)

    console.log(JSON.stringify({
      schema, apply,
      targetDuties: duties.length,
      targetPairings: pairingIds.length,
      creditFloor240: floorCount,
      creditAboveFloor: aboveFloor,
      dutiesWithZeroBlock: zeroBlk,
      assignedCrewAffected: assignedCrew,
      assignedDateWindow: { start: impact[0]?.min_dt ?? null, end: impact[0]?.max_dt ?? null },
      previewFirst12: preview,
    }, null, 2))

    if (!apply) {
      console.log('\n[DRY-RUN] no writes. Re-run with --apply to write credit.')
      return
    }

    // Apply: one UPDATE per duty, all segments carry the duty-level credit.
    let updatedSegs = 0
    let updatedDuties = 0
    await client.query('BEGIN')
    try {
      for (const r of rows) {
        if (r.credit == null) continue
        const res = await client.query(
          `UPDATE pairing_segment
              SET duty_sch_credited_minutes = $1,
                  duty_act_credited_minutes = $1,
                  updated_by = 'BACKFILL_CREDIT', updated_at = NOW()
            WHERE pairing_id = $2 AND duty_seq = $3 AND is_deleted = 0`,
          [r.credit, r.pairingId, r.dutySeq],
        )
        updatedSegs += res.rowCount
        updatedDuties++
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
    console.log(JSON.stringify({ applied: true, updatedDuties, updatedSegs }, null, 2))
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
