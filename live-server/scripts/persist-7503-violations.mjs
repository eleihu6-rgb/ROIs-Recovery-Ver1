/**
 * Persist rule 7503 (LIMITS OF CONSECUTIVE WOCLs) violations into rule_violation.
 *
 * Pipeline (mirrors the 7501/8056 path; see docs/architecture/rule-migration-playbook.md):
 *   roster_flight duties → Rust check-7503 (--emit-tsv) → rule_violation rows under the
 * gantt's ACTIVE rule group (workset 103 slug 'pbs_solver_ruleset'), rule_code '7503' /
 * rule_instance from the RULE workset (via check-7503 readParams), attached to the FIRST WOCL duty's pairing so the gantt renders it,
 * spanning the run (first duty start → last duty end).
 *
 * Severity = 2 (Overridable / amber WARNING), consistent with the other migrated rules.
 * Idempotent: deletes existing 7503 rows for the group, then re-inserts.
 *
 * Usage:
 *   node live-server/scripts/persist-7503-violations.mjs [maxConsecutive=2] [--from .. --to ..]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { readParams, crewOffsets, extractWorkPeriods, toTsv, runEngine } from './check-7503-wocl.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(path.resolve(__dirname, '../..'), 'live-server', '.env')

const GROUP_CODE = 'pbs_solver_ruleset'
const RULE_CODE = '7503'
const SEVERITY = 2
const UNIT = 'WOCL'

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

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  const maxConsecutive = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : p.maxConsecutive)
  const offsets = await crewOffsets(c)
  const { fly, ground } = await extractWorkPeriods(c, from, to)
  const viols = runEngine(toTsv(fly, ground, offsets), p, maxConsecutive)
  process.stderr.write(`computed ${viols.length} 7503 violations (max ${maxConsecutive})\n`)

  try {
    await c.query('BEGIN')
    const del = await c.query(`DELETE FROM rule_violation WHERE rule_group_code = $1 AND rule_code = $2`, [GROUP_CODE, RULE_CODE])
    process.stderr.write(`deleted ${del.rowCount} stale 7503 rows\n`)

    const BATCH = 500
    let inserted = 0
    for (let off = 0; off < viols.length; off += BATCH) {
      const batch = viols.slice(off, off + BATCH)
      const placeholders = []
      const values = []
      batch.forEach((v, idx) => {
        const b = idx * 13
        placeholders.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'rust_7503','rust_7503')`,
        )
        const inputHash = createHash('sha256').update(`${v.crewId}|${v.pairingId}|${v.startSecs}|7503`).digest('hex')
        values.push(
          v.crewId,
          v.pairingId,
          GROUP_CODE,
          RULE_CODE,
          p.instance,
          new Date(v.startSecs * 1000).toISOString(),
          new Date(v.endSecs * 1000).toISOString(),
          SEVERITY,
          v.count, // actual_value (consecutive WOCL duties)
          maxConsecutive, // limit_value (MAX CONSECUTIVE WOCLs)
          UNIT,
          `Concecutive WOCL duties(${v.count}) is more than the limitation(${maxConsecutive}).`,
          inputHash,
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
    process.stderr.write(`inserted ${inserted} 7503 rows under ${GROUP_CODE}\n`)
    process.stdout.write(JSON.stringify({ deleted: del.rowCount, inserted, maxConsecutive }))
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
