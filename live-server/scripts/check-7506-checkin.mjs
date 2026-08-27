/**
 * Rule 7506 (ONE CHECKIN PER DAY) — live validation + persistence harness.
 *
 * The rule: a crew may check in at most ONCE per crew-LOCAL calendar day for the checked
 * assignment groups (F8 = "FLY"). Two FLY pairings (check-ins) that START the same local
 * day → violation (severity 1, ROSTER).
 *
 * Live-port: check-ins are FLY pairings (one per crew×pairing) plus non-pairing
 * ground rows (duty = assignment code, e.g. SIM). `rule7506` filters to the
 * instance Assignments list (e.g. FLY|SIM). Local-day bucketing uses the crew's
 * PRIME-BASE offset. Params are read from the RULE workset — do NOT hardcode instance.
 *
 * Connection string is read from live-server/.env (DATABASE_URL) — no secret hard-coded.
 *
 * Usage:
 *   node live-server/scripts/check-7506-checkin.mjs [--from 2026-06-01 --to 2026-07-01] [--persist]
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { readDatabaseUrl, crewOffsets } from './check-7501-sdfd.mjs'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-7506')

// rule_violation now keys on bigint ruleset_id (= RULE workset, prefer id 103),
// not the dropped varchar rule_group_code column.
const RULE_CODE = '7506'
const SEVERITY = 1 // Soft / yellow (DB rule severity = 1)
const CREATED_BY = 'rust_7506'

function argFlag(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

/** Read 7506 checked assignment groups from the RULE workset (header "Assignments"). */
export async function readCheckedGroups(c, opts = {}) {
  const rule = await loadRulesetRule(c, 7506, opts)
  const raw = fieldRaw(rule.rows[0], rule.header, 'Assignments')
  if (!raw) {
    throw new Error(`7506/${rule.instance} workset ${rule.rulesetId}: missing Assignments`)
  }
  return { checkedRaw: raw, instance: rule.instance, rulesetId: rule.rulesetId }
}

/** Check-ins: FLY pairings + ground rows (duty = assignment code). */
async function loadCheckins(c, from, to) {
  const r = await c.query(
    `SELECT crew_id, pairing_id, assignment_group AS duty,
            EXTRACT(EPOCH FROM MIN(sch_str_dt_utc))::bigint AS start_secs,
            EXTRACT(EPOCH FROM MAX(sch_end_dt_utc))::bigint  AS end_secs
       FROM roster_flight
      WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
        AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
      GROUP BY crew_id, pairing_id, assignment_group
     UNION ALL
     SELECT crew_id, 0::bigint AS pairing_id, assignment AS duty,
            EXTRACT(EPOCH FROM sch_str_dt_utc)::bigint AS start_secs,
            EXTRACT(EPOCH FROM sch_end_dt_utc)::bigint AS end_secs
       FROM roster_flight
      WHERE is_deleted = 0 AND pairing_id IS NULL
        AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz`,
    [from, to],
  )
  return r.rows
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const persist = process.argv.includes('--persist')

  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()

  const { checkedRaw, instance: ruleInstance, rulesetId } = await readCheckedGroups(c)
  const checked = new Set(
    checkedRaw.split('|').map((s) => s.trim().toUpperCase()).filter(Boolean),
  )
  const offsets = await crewOffsets(c)
  const checkins = await loadCheckins(c, from, to)

  // Build TSV for the engine + keep a per-crew index of (start → pairing) to attach bells.
  const lines = []
  const byCrew = new Map() // crew → [{pairingId, start, end, off}]
  for (const r of checkins) {
    const duty = String(r.duty ?? 'FLY').trim().toUpperCase()
    if (!checked.has(duty) && !checked.has('*')) continue
    const crew = String(r.crew_id)
    const off = offsets.get(crew) ?? -360
    const start = Number(r.start_secs)
    const end = Number(r.end_secs)
    lines.push(`${crew}\t${duty}\t${start}\t${end}\t${off}`)
    if (!byCrew.has(crew)) byCrew.set(crew, [])
    byCrew.get(crew).push({ pairingId: String(r.pairing_id ?? 0), start, end, off })
  }

  const res = spawnSync(BIN, ['--checked-groups', checkedRaw, '--emit-tsv'], {
    input: lines.join('\n'),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (res.status !== 0) {
    console.error('check-7506 failed:', res.stderr)
    await c.end()
    process.exit(1)
  }

  // Parse engine violations: crew, local_day_start, viol_start, viol_end, checked_raw.
  const viols = res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crew, dayStart, vStart, vEnd, raw] = l.split('\t')
      return { crew, dayStart: Number(dayStart), vStart: Number(vStart), vEnd: Number(vEnd), raw }
    })

  // Attach each violation to the LATER (offending) FLY pairing that starts that local day.
  const DAY = 24 * 3600
  const attached = []
  let unattached = 0
  for (const v of viols) {
    const list = byCrew.get(v.crew) ?? []
    const sameDay = list
      .filter((p) => {
        const d = p.start - ((((p.start + p.off * 60) % DAY) + DAY) % DAY)
        return d === v.dayStart
      })
      .sort((a, b) => a.start - b.start)
    const curr = sameDay[sameDay.length - 1] // the later check-in = curr roster
    if (!curr) {
      unattached++
      continue
    }
    attached.push({
      crew: v.crew,
      pairingId: curr.pairingId,
      start: v.vStart,
      end: v.vEnd,
      dayStart: v.dayStart,
      raw: v.raw,
    })
  }

  const crewViolating = new Set(viols.map((v) => v.crew)).size

  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify({
        checkedRaw,
        flyCheckins: checkins.length,
        crewEvaluated: byCrew.size,
        violations: viols.length,
        crewViolating,
        attachable: attached.length,
        unattached,
      }),
    )
    await c.end()
    return
  }

  console.log('─────────────────────────────────────────────────────────────')
  console.log(' Rule 7506 (ONE CHECKIN PER DAY) — live (June 2026)')
  console.log(` checked groups : ${checkedRaw}`)
  console.log(` FLY check-ins  : ${checkins.length}   across ${byCrew.size} crew`)
  console.log(` violations     : ${viols.length}   across ${crewViolating} crew`)
  console.log(` attachable     : ${attached.length}   (unattached: ${unattached})`)
  console.log(` engine stderr  : ${res.stderr.trim()}`)
  console.log('─────────────────────────────────────────────────────────────')

  if (persist) {
    try {
      await c.query('BEGIN')
      const del = await c.query(
        `DELETE FROM rule_violation WHERE ruleset_id=$1 AND rule_code=$2`,
        [rulesetId, RULE_CODE],
      )
      const BATCH = 500
      let written = 0
      for (let off = 0; off < attached.length; off += BATCH) {
        const batch = attached.slice(off, off + BATCH)
        const placeholders = []
        const values = []
        batch.forEach((a, idx) => {
          const b = idx * 13
          placeholders.push(
            `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'${CREATED_BY}','${CREATED_BY}')`,
          )
          const inputHash = createHash('sha256')
            .update(`${a.crew}|${a.pairingId}|${a.start}|7506`)
            .digest('hex')
          const dayYmd = (() => {
            const off = offsets.get(a.crew) ?? -360
            const d = new Date((a.dayStart + off * 60) * 1000)
            const y = d.getUTCFullYear()
            const m = String(d.getUTCMonth() + 1).padStart(2, '0')
            const day = String(d.getUTCDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
          })()
          const msg = `Multiple check-ins per day (${dayYmd}).`
          values.push(
            a.crew,
            a.pairingId,
            rulesetId,
            RULE_CODE,
            ruleInstance,
            new Date(a.start * 1000).toISOString(),
            new Date(a.end * 1000).toISOString(),
            SEVERITY,
            null, // actual_value — N/A for a same-day check-in breach
            1, // limit_value — max one check-in per day
            'DAY',
            msg,
            inputHash,
          )
        })
        await c.query(
          `INSERT INTO rule_violation
             (crew_id, pairing_id, ruleset_id, rule_code, rule_instance,
              start_dt, end_dt, severity, actual_value, limit_value, unit, message, input_hash,
              computed_at, created_by, updated_by)
           VALUES ${placeholders.join(',')}`,
          values,
        )
        written += batch.length
      }
      await c.query('COMMIT')
      console.log(` persisted      : deleted ${del.rowCount}, inserted ${written} (ruleset ${rulesetId}, sev ${SEVERITY})`)
      console.log('─────────────────────────────────────────────────────────────')
    } catch (err) {
      await c.query('ROLLBACK')
      throw err
    }
  }

  await c.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
