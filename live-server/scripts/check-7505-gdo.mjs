/**
 * Rule 7505 (MIN # GDOs IN A RP) — live harness.
 *
 * Drives the Rust 7505 engine (rule-engine-rs/target/release/check-7505) over the LIVE
 * roster: each crew must have at least MIN DO "days off" in its own local RP window.
 * A day off = a RP calendar day that is blank (Count Blank Day=Y), or covered only by
 * DO-group assignments (live roster code 'DO'), or a LAYOVER. The band row is selected
 * by RP length and the crew's leave-assignment (VAC) day-count; its MIN DO is the floor.
 * Violation ⇔ daysOff < MIN DO (strict), severity Soft.
 *
 * Param authority = 7505 membership in the active RULE workset (prefer workset id 103).
 * Do NOT hardcode `rule.instance` (F8 currently ships 7505/001; older docs said 002).
 * DO/LEAVE codes use the ROSTER vocabulary ('DO','VAC'), not the assignment dictionary's groups
 * (where 'DO' is grouped LVE) — the demo roster and the dictionary use different codes
 * (playbook §5c data gotcha). Source fetch uses a one-day UTC overlap buffer so a crew-
 * local RP window can see rows that start before the UTC month boundary but still overlap
 * it. Post-duty-rest start = scheduled duty end (live roster_flight stores act_rest_min
 * as a duration, not a rest-start timestamp).
 *
 * Usage:
 *   node live-server/scripts/check-7505-gdo.mjs [--from 2026-06-01 --to 2026-06-30] [--persist]
 * Without --persist: prints a JSON summary. With --persist: writes warnings into
 * rule_violation (rule_code 7505 / instance from workset, sev 1, created_by 'rust_7505').
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import { crewLocalRpWindowUtc, nextIsoDate } from './legality-rp-window.mjs'
import { loadRulesetRule, headerIndexer, rule2015StartTimeRaw } from './legality-ruleset-params.mjs'

const { Client } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const ENV_PATH = path.join(REPO, 'live-server', '.env')
const BIN = path.join(REPO, 'rule-engine-rs', 'target', 'release', 'check-7505')

// rule_violation now keys on bigint ruleset_id (= RULE workset, prefer id 103),
// not the dropped varchar rule_group_code column.
const RULE_CODE = '7505'
const SEVERITY = 1 // Soft / INFO (the rule's own severity)
const MARKER = 'rust_7505'
// Roster-vocabulary day-off codes (the live roster_flight uses 'DO' for guaranteed days off).
const DO_CODES = ['DO']
const DAY_MS = 86_400_000
const BASE_OFFSET_MIN = {
  YYZ: -240, YUL: -240, YOW: -240, YKF: -240,
  YWG: -300,
  YEG: -360, YYC: -360,
  YVR: -420, YXX: -420, YLW: -420,
  OOL: 600,
}
const DEFAULT_OFFSET_MIN = -360

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

async function crewOffsets(c) {
  const byCrew = new Map()
  for (const r of (await c.query(`SELECT crew_id, base FROM crew_base WHERE is_prime_base = 1`)).rows) {
    byCrew.set(String(r.crew_id), r.base)
  }
  for (const r of (await c.query(`SELECT crew_id, base FROM crew_base`)).rows) {
    if (!byCrew.has(String(r.crew_id))) byCrew.set(String(r.crew_id), r.base)
  }
  const out = new Map()
  for (const [crewId, base] of byCrew) out.set(crewId, BASE_OFFSET_MIN[base] ?? DEFAULT_OFFSET_MIN)
  return out
}

export function fetchOverlapUtcWindow(from, toExclusive) {
  return {
    lowerBoundIso: new Date(new Date(`${from}T00:00:00Z`).getTime() - DAY_MS).toISOString(),
    upperBoundIso: new Date(new Date(`${toExclusive}T00:00:00Z`).getTime() + DAY_MS).toISOString(),
  }
}

const rawOrStar = (value) => {
  const text = String(value ?? '').trim()
  return text || '*'
}

const dateOrdOrMinusOne = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return '-1'
  if (/^-?\d+$/.test(text)) return text
  const t = Date.parse(`${text.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? String(Math.floor(t / DAY_MS)) : '-1'
}

export function buildStructured7505RuleLine(row, H, bump = 0) {
  const [rpLo, rpHi] = String(row[H('RP Days Range')] ?? '0-0').split('-')
  const [lvLo, lvHi] = String(row[H('Leave Days Range')] ?? '0-0').split('-')
  const leaveRaw = String(row[H('Leave Assignments')] ?? '').trim()
  const leaveCodes = !leaveRaw || leaveRaw === '*' ? '' : leaveRaw.split('|').join(',')
  return [
    'R',
    rawOrStar(row[H('Bases')]),
    rawOrStar(row[H('Ranks')]),
    rawOrStar(row[H('Fleets')]),
    rawOrStar(row[H('Crew Teams')]),
    String(Number(row[H('Min DO')]) + bump),
    rpLo,
    rpHi,
    lvLo,
    lvHi,
    rawOrStar(row[H('DO Assignment Group')]) === '*' ? DO_CODES.join(',') : rawOrStar(row[H('DO Assignment Group')]),
    leaveCodes,
    row[H('Count Blank Day')] === 'Y' ? '1' : '0',
    row[H('Utilize Post Duty Rest')] === 'Y' ? '1' : '0',
    row[H('Period')],
    row[H('Unit')],
    row[H('Count Layover')] === 'Y' ? '1' : '0',
  ].join('\t')
}

/** Build the engine's `R` band-row lines from 7505 param_json in the RULE workset.
 *  `bump` (debug only) adds to every row's MIN DO to prove param-sensitivity WITHOUT
 *  mutating the DB — raising the floor must fire strictly ≥ the real param (Rule-3029). */
export async function bandRows(c, bump = 0) {
  const rule = await loadRulesetRule(c, 7505)
  const H = headerIndexer(rule.header)
  const lines = []
  for (const r of rule.rows) {
    lines.push(buildStructured7505RuleLine(r, H, bump))
  }
  return { lines, count: rule.rows.length, instance: rule.instance, rulesetId: rule.rulesetId }
}

/** Rule 2015 Start Time minutes; missing → 0 (today's midnight paint). */
export async function loadDoStartMin(c) {
  try {
    const rule = await loadRulesetRule(c, 2015)
    const raw = rule2015StartTimeRaw(rule)
    if (raw == null || String(raw).trim() === '') return 0
    const [h, m] = String(raw).split(':').map((x) => parseInt(x, 10))
    if (!Number.isFinite(h)) return 0
    const mins = h * 60 + (Number.isFinite(m) ? m : 0)
    return mins > 0 ? mins : 0
  } catch {
    return 0
  }
}

async function crewQualRows(c) {
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

async function crewTeams(c, from, toExclusive) {
  const { lowerBoundIso, upperBoundIso } = fetchOverlapUtcWindow(from, toExclusive)
  const rows = (await c.query(
    `with active_crew as (
       select distinct crew_id
         from roster_flight
        where is_deleted = 0
          and sch_end_dt_utc > $1::timestamptz
          and sch_str_dt_utc < $2::timestamptz
     )
     select ct.crew_id, ct.team
       from crew_team ct
       join active_crew ac on ac.crew_id = ct.crew_id
      where ct.is_valid = 1
        and nullif(ct.team, '') is not null
        and ct.eff_dt <= $2::timestamptz
        and (ct.exp_dt is null or ct.exp_dt >= $1::timestamptz)
      group by ct.crew_id, ct.team
      order by ct.crew_id, ct.team`,
    [lowerBoundIso, upperBoundIso],
  )).rows
  const byCrew = new Map()
  for (const row of rows) {
    const crewId = String(row.crew_id)
    const teams = byCrew.get(crewId) ?? []
    teams.push(String(row.team))
    byCrew.set(crewId, teams)
  }
  return byCrew
}

export function buildCrewScopeLines({ crewQualRows = [], crewTeamsById = new Map() }) {
  const byCrew = new Map()
  const push = (crewId, line) => {
    const lines = byCrew.get(crewId) ?? []
    lines.push(line)
    byCrew.set(crewId, lines)
  }
  for (const row of crewQualRows) {
    const crewId = String(row.crew_id ?? '').trim()
    const dim = String(row.dim ?? '').trim().toUpperCase()
    const value = String(row.value ?? '').trim()
    if (!crewId || !['B', 'R', 'F'].includes(dim) || !value) continue
    const exp = row.exp ?? row.exp_date
    push(crewId, ['Q', crewId, dim, value, dateOrdOrMinusOne(row.eff ?? row.eff_date), exp == null || String(exp).trim() === '' ? '-1' : dateOrdOrMinusOne(exp)].join('\t'))
  }
  for (const [crewIdRaw, teams] of crewTeamsById) {
    const crewId = String(crewIdRaw)
    for (const team of teams ?? []) {
      const value = String(team ?? '').trim()
      if (value) push(crewId, ['T', crewId, value].join('\t'))
    }
  }
  return byCrew
}

/** Rows that can overlap any crew-local RP window, widened by one UTC day on both sides. */
async function activityRows(c, from, toExclusive) {
  const { lowerBoundIso, upperBoundIso } = fetchOverlapUtcWindow(from, toExclusive)
  const { rows } = await c.query(
    `
    SELECT crew_id,
           pairing_id,
           assignment AS code,
           EXTRACT(EPOCH FROM sch_str_dt_utc)::bigint AS s,
           EXTRACT(EPOCH FROM sch_end_dt_utc)::bigint AS e
      FROM roster_flight
     WHERE is_deleted = 0
       AND sch_end_dt_utc > $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
    `,
    [lowerBoundIso, upperBoundIso],
  )
  return rows.map((r) => ({
    crewId: String(r.crew_id),
    pairingId: r.pairing_id == null ? null : Number(r.pairing_id),
    code: r.code,
    startSecs: Number(r.s),
    endSecs: Number(r.e),
  }))
}

function runEngine(tsv, rpStart, rpEnd, offsetMin = 0, doStartMin = 0) {
  const res = spawnSync(
    BIN,
    [
      '--rp-start', String(rpStart),
      '--rp-end', String(rpEnd),
      '--offset', String(offsetMin),
      '--do-start-min', String(doStartMin),
      '--emit-tsv',
    ],
    { input: tsv, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  if (res.status !== 0) throw new Error(`check-7505 failed: ${res.stderr || res.error}`)
  return res.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [crewId, rpS, rpE, daysOff, minDo, period, unit] = l.split('\t')
      return {
        crewId,
        rpStart: Number(rpS),
        rpEnd: Number(rpE),
        daysOff: Number(daysOff),
        minDo: Number(minDo),
        period,
        unit,
      }
    })
}

export function selectPersistedPairingByCrew({ pairRows, from, to, crewOffsetsById }) {
  const offsets = crewOffsetsById ?? new Map()
  const rowsByCrew = new Map()
  for (const row of pairRows) {
    const crewId = String(row.crew_id)
    const rows = rowsByCrew.get(crewId) ?? []
    rows.push(row)
    rowsByCrew.set(crewId, rows)
  }

  const pairingByCrew = new Map()
  for (const [crewId, rows] of rowsByCrew) {
    const offsetMin = offsets.get(crewId) ?? DEFAULT_OFFSET_MIN
    const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(from, to, offsetMin)
    const anchor = rows
      .filter((row) => Number(row.e) > startUtcSec && Number(row.s) < endUtcSec)
      .sort((a, b) => Number(a.s) - Number(b.s) || Number(a.pairing_id) - Number(b.pairing_id))[0]
    if (anchor) pairingByCrew.set(crewId, Number(anchor.pairing_id))
  }
  return pairingByCrew
}

export function evaluateCrewViolations({
  activityRows,
  bandLines,
  from,
  to,
  crewOffsetsById,
  crewScopeLinesById = new Map(),
  doStartMin = 0,
  runEngineFn = runEngine,
}) {
  const activitiesByCrew = new Map()
  for (const row of activityRows) {
    const crewId = String(row.crewId)
    const lines = activitiesByCrew.get(crewId) ?? []
    const pairingId = row.pairingId != null && Number(row.pairingId) > 0 ? String(row.pairingId) : ''
    lines.push(
      pairingId
        ? `A\t${crewId}\t${row.code}\t${row.startSecs}\t${row.endSecs}\t${row.endSecs}\t${pairingId}`
        : `A\t${crewId}\t${row.code}\t${row.startSecs}\t${row.endSecs}\t${row.endSecs}`,
    )
    activitiesByCrew.set(crewId, lines)
  }

  const violations = []
  for (const [crewId, lines] of activitiesByCrew) {
    const offsetMin = crewOffsetsById.get(crewId) ?? DEFAULT_OFFSET_MIN
    const { startUtcSec, endUtcSec } = crewLocalRpWindowUtc(from, to, offsetMin)
    const tsv = bandLines.concat(crewScopeLinesById.get(crewId) ?? [], lines).join('\n') + '\n'
    violations.push(...runEngineFn(tsv, startUtcSec, endUtcSec, offsetMin, doStartMin))
  }
  return violations
}

const buildMessage = (v) =>
  `The number of days off(${v.daysOff}) must be at least ${v.minDo} in ${v.period} ${v.unit}.`

async function persist(c, viols, from, to, crewOffsetsById, { rulesetId, ruleInstance }) {
  // Attach each crew-RP shortfall to a triggering pairing that overlaps the fetch window.
  const toExclusive = nextIsoDate(to)
  const { lowerBoundIso, upperBoundIso } = fetchOverlapUtcWindow(from, toExclusive)
  const { rows: pairRows } = await c.query(
    `
    SELECT DISTINCT ON (crew_id)
           crew_id,
           pairing_id,
           EXTRACT(EPOCH FROM sch_str_dt_utc)::bigint AS s,
           EXTRACT(EPOCH FROM sch_end_dt_utc)::bigint AS e
      FROM roster_flight
     WHERE is_deleted = 0 AND pairing_id IS NOT NULL
       AND sch_end_dt_utc > $1::timestamptz AND sch_str_dt_utc < $2::timestamptz
     ORDER BY crew_id, sch_str_dt_utc
    `,
    [lowerBoundIso, upperBoundIso],
  )
  const pairingOf = selectPersistedPairingByCrew({ pairRows, from, to, crewOffsetsById })

  await c.query('BEGIN')
  const del = await c.query(`DELETE FROM rule_violation WHERE created_by = $1`, [MARKER])
  const rows = viols.filter((v) => pairingOf.has(v.crewId))
  let inserted = 0
  const BATCH = 500
  for (let off = 0; off < rows.length; off += BATCH) {
    const batch = rows.slice(off, off + BATCH)
    const ph = []
    const vals = []
    batch.forEach((v, idx) => {
      const b = idx * 13
      ph.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},now(),'${MARKER}','${MARKER}')`,
      )
      vals.push(
        v.crewId,
        pairingOf.get(v.crewId),
        rulesetId,
        RULE_CODE,
        ruleInstance,
        new Date(v.rpStart * 1000).toISOString(),
        new Date((v.rpEnd - 1) * 1000).toISOString(),
        SEVERITY,
        v.daysOff,
        v.minDo,
        'DAY',
        buildMessage(v),
        createHash('sha256').update(`${v.crewId}|${v.rpStart}|7505gdo`).digest('hex'),
      )
    })
    await c.query(
      `INSERT INTO rule_violation
         (crew_id, pairing_id, ruleset_id, rule_code, rule_instance,
          start_dt, end_dt, severity, actual_value, limit_value, unit, message, input_hash,
          computed_at, created_by, updated_by)
       VALUES ${ph.join(',')}`,
      vals,
    )
    inserted += batch.length
  }
  await c.query('COMMIT')
  return { deleted: del.rowCount, inserted, skippedNoPairing: viols.length - rows.length }
}

async function main() {
  const from = argFlag('--from', '2026-06-01')
  const to = argFlag('--to', '2026-06-30')
  const toExclusive = nextIsoDate(to)
  const doPersist = process.argv.includes('--persist')
  const bump = Number(argFlag('--bump', '0'))
  const { startUtcSec: rpStart, endUtcSec: rpEnd } = crewLocalRpWindowUtc(from, to, 0)

  const c = new Client({ connectionString: readDatabaseUrl() })
  await c.connect()
  const band = await bandRows(c, bump)
  const doStartMin = await loadDoStartMin(c)
  const offsets = await crewOffsets(c)
  const acts = await activityRows(c, from, toExclusive)
  const scopeLines = buildCrewScopeLines({
    crewQualRows: await crewQualRows(c),
    crewTeamsById: await crewTeams(c, from, toExclusive),
  })
  const crewEvaluated = new Set(acts.map((row) => row.crewId)).size
  const viols = evaluateCrewViolations({
    activityRows: acts,
    bandLines: band.lines,
    from,
    to,
    crewOffsetsById: offsets,
    crewScopeLinesById: scopeLines,
    doStartMin,
  })
  viols.sort((a, b) => a.daysOff - a.minDo - (b.daysOff - b.minDo))

  let persisted = null
  if (doPersist) persisted = await persist(c, viols, from, to, offsets, { rulesetId: band.rulesetId, ruleInstance: band.instance })
  await c.end()

  const minDoHist = {}
  for (const v of viols) minDoHist[v.minDo] = (minDoHist[v.minDo] || 0) + 1

  const summary = {
    rule: `7505/${band.instance}`,
    window: `${from}..${to}`,
    rpDays: (rpEnd - rpStart) / 86400,
    bandRows: band.count,
    minDoBump: bump,
    crewEvaluated,
    crewViolating: viols.length,
    byRequiredMinDo: minDoHist,
    worst: viols.slice(0, 5).map((v) => ({ crewId: v.crewId, daysOff: v.daysOff, minDo: v.minDo })),
    persisted,
  }
  process.stdout.write(JSON.stringify(summary, null, doPersist ? 2 : 0) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
