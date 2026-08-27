/**
 * Backfill rule_violation.window_* for Live 7505/7507 rows that still rely on
 * crew-local start_dt/end_dt (Americas end_dt spills into the next UTC month and
 * leaks prior-RP Soft findings into the next RP Alert Center view).
 *
 * Parses calendar RP labels from message: "... (YYYY-MM-DD, YYYY-MM-DD)."
 * Sets window_start_dt / window_end_dt to match calendarRpDisplayWindow().
 *
 * Usage:
 *   node live-server/scripts/backfill-7505-7507-display-window.mjs [--schema f8] [--dry-run]
 *
 * Connection: DATABASE_URL (or DATABASE_URL_F8). --schema sets search_path.
 */
import pg from 'pg'
import { calendarRpDisplayWindow, parseRpDatesFrom7505Message } from './legality-rp-window.mjs'

const args = process.argv.slice(2)
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const schema = getArg('schema', process.env.LIVE_SCHEMA ?? 'f8')
const dryRun = args.includes('--dry-run')
const DB_URL = process.env.DATABASE_URL ?? process.env.DATABASE_URL_F8
if (!DB_URL) {
  throw new Error('DATABASE_URL or DATABASE_URL_F8 is required')
}
const IDENTIFIER = /^[a-z][a-z0-9_]*$/
if (!IDENTIFIER.test(schema)) {
  throw new Error(`invalid schema: ${schema}`)
}

const client = new pg.Client({ connectionString: DB_URL })
await client.connect()
try {
  await client.query(`set search_path to ${schema}, public`)
  const { rows } = await client.query(
    `select id, message
       from rule_violation
      where rule_code in ('7505', '7507')
        and (window_start_dt is null or window_end_dt is null)`,
  )
  let updated = 0
  let skipped = 0
  for (const row of rows) {
    const parsed = parseRpDatesFrom7505Message(row.message)
    if (!parsed) {
      skipped += 1
      continue
    }
    const win = calendarRpDisplayWindow(parsed.rpFrom, parsed.rpTo)
    if (!dryRun) {
      await client.query(
        `update rule_violation
            set window_start_dt = $2::timestamptz,
                window_end_dt = $3::timestamptz,
                updated_at = now(),
                updated_by = 'backfill-7505-7507-display-window'
          where id = $1`,
        [row.id, win.window_start_dt, win.window_end_dt],
      )
    }
    updated += 1
  }
  console.log(JSON.stringify({
    schema,
    dryRun,
    candidates: rows.length,
    updated,
    skipped,
  }))
} finally {
  await client.end()
}
