/**
 * Persist rule 8004 (BASIC COMPETENCY — BASE) violations into rule_violation.
 *
 * Pipeline (mirrors the 8056 path; see docs/architecture/rule-migration-playbook.md):
 *   roster_flight rosters + crew_base quals → Rust check-8004 (--emit-tsv) → rule_violation
 * written under the gantt's ACTIVE rule group (workset 103 slug 'pbs_solver_ruleset'),
 * rule_code '8004' / rule_instance from the RULE workset, attached to the offending pairing (non-null) so
 * the gantt renders it, spanning the roster's start→end.
 *
 * Severity = 2 (Overridable / amber WARNING), consistent with the other migrated rules.
 * 8004 has no numeric band, so actual_value/limit_value are NULL and unit = 'BASE'.
 *
 * Idempotent: deletes existing 8004 rows for the group, then re-inserts. Re-runnable.
 *
 * Usage:
 *   node live-server/scripts/persist-8004-violations.mjs [graceDays=0] [--from .. --to ..]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { extractData, toTsv, runEngine } from './check-8004-competency.mjs'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(path.resolve(__dirname, '../..'), 'live-server', '.env')

const GROUP_CODE = 'pbs_solver_ruleset'
const RULE_CODE = '8004'
const SEVERITY = 2 // Overridable / WARNING
const UNIT = 'BASE'

async function readRuleParams(c) {
  const rule = await loadRulesetRule(c, 8004)
  const graceRaw = fieldRaw(rule.rows[0], rule.header, 'Grace Period', '0')
  const graceDays = parseInt(graceRaw, 10)
  return {
    instance: rule.instance,
    graceDays: Number.isNaN(graceDays) ? 0 : graceDays,
  }
}

function readDatabaseUrl() {
  const env = readFileSync(ENV_PATH, 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

async function main() {
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const ruleParams = await readRuleParams(c)
  const graceDays = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ruleParams.graceDays)
  const data = await extractData()
  // crew|pairing -> { startSecs, endSecs } for the violation span.
  const span = new Map()
  for (const r of data.rosters) {
    span.set(`${r.crew_id}|${r.pairing_id}`, { startSecs: Number(r.start_secs), endSecs: Number(r.end_secs) })
  }

  const viols = runEngine(toTsv(data), graceDays)
  process.stderr.write(`computed ${viols.length} 8004 violations (grace ${graceDays}d)\n`)

  try {
    await c.query('BEGIN')
    const del = await c.query(
      `DELETE FROM rule_violation WHERE rule_group_code = $1 AND rule_code = $2`,
      [GROUP_CODE, RULE_CODE],
    )
    process.stderr.write(`deleted ${del.rowCount} stale 8004 rows\n`)

    const BATCH = 500
    let inserted = 0
    for (let off = 0; off < viols.length; off += BATCH) {
      const batch = viols.slice(off, off + BATCH)
      const placeholders = []
      const values = []
      batch.forEach((v, idx) => {
        const b = idx * 13
        placeholders.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'rust_8004','rust_8004')`,
        )
        const s = span.get(`${v.crewId}|${v.pairingId}`) ?? { startSecs: 0, endSecs: 0 }
        const inputHash = createHash('sha256').update(`${v.crewId}|${v.pairingId}|${v.base}|8004`).digest('hex')
        values.push(
          v.crewId, // crew_id
          v.pairingId, // pairing_id (offending roster)
          GROUP_CODE, // rule_group_code
          RULE_CODE, // rule_code
          ruleParams.instance, // rule_instance
          new Date(s.startSecs * 1000).toISOString(), // start_dt (roster start)
          new Date(s.endSecs * 1000).toISOString(), // end_dt (roster end)
          SEVERITY, // severity
          null, // actual_value (no numeric band)
          null, // limit_value
          UNIT, // unit
          `${v.crewId}: No base (${v.base}) assigned in roster.`, // message
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
    process.stderr.write(`inserted ${inserted} 8004 rows under ${GROUP_CODE}\n`)
    process.stdout.write(JSON.stringify({ deleted: del.rowCount, inserted, graceDays }))
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
