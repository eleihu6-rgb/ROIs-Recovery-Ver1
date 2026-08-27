/**
 * Rule 7501 (SINGLE DAY FREE FROM DUTY) — live validation harness.
 *
 * Drives the Rust 7501 engine (rule-engine-rs/target/release/check-7501) against the LIVE
 * roster: every rolling PERIOD-hour window must contain at least MIN LIMITS fully-contained
 * SDFDs (a True Rest covering two consecutive local nights). Crew whose worst window is
 * below the limit are reported. Used by `e2e/tests/gantt/rule-7501-sdfd.spec.ts` (Rule-3xxx).
 *
 * Params are read from the active RULE workset (same resolution as live recheck /
 * legality preview — prefer workset id 103) via `rule_set` → `rule`. Do NOT hardcode
 * `rule.instance` (F8 currently ships 7501/001 + 2014/001; older docs said 004/014).
 *   7501 param_json → PERIOD, UNIT, DUTY END BUFFER, MIN LIMITS (all rows).
 *   2014 param_json → Local Night Start / End / Min Interval (row 0).
 *
 * Work periods mirror the C++ `WorkPeriod::GetWorkPeriods` filtering (WorkPeriod.cpp:28-33):
 *   - FLY pairings: one duty per (crew, pairing), start = MIN(sch_str), end = MAX(sch_end).
 *   - Ground tasks (pairing IS NULL) are work periods EXCEPT rest/leave (DO/VAC/ILL/LO/LEA),
 *     which are ignored (they become free time → can host SDFDs). In live data those codes
 *     have assignment TYPE LVE/leave; standby (RES/SBY), training (SIM), ground (GRD/SFT)
 *     and deadhead (DHD) remain work.
 *   Each crew's local-night offset comes from its (prime) crew_base, mapped to the June 2026
 *   UTC offset (DST active in North America).
 *
 * Connection string is read from live-server/.env (DATABASE_URL) — no secret hard-coded.
 * Build the binary first:  (cd rule-engine-rs && cargo build --release)
 *
 * Usage:
 *   node live-server/scripts/check-7501-sdfd.mjs [minLimits] [--from 2026-06-01 --to 2026-07-01]
 *   node live-server/scripts/check-7501-sdfd.mjs --ruleset 103 [--from … --to …]
 *   node live-server/scripts/check-7501-sdfd.mjs --compare        # show MinLimits 1 vs configured
 * Prints one JSON object (or, with --compare, an object keyed by limit).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import {
  resolveDefaultRulesetId,
  loadRulesetRule,
  loadRulesetRules,
  fieldRaw,
} from './legality-ruleset-params.mjs'

export { resolveDefaultRulesetId } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-7501')

/** June-2026 UTC offset (minutes east of UTC, DST active) per crew base. Default MDT. */
const BASE_OFFSET_MIN = {
  YYZ: -240, YUL: -240, YOW: -240, YKF: -240, // Eastern (EDT)
  YWG: -300, // Central (CDT)
  YEG: -360, YYC: -360, // Mountain (MDT)
  YVR: -420, YXX: -420, YLW: -420, // Pacific (PDT)
  OOL: 600, // Gold Coast, AU (AEST, no DST)
}
const DEFAULT_OFFSET_MIN = -360

/** Codes whose roster lines are REST/leave → ignored (not work periods), per C++ isRestAssignment. */
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

/** "HH:MM" → minutes from midnight. */
function hhmmToMin(s) {
  const [h, m] = String(s).split(':').map((x) => parseInt(x, 10))
  return h * 60 + (m || 0)
}

/**
 * Load 7501 + 2014 params from a RULE workset membership (`rule_set` → `rule`).
 * @param {import('pg').Client} c
 * @param {{ rulesetId?: number }} [opts]
 */
export async function readParams(c, opts = {}) {
  const rules7501 = await loadRulesetRules(c, 7501, opts)
  if (!rules7501.length) {
    throw new Error(`No 7501 rule in RULE workset ${opts.rulesetId ?? '(default)'} (rule_set)`)
  }
  const nightRule = await loadRulesetRule(c, 2014, opts)
  const rulesetId = rules7501[0].rulesetId

  const ruleRows = []
  for (const inst of rules7501) {
    if (!inst.header.length || !inst.rows.length) {
      throw new Error(`7501/${inst.instance} in workset ${rulesetId} has empty param_json tables[0]`)
    }
    for (const row of inst.rows) {
      const periodHours = parseInt(fieldRaw(row, inst.header, 'Period'), 10)
      const unit = fieldRaw(row, inst.header, 'Unit').toUpperCase()
      const bufferRaw = fieldRaw(row, inst.header, 'Duty End Buffer')
      const minLimits = parseInt(fieldRaw(row, inst.header, 'Min Limits'), 10)
      if (!periodHours || !unit || !bufferRaw || Number.isNaN(minLimits)) {
        throw new Error(
          `7501/${inst.instance} workset ${rulesetId}: missing Period/Unit/Duty End Buffer/Min Limits`,
        )
      }
      ruleRows.push({
        rowId: ruleRows.length,
        instance: inst.instance,
        bases: fieldRaw(row, inst.header, 'Bases', '*'),
        ranks: fieldRaw(row, inst.header, 'Ranks', '*'),
        fleets: fieldRaw(row, inst.header, 'Fleets', '*'),
        teams: fieldRaw(row, inst.header, 'Crew Teams', '*'),
        periodHours,
        unit,
        bufferMin: hhmmToMin(bufferRaw),
        minLimits,
      })
    }
  }

  const primary = ruleRows[0]
  const night = nightRule.rows[0]
  return {
    rulesetId,
    instance: primary.instance,
    instances: [...new Set(rules7501.map((r) => r.instance))],
    nightInstance: nightRule.instance,
    ruleRows,
    periodHours: primary.periodHours,
    unit: primary.unit,
    bufferMin: primary.bufferMin,
    minLimits: primary.minLimits,
    nightStartMin: hhmmToMin(night[0]),
    nightEndMin: hhmmToMin(night[1]),
    minRestMin: hhmmToMin(night[2]),
  }
}

/** Crew → local-night offset (minutes), from the prime crew_base mapped to June offset. */
export async function crewOffsets(c) {
  // Prefer the prime base; fall back to any base for crew without one.
  const byCrew = new Map()
  const primeRows = await c.query(`SELECT crew_id, base FROM crew_base WHERE is_prime_base = 1`)
  for (const r of primeRows.rows) byCrew.set(String(r.crew_id), r.base)
  const allRows = await c.query(`SELECT crew_id, base FROM crew_base`)
  for (const r of allRows.rows) if (!byCrew.has(String(r.crew_id))) byCrew.set(String(r.crew_id), r.base)
  const out = new Map()
  for (const [crew, base] of byCrew) out.set(crew, BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN)
  return out
}

/** FLY pairings (one duty per crew×pairing) + ground work tasks (DO/VAC/ILL/LO/LEA excluded). */
export async function extractWorkPeriods(c, from, to) {
  const fly = await c.query(
    `SELECT crew_id, pairing_id,
            EXTRACT(EPOCH FROM MIN(sch_str_dt_utc))::bigint AS start_secs,
            EXTRACT(EPOCH FROM MAX(sch_end_dt_utc))::bigint  AS end_secs
       FROM roster_flight
      WHERE is_deleted = 0 AND assignment_group = 'FLY' AND pairing_id IS NOT NULL
        AND sch_str_dt_utc >= $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
      GROUP BY crew_id, pairing_id`,
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

export async function crewQualEntries(c) {
  return (await c.query(
    `select crew_id, 'B' as dim, base as value,
            to_char(eff_dt, 'YYYY-MM-DD') as eff, to_char(exp_dt, 'YYYY-MM-DD') as exp
       from crew_base where base is not null and base <> ''
     union all
     select crew_id, 'R', rank,
            to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
       from crew_rank where rank is not null and rank <> ''
     union all
     select crew_id, 'F', ac_type,
            to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
       from crew_fleet where ac_type is not null and ac_type <> ''
     union all
     select crew_id, 'F', fleet_grp,
            to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
       from crew_fleet where fleet_grp is not null and fleet_grp <> ''`,
  )).rows
}

export async function crewTeams(c, from, to) {
  const rows = (await c.query(
    `select crew_id, team
       from crew_team
      where is_valid = 1
        and nullif(team, '') is not null
        and eff_dt <= $2::timestamp
        and (exp_dt is null or exp_dt >= $1::timestamp)
      group by crew_id, team
      order by crew_id, team`,
    [from, to],
  )).rows
  const out = new Map()
  for (const row of rows) {
    const crew = String(row.crew_id)
    const values = out.get(crew) ?? []
    values.push(String(row.team))
    out.set(crew, values)
  }
  return out
}

/** Legacy duty-only TSV retained for low-level manual callers. */
export function toTsv(fly, ground, offsets) {
  const lines = []
  for (const r of fly) {
    const off = offsets.get(String(r.crew_id)) ?? DEFAULT_OFFSET_MIN
    lines.push(`${r.crew_id}\t${r.pairing_id}\t${r.start_secs}\t${r.end_secs}\t${off}`)
  }
  for (const r of ground) {
    const off = offsets.get(String(r.crew_id)) ?? DEFAULT_OFFSET_MIN
    lines.push(`${r.crew_id}\t\t${r.start_secs}\t${r.end_secs}\t${off}`)
  }
  return lines.join('\n') + '\n'
}

function dateOrdOrMinusOne(value) {
  const s = String(value ?? '').trim()
  if (!s) return '-1'
  if (/^-?\d+$/.test(s)) return s
  const parsed = Date.parse(`${s.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(parsed) ? String(Math.floor(parsed / 86_400_000)) : '-1'
}

export function toStructuredTsv(fly, ground, offsets, p, qualRows = [], teamMap = new Map()) {
  const lines = p.ruleRows.map((row) => [
    'R', row.rowId, row.bases, row.ranks, row.fleets, row.teams,
    row.periodHours, row.unit, row.bufferMin, row.minLimits,
  ].join('\t'))
  for (const r of fly) {
    const crew = String(r.crew_id)
    lines.push(['D', crew, r.pairing_id, r.start_secs, r.end_secs,
      offsets.get(crew) ?? DEFAULT_OFFSET_MIN].join('\t'))
  }
  for (const r of ground) {
    const crew = String(r.crew_id)
    lines.push(['D', crew, 0, r.start_secs, r.end_secs,
      offsets.get(crew) ?? DEFAULT_OFFSET_MIN].join('\t'))
  }
  for (const q of qualRows) {
    const dim = String(q.dim ?? q.dimension ?? '').trim().toUpperCase()
    const tag = dim === 'B' || dim === 'BASE' ? 'BASE'
      : dim === 'R' || dim === 'RANK' ? 'RANK'
        : dim === 'F' || dim === 'FLEET' ? 'FLEET' : ''
    if (!tag) continue
    const exp = q.exp ?? q.exp_date
    lines.push(['Q', q.crew_id, tag, q.value, dateOrdOrMinusOne(q.eff ?? q.eff_date),
      exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp)].join('\t'))
  }
  for (const [crew, teams] of teamMap) {
    for (const team of teams ?? []) lines.push(['T', crew, team].join('\t'))
  }
  return lines.join('\n') + '\n'
}

/** Run check-7501 --emit-tsv, return parsed crew violations. */
export function runEngine(tsv, p, minLimits, checkedEndSecs) {
  const structured = tsv.split('\n').map((line) => {
    if (!line.startsWith('R\t')) return line
    const cols = line.split('\t')
    cols[9] = String(minLimits)
    return cols.join('\t')
  }).join('\n')
  const res = spawnSync(
    BIN,
    [
      '--emit-tsv',
      '--night-start-min', String(p.nightStartMin),
      '--night-end-min', String(p.nightEndMin),
      '--min-rest-min', String(p.minRestMin),
      '--checked-end-secs', String(checkedEndSecs),
    ],
    { input: structured, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`check-7501 failed: ${res.stderr || res.error}`)
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [rowId, crewId, ws, we, sdfd, lim, period, unit, trig] = l.split('\t')
      return {
        rowId: Number(rowId),
        crewId,
        windowStartSecs: Number(ws),
        windowEndSecs: Number(we),
        totalSdfd: Number(sdfd),
        minLimits: Number(lim),
        periodHours: Number(period),
        unit,
        triggerPairingId: trig ? Number(trig) : null,
      }
    })
}

function summarize(viols, crewEvaluated, minLimits) {
  viols.sort((a, b) => a.totalSdfd - b.totalSdfd)
  const worst = viols[0]
    ? { crewId: viols[0].crewId, totalSdfd: viols[0].totalSdfd, triggerPairingId: viols[0].triggerPairingId }
    : null
  return { minLimits, crewEvaluated, crewViolating: viols.length, worst }
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-07-01')
  const rulesetArg = argFlag('--ruleset', '')
  const rulesetId = rulesetArg ? Number(rulesetArg) : undefined
  if (rulesetArg && !Number.isFinite(rulesetId)) {
    throw new Error(`Invalid --ruleset ${rulesetArg}`)
  }
  const checkedEndSecs = Math.floor(new Date(`${to}T00:00:00Z`).getTime() / 1000) - 1
  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const p = await readParams(c, rulesetId != null ? { rulesetId } : {})
  const offsets = await crewOffsets(c)
  const { fly, ground } = await extractWorkPeriods(c, from, to)
  const qualRows = await crewQualEntries(c)
  const teamMap = await crewTeams(c, from, to)
  await c.end()

  const tsv = toStructuredTsv(fly, ground, offsets, p, qualRows, teamMap)
  const crewEvaluated = new Set([...fly, ...ground].map((r) => String(r.crew_id))).size

  if (process.argv.includes('--compare')) {
    const at1 = summarize(runEngine(tsv, p, 1, checkedEndSecs), crewEvaluated, 1)
    const atConfigured = summarize(runEngine(tsv, p, p.minLimits, checkedEndSecs), crewEvaluated, p.minLimits)
    process.stdout.write(JSON.stringify({ params: p, at1, atConfigured }))
    return
  }
  const minLimits = process.argv[2] && !process.argv[2].startsWith('--') ? Number(process.argv[2]) : p.minLimits
  process.stdout.write(JSON.stringify({ params: p, ...summarize(runEngine(tsv, p, minLimits, checkedEndSecs), crewEvaluated, minLimits) }))
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err))
    process.exit(1)
  })
}
