/**
 * Rule 7272 (CALCULATE DP OF THE RESERVES) — live harness (CALC / Definition rule).
 *
 * Drives the Rust 7272 calculator (rule-engine-rs/target/release/check-7272) over the LIVE
 * June reserve rosters: each standby/reserve roster earns a duty-period (DP) = rate × the
 * (offset-adjusted) standby duration. This is a DEFINITION rule (category=Definition, like
 * 7502/2014/7500) — it computes a DP value that other duty rules consume and emits **NO
 * violations**. The "end goal" is therefore the Legality config tab + a DP report, NOT an
 * Alert Center alarm (and an assertion that it writes zero rule_violation rows).
 *
 * Param authority = 7272 membership in the active RULE workset (prefer workset id 103).
 * Do NOT hardcode `rule.instance` (F8 currently ships 7272/001). DATA GOTCHA (playbook §5c class):
 * the param lists the dictionary standby codes SBY|PRAM|PRPM, but the live roster_flight uses 'RES'
 * for reserve standby (RES is in the same RES dictionary group as PRAM/PRPM). The harness adds 'RES'
 * to the matched assignments so it computes DP over the real reserve population. No notification/callout
 * data exists live → every reserve uses the regular-standby path (notification=0).
 *
 * Usage:
 *   node live-server/scripts/check-7272-standby-dp.mjs [--from 2026-06-01 --to 2026-07-01]
 * Prints a JSON summary. (No --persist: a CALC rule writes nothing.)
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { loadRulesetRule, fieldRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-7272')
// The live roster reserve-standby code (the param's SBY|PRAM|PRPM are dictionary codes).
const ROSTER_RESERVE_CODE = 'RES'

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
const hhmmToMin = (s) => {
  const [h, m] = String(s).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Read 7272 standby-DP params from the RULE workset. */
export async function readParam(c, opts = {}) {
  const rule = await loadRulesetRule(c, 7272, opts)
  const row = rule.rows[0]
  const assignmentsRaw = fieldRaw(row, rule.header, 'Assignments')
  if (!assignmentsRaw) {
    throw new Error(`7272/${rule.instance} workset ${rule.rulesetId}: missing Assignments`)
  }
  const assignments = assignmentsRaw.split('|').filter(Boolean)
  if (!assignments.includes(ROSTER_RESERVE_CODE)) assignments.push(ROSTER_RESERVE_CODE)
  const offsetRaw = fieldRaw(row, rule.header, 'Standby Offset')
  const rateRaw = fieldRaw(row, rule.header, 'Rate')
  const sbyLimitRaw = fieldRaw(row, rule.header, 'SBY Limit')
  const notifyLimitRaw = fieldRaw(row, rule.header, 'Notification Limit')
  if (!offsetRaw || !rateRaw || !sbyLimitRaw || !notifyLimitRaw) {
    throw new Error(`7272/${rule.instance} workset ${rule.rulesetId}: missing Standby Offset/Rate/SBY Limit/Notification Limit`)
  }
  return {
    rulesetId: rule.rulesetId,
    instance: rule.instance,
    assignments,
    offsetMin: hhmmToMin(offsetRaw),
    rate: Number(rateRaw),
    sbyLimitMin: hhmmToMin(sbyLimitRaw),
    notifyLimitMin: hhmmToMin(notifyLimitRaw),
  }
}

/** Reserve rosters in the window, one TSV line each (no live callout → notification/report 0). */
async function reserveRows(c, from, to, codes) {
  const { rows } = await c.query(
    `
    SELECT crew_id, assignment AS qualifier,
           EXTRACT(EPOCH FROM sch_str_dt_utc)::bigint AS s,
           EXTRACT(EPOCH FROM sch_end_dt_utc)::bigint AS e
      FROM roster_flight
     WHERE is_deleted = 0 AND assignment = ANY($3)
       AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
    `,
    [from, to, codes],
  )
  return rows.map((r) => `${r.crew_id}\t${r.qualifier}\t${r.s}\t${r.e}\t0\t0`)
}

function runEngine(tsv, p) {
  const res = spawnSync(
    BIN,
    [
      '--assignments', p.assignments.join(','),
      '--rate', String(p.rate),
      '--offset-min', String(p.offsetMin),
      '--sby-limit-min', String(p.sbyLimitMin),
      '--notify-limit-min', String(p.notifyLimitMin),
      '--emit-tsv',
    ],
    { input: tsv, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`check-7272 failed: ${res.stderr || res.error}`)
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, dpMin] = l.split('\t')
      return { crewId, dpMin: Number(dpMin) }
    })
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')

  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const param = await readParam(c)
  const rows = await reserveRows(c, from, to, param.assignments)
  // Verify zero 7272 violations exist (CALC rule writes none).
  const { rows: vrows } = await c.query(
    `SELECT count(*)::int AS n FROM rule_violation WHERE rule_code = '7272'`,
  )
  await c.end()

  const dps = runEngine(rows.join('\n') + '\n', param)
  const byCrew = new Map()
  let totalDpMin = 0
  for (const d of dps) {
    totalDpMin += d.dpMin
    byCrew.set(d.crewId, (byCrew.get(d.crewId) || 0) + d.dpMin)
  }
  const longest = [...dps].sort((a, b) => b.dpMin - a.dpMin).slice(0, 5)

  const hh = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  const summary = {
    rule: `7272/${param.instance}`,
    kind: 'CALC/Definition',
    window: `${from}..${to}`,
    assignments: param.assignments,
    rate: param.rate,
    offsetMin: param.offsetMin,
    reserveRosters: dps.length,
    crewWithReserves: byCrew.size,
    totalReserveDpHours: Math.round((totalDpMin / 60) * 10) / 10,
    avgDpHoursPerReserve: dps.length ? Math.round((totalDpMin / dps.length / 60) * 100) / 100 : 0,
    longest: longest.map((d) => ({ crewId: d.crewId, dp: hh(d.dpMin) })),
    violationsWritten: vrows[0].n,
  }
  process.stdout.write(JSON.stringify(summary) + '\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
