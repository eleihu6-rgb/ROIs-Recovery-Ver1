/**
 * Rule 8004 (BASIC COMPETENCY — BASE) — live validation harness.
 *
 * Drives the Rust 8004 engine (rule-engine-rs/target/release/check-8004) against the LIVE
 * roster data: for each roster (crew×pairing) whose base is non-empty, the pairing's base
 * must be a valid crew_base during the roster span (eff ≤ start, exp(+grace) > end). A
 * roster whose base is not covered is a violation.
 *
 * Data source:
 *   roster_flight (pairing_id NOT NULL, is_deleted=0) → one roster per (crew, pairing):
 *     base = roster_flight.base, span = MIN(sch_str)..MAX(sch_end)
 *   crew_base → the crew's base quals (eff/exp; null = open-ended).
 *
 * F8 8004/004: only Type=BASE is enabled (RANK/FLEET=N), Grace Period=0.
 *
 * Connection string is read from live-server/.env (DATABASE_URL). The Rust binary must be
 * built first: (cd rule-engine-rs && cargo build --release)
 *
 * Usage:
 *   node live-server/scripts/check-8004-competency.mjs [graceDays=0] [--from 2026-06-01 --to 2026-07-01]
 * Prints one JSON object to stdout:
 *   { "graceDays":0, "rostersWithBase":N, "crewEvaluated":N, "crewViolating":N,
 *     "violationCount":N, "sample": { "crewId":"…", "pairingId":N, "base":"…" } }
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
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-8004')

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

/** Grace Period (days) from the RULE workset's 8004 membership (BASE row preferred). */
export async function readParams(c, opts = {}) {
  const rule = await loadRulesetRule(c, 8004, opts)
  const baseRow = rule.rows.find((row) => fieldRaw(row, rule.header, 'Type').toUpperCase() === 'BASE')
    ?? rule.rows[0]
  const graceDays = Number(fieldRaw(baseRow, rule.header, 'Grace Period', '0'))
  if (!Number.isFinite(graceDays) || graceDays < 0) {
    throw new Error(`8004/${rule.instance}: missing/invalid Grace Period`)
  }
  return { rulesetId: rule.rulesetId, instance: rule.instance, graceDays }
}

/** Returns { rosters, quals }: one roster per (crew,pairing) + each crew's base quals. */
export async function extractData() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const rosters = (
    await c.query(
      `
      SELECT crew_id,
             pairing_id,
             MAX(base) AS base,
             to_char(MIN(sch_str_dt_utc), 'YYYY-MM-DD')     AS start_date,
             to_char(MAX(sch_end_dt_utc), 'YYYY-MM-DD')      AS end_date,
             EXTRACT(EPOCH FROM MIN(sch_str_dt_utc))::bigint AS start_secs,
             EXTRACT(EPOCH FROM MAX(sch_end_dt_utc))::bigint  AS end_secs
        FROM roster_flight
       WHERE is_deleted = 0
         AND pairing_id IS NOT NULL
         AND sch_str_dt_utc >= $1::timestamptz
         AND sch_str_dt_utc <  $2::timestamptz
       GROUP BY crew_id, pairing_id
      `,
      [from, to],
    )
  ).rows
  const crewIds = [...new Set(rosters.map((r) => r.crew_id))]
  const quals = (
    await c.query(
      `
      SELECT crew_id,
             base,
             to_char(COALESCE(eff_dt_utc, eff_dt), 'YYYY-MM-DD') AS eff_date,
             to_char(COALESCE(exp_dt_utc, exp_dt), 'YYYY-MM-DD') AS exp_date
        FROM crew_base
       WHERE crew_id = ANY($1::varchar[])
      `,
      [crewIds],
    )
  ).rows
  await c.end()
  return { rosters, quals }
}

/** Build the R/Q TSV the Rust engine reads. */
export function toTsv({ rosters, quals }) {
  const lines = []
  for (const r of rosters) {
    lines.push(`R\t${r.crew_id}\t${r.pairing_id}\t${r.base ?? ''}\t${r.start_date}\t${r.end_date}`)
  }
  for (const q of quals) {
    lines.push(`Q\t${q.crew_id}\t${q.base}\t${q.eff_date ?? '-'}\t${q.exp_date ?? '-'}`)
  }
  return lines.join('\n') + '\n'
}

/** Run check-8004 in --emit-tsv mode, return parsed violations. */
export function runEngine(tsv, graceDays) {
  const res = spawnSync(BIN, ['--grace-days', String(graceDays), '--emit-tsv'], {
    input: tsv,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (res.status !== 0) {
    throw new Error(`check-8004 failed: ${res.stderr || res.error}`)
  }
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, pairingId, base] = l.split('\t')
      return { crewId, pairingId: Number(pairingId), base }
    })
}

async function main() {
  const cliGrace = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  await c.end()
  const graceDays = cliGrace != null && Number.isFinite(cliGrace) ? cliGrace : p.graceDays
  const data = await extractData()
  const rostersWithBase = data.rosters.filter((r) => r.base && r.base !== '*').length
  const crewEvaluated = new Set(data.rosters.map((r) => r.crew_id)).size
  const viols = runEngine(toTsv(data), graceDays)
  const sample = viols[0] ? { crewId: viols[0].crewId, pairingId: viols[0].pairingId, base: viols[0].base } : null
  process.stdout.write(
    JSON.stringify({
      rulesetId: p.rulesetId,
      instance: p.instance,
      graceDays,
      rostersWithBase,
      crewEvaluated,
      crewViolating: new Set(viols.map((v) => v.crewId)).size,
      violationCount: viols.length,
      sample,
    }),
  )
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
