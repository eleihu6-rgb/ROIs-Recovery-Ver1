/**
 * Rule 8030 (PILOT AGE) — live validation harness.
 *
 * Drives the Rust 8030 engine (rule-engine-rs/target/release/check-8030) against the
 * LIVE roster data: for each physical flight (`flt_id`; falls back to `-pairing_id` when
 * flt_id is null so rows never falsely merge across pairings), count crew of the
 * configured DIVISION whose age at the segment start is ≥ AGE DEFINE; a flight carrying
 * more than MAX NUMBER such crew is a violation for each of them.
 *
 * Data source:
 *   roster_flight (assignment_group='FLY', pairing_id NOT NULL, is_deleted=0)
 *     → distinct (flt_id, crew) with the segment start/end span + attribution pairing_id
 *     → crew.birthday + crew.division (falling back to roster_flight.division).
 *
 * Connection string is read from live-server/.env (DATABASE_URL). The Rust binary must be
 * built first: (cd rule-engine-rs && cargo build --release)
 *
 * Usage:
 *   node live-server/scripts/check-8030-age.mjs [--from 2026-06-01 --to 2026-07-01]
 *   node live-server/scripts/check-8030-age.mjs 60 --division P --max-number 1   # optional overrides
 * Defaults (Age Define / Division / Max Number) come from the RULE workset's 8030 row.
 * Prints one JSON object to stdout:
 *   { "ageLimit":35, "division":"P", "maxNumber":1, "flightsEvaluated":N,
 *     "flightsFiring":N, "crewViolating":N, "violationCount":N,
 *     "oldest": { "crewId":"…", "ageYears":N, "pairingId":N, "flightId":N, "onFlightCount":N } }
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-8030')

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

/** Division / Age Define / Max Number / Airport from RULE workset 8030. */
export async function readParams(c, opts = {}) {
  const rule = await loadRulesetRule(c, 8030, opts)
  const row = rule.rows[0]
  const ageLimit = Number(fieldRaw(row, rule.header, 'Age Define'))
  const maxNumber = Number(fieldRaw(row, rule.header, 'Max Number'))
  const division = fieldRaw(row, rule.header, 'Division')
  const airport = fieldRaw(row, rule.header, 'Airport', '*')
  if (!Number.isFinite(ageLimit) || !Number.isFinite(maxNumber) || !division) {
    throw new Error(`8030/${rule.instance}: missing Division/Age Define/Max Number`)
  }
  return {
    rulesetId: rule.rulesetId,
    instance: rule.instance,
    ageLimit,
    maxNumber,
    division,
    airport,
  }
}

/** Distinct (flt_id, crew) crew-on-flight rows + segment span (start/end secs). */
export async function extractFlights() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const { rows } = await c.query(
    `
    WITH f AS (
      SELECT COALESCE(rf.flt_id, ps.flt_id, -rf.pairing_id) AS flt_id,
             rf.pairing_id,
             rf.crew_id,
             COALESCE(NULLIF(rf.division, ''), cr.division) AS division,
             COALESCE(rf.sch_str_dt_utc, ps.sch_str_dt_utc) AS seg_start_ts,
             COALESCE(rf.sch_end_dt_utc, ps.sch_end_dt_utc) AS seg_end_ts,
             cr.birthday
        FROM roster_flight rf
        JOIN crew cr ON cr.crew_id = rf.crew_id
        LEFT JOIN pairing_segment ps
          ON ps.pairing_id = rf.pairing_id
         AND COALESCE(ps.is_deleted, 0) = 0
         AND (
           (rf.flt_id IS NOT NULL AND ps.flt_id = rf.flt_id)
           OR (rf.flt_id IS NULL AND (
                 rf.duty_seq IS NULL
                 OR (ps.duty_seq = rf.duty_seq
                     AND (rf.seg_seq IS NULL OR ps.seg_seq = rf.seg_seq))
               ))
         )
       WHERE rf.is_deleted = 0
         AND rf.assignment_group = 'FLY'
         AND rf.pairing_id IS NOT NULL
         AND cr.birthday IS NOT NULL
         AND rf.sch_str_dt_utc >= $1::timestamptz
         AND rf.sch_str_dt_utc <  $2::timestamptz
    )
    SELECT DISTINCT
           flt_id,
           pairing_id,
           crew_id,
           division,
           to_char(seg_start_ts, 'YYYY-MM-DD')        AS start_date,
           EXTRACT(EPOCH FROM seg_start_ts)::bigint    AS start_secs,
           EXTRACT(EPOCH FROM seg_end_ts)::bigint       AS end_secs,
           to_char(birthday, 'YYYY-MM-DD')              AS birth_date
      FROM f
    `,
    [from, to],
  )
  await c.end()
  return rows
}

/** Build the TSV the Rust engine reads: flt_id, pairing_id, start_date, crew_id, division, birth_date. */
export function toTsv(rows) {
  return (
    rows.map((r) => `${r.flt_id}\t${r.pairing_id}\t${r.start_date}\t${r.crew_id}\t${r.division}\t${r.birth_date}`).join('\n') +
    '\n'
  )
}

/** Run check-8030 in --emit-tsv mode, return parsed violations. */
export function runEngine(tsv, { ageLimit, division, maxNumber }) {
  const res = spawnSync(
    BIN,
    ['--division', division, '--age-limit', String(ageLimit), '--max-number', String(maxNumber), '--emit-tsv'],
    { input: tsv, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
  )
  if (res.status !== 0) {
    throw new Error(`check-8030 failed: ${res.stderr || res.error}`)
  }
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, pairingId, flightId, ageYears, onFlightCount] = l.split('\t')
      return {
        crewId,
        pairingId: Number(pairingId),
        flightId: Number(flightId),
        ageYears: Number(ageYears),
        onFlightCount: Number(onFlightCount),
      }
    })
}

async function main() {
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  await c.end()
  const cliAge = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null
  const ageLimit = cliAge != null && Number.isFinite(cliAge) ? cliAge : p.ageLimit
  const division = argFlag('--division', p.division)
  const maxNumber = Number(argFlag('--max-number', String(p.maxNumber)))
  const rows = await extractFlights()
  const viols = runEngine(toTsv(rows), { ageLimit, division, maxNumber })
  const firing = new Set(viols.map((v) => v.flightId))
  const crew = new Set(viols.map((v) => v.crewId))
  const oldest = viols.slice().sort((a, b) => b.ageYears - a.ageYears)[0] ?? null
  const flightIds = new Set(rows.map((r) => Number(r.flt_id)))
  console.log(JSON.stringify({
    ageLimit,
    division,
    maxNumber,
    flightsEvaluated: flightIds.size,
    flightsFiring: firing.size,
    crewViolating: crew.size,
    violationCount: viols.length,
    oldest: oldest
      ? {
          crewId: oldest.crewId,
          ageYears: oldest.ageYears,
          pairingId: oldest.pairingId,
          flightId: oldest.flightId,
          onFlightCount: oldest.onFlightCount,
        }
      : null,
  }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
