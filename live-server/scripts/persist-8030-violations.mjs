/**
 * Persist rule 8030 (PILOT AGE) violations into rule_violation.
 *
 * Pipeline (mirrors the 8056 path; see docs/architecture/rule-migration-playbook.md):
 *   roster_flight crew-on-flight  → Rust check-8030 (--emit-tsv)  → rule_violation rows
 * written under the gantt's ACTIVE rule group (workset 103 slug 'pbs_solver_ruleset'),
 * rule_code '8030' / rule_instance from the RULE workset, attached to the TRIGGERING pairing (the flight
 * carrying > MAX over-age pilots) so the gantt — which drops pairing_id NULL rows —
 * renders them, spanning the pairing's start→end.
 *
 * Severity = 2 (Overridable / amber WARNING), consistent with 8056.
 *
 * Idempotent: deletes existing 8030 rows for the group, then re-inserts. Re-runnable.
 *
 * Usage:
 *   node live-server/scripts/persist-8030-violations.mjs [--from .. --to ..]
 *   node live-server/scripts/persist-8030-violations.mjs 60 --division P --max-number 1
 * Defaults come from the RULE workset's 8030 row (not hardcoded instance/params).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { extractFlights, toTsv, runEngine } from './check-8030-age.mjs'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(path.resolve(__dirname, '../..'), 'live-server', '.env')

const GROUP_CODE = 'pbs_solver_ruleset'
const RULE_CODE = '8030'
const SEVERITY = 2 // Overridable / WARNING
const UNIT = 'YEAR'

async function readRuleParams(c) {
  const rule = await loadRulesetRule(c, 8030)
  const row = rule.rows[0]
  const division = fieldRaw(row, rule.header, 'Division')
  const ageLimit = parseInt(fieldRaw(row, rule.header, 'Age Define'), 10)
  const maxNumber = parseInt(fieldRaw(row, rule.header, 'Max Number'), 10)
  const airport = fieldRaw(row, rule.header, 'Airport', '*')
  if (!division || !ageLimit || Number.isNaN(maxNumber)) {
    throw new Error(`8030/${rule.instance} workset ${rule.rulesetId}: missing Division/Age Define/Max Number`)
  }
  return { instance: rule.instance, division, ageLimit, maxNumber, airport }
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

function buildMessage(ageLimit, maxNumber, airport) {
  return `The number of crew older than ${ageLimit} at the airport(${airport}) must not exceed (${maxNumber}).`
}

async function main() {
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const ruleParams = await readRuleParams(c)
  const ageLimit = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ruleParams.ageLimit)
  const division = argFlag('--division', ruleParams.division)
  const maxNumber = Number(argFlag('--max-number', String(ruleParams.maxNumber)))
  const airport = ruleParams.airport

  const rows = await extractFlights()
  // crew|pairing|flt -> segment span for the violation window.
  const span = new Map()
  for (const r of rows) {
    span.set(`${r.crew_id}|${r.pairing_id}|${r.flt_id}`, {
      startSecs: Number(r.start_secs),
      endSecs: Number(r.end_secs),
    })
  }

  const viols = runEngine(toTsv(rows), { ageLimit, division, maxNumber })
  process.stderr.write(`computed ${viols.length} 8030 violations (age ${ageLimit}, div ${division}, max ${maxNumber})\n`)
  const message = buildMessage(ageLimit, maxNumber, airport)

  try {
    await c.query('BEGIN')
    const del = await c.query(
      `DELETE FROM rule_violation WHERE rule_group_code = $1 AND rule_code = $2`,
      [GROUP_CODE, RULE_CODE],
    )
    process.stderr.write(`deleted ${del.rowCount} stale 8030 rows\n`)

    const BATCH = 500
    let inserted = 0
    for (let off = 0; off < viols.length; off += BATCH) {
      const batch = viols.slice(off, off + BATCH)
      const placeholders = []
      const values = []
      batch.forEach((v, idx) => {
        const b = idx * 13
        placeholders.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'rust_8030','rust_8030')`,
        )
        const s = span.get(`${v.crewId}|${v.pairingId}|${v.flightId}`) ?? { startSecs: 0, endSecs: 0 }
        const inputHash = createHash('sha256').update(`${v.crewId}|${v.pairingId}|${v.flightId}|${ageLimit}|8030`).digest('hex')
        values.push(
          v.crewId, // crew_id
          v.pairingId, // pairing_id (attribution)
          GROUP_CODE, // rule_group_code
          RULE_CODE, // rule_code
          ruleParams.instance, // rule_instance
          new Date(s.startSecs * 1000).toISOString(), // start_dt (segment start)
          new Date(s.endSecs * 1000).toISOString(), // end_dt (segment end)
          SEVERITY, // severity
          v.ageYears, // actual_value (crew age, years)
          ageLimit, // limit_value (AGE DEFINE)
          UNIT, // unit
          message, // message
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
    process.stderr.write(`inserted ${inserted} 8030 rows under ${GROUP_CODE}\n`)
    process.stdout.write(JSON.stringify({ deleted: del.rowCount, inserted, ageLimit, division, maxNumber }))
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
