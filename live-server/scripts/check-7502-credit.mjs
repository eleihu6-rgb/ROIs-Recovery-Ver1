/**
 * Rule 7502 (CALCULATION OF CREDIT HOURS) — live credit-hours report harness.
 *
 * Computes per-crew credit hours for June from the LIVE, DATA-DRIVEN model in the
 * `assignment` table (the same model 8002's credit band uses, so the two reconcile):
 *
 *   FLIGHT (pairing) segment → block time × FT (FLT ft=1.0), via pairing_segment → flight.
 *   GROUND (no pairing) duty  → fixed_credit_min only.
 *
 * So days off / leave with no fixed credit earn 0; VAC/ASBY/SIM earn their
 * fixed 4:00; flights earn block. 7502 is a CALC rule —
 * it reports credit-hour totals, writes nothing to rule_violation. Used by the e2e spec
 * `e2e/tests/gantt/rule-7502-credit.spec.ts` (Rule-3xxx).
 *
 * Usage:
 *   node live-server/scripts/check-7502-credit.mjs [--from 2026-06-01 --to 2026-07-01]
 * Prints one JSON object: { crewCredited, totalCreditHours, flyCreditHours,
 *   groundCreditHours, worst:{crewId, creditHours} }.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.resolve(__dirname, '..', '.env')

function readDatabaseUrl() {
  const env = readFileSync(ENV_PATH, 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

function argFlag(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/** Per-crew credit (minutes): flight block + data-driven ground credit. */
export async function computeCredit(c, from, to) {
  // FLIGHT: block per matched pairing segment (× FLT ft 1.0).
  const fly = await c.query(
    `
    SELECT rf.crew_id AS crew_id, SUM(COALESCE(f.blk_min, 0))::bigint AS fly_min
      FROM (SELECT DISTINCT crew_id, pairing_id
              FROM roster_flight
             WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
               AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz) rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id AND ps.is_deleted = 0
      JOIN flight f ON f.id = ps.flt_id
     GROUP BY rf.crew_id
    `,
    [from, to],
  )
  // GROUND: fixed_credit_min only.
  const grd = await c.query(
    `
    SELECT rf.crew_id AS crew_id,
           SUM(COALESCE(a.fixed_credit_min, 0))::bigint AS gnd_min
      FROM roster_flight rf
      LEFT JOIN assignment a ON a.assignment = rf.assignment
     WHERE rf.is_deleted = 0 AND rf.assignment_group = 'GRD'
       AND rf.sch_str_dt_utc >= $1::timestamptz AND rf.sch_str_dt_utc < $2::timestamptz
     GROUP BY rf.crew_id
    `,
    [from, to],
  )
  // Every crew with any June activity (so credit-0 crew are still "evaluated").
  const all = await c.query(
    `SELECT DISTINCT crew_id FROM roster_flight
      WHERE is_deleted = 0 AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz`,
    [from, to],
  )

  const flyOf = new Map(fly.rows.map((r) => [r.crew_id, Number(r.fly_min)]))
  const grdOf = new Map(grd.rows.map((r) => [r.crew_id, Number(r.gnd_min)]))
  return all.rows.map((r) => {
    const flyMin = flyOf.get(r.crew_id) ?? 0
    const gndMin = grdOf.get(r.crew_id) ?? 0
    return { crewId: r.crew_id, flyMin, gndMin, totalMin: flyMin + gndMin }
  })
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const crews = await computeCredit(c, from, to)
  await c.end()

  crews.sort((a, b) => b.totalMin - a.totalMin)
  const sum = (f) => crews.reduce((acc, x) => acc + f(x), 0)
  const worst = crews[0]
    ? { crewId: crews[0].crewId, creditHours: Math.round((crews[0].totalMin / 60) * 10) / 10 }
    : null
  process.stdout.write(
    JSON.stringify({
      model: 'assignment-factors',
      crewCredited: crews.length,
      totalCreditHours: Math.round((sum((x) => x.totalMin) / 60) * 10) / 10,
      flyCreditHours: Math.round((sum((x) => x.flyMin) / 60) * 10) / 10,
      groundCreditHours: Math.round((sum((x) => x.gndMin) / 60) * 10) / 10,
      worst,
    }),
  )
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
