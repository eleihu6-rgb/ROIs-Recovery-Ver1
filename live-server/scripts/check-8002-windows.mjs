/**
 * Rule 8002 (MAX_CUM_BLOCK) — multi-window live validation harness.
 *
 * Drives the Rust 8002 engine (rule-engine-rs/target/release/check-8002) against the
 * LIVE roster block-time data for each cumulative-block window defined in the RULE
 * workset's 8002 Type=BH rows (via rule_set — never hardcoded instance/windows).
 * Used by the e2e spec `e2e/tests/gantt/rule-8002-windows.spec.ts` (Rule-3xxx).
 *
 * Data source mirrors the persisted 8002 pipeline exactly:
 *   roster_flight (assignment_group='FLY', pairing_id NOT NULL, is_deleted=0)
 *     → pairing_segment → flight.blk_min
 *   bucketed by the UTC calendar day of sch_str_dt_utc.
 *
 * Connection string is read from live-server/.env (DATABASE_URL) — no secret is
 * hard-coded. The Rust binary must be built first:
 *   (cd rule-engine-rs && cargo build --release)
 *
 * Usage:
 *   node live-server/scripts/check-8002-windows.mjs
 *   node live-server/scripts/check-8002-windows.mjs '28:112,90:300'   # optional override
 * Prints one JSON object to stdout:
 *   { "windows": [ { "windowDays":28, "limitHours":112, ... }, ... ] }
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { loadRulesetRules, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-8002')

function readDatabaseUrl() {
  const env = readFileSync(ENV_PATH, 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

/** Parse "28:40,100:300" into [{windowDays,limitHours}, ...]. */
function parseWindows(arg) {
  return arg.split(',').map((pair) => {
    const [d, h] = pair.split(':').map(Number)
    return { windowDays: d, limitHours: h }
  })
}

/** HH:MM or plain hours → decimal hours. */
function limitToHours(raw) {
  const s = String(raw ?? '').trim()
  if (s.includes(':')) {
    const [h, m] = s.split(':').map(Number)
    return h + (m || 0) / 60
  }
  return Number(s)
}

/** Type=BH Period/Max Limits rows from every 8002 instance in the RULE workset. */
export async function readBhWindows(c, opts = {}) {
  const rules = await loadRulesetRules(c, 8002, opts)
  if (!rules.length) throw new Error('No 8002 rule in RULE workset (rule_set)')
  const windows = []
  for (const rule of rules) {
    for (const row of rule.rows) {
      if (fieldRaw(row, rule.header, 'Type').toUpperCase() !== 'BH') continue
      const windowDays = Number(fieldRaw(row, rule.header, 'Period'))
      const limitHours = limitToHours(fieldRaw(row, rule.header, 'Max Limits'))
      if (!Number.isFinite(windowDays) || !Number.isFinite(limitHours)) {
        throw new Error(`8002/${rule.instance}: invalid BH Period/Max Limits`)
      }
      windows.push({
        instance: rule.instance,
        windowDays,
        limitHours,
      })
    }
  }
  if (!windows.length) {
    throw new Error(`No Type=BH rows in RULE workset 8002 instances [${rules.map((r) => r.instance).join(',')}]`)
  }
  return { rulesetId: rules[0].rulesetId, instances: [...new Set(windows.map((w) => w.instance))], windows }
}

async function extractTsv() {
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const { rows } = await c.query(`
    SELECT rf.crew_id AS crew_id,
           to_char((rf.sch_str_dt_utc AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
           SUM(COALESCE(f.blk_min, 0))::float8 AS mins
      FROM roster_flight rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id AND ps.is_deleted = 0
      JOIN flight f ON f.id = ps.flt_id
     WHERE rf.is_deleted = 0
       AND rf.assignment_group = 'FLY'
       AND rf.pairing_id IS NOT NULL
     GROUP BY rf.crew_id, (rf.sch_str_dt_utc AT TIME ZONE 'UTC')::date
  `)
  await c.end()
  return rows.map((r) => `${r.crew_id}\t${r.day}\t${r.mins}`).join('\n') + '\n'
}

function runEngine(tsv, windowDays, limitHours) {
  // --emit-tsv: one violation per line `crew\twin_start\twin_end\tactual_minutes`.
  const res = spawnSync(
    BIN,
    ['--window-days', String(windowDays), '--limit-hours', String(limitHours), '--emit-tsv'],
    { input: tsv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (res.status !== 0) {
    throw new Error(`check-8002 failed (window ${windowDays}): ${res.stderr || res.error}`)
  }
  const lines = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  const viols = lines.map((l) => {
    const [crewId, winStart, winEnd, mins] = l.split('\t')
    return { crewId, winStart, winEnd, hours: Number(mins) / 60 }
  })
  viols.sort((a, b) => b.hours - a.hours)
  // crew evaluated = distinct crew in the TSV
  const crewEvaluated = new Set(tsv.split('\n').map((l) => l.split('\t')[0]).filter(Boolean)).size
  return {
    windowDays,
    limitHours,
    crewEvaluated,
    crewViolating: viols.length,
    worst: viols[0] ? { crewId: viols[0].crewId, hours: Math.round(viols[0].hours * 10) / 10 } : null,
    violatingCrew: viols.map((v) => v.crewId),
  }
}

async function main() {
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const fromRuleset = await readBhWindows(c)
  await c.end()
  const windows = process.argv[2]
    ? parseWindows(process.argv[2])
    : fromRuleset.windows.map((w) => ({ windowDays: w.windowDays, limitHours: w.limitHours }))
  const tsv = await extractTsv()
  const out = {
    rulesetId: fromRuleset.rulesetId,
    instances: fromRuleset.instances,
    windows: windows.map((w) => runEngine(tsv, w.windowDays, w.limitHours)),
  }
  process.stdout.write(JSON.stringify(out))
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
