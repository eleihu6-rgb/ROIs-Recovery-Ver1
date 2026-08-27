/**
 * One-off: refresh live CrewManday to match current roster_flight.
 *
 * Crew-scoped (all crew) recompute of credit + blh(飞时) + day-off/leave flags
 * over the roster date window. Manday OUTSIDE the window (imported history with
 * no roster) is preserved.
 *
 *   npx tsx scripts/refresh-manday.ts --month=2026-06            # preview (rolled back)
 *   npx tsx scripts/refresh-manday.ts --month=2026-06 --commit   # apply
 *
 * Without --month the window is the full roster_flight date span.
 */
import 'dotenv/config'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { recalcMandayCredit } from '../src/services/manday/manday-credit-service.js'

const COMMIT = process.argv.includes('--commit')
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const pool = new pg.Pool({ connectionString })
const db = drizzle(pool)

type Snap = { cred: string; blh: string; blh_in: string; blh_out: string }

async function snapshot(d: typeof db, startDt: string, endDt: string): Promise<Snap> {
  const r = await d.execute<Snap>(sql`
    SELECT
      COALESCE(SUM(credit), 0)::numeric AS cred,
      COALESCE(SUM(blh), 0)::bigint     AS blh,
      COALESCE(SUM(blh) FILTER (WHERE crew_base_dt BETWEEN ${startDt}::date AND ${endDt}::date), 0)::bigint AS blh_in,
      COALESCE(SUM(blh) FILTER (WHERE crew_base_dt < ${startDt}::date OR crew_base_dt > ${endDt}::date), 0)::bigint AS blh_out
    FROM (
      SELECT credit, blh, crew_base_dt FROM crew_manday_fd_daily
      UNION ALL
      SELECT credit, blh, crew_base_dt FROM crew_manday_cc_am_daily
    ) x
  `)
  return r.rows[0]
}

async function main() {
  const monthArg = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1]
  let startDt: string
  let endDt: string
  if (monthArg) {
    // Exact calendar month [first day, last day] — no outward padding, so only
    // that month's crew_base_dt rows are cleared/recomputed.
    const m = await db.execute<{ lo: string; hi: string }>(sql`
      SELECT (${monthArg} || '-01')::date::text AS lo,
             ((${monthArg} || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date::text AS hi
    `)
    startDt = m.rows[0].lo
    endDt = m.rows[0].hi
  } else {
    const span = await db.execute<{ lo: string; hi: string }>(sql`
      SELECT (MIN(sch_str_dt_utc)::date - INTERVAL '2 day')::date::text AS lo,
             (MAX(sch_str_dt_utc)::date + INTERVAL '2 day')::date::text AS hi
      FROM roster_flight WHERE is_deleted = 0
    `)
    startDt = span.rows[0].lo
    endDt = span.rows[0].hi
  }

  const crewRows = await db.execute<{ crew_id: string }>(sql`SELECT crew_id FROM crew`)
  const crewIds = crewRows.rows.map((r) => r.crew_id)

  console.log(`Window: ${startDt} … ${endDt} | crew: ${crewIds.length} | mode: ${COMMIT ? 'COMMIT' : 'PREVIEW (rollback)'}`)

  const before = await snapshot(db, startDt, endDt)

  const run = async (d: typeof db) => {
    const res = await recalcMandayCredit(d, { crewIds, startDt, endDt, updatedBy: 'MANUAL_REFRESH' })
    const after = await snapshot(d, startDt, endDt)
    console.log('\nrows updated:', res)
    const fmt = (s: Snap) => ({ credit: Number(s.cred), blh_total: Number(s.blh), blh_in_window: Number(s.blh_in), blh_out_window: Number(s.blh_out) })
    console.table({ before: fmt(before), after: fmt(after) })
    const b = fmt(before), a = fmt(after)
    console.log(`Δ credit: ${(a.credit - b.credit).toFixed(2)} | Δ blh(in-window): ${a.blh_in_window - b.blh_in_window} | blh(out-window) preserved: ${b.blh_out_window === a.blh_out_window ? 'YES' : `NO (${b.blh_out_window} → ${a.blh_out_window})`}`)
  }

  if (COMMIT) {
    await run(db)
    console.log('\n✅ committed')
  } else {
    const ROLLBACK = Symbol('rollback')
    try {
      await db.transaction(async (tx) => {
        await run(tx as unknown as typeof db)
        throw ROLLBACK
      })
    } catch (e) {
      if (e !== ROLLBACK) throw e
    }
    console.log('\n↩️  rolled back (preview only) — re-run with --commit to apply')
  }

  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
