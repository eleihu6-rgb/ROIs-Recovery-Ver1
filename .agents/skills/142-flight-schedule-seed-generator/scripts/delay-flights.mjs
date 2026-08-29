#!/usr/bin/env node
/**
 * Delay a small fixed set of existing `flight` rows by shifting act_dep_dt_utc /
 * act_arv_dt_utc later than sch_dep_dt_utc / sch_arv_dt_utc — test data for the
 * Gantt "delay ghost bar" feature (flight-renderer.ts DELAY_GHOST_* constants).
 *
 * All arithmetic happens inside Postgres as `sch_*_dt_utc + interval` — never round-tripped
 * through a JS epoch number/Date, which was observed to introduce a spurious multi-hour
 * offset on this session (session `TimeZone` is `Asia/Bangkok`; to_timestamp()/extract(epoch)
 * round-tripping through node-postgres landed a wrong absolute instant even though each
 * individual step looked correct in isolation — see SKILL.md's node-postgres/timestamptz
 * display-quirk warning). Idempotent: the WHERE clause only touches rows not already at the
 * target instant, so re-running does not accumulate delay.
 *
 * Usage:
 *   cd live-server && set -a; source .env >/dev/null 2>&1; set +a
 *   node ../.agents/skills/142-flight-schedule-seed-generator/scripts/delay-flights.mjs [--dry-run]
 */
import pg from 'pg'

const DRY_RUN = process.argv.includes('--dry-run')

// airline + flt_num + flt_dt + dep_arp uniquely identifies a flight row (flight_key).
// delayMin shifts both act_dep_dt_utc and act_arv_dt_utc by the same amount, preserving blk_min.
const TARGETS = [
  { airline: 'EK', fltNum: 'EK001', fltDt: '2026-09-01', depArp: 'DXB', delayMin: 120 },
  { airline: 'EK', fltNum: 'EK202', fltDt: '2026-09-01', depArp: 'JFK', delayMin: 180 },
  { airline: 'ET', fltNum: 'ET100', fltDt: '2026-09-01', depArp: 'ADD', delayMin: 150 },
  { airline: 'ET', fltNum: 'ET168', fltDt: '2026-09-01', depArp: 'ADD', delayMin: 240 },
]

const main = async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()

  try {
    for (const t of TARGETS) {
      const { rows } = await client.query(
        `select id, flt_num, dep_arp, arv_arp,
                (act_dep_dt_utc = sch_dep_dt_utc + make_interval(mins => $5)) as already_set
         from flight
         where airline = $1 and flt_num = $2 and flt_dt = $3 and dep_arp = $4`,
        [t.airline, t.fltNum, t.fltDt, t.depArp, t.delayMin],
      )
      if (rows.length === 0) {
        console.warn(`SKIP (not found): ${t.airline} ${t.fltNum} ${t.fltDt} ${t.depArp}`)
        continue
      }
      const row = rows[0]

      if (row.already_set) {
        console.log(`OK (already delayed): id=${row.id} ${t.airline} ${t.fltNum} ${row.dep_arp}->${row.arv_arp} +${t.delayMin}min`)
        continue
      }

      console.log(`${DRY_RUN ? 'DRY-RUN would update' : 'UPDATE'}: id=${row.id} ${t.airline} ${t.fltNum} ${row.dep_arp}->${row.arv_arp} +${t.delayMin}min`)
      if (!DRY_RUN) {
        await client.query(
          `update flight
           set act_dep_dt_utc = sch_dep_dt_utc + make_interval(mins => $1),
               act_arv_dt_utc = sch_arv_dt_utc + make_interval(mins => $1),
               updated_by = 'delay-flights-seed', updated_at = now()
           where id = $2`,
          [t.delayMin, row.id],
        )
      }
    }

    // Verify: extract(epoch from ...) diff, computed entirely server-side (no JS round-trip).
    const ids = []
    for (const t of TARGETS) {
      const { rows } = await client.query(
        `select id from flight where airline = $1 and flt_num = $2 and flt_dt = $3 and dep_arp = $4`,
        [t.airline, t.fltNum, t.fltDt, t.depArp],
      )
      if (rows[0]) ids.push(rows[0].id)
    }
    if (!DRY_RUN && ids.length > 0) {
      const { rows } = await client.query(
        `select id, flt_num,
                round(extract(epoch from (act_dep_dt_utc - sch_dep_dt_utc)) / 60) as dep_delay_min,
                round(extract(epoch from (act_arv_dt_utc - sch_arv_dt_utc)) / 60) as arv_delay_min
         from flight where id = any($1) order by id`,
        [ids],
      )
      console.log('--- verify (server-side interval, minutes) ---')
      for (const r of rows) console.log(r.id, r.flt_num, 'dep_delay_min=', r.dep_delay_min, 'arv_delay_min=', r.arv_delay_min)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
