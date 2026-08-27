/**
 * Persist rule 7504 (SPACING RULE - WOCL) violations into rule_violation.
 *
 * Pipeline (mirrors 8056/7503): roster_flight WOCL duties → Rust check-7504 (--emit-tsv) →
 * rule_violation rows under the gantt's ACTIVE rule group ('pbs_solver_ruleset'), rule_code
 * '7504' / rule_instance from the RULE workset (via check-7504 readParams), attached to the earlier (current) duty's pairing, spanning
 * the rest gap. Severity 2 (Overridable / amber). Idempotent.
 *
 * Usage:
 *   node live-server/scripts/persist-7504-violations.mjs [minPeriod=80] [--from .. --to ..]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { readParams, crewOffsets, extractDuties, toTsv, runEngine } from './check-7504-wocl-spacing.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_PATH = path.join(path.resolve(__dirname, '../..'), 'live-server', '.env')

const GROUP_CODE = 'pbs_solver_ruleset'
const RULE_CODE = '7504'
const SEVERITY = 2

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
/** Format a UTC epoch (secs) as local "YYYY-MM-DD HH:MM" (offset = minutes east of UTC). */
function fmtLocal(utcSecs, offsetMin) {
  const d = new Date((utcSecs + offsetMin * 60) * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/** Date-only slice of fmtLocal — matches legality-recheck-core rule7504 message dates. */
function fmtLocalDate(utcSecs, offsetMin) {
  return fmtLocal(utcSecs, offsetMin).slice(0, 10)
}

/** Minutes → HH:MM (same shape as legality-recheck-core formatMinutesHHMM). */
function formatMinutesHHMM(min) {
  const n = Math.round(Number(min) || 0)
  const neg = n < 0
  const abs = Math.abs(n)
  const body = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return neg ? `-${body}` : body
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  const unit = String(p.unit ?? 'RH').trim().toUpperCase() || 'RH'
  const minPeriod = Number(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : p.minPeriod)
  const offsets = await crewOffsets(c)
  const duties = await extractDuties(c, from, to)
  const startByCrewEnd = new Map()
  const startByCrewPairing = new Map()
  for (const r of duties) {
    const crew = String(r.crew_id)
    startByCrewEnd.set(`${crew}\t${String(r.end_secs)}`, Number(r.start_secs))
    startByCrewPairing.set(`${crew}\t${String(r.pairing_id)}`, Number(r.start_secs))
  }
  const viols = runEngine(toTsv(duties, offsets), p, minPeriod)
  process.stderr.write(`computed ${viols.length} 7504 violations (min ${minPeriod} ${unit})\n`)

  try {
    await c.query('BEGIN')
    const del = await c.query(`DELETE FROM rule_violation WHERE rule_group_code = $1 AND rule_code = $2`, [GROUP_CODE, RULE_CODE])
    process.stderr.write(`deleted ${del.rowCount} stale 7504 rows\n`)

    const BATCH = 500
    let inserted = 0
    for (let off = 0; off < viols.length; off += BATCH) {
      const batch = viols.slice(off, off + BATCH)
      const placeholders = []
      const values = []
      batch.forEach((v, idx) => {
        const b = idx * 13
        placeholders.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'rust_7504','rust_7504')`,
        )
        const inputHash = createHash('sha256').update(`${v.crewId}|${v.pairingId}|${v.gapStartSecs}|7504`).digest('hex')
        const crew = String(v.crewId)
        const duty1Start = startByCrewEnd.get(`${crew}\t${String(v.gapStartSecs)}`)
          ?? startByCrewPairing.get(`${crew}\t${String(v.pairingId)}`)
          ?? v.gapStartSecs
        const d1 = fmtLocalDate(duty1Start, v.offsetMin)
        const d2 = fmtLocalDate(v.gapEndSecs, v.offsetMin)
        let msg
        let actualValue
        let unitDb
        if (unit === 'CD') {
          actualValue = v.gapMinutes
          unitDb = 'DAY'
          msg = `Rest between consecutive WOCL flight duties (${d1}, ${d2}) is ${actualValue} less than ${minPeriod} CD.`
        } else {
          actualValue = Math.round((v.gapMinutes / 60) * 100) / 100
          unitDb = 'HOUR'
          const gapHHMM = formatMinutesHHMM(v.gapMinutes)
          msg = `Rest between consecutive WOCL flight duties (${d1}, ${d2}) is ${gapHHMM} less than ${minPeriod} RH.`
        }
        values.push(
          v.crewId,
          v.pairingId,
          GROUP_CODE,
          RULE_CODE,
          p.instance,
          new Date(v.gapStartSecs * 1000).toISOString(),
          new Date(v.gapEndSecs * 1000).toISOString(),
          SEVERITY,
          actualValue,
          minPeriod,
          unitDb,
          msg,
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
    process.stderr.write(`inserted ${inserted} 7504 rows under ${GROUP_CODE}\n`)
    process.stdout.write(JSON.stringify({ deleted: del.rowCount, inserted, minPeriod }))
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
