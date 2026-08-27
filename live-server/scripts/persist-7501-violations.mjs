/**
 * Persist rule 7501 (SINGLE DAY FREE FROM DUTY) violations into rule_violation.
 *
 * Pipeline (see docs/architecture/rule-migration-playbook.md):
 *   roster_flight work periods → Rust check-7501 (--emit-tsv) → one row per VIOLATING crew
 * (the worst rolling-window). Written under the gantt's ACTIVE group (workset 103 slug
 * 'pbs_solver_ruleset'), rule_code '7501' / rule_instance from that workset's rule_set
 * membership (not a hardcoded instance), attached to the TRIGGERING pairing (the pairing
 * overlapping/nearest the worst window) so the gantt — which drops pairing_id NULL rows —
 * renders them. Crew with no FLY pairing in the period (pure-ground) have no pairing puck
 * to hang a bell on and are skipped (logged).
 *
 * Severity = 1 (rule 7501's configured severity → yellow in the gantt's 1-5 palette).
 * Params (period / buffer / min-limits / local-night band) come from the RULE workset's
 * 7501 + 2014 via readParams(), so config drives the engine. Idempotent: deletes existing
 * 7501 rows for the group first.
 *
 * Usage:
 *   node live-server/scripts/persist-7501-violations.mjs [minLimits] [--from 2026-06-01 --to 2026-07-01]
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import {
  readDatabaseUrl,
  readParams,
  crewOffsets,
  extractWorkPeriods,
  crewQualEntries,
  crewTeams,
  toStructuredTsv,
  runEngine,
} from './check-7501-sdfd.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
void __dirname

const GROUP_CODE = 'pbs_solver_ruleset'
const RULE_CODE = '7501'
const SEVERITY = 1 // rule 7501 configured severity (yellow)
const UNIT = 'RH'

function argFlag(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/** Epoch seconds → crew-base local 'YYYY-MM-DD HH:mm' (same as legality-recheck-core). */
function formatDutyDateTime(epochSeconds, zoneId = 'UTC') {
  const d = new Date(Number(epochSeconds) * 1000)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zoneId || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d)
    const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

function buildMessage(v, zoneId) {
  const w0 = formatDutyDateTime(v.windowStartSecs, zoneId)
  const w1 = formatDutyDateTime(v.windowEndSecs, zoneId)
  return `Single day free from duty (${v.totalSdfd}) must be at least ${v.minLimits} in ${v.periodHours} ${v.unit} (${w0} .. ${w1}).`
}

async function crewBaseTimezone(c) {
  const { rows } = await c.query(
    `select distinct on (cb.crew_id) cb.crew_id, coalesce(a.zone_id, 'UTC') as zone_id
       from crew_base cb
       left join airport a on a.airport = cb.base
      where cb.is_prime_base = 1
      order by cb.crew_id, cb.eff_dt desc`,
  )
  return new Map(rows.map((r) => [String(r.crew_id), r.zone_id]))
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const checkedEndSecs = Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000) - 1

  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  try {
    const p = await readParams(c)
    const minLimits =
      process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : p.minLimits
    const offsets = await crewOffsets(c)
    const tzMap = await crewBaseTimezone(c)
    const { fly, ground } = await extractWorkPeriods(c, from, to)
    const qualRows = await crewQualEntries(c)
    const teamMap = await crewTeams(c, from, to)
    const tsv = toStructuredTsv(fly, ground, offsets, p, qualRows, teamMap)
    const all = runEngine(tsv, p, minLimits, checkedEndSecs)
    const viols = all.filter((v) => v.triggerPairingId != null)
    const skipped = all.length - viols.length
    process.stderr.write(
      `computed ${all.length} 7501 crew violations (minLimits ${minLimits}); ${skipped} skipped (no pairing)\n`,
    )

    await c.query('BEGIN')
    const del = await c.query(
      `DELETE FROM rule_violation WHERE rule_group_code = $1 AND rule_code = $2`,
      [GROUP_CODE, RULE_CODE],
    )
    process.stderr.write(`deleted ${del.rowCount} stale 7501 rows\n`)

    const BATCH = 500
    let inserted = 0
    for (let off = 0; off < viols.length; off += BATCH) {
      const batch = viols.slice(off, off + BATCH)
      const values = []
      const placeholders = []
      batch.forEach((v, idx) => {
        const b = idx * 13
        placeholders.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'rust_7501_sdfd','rust_7501_sdfd')`,
        )
        const startDt = new Date(v.windowStartSecs * 1000).toISOString()
        const endDt = new Date(v.windowEndSecs * 1000).toISOString()
        const inputHash = createHash('sha256')
          .update(`${v.crewId}|${v.triggerPairingId}|${v.windowStartSecs}|7501`)
          .digest('hex')
        const ruleInstance = p.ruleRows.find((row) => row.rowId === v.rowId)?.instance ?? p.instance
        values.push(
          v.crewId, // crew_id
          v.triggerPairingId, // pairing_id (triggering / nearest pairing)
          GROUP_CODE, // rule_group_code
          RULE_CODE, // rule_code
          ruleInstance, // rule_instance from RULE workset membership
          startDt, // start_dt (worst window start)
          endDt, // end_dt (worst window end)
          SEVERITY, // severity
          v.totalSdfd, // actual_value (SDFD count)
          v.minLimits, // limit_value (required SDFD)
          UNIT, // unit
          buildMessage(v, tzMap.get(String(v.crewId))), // message
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
    process.stderr.write(`inserted ${inserted} 7501 rows under ${GROUP_CODE}\n`)
    process.stdout.write(JSON.stringify({ deleted: del.rowCount, inserted, skipped, minLimits }))
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
