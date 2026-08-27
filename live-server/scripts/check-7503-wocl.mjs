/**
 * Rule 7503 (LIMITS OF CONSECUTIVE WOCLs) — live validation harness.
 *
 * Drives the Rust 7503 engine (rule-engine-rs/target/release/check-7503) against the LIVE
 * roster: a WOCL duty is a flight duty whose FDP overlaps the WOCL window [02:00,05:59] in
 * the crew's acclimatisation-local time. Consecutive WOCL duties accumulate unless a full
 * local night of rest (rule 2014), a ground duty, or a non-WOCL duty resets the run; a run
 * larger than MAX CONSECUTIVE WOCLs is a violation.
 *
 * Params come from the active RULE workset (prefer workset id 103) via `rule_set` → `rule`.
 * Do NOT hardcode `rule.instance` (F8 currently ships 7503/001 + 2014/001; older docs said 003/014):
 *   7503 param_json row 0 → WOCL Start / WOCL End / Max Consecutive WOCLs.
 *   2014 param_json         → Local Night Start / End / Min Interval Hours (the reset band).
 *
 * Rule 7500 (acclimatisation) supplies the WOCL-evaluation timezone. roster_flight carries
 * no per-segment airport TZ (dep_arp/flt_id null), so — exactly as the C++ falls back when
 * the acclimatisation ref TZ is unset — the live port uses the crew PRIME-BASE TZ (the
 * dominant domestic case). See the 7500 note in rule-engine-rs/src/lib.rs.
 *
 * Work periods (C++ GetWorkFDPPeriods): one DUTY per (crew, pairing, duty_seq), FDP span =
 * MIN(sch_str)..MAX(sch_end); ground tasks (pairing IS NULL, excluding rest/leave) reset.
 *
 * Usage:
 *   node live-server/scripts/check-7503-wocl.mjs [maxConsecutive] [--from .. --to ..]
 *   node live-server/scripts/check-7503-wocl.mjs --compare    # MAX 3 (legacy) vs 2 (migrated)
 * Prints one JSON object (or, with --compare, { params, at3, at2 }).
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
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-7503')

/** June-2026 UTC offset (minutes east of UTC, DST active) per crew base. Default MDT. */
const BASE_OFFSET_MIN = {
  YYZ: -240, YUL: -240, YOW: -240, YKF: -240,
  YWG: -300,
  YEG: -360, YYC: -360,
  YVR: -420, YXX: -420, YLW: -420,
  OOL: 600,
}
const DEFAULT_OFFSET_MIN = -360
/** Codes whose roster lines are REST/leave → ignored entirely (not even resets). */
const REST_LEAVE_CODES = new Set(['DO', 'VAC', 'ILL', 'LO', 'LEA'])

export function readDatabaseUrl() {
  const env = readFileSync(ENV_PATH, 'utf8')
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL not found in live-server/.env')
  return line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
}

function argFlag(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function hhmmToMin(s) {
  const [h, m] = String(s).split(':').map((x) => parseInt(x, 10))
  return h * 60 + (m || 0)
}

/** Read 7503 + 2014 params from the RULE workset (`rule_set` → `rule`). */
export async function readParams(c, opts = {}) {
  const rule7503 = await loadRulesetRule(c, 7503, opts)
  const nightRule = await loadRulesetRule(c, 2014, opts)
  const row0 = rule7503.rows[0]
  const nightRow = nightRule.rows[0]
  const maxConsecutive = parseInt(fieldRaw(row0, rule7503.header, 'Max Consecutive WOCLs'), 10)
  const woclStartRaw = fieldRaw(row0, rule7503.header, 'WOCL Start')
  const woclEndRaw = fieldRaw(row0, rule7503.header, 'WOCL End')
  if (!woclStartRaw || !woclEndRaw || !maxConsecutive || Number.isNaN(maxConsecutive)) {
    throw new Error(
      `7503/${rule7503.instance} workset ${rule7503.rulesetId}: missing WOCL Start/End or Max Consecutive WOCLs`,
    )
  }
  const nightStartRaw = fieldRaw(nightRow, nightRule.header, 'Local Night Start')
  const nightEndRaw = fieldRaw(nightRow, nightRule.header, 'Local Night End')
  const minRestRaw = fieldRaw(nightRow, nightRule.header, 'Min Interval Hours')
  if (!nightStartRaw || !nightEndRaw || !minRestRaw) {
    throw new Error(
      `2014/${nightRule.instance} workset ${nightRule.rulesetId}: missing Local Night Start/End or Min Interval Hours`,
    )
  }
  return {
    rulesetId: rule7503.rulesetId,
    instance: rule7503.instance,
    nightInstance: nightRule.instance,
    woclStartMin: hhmmToMin(woclStartRaw),
    woclEndMin: hhmmToMin(woclEndRaw),
    maxConsecutive,
    nightStartMin: hhmmToMin(nightStartRaw),
    nightEndMin: hhmmToMin(nightEndRaw),
    minRestMin: hhmmToMin(minRestRaw),
  }
}

/** Crew → prime-base offset (minutes), the WOCL-evaluation TZ (rule 7500 fallback). */
export async function crewOffsets(c) {
  const byCrew = new Map()
  for (const r of (await c.query(`SELECT crew_id, base FROM crew_base WHERE is_prime_base = 1`)).rows) byCrew.set(String(r.crew_id), r.base)
  for (const r of (await c.query(`SELECT crew_id, base FROM crew_base`)).rows) if (!byCrew.has(String(r.crew_id))) byCrew.set(String(r.crew_id), r.base)
  const out = new Map()
  for (const [crew, base] of byCrew) out.set(crew, BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN)
  return out
}

/** Flight DUTIES (one per crew×pairing×duty_seq) + ground work periods (resets). */
export async function extractWorkPeriods(c, from, to) {
  const fly = await c.query(
    `SELECT crew_id, pairing_id, duty_seq,
            EXTRACT(EPOCH FROM MIN(sch_str_dt_utc))::bigint AS start_secs,
            EXTRACT(EPOCH FROM MAX(sch_end_dt_utc))::bigint  AS end_secs
       FROM roster_flight
      WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
        AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
      GROUP BY crew_id, pairing_id, duty_seq`,
    [from, to],
  )
  const ground = await c.query(
    `SELECT crew_id, assignment,
            EXTRACT(EPOCH FROM sch_str_dt_utc)::bigint AS start_secs,
            EXTRACT(EPOCH FROM sch_end_dt_utc)::bigint AS end_secs
       FROM roster_flight
      WHERE is_deleted = 0 AND pairing_id IS NULL
        AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz`,
    [from, to],
  )
  const groundWork = ground.rows.filter((r) => !REST_LEAVE_CODES.has(String(r.assignment)))
  return { fly: fly.rows, ground: groundWork }
}

/** TSV: crew, pairing|'', start, end, offset_min, is_ground(0/1). */
export function toTsv(fly, ground, offsets) {
  const lines = []
  for (const r of fly) {
    const off = offsets.get(String(r.crew_id)) ?? DEFAULT_OFFSET_MIN
    lines.push(`${r.crew_id}\t${r.pairing_id}\t${r.start_secs}\t${r.end_secs}\t${off}\t0`)
  }
  for (const r of ground) {
    const off = offsets.get(String(r.crew_id)) ?? DEFAULT_OFFSET_MIN
    lines.push(`${r.crew_id}\t\t${r.start_secs}\t${r.end_secs}\t${off}\t1`)
  }
  return lines.join('\n') + '\n'
}

/** Run check-7503 --emit-tsv, return parsed violations. */
export function runEngine(tsv, p, maxConsecutive) {
  const res = spawnSync(
    BIN,
    [
      '--emit-tsv',
      '--wocl-start-min', String(p.woclStartMin),
      '--wocl-end-min', String(p.woclEndMin),
      '--max-consecutive', String(maxConsecutive),
      '--night-start-min', String(p.nightStartMin),
      '--night-end-min', String(p.nightEndMin),
      '--min-rest-min', String(p.minRestMin),
    ],
    { input: tsv, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`check-7503 failed: ${res.stderr || res.error}`)
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, pairingId, startSecs, endSecs, count] = l.split('\t')
      return {
        crewId,
        pairingId: Number(pairingId),
        startSecs: Number(startSecs),
        endSecs: Number(endSecs),
        count: Number(count),
      }
    })
}

function summarize(viols, crewEvaluated, maxConsecutive) {
  viols.sort((a, b) => b.count - a.count)
  const worst = viols[0] ? { crewId: viols[0].crewId, count: viols[0].count, pairingId: viols[0].pairingId } : null
  return {
    maxConsecutive,
    crewEvaluated,
    crewViolating: new Set(viols.map((v) => v.crewId)).size,
    violationCount: viols.length,
    worst,
  }
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c)
  const offsets = await crewOffsets(c)
  const { fly, ground } = await extractWorkPeriods(c, from, to)
  await c.end()

  const tsv = toTsv(fly, ground, offsets)
  const crewEvaluated = new Set([...fly, ...ground].map((r) => String(r.crew_id))).size

  if (process.argv.includes('--compare')) {
    const at3 = summarize(runEngine(tsv, p, 3), crewEvaluated, 3)
    const at2 = summarize(runEngine(tsv, p, 2), crewEvaluated, 2)
    process.stdout.write(JSON.stringify({ params: p, at3, at2 }))
    return
  }
  const maxConsecutive = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : p.maxConsecutive
  process.stdout.write(JSON.stringify({ params: p, ...summarize(runEngine(tsv, p, maxConsecutive), crewEvaluated, maxConsecutive) }))
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
