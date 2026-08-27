/**
 * Rule 8002 (CREDIT-HOUR BAND) — live harness.
 *
 * Drives the Rust 8002 credit-band engine (rule-engine-rs/target/release/check-8002-credit)
 * over the LIVE roster: 8002 computes each crew's MONTHLY credit standalone (FLY →
 * max(4:00, block); ground/off → flat 4:00), prorates the [min,max] band by availability,
 * and warns when outside it. NO 7502 dependency — 8002 fires by itself. Used by the e2e
 * spec `e2e/tests/gantt/rule-8002-credit.spec.ts` (Rule-3xxx).
 *
 * Instance/ruleset resolved from the active RULE workset — do NOT hardcode instance.
 *
 * Data source: every roster_flight activity in the window (FLY block via flight; ground
 * rows credit the flat floor), one TSV row each: crew, group, block_min, YYYY-MM-DD.
 *
 * Usage:
 *   node live-server/scripts/check-8002-credit.mjs [--min 65 --max 75 --from 2026-06-01 --to 2026-07-01] [--persist]
 * Without --persist: prints a JSON summary. With --persist: writes warnings into
 * rule_violation (rule_code 8002 / instance from workset, sev 2, created_by 'rust_8002_credit').
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { loadRulesetRules, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-8002-credit')

// rule_violation now keys on bigint ruleset_id (= RULE workset, prefer id 103),
// not the dropped varchar rule_group_code column.
const RULE_CODE = '8002'
const SEVERITY = 2 // Overridable / WARNING
const MARKER = 'rust_8002_credit' // created_by — separates these from the BH-window 8002 rows

function hhmmToHours(raw) {
  const s = String(raw ?? '').trim()
  if (s.includes(':')) {
    const [h, m] = s.split(':').map(Number)
    return h + (m || 0) / 60
  }
  return Number(s)
}

/**
 * Credit-band (Type=CH) row from RULE workset 8002 instances, if configured.
 * Current F8 workset 103 may only ship BH/DP — then CLI --min/--max is required.
 */
export async function readRuleMeta(c, opts = {}) {
  const rules = await loadRulesetRules(c, 8002, opts)
  if (!rules.length) throw new Error('No 8002 rule in RULE workset (rule_set)')
  for (const rule of rules) {
    for (const row of rule.rows) {
      if (fieldRaw(row, rule.header, 'Type').toUpperCase() !== 'CH') continue
      const minHours = hhmmToHours(fieldRaw(row, rule.header, 'Min Limits'))
      const maxHours = hhmmToHours(fieldRaw(row, rule.header, 'Max Limits'))
      if (!Number.isFinite(minHours) || !Number.isFinite(maxHours)) {
        throw new Error(`8002/${rule.instance}: invalid CH Min/Max Limits`)
      }
      return {
        rulesetId: rule.rulesetId,
        instance: rule.instance,
        minHours,
        maxHours,
        hasCreditBand: true,
      }
    }
  }
  return {
    rulesetId: rules[0].rulesetId,
    instance: rules[0].instance,
    minHours: null,
    maxHours: null,
    hasCreditBand: false,
  }
}

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

// Per-activity credit, DATA-DRIVEN from the assignment fixed credit (same model 7502 uses):
//   FLIGHT (pairing) segment → block × FT (FLT ft=1.0), via pairing_segment → flight.
//   GROUND (no pairing) duty  → fixed_credit_min only.
// Plus a presence row (credit 0) per roster activity so active-days (proration) counts
// every assigned day even when its credit is 0 (days off) or its block is missing.
// Emits one TSV line per row: crew <TAB> credit_minutes <TAB> YYYY-MM-DD.
async function extractActivities(c, from, to) {
  const fly = await c.query(
    `
    SELECT rf.crew_id AS crew_id, COALESCE(f.blk_min, 0)::int AS credit,
           to_char(rf.pday, 'YYYY-MM-DD') AS day
      FROM (SELECT crew_id, pairing_id, MIN(sch_str_dt_utc::date) AS pday
              FROM roster_flight
             WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
               AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
             GROUP BY crew_id, pairing_id) rf
      JOIN pairing_segment ps ON ps.pairing_id = rf.pairing_id AND ps.is_deleted = 0
      JOIN flight f ON f.id = ps.flt_id
    `,
    [from, to],
  )
  const grd = await c.query(
    `
    SELECT rf.crew_id AS crew_id,
           COALESCE(a.fixed_credit_min, 0)::int AS credit,
           to_char(rf.sch_str_dt_utc::date, 'YYYY-MM-DD') AS day
      FROM roster_flight rf
      LEFT JOIN assignment a ON a.assignment = rf.assignment
     WHERE rf.is_deleted = 0 AND rf.assignment_group = 'GRD'
       AND rf.sch_str_dt_utc >= $1::timestamptz AND rf.sch_str_dt_utc < $2::timestamptz
    `,
    [from, to],
  )
  const presence = await c.query(
    `
    SELECT crew_id, to_char(sch_str_dt_utc::date, 'YYYY-MM-DD') AS day
      FROM roster_flight
     WHERE is_deleted = 0
       AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
    `,
    [from, to],
  )
  const lines = []
  for (const r of fly.rows) lines.push(`${r.crew_id}\t${r.credit}\t${r.day}`)
  for (const r of grd.rows) lines.push(`${r.crew_id}\t${r.credit}\t${r.day}`)
  for (const r of presence.rows) lines.push(`${r.crew_id}\t0\t${r.day}`)
  return lines.join('\n') + '\n'
}

function runEngine(tsv, minHours, maxHours) {
  const res = spawnSync(
    BIN,
    ['--min-hours', String(minHours), '--max-hours', String(maxHours), '--emit-tsv'],
    { input: tsv, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`check-8002-credit failed: ${res.stderr || res.error}`)
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, month, credit, minPro, maxPro, over, activeDays, daysInMonth] = l.split('\t')
      return {
        crewId,
        month,
        creditMin: Number(credit),
        minProMin: Number(minPro),
        maxProMin: Number(maxPro),
        over: over === '1',
        activeDays: Number(activeDays),
        daysInMonth: Number(daysInMonth),
      }
    })
}

const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

function buildMessage(v) {
  const credit = hhmm(v.creditMin)
  if (v.over) {
    return `Monthly credit ${credit} in 1 CM (${v.month}) exceeds the ${hhmm(v.maxProMin)} maximum (8002 credit band ${hhmm(v.minProMin)}–${hhmm(v.maxProMin)}).`
  }
  return `Monthly credit ${credit} in 1 CM (${v.month}) is below the ${hhmm(v.minProMin)} minimum (8002 credit band ${hhmm(v.minProMin)}–${hhmm(v.maxProMin)}).`
}

async function persist(c, viols, from, to, { rulesetId, ruleInstance }) {
  // Map each crew-month to a triggering June pairing so the gantt (which drops
  // pairing_id NULL) renders it. start_dt = month start (distinct from the BH-window rows).
  const { rows: pairRows } = await c.query(
    `
    SELECT DISTINCT ON (crew_id) crew_id, pairing_id
      FROM roster_flight
     WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
       AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
     ORDER BY crew_id, sch_str_dt_utc
    `,
    [from, to],
  )
  const pairingOf = new Map(pairRows.map((r) => [r.crew_id, Number(r.pairing_id)]))

  await c.query('BEGIN')
  const del = await c.query(`DELETE FROM rule_violation WHERE created_by = $1`, [MARKER])
  let inserted = 0
  const rows = viols.filter((v) => pairingOf.has(v.crewId))
  const BATCH = 500
  for (let off = 0; off < rows.length; off += BATCH) {
    const batch = rows.slice(off, off + BATCH)
    const ph = []
    const vals = []
    batch.forEach((v, idx) => {
      const b = idx * 13
      ph.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'${MARKER}','${MARKER}')`,
      )
      const startDt = `${v.month}-01T00:00:00Z`
      const endDt = new Date(Date.UTC(Number(v.month.slice(0, 4)), Number(v.month.slice(5, 7)), 0, 23, 59, 59)).toISOString()
      vals.push(
        v.crewId,
        pairingOf.get(v.crewId),
        rulesetId,
        RULE_CODE,
        ruleInstance,
        startDt,
        endDt,
        SEVERITY,
        Math.round((v.creditMin / 60) * 100) / 100,
        Math.round(((v.over ? v.maxProMin : v.minProMin) / 60) * 100) / 100,
        'HOUR',
        buildMessage(v),
        createHash('sha256').update(`${v.crewId}|${v.month}|8002credit`).digest('hex'),
      )
    })
    await c.query(
      `INSERT INTO rule_violation
         (crew_id, pairing_id, ruleset_id, rule_code, rule_instance,
          start_dt, end_dt, severity, actual_value, limit_value, unit, message, input_hash,
          computed_at, created_by, updated_by)
       VALUES ${ph.join(',')}`,
      vals,
    )
    inserted += batch.length
  }
  await c.query('COMMIT')
  return { deleted: del.rowCount, inserted, skippedNoPairing: viols.length - rows.length }
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const doPersist = process.argv.includes('--persist')

  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const ruleMeta = await readRuleMeta(c)
  const minCli = argFlag('--min', null)
  const maxCli = argFlag('--max', null)
  const minHours = minCli != null ? Number(minCli) : ruleMeta.minHours
  const maxHours = maxCli != null ? Number(maxCli) : ruleMeta.maxHours
  if (!Number.isFinite(minHours) || !Number.isFinite(maxHours)) {
    throw new Error(
      '8002 credit band: RULE workset has no Type=CH row — pass --min and --max, or add a CH band to the workset',
    )
  }
  const tsv = await extractActivities(c, from, to)
  const crewMonths = new Set(tsv.split('\n').filter(Boolean).map((l) => l.split('\t')[0])).size
  const viols = runEngine(tsv, minHours, maxHours)
  const over = viols.filter((v) => v.over).length

  let persisted = null
  if (doPersist) persisted = await persist(c, viols, from, to, ruleMeta)
  await c.end()

  const worst = viols.slice().sort((a, b) => b.creditMin - a.creditMin)[0]
  process.stdout.write(
    JSON.stringify({
      rule: `8002/${ruleMeta.instance}`,
      rulesetId: ruleMeta.rulesetId,
      hasCreditBand: ruleMeta.hasCreditBand,
      minHours,
      maxHours,
      crewEvaluated: crewMonths,
      warnings: viols.length,
      overMax: over,
      underMin: viols.length - over,
      worst: worst ? { crewId: worst.crewId, creditHours: Math.round((worst.creditMin / 60) * 10) / 10, over: worst.over } : null,
      ...(persisted ? { persisted } : {}),
    }),
  )
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
