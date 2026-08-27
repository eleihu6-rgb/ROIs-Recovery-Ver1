/**
 * Persist rule 8056 (ROSTER SPACING) violations into rule_violation.
 *
 * Pipeline (mirrors the 8002 path; see docs/architecture/rule-migration-playbook.md):
 *   roster_flight FLY duties  → Rust check-8056 (--emit-tsv)  → rule_violation rows
 * written under the gantt's ACTIVE rule group (workset 103 slug 'pbs_solver_ruleset'),
 * rule_code '8056' / rule_instance from the RULE workset, attached to the TRIGGERING (earlier) pairing
 * so the gantt — which drops pairing_id NULL rows — actually renders them.
 *
 * Severity = 2 (Overridable / amber WARNING): a spacing limit a planner may knowingly
 * accept, distinct from 8002's Hard (3) cumulative-block alarms which remain untouched.
 *
 * Idempotent: deletes existing 8056 rows for the group, then re-inserts. Re-runnable.
 *
 * Usage:
 *   node live-server/scripts/persist-8056-violations.mjs [spaceHours=24] [--from 2026-06-01 --to 2026-07-01]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { extractDuties, toTsv, runEngine } from './check-8056-spacing.mjs'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')

const GROUP_CODE = 'pbs_solver_ruleset'
const RULE_CODE = '8056'
const SEVERITY = 2 // Overridable / WARNING
const UNIT = 'HOUR'

async function readRuleParams(c) {
  const rule = await loadRulesetRule(c, 8056)
  const spaceRaw = fieldRaw(rule.rows[0], rule.header, 'Space')
  const spaceHours = parseInt(spaceRaw, 10)
  if (!spaceRaw || Number.isNaN(spaceHours)) {
    throw new Error(`8056/${rule.instance} workset ${rule.rulesetId}: missing Space`)
  }
  return { instance: rule.instance, spaceHours }
}

function readDatabaseUrl() {
  const env = readFileSync(ENV_PATH, 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

/** "H:MM" with a leading "-" for a negative gap — matches the Rust/C++ message. */
function formatHHMM(minutes) {
  const neg = minutes < 0
  const m = Math.abs(minutes)
  const body = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  return neg ? `-${body}` : body
}

function formatDutyDateTime(epochSeconds) {
  const d = new Date(Number(epochSeconds) * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function buildMessage(v, spaceHours) {
  return `Rest between (${v.currentLabel} ${formatDutyDateTime(
    v.gapStartSecs,
  )}) and (${v.nextLabel} ${formatDutyDateTime(v.gapEndSecs)}) is ${formatHHMM(
    v.gapMinutes,
  )}, which is below the required ${spaceHours} RH.`
}

async function main() {
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const ruleParams = await readRuleParams(c)
  const spaceHours = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ruleParams.spaceHours)
  const rows = await extractDuties()
  const viols = runEngine(toTsv(rows), spaceHours)
  process.stderr.write(`computed ${viols.length} 8056 violations (space ${spaceHours}h)\n`)

  try {
    await c.query('BEGIN')
    const del = await c.query(
      `DELETE FROM rule_violation WHERE rule_group_code = $1 AND rule_code = $2`,
      [GROUP_CODE, RULE_CODE],
    )
    process.stderr.write(`deleted ${del.rowCount} stale 8056 rows\n`)

    const BATCH = 500
    let inserted = 0
    for (let off = 0; off < viols.length; off += BATCH) {
      const batch = viols.slice(off, off + BATCH)
      const values = []
      const placeholders = []
      batch.forEach((v, idx) => {
        const b = idx * 13
        placeholders.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'rust_8056','rust_8056')`,
        )
        const startDt = new Date(v.gapStartSecs * 1000).toISOString()
        const endDt = new Date(v.gapEndSecs * 1000).toISOString()
        const inputHash = createHash('sha256')
          .update(`${v.crewId}|${v.pairingId}|${v.gapStartSecs}|8056`)
          .digest('hex')
        values.push(
          v.crewId, // crew_id
          v.pairingId, // pairing_id (triggering = earlier duty)
          GROUP_CODE, // rule_group_code
          RULE_CODE, // rule_code
          ruleParams.instance, // rule_instance
          startDt, // start_dt (gap start = current duty end)
          endDt, // end_dt (gap end = next duty start)
          SEVERITY, // severity
          Math.round((v.gapMinutes / 60) * 100) / 100, // actual_value (hours)
          spaceHours, // limit_value
          UNIT, // unit
          buildMessage(v, spaceHours), // message
          inputHash, // input_hash
        )
      })
      await c.query(
        `INSERT INTO rule_violation
           (crew_id, pairing_id, rule_group_code, rule_code, rule_instance,
            start_dt, end_dt, severity, actual_value, limit_value, unit, message, input_hash,
            computed_at, created_by, updated_by)
         VALUES ${placeholders.join(',')}`,
        values,
      )
      inserted += batch.length
    }
    await c.query('COMMIT')
    process.stderr.write(`inserted ${inserted} 8056 rows under ${GROUP_CODE}\n`)
    process.stdout.write(JSON.stringify({ deleted: del.rowCount, inserted, spaceHours }))
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err))
  process.exit(1)
})
