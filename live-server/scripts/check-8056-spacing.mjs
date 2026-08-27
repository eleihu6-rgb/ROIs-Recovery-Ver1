/**
 * Rule 8056 (ROSTER SPACING) — live validation harness.
 *
 * Drives the Rust 8056 engine (rule-engine-rs/target/release/check-8056) against the
 * LIVE roster data: every consecutive FLY duty pair whose gap is below SPACE hours is a
 * spacing violation. Used by the e2e spec `e2e/tests/gantt/rule-8056-spacing.spec.ts`
 * (Rule-3xxx) so the test can assert SPECIFIC violation counts/crew over live data.
 *
 * Data source mirrors the persisted 8056 pipeline exactly:
 *   roster_flight (assignment_group='FLY', pairing_id NOT NULL, is_deleted=0)
 *     → one DUTY per (crew, pairing): start = MIN(duty report/brief), end = MAX(duty release/debrief)
 *       (not MIN(sch_str_dt_utc) / MAX(sch_end_dt_utc); same helpers as Live flyByPairing)
 *     → label = first segment label, else "DEP-ARV" route.
 *   The Rust engine sorts each crew's duties and checks consecutive gaps.
 *
 * Connection string is read from live-server/.env (DATABASE_URL) — no secret is
 * hard-coded. The Rust binary must be built first:
 *   (cd rule-engine-rs && cargo build --release)
 *
 * Usage:
 *   node live-server/scripts/check-8056-spacing.mjs [spaceHours] [--from 2026-06-01 --to 2026-07-01]
 * Prints one JSON object to stdout:
 *   { "spaceHours":24, "crewEvaluated":738, "crewViolating":NNN, "violationCount":NNN,
 *     "worst": { "crewId":"…", "gapMinutes":NNN, "currentLabel":"…", "nextLabel":"…" } }
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'
import { dutyStartUtcExpr, dutyEndUtcExpr } from './assignment-overlap-rest-sql.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-8056')

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

/** Space (hours) + instance from the RULE workset's 8056 membership. */
export async function readParams(c, opts = {}) {
  const rule = await loadRulesetRule(c, 8056, opts)
  const space = Number(fieldRaw(rule.rows[0], rule.header, 'Space'))
  if (!Number.isFinite(space) || space <= 0) {
    throw new Error(`8056/${rule.instance}: missing/invalid Space param`)
  }
  return { rulesetId: rule.rulesetId, instance: rule.instance, spaceHours: space }
}

/** One DUTY per (crew, pairing): duty report/release span + a human label. */
export async function extractDuties() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const { rows } = await c.query(
    `
    SELECT rf.crew_id,
           rf.pairing_id,
           EXTRACT(EPOCH FROM MIN(${dutyStart}))::bigint AS start_secs,
           EXTRACT(EPOCH FROM MAX(${dutyEnd}))::bigint AS end_secs,
           COALESCE(
             NULLIF((ARRAY_AGG(rf.label   ORDER BY rf.sch_str_dt_utc, rf.seg_seq))[1], ''),
             (ARRAY_AGG(rf.dep_arp ORDER BY rf.sch_str_dt_utc, rf.seg_seq))[1] || '-' ||
             (ARRAY_AGG(rf.arv_arp ORDER BY rf.sch_end_dt_utc DESC, rf.seg_seq DESC))[1],
             'P' || rf.pairing_id
           ) AS label
      FROM roster_flight rf
      LEFT JOIN pairing_segment ps
        ON ps.pairing_id = rf.pairing_id
       AND coalesce(ps.is_deleted, 0) = 0
       AND ps.duty_seq = rf.duty_seq
     WHERE rf.is_deleted = 0
       AND rf.assignment_group = 'FLY'
       AND rf.pairing_id IS NOT NULL
       AND rf.sch_str_dt_utc >= $1::timestamptz
       AND rf.sch_str_dt_utc <  $2::timestamptz
     GROUP BY rf.crew_id, rf.pairing_id
    `,
    [from, to],
  )
  await c.end()
  return rows
}

/** Build the TSV the Rust engine reads: crew, pairing, start_secs, end_secs, label. */
export function toTsv(rows) {
  return (
    rows
      .map((r) => {
        const label = String(r.label ?? '').replace(/[\t\n\r]/g, ' ')
        return `${r.crew_id}\t${r.pairing_id}\t${r.start_secs}\t${r.end_secs}\t${label}`
      })
      .join('\n') + '\n'
  )
}

/** Run check-8056 in --emit-tsv mode, return parsed violations. */
export function runEngine(tsv, spaceHours) {
  const res = spawnSync(BIN, ['--space-hours', String(spaceHours), '--emit-tsv'], {
    input: tsv,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (res.status !== 0) {
    throw new Error(`check-8056 failed: ${res.stderr || res.error}`)
  }
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, pairingId, gapStart, gapEnd, mins, currentLabel, nextLabel] = l.split('\t')
      return {
        crewId,
        pairingId: Number(pairingId),
        gapStartSecs: Number(gapStart),
        gapEndSecs: Number(gapEnd),
        gapMinutes: Number(mins),
        currentLabel,
        nextLabel,
      }
    })
}

async function main() {
  const cliSpace = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : null
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  await c.end()
  const spaceHours = cliSpace != null && Number.isFinite(cliSpace) ? cliSpace : p.spaceHours
  const rows = await extractDuties()
  const tsv = toTsv(rows)
  const crewEvaluated = new Set(rows.map((r) => r.crew_id)).size
  const viols = runEngine(tsv, spaceHours)
  viols.sort((a, b) => a.gapMinutes - b.gapMinutes)
  const violatingCrew = new Set(viols.map((v) => v.crewId))
  const worst = viols[0]
    ? {
        crewId: viols[0].crewId,
        gapMinutes: viols[0].gapMinutes,
        currentLabel: viols[0].currentLabel,
        nextLabel: viols[0].nextLabel,
      }
    : null
  process.stdout.write(
    JSON.stringify({
      rulesetId: p.rulesetId,
      instance: p.instance,
      spaceHours,
      crewEvaluated,
      crewViolating: violatingCrew.size,
      violationCount: viols.length,
      worst,
    }),
  )
}

// Only run main() when invoked directly (allows reuse of the exported helpers).
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
