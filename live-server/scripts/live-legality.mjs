// live-legality.mjs — LIVE twin of scenario-legality.mjs: recompute the live rule
// violations with the SAME rule-engine-rs core (§Gantt-Unify) and persist them to the
// LIVE f8.rule_violation table, then publish recheck status to Redis so the gantt can poll
// and PUBLISH violations:{schema}:{rulesetId} so Alert Center / bells refetch without a hard refresh.
//
//   node scripts/live-legality.mjs --group <code> --from <YYYY-MM-DD> --to <YYYY-MM-DD>
//
// The rule logic + engine plumbing live in legality-recheck-core.mjs; this entry only
// supplies a LIVE `source` adapter (the same SQL as the scenario adapter, but reading the
// live roster_flight scoped by is_deleted=0 + a date window instead of scenario.* under a
// scenario_id) plus the live persistence + Redis status publishing below.
//
// The live rule_violation table is partitioned by range(start_dt) and has NO scenario_id /
// roster_version columns (unlike scenario.rule_violation); persistence deletes the windowed
// slice for the group then bulk-upserts the freshly computed rows.

import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { createClient } from 'redis'
import {
  computeViolations, buildBulkInsert,
  crewTeamRowsToMap, REST_LEAVE_CODES,
  asOfDateOnly,
  buildCrewBaseTimeline, resolveOffsetAtUtc, resolveBaseAt, resolveOffsetAt, midpointDateOnly,
  utcSecsToUtcDateOnly,
} from './legality-recheck-core.mjs'
import {
  pairingEndRestSecsSql,
  pairingOverlapStartSecsSql,
  pairingOverlapEndDutySecsSql,
  dutyStartUtcExpr,
  dutyEndUtcExpr,
  firstFlightDepartureUtcExpr,
  lastFlightArrivalUtcExpr,
} from './assignment-overlap-rest-sql.mjs'
import { publishViolationsUpdated } from './live-legality-publish.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
// CLI args are only required when this file is the process entrypoint. Library
// importers (preview-draft → liveSource, unit tests) must NOT process.exit —
// an unguarded RULESET_ID check previously killed the whole live-server on
// POST /api/legality/preview-draft when --group was absent from argv.
const GROUP = arg('--group')
const FROM = arg('--from'); const TO = arg('--to')
const DIVISION = (arg('--division') ?? 'P').toUpperCase()
const RULESET_ID = Number(GROUP)
if (IS_MAIN) {
  if (!GROUP) {
    console.error('usage: node scripts/live-legality.mjs --group <ruleset_id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--division P|C] [--rules 8002,8056] [--focus-crew-ids C1,C2]')
    process.exit(2)
  }
  if (!Number.isInteger(RULESET_ID) || RULESET_ID <= 0) {
    console.error(`invalid --group: expected numeric workset (ruleset) id, got "${GROUP}"`)
    process.exit(2)
  }
  if (!['P', 'C'].includes(DIVISION)) {
    console.error(`invalid --division: expected P or C, got "${DIVISION}"`)
    process.exit(2)
  }
  if (!FROM || !TO) {
    console.error('usage: node scripts/live-legality.mjs --group <ruleset_id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--rules 8002,8056] [--focus-crew-ids C1,C2]')
    process.exit(2)
  }
}
const FOCUS_START_SECS = Number(arg('--focus-start-secs'))
const FOCUS_END_SECS = Number(arg('--focus-end-secs'))
const FOCUS_CREW_IDS = (arg('--focus-crew-ids', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
// Optional scoped recheck: only recompute (and only delete/rewrite) these rule codes.
// Omit → whole group. Lets a single-rule param change skip the other 8 rules' (slow) recompute.
const ONLY_CODES = (arg('--rules', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const ACC_REF_BIN = path.resolve(__dirname, '../../rule-engine-rs/target/release/check-7500-ref')

function readEnv(key) {
  if (process.env[key]) return process.env[key]
  const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8')
  const line = env.split('\n').find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} not found in live-server/.env`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}
function readEnvDefault(key, fallback) {
  try {
    return readEnv(key)
  } catch {
    return fallback
  }
}
function quoteIdent(value) {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new Error(`invalid SQL identifier: ${value}`)
  return `"${value}"`
}
/** Unquoted live schema name — must match JWT `payload.schema` / WS client.schema. */
const LIVE_SCHEMA_NAME = readEnvDefault('LIVE_SCHEMA', 'f8')
const LIVE_SCHEMA = quoteIdent(LIVE_SCHEMA_NAME)
const SCENARIO_SCHEMA = quoteIdent(readEnvDefault('SCENARIO_SCHEMA', 'scenario'))
export const applySchemas = (text) =>
  text.replaceAll('f8.', `${LIVE_SCHEMA}.`).replaceAll('scenario.', `${SCENARIO_SCHEMA}.`)
const AIRLINE = arg('--airline', process.env.FILIALE || 'F8')
const KEY = (s) => `legality:recheck:${AIRLINE}:${GROUP}:${s}`
// DB/Redis clients + applySchemas wrapper only for CLI entrypoint execution. Library
// importers (pbs-server rust-rule-runner, preview-draft) get liveSource etc. without
// connecting to PG/Redis or requiring live-server/.env — those readEnv calls used to
// throw at import time when the file's own .env was absent.
let db = null
let redis = null
if (IS_MAIN) {
  db = new pg.Client({ connectionString: readEnv('DATABASE_URL') })
  const rawQuery = db.query.bind(db)
  db.query = (queryConfig, values, callback) => {
    if (typeof queryConfig === 'string') return rawQuery(applySchemas(queryConfig), values, callback)
    if (queryConfig && typeof queryConfig.text === 'string') {
      return rawQuery({ ...queryConfig, text: applySchemas(queryConfig.text) }, values, callback)
    }
    return rawQuery(queryConfig, values, callback)
  }
}

const DAY_MS = 86_400_000
const fetchOverlapUtcWindow = (fromIso, toExclusiveIso) => ({
  lowerBoundIso: new Date(new Date(`${fromIso}T00:00:00Z`).getTime() - DAY_MS).toISOString(),
  upperBoundIso: new Date(new Date(`${toExclusiveIso}T00:00:00Z`).getTime() + DAY_MS).toISOString(),
})

if (IS_MAIN) {
  redis = createClient({ url: readEnv('REDIS_URL') })
}

const accRefKey = (crewId, pairingId, dutySeq) => `${crewId}|${pairingId}|${dutySeq}`

const offsetAt = (date, zoneId) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneId || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (type) => Number(parts.find((part) => part.type === type)?.value ?? '0')
    const hour = get('hour') === 24 ? 0 : get('hour')
    const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
    return Math.round((localAsUtc - date.getTime()) / 60_000)
  } catch {
    return 0
  }
}

const runAccRefTz = (input, params) => {
  const lines = input.flatMap((crew) => crew.duties.map((duty) => [
    crew.crewId,
    duty.pairingId,
    duty.dutySeq,
    duty.startUtc,
    duty.endUtc,
    duty.depTzMin,
    duty.arrTzMin,
  ].join('\t')))
  if (lines.length === 0) return new Map()
  const result = spawnSync(ACC_REF_BIN, [
    '--stay-per-min', String(params.stayPerMin),
    '--adjust-min', String(params.adjustMin),
    '--emit-tsv',
  ], {
    input: lines.join('\n'),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `check-7500-ref binary missing at ${ACC_REF_BIN} (ENOENT). ` +
      `Deploy it via deploy/sit/deploy.sh rust-bins, or: cargo build --release --bin check-7500-ref`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`check-7500-ref exited ${result.status}: ${result.stderr || result.error || 'unknown error'}`)
  }
  const refs = new Map()
  for (const line of result.stdout.split('\n').map((value) => value.trim()).filter(Boolean)) {
    const [crewId, pairingId, dutySeq, refTz, dutyEndRefTz] = line.split('\t')
    const parsed = Number(refTz)
    const parsedEnd = Number(dutyEndRefTz ?? refTz)
    if (crewId && Number.isFinite(parsed) && Number.isFinite(parsedEnd)) {
      refs.set(accRefKey(crewId, Number(pairingId), Number(dutySeq)), {
        duty_ref_tz: parsed,
        duty_end_ref_tz: parsedEnd,
      })
    }
  }
  return refs
}

/**
 * Build the segment-level writes for rule 7500. The calculator receives one complete,
 * chronological duty line per crew, while the returned rows intentionally repeat a
 * duty-level result for every source segment row.
 */
export const buildLiveAccRefUpdates = (rows, params, runner = runAccRefTz) => {
  const byCrew = new Map()
  for (const row of rows) {
    const startUtc = Math.floor(new Date(row.start_utc).getTime() / 1000)
    const endUtc = Math.floor(new Date(row.end_utc).getTime() / 1000)
    if (!row.crew_id || !Number.isFinite(startUtc) || !Number.isFinite(endUtc) || endUtc < startUtc) continue
    const crewId = String(row.crew_id)
    const duties = byCrew.get(crewId) ?? new Map()
    const duty = {
      pairingId: Number(row.pairing_id),
      dutySeq: Number(row.duty_seq),
      startUtc,
      endUtc,
      depTzMin: Number.isFinite(Number(row.dep_tz_min))
        ? Number(row.dep_tz_min)
        : offsetAt(new Date(row.start_utc), row.dep_zone_id),
      arrTzMin: Number.isFinite(Number(row.arr_tz_min))
        ? Number(row.arr_tz_min)
        : offsetAt(new Date(row.end_utc), row.arr_zone_id),
    }
    const key = accRefKey(crewId, duty.pairingId, duty.dutySeq)
    if (!duties.has(key)) duties.set(key, duty)
    byCrew.set(crewId, duties)
  }
  const input = [...byCrew.entries()]
    .map(([crewId, duties]) => ({
      crewId,
      duties: [...duties.values()].sort((a, b) =>
        a.startUtc - b.startUtc || a.endUtc - b.endUtc || a.pairingId - b.pairingId || a.dutySeq - b.dutySeq),
    }))
    .sort((a, b) => a.crewId.localeCompare(b.crewId))
  const refs = runner(input, params)
  return rows.flatMap((row) => {
    const ref = refs.get(accRefKey(String(row.crew_id), Number(row.pairing_id), Number(row.duty_seq)))
    const normalized = typeof ref === 'number' ? { duty_ref_tz: ref, duty_end_ref_tz: ref } : ref
    return normalized == null ? [] : [{
      crew_id: String(row.crew_id),
      pairing_id: Number(row.pairing_id),
      duty_seq: Number(row.duty_seq),
      duty_ref_tz: normalized.duty_ref_tz,
      duty_end_ref_tz: normalized.duty_end_ref_tz,
    }]
  })
}

const refParamsFromJson = (paramJson) => {
  const fallback = { stayPerMin: 1440, adjustMin: 60 }
  if (!paramJson || typeof paramJson !== 'object' || !Array.isArray(paramJson.tables) || paramJson.tables.length < 2) return fallback
  const table = paramJson.tables[1]
  if (!table || !Array.isArray(table.header) || !Array.isArray(table.rows) || !Array.isArray(table.rows[0])) return fallback
  const hm = (value) => {
    const match = String(value ?? '').match(/^(\d+):(\d{2})$/)
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }
  const stay = table.header.findIndex((value) => String(value).toLowerCase() === 'stay duration per x hours')
  const adjust = table.header.findIndex((value) => String(value).toLowerCase() === 'acc time zone adjust x hours')
  return {
    stayPerMin: hm(table.rows[0][stay]) ?? fallback.stayPerMin,
    adjustMin: hm(table.rows[0][adjust]) ?? fallback.adjustMin,
  }
}

const loadLiveAccRefRows = async (client, focusCrewIds) => {
  const crewPredicate = focusCrewIds.length > 0 ? 'and rf.crew_id = any($1::varchar[])' : ''
  const values = focusCrewIds.length > 0 ? [focusCrewIds] : []
  const result = await client.query(
    `with duty_rows as (
       select rf.crew_id,
              rf.pairing_id,
              rf.duty_seq,
              min(coalesce(rf.act_str_dt_utc, rf.sch_str_dt_utc)) as start_utc,
              max(coalesce(rf.act_end_dt_utc, rf.sch_end_dt_utc)) as end_utc,
              (array_agg(coalesce(nullif(rf.dep_arp, ''), nullif(ps.dep_arp, ''))
                         order by coalesce(rf.act_str_dt_utc, rf.sch_str_dt_utc), rf.seg_seq))[1] as dep_arp,
              (array_agg(coalesce(nullif(rf.arv_arp, ''), nullif(ps.arv_arp, ''))
                         order by coalesce(rf.act_end_dt_utc, rf.sch_end_dt_utc) desc, rf.seg_seq desc))[1] as arr_arp
         from ${LIVE_SCHEMA}.roster_flight rf
         left join ${LIVE_SCHEMA}.pairing_segment ps
           on ps.pairing_id = rf.pairing_id
          and ps.duty_seq = rf.duty_seq
          and ps.seg_seq = rf.seg_seq
          and ps.is_deleted = 0
        where rf.is_deleted = 0
          and rf.pairing_id is not null
          and rf.duty_seq is not null
          and rf.assignment_group = 'FLY'
          ${crewPredicate}
        group by rf.crew_id, rf.pairing_id, rf.duty_seq
     )
     select d.crew_id, d.pairing_id, d.duty_seq, d.start_utc, d.end_utc,
            coalesce(dep_airport.zone_id, 'UTC') as dep_zone_id,
            coalesce(arr_airport.zone_id, 'UTC') as arr_zone_id
       from duty_rows d
       left join ${LIVE_SCHEMA}.airport dep_airport on dep_airport.airport = d.dep_arp
       left join ${LIVE_SCHEMA}.airport arr_airport on arr_airport.airport = d.arr_arp
      order by d.crew_id, d.start_utc, d.end_utc, d.pairing_id, d.duty_seq`,
    values,
  )
  return result.rows
}

const loadLiveAccRefParams = async (client, rulesetId) => {
  const result = await client.query(
    `select r.param_json
       from ${LIVE_SCHEMA}.rule_set rs
       join ${LIVE_SCHEMA}.rule r on r.rule_id = rs.rule_id
      where rs.workset_id = $1
        and r.function = 7500
      order by r.instance
      limit 1`,
    [rulesetId],
  )
  return refParamsFromJson(result.rows[0]?.param_json)
}

const persistLiveAccRef = async (client, updates, focusCrewIds) => {
  const crewPredicate = focusCrewIds.length > 0 ? 'and rf.crew_id = any($1::varchar[])' : ''
  const clearValues = focusCrewIds.length > 0 ? [focusCrewIds] : []
  await client.query(
    `update ${LIVE_SCHEMA}.roster_flight rf
        set duty_ref_tz = null,
            duty_end_ref_tz = null
      where rf.is_deleted = 0
        and rf.pairing_id is not null
        and rf.assignment_group = 'FLY'
        ${crewPredicate}`,
    clearValues,
  )
  const uniqueUpdates = [...new Map(
    updates.map((row) => [accRefKey(row.crew_id, row.pairing_id, row.duty_seq), row]),
  ).values()]
  if (uniqueUpdates.length === 0) return
  // Keep unnest placeholders at $1..$5. Do NOT prepend focus clearValues — an unused
  // $1 (focus crew array) makes Postgres raise 42P18 "could not determine data type
  // of parameter $1" and aborts the whole live recheck after draft Save.
  await client.query(
    `update ${LIVE_SCHEMA}.roster_flight rf
        set duty_ref_tz = refs.ref,
            duty_end_ref_tz = refs.end_ref
       from unnest(
         $1::varchar[],
         $2::bigint[],
         $3::smallint[],
         $4::integer[],
         $5::integer[]
       ) as refs(crew_id, pairing_id, duty_seq, ref, end_ref)
      where rf.is_deleted = 0
        and rf.pairing_id is not null
        and rf.assignment_group = 'FLY'
        and rf.crew_id = refs.crew_id
        and rf.pairing_id = refs.pairing_id
        and rf.duty_seq = refs.duty_seq`,
    [
      uniqueUpdates.map((row) => row.crew_id),
      uniqueUpdates.map((row) => row.pairing_id),
      uniqueUpdates.map((row) => row.duty_seq),
      uniqueUpdates.map((row) => row.duty_ref_tz),
      uniqueUpdates.map((row) => row.duty_end_ref_tz),
    ],
  )
}

const invalidateLivePairingCaches = async (client, pairingIds) => {
  const ids = [...new Set(pairingIds.map(Number).filter(Number.isFinite))]
  const keys = ids.flatMap((id) => [
    `pairing:${id}`,
    `pairing:crewdetail:${id}`,
    `pairing:crewids:${id}`,
    `pairing:comp:${id}`,
  ])
  if (keys.length > 0) await client.del(keys)
}

async function setStatus(status, extra = {}) {
  const ops = redis.multi()
  if (status === 'computing') ops.set(KEY('status'), status, { EX: 1800 })
  else ops.set(KEY('status'), status)
  if (extra.lastCheckedAt) ops.set(KEY('last_checked_at'), extra.lastCheckedAt)
  if (extra.error != null) ops.set(KEY('error'), String(extra.error))
  if (status === 'computing') ops.set(KEY('done_count'), '0').set(KEY('total_count'), '0')
  await ops.exec()
}

/**
 * Live source adapter: the EXACT same accessors as the scenario adapter, but reading the
 * live roster_flight (search_path=f8) scoped by is_deleted=0 + a [fromIso, toExclusiveIso)
 * window on sch_str_dt_utc instead of scenario.roster_flight under a scenario_id. Shared
 * reference reads (f8.crew / f8.crew_base / f8.rule) stay identical.
 */
export function liveSource(db, fromIso, toExclusiveIso) {
  const W = 'is_deleted=0 and sch_str_dt_utc >= $1 and sch_str_dt_utc < $2'
  const P = [fromIso, toExclusiveIso]
  const { lowerBoundIso, upperBoundIso } = fetchOverlapUtcWindow(fromIso, toExclusiveIso)
  const W_7505 = 'is_deleted=0 and sch_end_dt_utc > $1 and sch_str_dt_utc < $2'
  const P_7505 = [lowerBoundIso, upperBoundIso]
  let timelineCache = null
  const windowAsOf = () =>
    midpointDateOnly(fromIso, toExclusiveIso)
    ?? asOfDateOnly(fromIso) ?? asOfDateOnly(toExclusiveIso)
  async function loadTimeline() {
    if (timelineCache) return timelineCache
    const rows = (await db.query(
      `select cb.crew_id, cb.base, cb.is_prime_base, cb.eff_dt, cb.exp_dt,
              coalesce(a.zone_id, 'UTC') as zone_id
         from f8.crew_base cb
         left join f8.airport a on a.airport = cb.base`,
    )).rows
    const zoneByBase = new Map()
    for (const r of rows) {
      const base = String(r.base ?? '').trim()
      if (base && !zoneByBase.has(base)) zoneByBase.set(base, String(r.zone_id ?? 'UTC'))
    }
    timelineCache = { timeline: buildCrewBaseTimeline(rows), zoneByBase }
    return timelineCache
  }
  return {
    db,

    async crewBaseTimeline() {
      return (await loadTimeline()).timeline
    },

    async resolveCrewOffset(crewId, utcSecs) {
      const { timeline } = await loadTimeline()
      return resolveOffsetAtUtc(timeline, crewId, utcSecs)
    },

    async resolveCrewTimezone(crewId, utcSecs) {
      const { timeline, zoneByBase } = await loadTimeline()
      const day = utcSecsToUtcDateOnly(utcSecs) ?? windowAsOf()
      const base = resolveBaseAt(timeline, crewId, day)
      return zoneByBase.get(base) ?? 'UTC'
    },

    /** crew_id → base-local offset (minutes), from the date-effective crew_base at window midpoint. */
    async crewOffsets() {
      const asOf = windowAsOf()
      const { timeline } = await loadTimeline()
      const out = new Map()
      for (const crew of timeline.keys()) {
        out.set(crew, resolveOffsetAt(timeline, crew, asOf))
      }
      return out
    },

    /** First FLY pairing per crew (including the UTC-overlap buffer used by 7505). */
    async firstPairingByCrew() {
      const rows = (await db.query(
        `select distinct on (crew_id) crew_id, pairing_id from roster_flight
           where ${W_7505} and pairing_id is not null
           order by crew_id, sch_str_dt_utc`, P_7505)).rows
      return new Map(rows.map((r) => [String(r.crew_id), Number(r.pairing_id)]))
    },

    /** First FLY pairing per crew WITH its UTC span — anchors cumulative-window findings in-window. */
    async firstPairingSpanByCrew() {
      const rows = (await db.query(
        `with firstp as (
           select distinct on (crew_id) crew_id, pairing_id
             from roster_flight where ${W} and pairing_id is not null
             order by crew_id, sch_str_dt_utc)
         select f.crew_id, f.pairing_id, min(rf.sch_str_dt_utc) as s, max(rf.sch_end_dt_utc) as e
           from firstp f
           join roster_flight rf on rf.crew_id = f.crew_id and rf.pairing_id = f.pairing_id and ${W}
          group by f.crew_id, f.pairing_id`, P)).rows
      return new Map(rows.map((r) => [String(r.crew_id),
        { id: Number(r.pairing_id), startIso: new Date(r.s).toISOString(), endIso: new Date(r.e).toISOString() }]))
    },

    /** All FLY pairing spans per crew, used to attach cumulative-window findings near the window. */
    async pairingSpansByCrew() {
      const rows = (await db.query(
        `select crew_id, pairing_id, min(sch_str_dt_utc) as s, max(sch_end_dt_utc) as e
           from roster_flight
          where ${W} and pairing_id is not null
          group by crew_id, pairing_id
          order by crew_id, min(sch_str_dt_utc), pairing_id`, P)).rows
      const byCrew = new Map()
      for (const r of rows) {
        const crew = String(r.crew_id)
        const list = byCrew.get(crew) ?? []
        list.push({ id: Number(r.pairing_id), startIso: new Date(r.s).toISOString(), endIso: new Date(r.e).toISOString() })
        byCrew.set(crew, list)
      }
      return byCrew
    },

    // ── rule 8002 / 7508 — crew base IANA timezone (date-effective base at window midpoint) ──
    async crewBaseTimezone() {
      const asOf = windowAsOf()
      const { timeline, zoneByBase } = await loadTimeline()
      const out = new Map()
      for (const crew of timeline.keys()) {
        const base = resolveBaseAt(timeline, crew, asOf)
        out.set(crew, zoneByBase.get(base) ?? 'UTC')
      }
      return out
    },

    async rosterPeriods() {
      const rows = (await db.query(
        `select to_char(rp_start, 'YYYY-MM-DD') as start,
                to_char(rp_end, 'YYYY-MM-DD') as end
           from roster_period
          where rp_start <= $2::date + interval '400 days'
            and rp_end >= $1::date - interval '400 days'
          order by rp_start`,
        [fromIso, toExclusiveIso],
      )).rows
      return rows
    },

    async crewTeams() {
      const rows = (await db.query(
        `with active_crew as (
           select distinct crew_id
             from roster_flight
            where ${W_7505}
         )
         select ct.crew_id, ct.team
           from crew_team ct
           join active_crew ac on ac.crew_id = ct.crew_id
          where ct.is_valid = 1
            and nullif(ct.team, '') is not null
            and ct.eff_dt <= $2::timestamp
            and (ct.exp_dt is null or ct.exp_dt >= $1::timestamp)
          group by ct.crew_id, ct.team
          order by ct.crew_id, ct.team`, P_7505)).rows
      return crewTeamRowsToMap(rows)
    },

    async assignmentGroups() {
      return (await db.query(
        `select a.assignment,
                ag.assignment_group
           from assignment_group_map agm
           join assignment_group ag on ag.id = agm.assignment_group_id
           join assignment a on a.id = agm.assignment_id
          where nullif(a.assignment, '') is not null
            and nullif(ag.assignment_group, '') is not null
          order by a.assignment, ag.assignment_group`,
      )).rows
    },

    // ── rule 7305 — complete crew roster activities, including ground rows ──
    async rosterDuties() {
      const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
      })
      return (await db.query(
        `with pairing_rows as (
           select rf.crew_id, rf.pairing_id,
                  extract(epoch from min(${dutyStart}))::bigint as start_secs,
                  extract(epoch from max(${dutyEnd}))::bigint as end_secs,
                  ${endRestSql},
                  (array_agg(rf.duty_ref_tz order by ${dutyStart}))[1] as offset_min,
                  coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment,
                  coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
                  coalesce(nullif((array_agg(nullif(rf.label, '') order by rf.sch_str_dt_utc))[1], ''), max(p.pairing_label), '') as label,
                  bool_and(coalesce(rf.source, '') = 'PA') as is_pre_assigned,
                  coalesce(nullif(string_agg(distinct nullif(ps.seg_assignment, ''), '|' order by nullif(ps.seg_assignment, '')), ''), '') as attributes
             from roster_flight rf
             left join pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
            where rf.is_deleted = 0
              and rf.sch_end_dt_utc > $1
              and rf.sch_str_dt_utc < $2
              and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ),
         ground_rows as (
           select rf.crew_id,
                  -rf.id as activity_id,
                  extract(epoch from rf.sch_str_dt_utc)::bigint as start_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint
                    + greatest(coalesce(rf.act_rest_min, 0), 0) * 60 as end_rest_secs,
                  rf.duty_ref_tz as offset_min,
                  coalesce(rf.assignment, '') as assignment,
                  coalesce(nullif(rf.assignment_group, ''), rf.assignment, '') as assignment_group,
                  coalesce(rf.label, '') as label,
                  coalesce(rf.source, '') = 'PA' as is_pre_assigned,
                  coalesce(nullif(rf.tag_set, ''), '') as attributes
             from roster_flight rf
            where rf.is_deleted = 0
              and rf.sch_end_dt_utc > $1
              and rf.sch_str_dt_utc < $2
              and rf.pairing_id is null
         )
         select crew_id, pairing_id as activity_id, pairing_id, start_secs, end_secs, end_rest_secs,
                offset_min, assignment, assignment_group, attributes, label,
                is_pre_assigned, true as phase_checked, false as is_ground
           from pairing_rows
         union all
         select crew_id, activity_id, null as pairing_id, start_secs, end_secs, end_rest_secs,
                offset_min, assignment, assignment_group, attributes, label,
                is_pre_assigned, true as phase_checked, true as is_ground
           from ground_rows
          order by crew_id, start_secs, activity_id`,
        [lowerBoundIso, upperBoundIso],
      )).rows
    },

    // ── rule 8002 — block minutes per crew per LOCAL day (crew base timezone) ──
    // Day boundary is defined by the crew's base IANA timezone, not UTC.
    async blockByDay() {
      return (await db.query(
        `with crew_tz as (
           select distinct on (cb.crew_id) cb.crew_id, coalesce(a.zone_id, 'UTC') as zone_id
             from crew_base cb
             left join airport a on a.airport = cb.base
            where cb.is_prime_base = 1
            order by cb.crew_id, cb.eff_dt desc
         )
         select rf.crew_id,
                to_char(date_trunc('day', rf.sch_str_dt_utc at time zone coalesce(tz.zone_id, 'UTC')), 'YYYY-MM-DD') as day,
                sum(greatest(0, extract(epoch from (rf.sch_end_dt_utc - rf.sch_str_dt_utc)) / 60))::int as blk
           from roster_flight rf
           left join crew_tz tz on tz.crew_id = rf.crew_id
          where ${W} and rf.assignment_group = 'FLY' and rf.pairing_id is not null
          group by rf.crew_id, tz.zone_id,
                   date_trunc('day', rf.sch_str_dt_utc at time zone coalesce(tz.zone_id, 'UTC'))
         having sum(greatest(0, extract(epoch from (rf.sch_end_dt_utc - rf.sch_str_dt_utc)) / 60)) > 0`, P)).rows
    },

    // ── rule 8002 full port — per-crew per-LOCAL-day manday metrics ──
    // Primary metric source (C++ parity): crew_manday_fd_daily, scenario_id=0,
    // keyed by crew_base_dt (already the crew's local date). leadInDays covers
    // long rolling windows (365d) before FROM. Units: minutes, EXCEPT credit
    // (hours numeric(6,2) → ×60 here); standby int → 0/1 presence; duty_aloft
    // = cust_data1 (airline-custom, passed raw); int_blh passed raw (unused by
    // F8 band filters today). Metric order = rre MANDAY_METRICS.
    async mandayMetricsByDay(leadInDays = 365) {
      return (await db.query(
        `select crew_id,
                to_char(crew_base_dt, 'YYYY-MM-DD') as day,
                blh::float8                          as blh,
                ft::float8                           as ft,
                dp::float8                           as dp,
                round(credit * 60)::float8           as credit_min,
                case when standby > 0 then 1 else 0 end::float8 as sby,
                coalesce(int_blh, 0)::float8         as int_blh,
                augument_blh::float8                 as aug_blh,
                coalesce(cust_data1, 0)::float8      as duty_aloft,
                coalesce(cross_tz_duty_count, 0)::float8 as cross_tz
           from crew_manday_fd_daily
          where scenario_id = 0
            and crew_base_dt >= ($1::date - ($3::int * interval '1 day'))
            and crew_base_dt < $2::date
            and (blh > 0 or ft > 0 or dp > 0 or credit > 0 or standby > 0
                 or coalesce(int_blh,0) > 0 or augument_blh > 0
                 or coalesce(cust_data1,0) > 0 or coalesce(cross_tz_duty_count,0) > 0)`,
        [fromIso, toExclusiveIso, leadInDays])).rows
    },

    // ── rule 8002 full port — effective-dated crew qualification windows ──
    // dim: B=base, R=rank, F=fleet (ac_type AND fleet_grp each contribute a
    // value). exp null → open-ended. Matching itself happens in the Rust
    // binary (qual_matches) — this only ships raw rows.
    async crewQualEntries() {
      return (await db.query(
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
           from crew_fleet where fleet_grp is not null and fleet_grp <> ''
         union all
         select crew_id, 'P', position,
                to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
           from crew_rank where position is not null and position <> ''`)).rows
    },

    // ── rule 8071 — normalized roster-property activity rows ──
    async rosterProperties(filters = {}) {
      const groups = filters.groups?.length ? filters.groups : []
      const flights = filters.flights?.length ? filters.flights : []
      const destinations = filters.destinations?.length ? filters.destinations : []
      const positions = filters.positions?.length ? filters.positions : []
      return (await db.query(
        `with crew_quals as (
           select crew_id, 'B' as dim, base as value
             from f8.crew_base
            where base is not null and base <> ''
           union all
           select crew_id, 'R', rank
             from f8.crew_rank
            where rank is not null and rank <> ''
           union all
           select crew_id, 'F', ac_type
             from f8.crew_fleet
            where ac_type is not null and ac_type <> ''
           union all
           select crew_id, 'F', fleet_grp
             from f8.crew_fleet
            where fleet_grp is not null and fleet_grp <> ''
         )
         select rf.crew_id,
                coalesce(rf.pairing_id, -rf.id)::bigint as pairing_id,
                coalesce(rf.duty_seq, 0)::bigint as duty_seq,
                coalesce(rf.flt_id, rf.id)::bigint as segment_id,
                extract(epoch from rf.sch_str_dt_utc)::bigint as start_utc,
                extract(epoch from rf.sch_end_dt_utc)::bigint as end_utc,
                coalesce(nullif(rf.label, ''), nullif(p.pairing_label, ''), rf.assignment, rf.assignment_group, '') as label,
                coalesce(nullif(rf.assignment_group, ''), p.assignment_group, '') as assignment_group,
                coalesce(nullif(rf.assignment, ''), p.assignment, '') as qualifier,
                coalesce(nullif(f.flt_num, ''), nullif(ps.flt_num, ''), '') as flight_number,
                coalesce(nullif(rf.arv_arp, ''), nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), '') as destination,
                coalesce(nullif(rf.position, ''), '') as position,
                coalesce(string_agg(distinct case when q.dim = 'B' then q.value end, '|' order by case when q.dim = 'B' then q.value end), '*') as bases,
                coalesce(string_agg(distinct case when q.dim = 'R' then q.value end, '|' order by case when q.dim = 'R' then q.value end), '*') as ranks,
                coalesce(string_agg(distinct case when q.dim = 'F' then q.value end, '|' order by case when q.dim = 'F' then q.value end), '*') as fleets,
                '*' as teams,
                '*' as attributes,
                '*' as override_duty_attributes
           from roster_flight rf
           left join pairing p on p.id = rf.pairing_id and p.is_deleted = 0
           left join flight f on f.id = rf.flt_id and f.is_deleted = 0
           left join pairing_segment ps on ps.pairing_id = rf.pairing_id
            and ps.duty_seq = rf.duty_seq and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0
           left join crew_quals q on q.crew_id = rf.crew_id
          where rf.is_deleted = 0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
            and (cardinality($3::text[]) = 0 or coalesce(nullif(rf.assignment_group, ''), p.assignment_group, '') = any($3::text[]))
            and (cardinality($4::text[]) = 0 or coalesce(nullif(f.flt_num, ''), nullif(ps.flt_num, ''), '') = any($4::text[]))
            and (cardinality($5::text[]) = 0 or coalesce(nullif(rf.arv_arp, ''), nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), '') = any($5::text[]))
            and (cardinality($6::text[]) = 0 or coalesce(nullif(rf.position, ''), '') = any($6::text[]))
          group by rf.id, rf.crew_id, rf.pairing_id, rf.duty_seq, rf.flt_id, rf.sch_str_dt_utc,
                   rf.sch_end_dt_utc, rf.label, p.pairing_label, rf.assignment_group, p.assignment_group,
                   rf.assignment, p.assignment, f.flt_num, ps.flt_num, rf.arv_arp, f.arv_arp, ps.arv_arp,
                   rf.seg_seq,
                   rf.position
          order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id nulls last, rf.duty_seq, rf.seg_seq`,
        [...P, groups, flights, destinations, positions])).rows
    },

    // ── rule 8072 — crew-on-flight segment qualification rows ──
    async qualificationFlightSegments(filters = {}) {
      const groups = filters.groups?.length ? filters.groups : []
      const fleets = filters.fleets?.length ? filters.fleets : []
      const deps = filters.deps?.length ? filters.deps : []
      const arrs = filters.arrs?.length ? filters.arrs : []
      // Preview-draft: only segments on the edited pairings.
      const focusPairingIds = [...new Set(
        (Array.isArray(filters.focusPairingIds) ? filters.focusPairingIds : [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      )]
      const rows = (await db.query(
        `with seg as (
           select distinct
                  coalesce(ps.id, rf.flt_id, rf.id)::bigint as segment_id,
                  rf.pairing_id::bigint as pairing_id,
                  coalesce(rf.duty_seq, 0)::bigint as duty_seq,
                  coalesce(rf.seg_seq, 0)::bigint as seg_seq,
                  coalesce(rf.flt_id, ps.flt_id, f.id, 0)::bigint as flight_id,
                  coalesce(nullif(f.flt_num, ''), nullif(ps.flt_num, ''), '') as flight_number,
                  coalesce(to_char(f.flt_dt, 'YYYY-MM-DD'), to_char(ps.flt_dt, 'YYYY-MM-DD'), nullif(rf.flt_dt, ''), '') as flight_date,
                  extract(epoch from coalesce(f.sch_dep_dt_utc, ps.sch_str_dt_utc, rf.sch_str_dt_utc))::bigint as start_utc,
                  extract(epoch from coalesce(f.sch_arv_dt_utc, ps.sch_end_dt_utc, rf.sch_end_dt_utc))::bigint as end_utc,
                  coalesce(nullif(f.fleet, ''), nullif(ps.fleet_seg, ''), nullif(p.fleet, ''), '') as fleet,
                  coalesce(nullif(f.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(rf.dep_arp, ''), '') as dep,
                  coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''), '') as arr,
                  coalesce(nullif(rf.assignment, ''), nullif(p.assignment, ''), '') as assignment,
                  coalesce(nullif(rf.assignment_group, ''), nullif(p.assignment_group, ''), '') as assignment_group,
                  '*' as composition,
                  coalesce(nullif(ps.seg_assignment, ''), nullif(f.flight_assignment, ''), '*') as attributes,
                  coalesce(ap.country, '') as destination_country,
                  coalesce(f.sch_dep_dt_utc, ps.sch_str_dt_utc, rf.sch_str_dt_utc) as start_ts,
                  coalesce(f.sch_arv_dt_utc, ps.sch_end_dt_utc, rf.sch_end_dt_utc) as end_ts
             from roster_flight rf
             left join pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join pairing_segment ps on ps.pairing_id = rf.pairing_id
              and ps.duty_seq = rf.duty_seq and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0
             left join flight f on f.id = coalesce(rf.flt_id, ps.flt_id) and f.is_deleted = 0
             left join crew c on c.crew_id = rf.crew_id
             left join airport ap on ap.airport = coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''))
            where rf.is_deleted = 0
              and rf.pairing_id is not null
              and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
              and coalesce(nullif(rf.division, ''), c.division, p.division, '') = '${DIVISION}'
              and (cardinality($3::text[]) = 0 or coalesce(nullif(rf.assignment_group, ''), nullif(p.assignment_group, ''), '') = any($3::text[]))
              and (cardinality($4::text[]) = 0 or coalesce(nullif(f.fleet, ''), nullif(ps.fleet_seg, ''), nullif(p.fleet, ''), '') = any($4::text[]))
              and (cardinality($5::text[]) = 0 or coalesce(nullif(f.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(rf.dep_arp, ''), '') = any($5::text[]))
              and (cardinality($6::text[]) = 0 or coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''), '') = any($6::text[]))
              and (cardinality($7::bigint[]) = 0 or rf.pairing_id = any($7::bigint[]))
         ),
         crew_rows as materialized (
           select s.segment_id,
                  jsonb_build_object(
                    'crew_id', rf.crew_id,
                    'division', coalesce(nullif(rf.division, ''), c.division, ''),
                    'acting_rank', coalesce(nullif(rf.flight_acting_rank, ''), nullif(rf.roster_acting_rank, ''), ''),
                    'assignment', coalesce(nullif(rf.assignment, ''), s.assignment),
                    'assignment_group', coalesce(nullif(rf.assignment_group, ''), s.assignment_group),
                    'nationality', coalesce(c.nationality, ''),
                    'teams', coalesce(tm.teams, '*'),
                    'source', coalesce(nullif(rf.source, ''), 'CR'),
                    'qualifications', coalesce(q.quals, '*')
                  ) as crew_json
             from seg s
             join roster_flight rf on rf.pairing_id = s.pairing_id
              and coalesce(rf.duty_seq, 0) = s.duty_seq
              and coalesce(rf.seg_seq, 0) = s.seg_seq
              and rf.is_deleted = 0
             left join crew c on c.crew_id = rf.crew_id
             left join lateral (
               select string_agg(distinct cq.qualification, '|' order by cq.qualification) as quals
                 from crew_qualification cq
                where cq.crew_id = rf.crew_id
                  and cq.is_valid = 1
                  and cq.eff_dt <= s.end_ts
                  and (cq.exp_dt is null or cq.exp_dt >= s.start_ts)
             ) q on true
             left join lateral (
               select string_agg(distinct ct.team, '|' order by ct.team) as teams
                 from crew_team ct
                where ct.crew_id = rf.crew_id
                  and ct.is_valid = 1
                  and ct.eff_dt <= s.end_ts
                  and (ct.exp_dt is null or ct.exp_dt >= s.start_ts)
             ) tm on true
            where coalesce(nullif(rf.division, ''), c.division, '') = '${DIVISION}'
         ),
         crews as materialized (
           select segment_id, jsonb_agg(crew_json order by crew_json->>'crew_id') as crews_json
             from crew_rows
            group by segment_id
         ),
         planned as materialized (
           select s.segment_id,
                  coalesce(fc.planned_by_rank, pc.planned_by_rank, '') as planned_by_rank
             from seg s
             left join lateral (
               select string_agg(fc.acting_rank || ':' || coalesce(fc.plan, 0)::text, '|' order by fc.acting_rank) as planned_by_rank
                 from flight_composition fc
                where fc.flt_id = s.flight_id and fc.division = '${DIVISION}'
             ) fc on true
             left join lateral (
               select string_agg(pc.acting_rank || ':' || coalesce(pc.plan, 0)::text, '|' order by pc.acting_rank) as planned_by_rank
                 from pairing_composition pc
                where pc.pairing_id = s.pairing_id and pc.division = '${DIVISION}' and pc.is_deleted = 0
             ) pc on true
         ),
         filled as materialized (
           select s.segment_id,
                  string_agg(x.acting_rank || ':' || x.n::text, '|' order by x.acting_rank) as filled_by_rank
             from seg s
             join lateral (
               select coalesce(nullif(rf.flight_acting_rank, ''), nullif(rf.roster_acting_rank, ''), '*') as acting_rank,
                      count(distinct rf.crew_id)::int as n
                 from roster_flight rf
                 left join crew c on c.crew_id = rf.crew_id
                where rf.pairing_id = s.pairing_id
                  and coalesce(rf.duty_seq, 0) = s.duty_seq
                  and coalesce(rf.seg_seq, 0) = s.seg_seq
                  and rf.is_deleted = 0
                  and coalesce(nullif(rf.division, ''), c.division, '') = '${DIVISION}'
                group by coalesce(nullif(rf.flight_acting_rank, ''), nullif(rf.roster_acting_rank, ''), '*')
             ) x on true
            group by s.segment_id
         )
         select s.segment_id, s.pairing_id, s.duty_seq, s.seg_seq, s.flight_id,
                s.flight_number, s.flight_date, s.start_utc, s.end_utc,
                s.fleet, s.dep, s.arr, s.assignment, s.assignment_group,
                s.composition, s.attributes, s.destination_country,
                coalesce(p.planned_by_rank, '') as planned_by_rank,
                coalesce(filled.filled_by_rank, '') as filled_by_rank,
                coalesce(c.crews_json, '[]'::jsonb) as crews_json
           from seg s
           left join planned p on p.segment_id = s.segment_id
           left join filled on filled.segment_id = s.segment_id
           left join crews c on c.segment_id = s.segment_id
          order by s.start_utc, s.pairing_id, s.duty_seq, s.seg_seq`,
        [...P, groups, fleets, deps, arrs, focusPairingIds])).rows
      return rows.map((row) => ({
        segment_id: Number(row.segment_id),
        pairing_id: Number(row.pairing_id),
        duty_seq: Number(row.duty_seq ?? 0),
        seg_seq: Number(row.seg_seq ?? 0),
        flight_id: Number(row.flight_id ?? 0),
        flight_number: row.flight_number ?? '',
        flight_date: row.flight_date ?? '',
        start_utc: Number(row.start_utc),
        end_utc: Number(row.end_utc),
        fleet: row.fleet ?? '',
        dep: row.dep ?? '',
        arr: row.arr ?? '',
        assignment: row.assignment ?? '',
        assignment_group: row.assignment_group ?? '',
        composition: row.composition ?? '',
        attributes: row.attributes ?? '*',
        destination_country: row.destination_country ?? '',
        planned_by_rank: row.planned_by_rank ?? '',
        filled_by_rank: row.filled_by_rank ?? '',
        crews: typeof row.crews_json === 'string' ? JSON.parse(row.crews_json) : (row.crews_json ?? []),
      }))
    },

    // ── rule 8056 — roster spacing: load the groups AND assignment codes the rule set
    //    references (A ∪ B), passed in from the kernel's param_json. A duty is loaded if its
    //    group OR its assignment code is referenced (no hardcoded FLY/SBY/SIM). ──
    async flyByPairing(groups, codes) {
      const hasG = groups && groups.length, hasC = codes && codes.length
      const G = hasG ? groups : []
      const C = hasC ? codes : []
      const dutyBoundOpts = { rosterAlias: 'rf', segmentAlias: 'ps' }
      const dutyStart = dutyStartUtcExpr(dutyBoundOpts)
      const dutyEnd = dutyEndUtcExpr(dutyBoundOpts)
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
      })
      return (await db.query(
        `with duty_rows as (
           -- A/B pairings (have pairing_id)
           select rf.crew_id, rf.pairing_id,
                  extract(epoch from min(${dutyStart}))::bigint as start_secs,
                  extract(epoch from max(${dutyEnd}))::bigint as end_secs,
                  ${endRestSql},
                  coalesce(nullif((array_agg(rf.label order by rf.sch_str_dt_utc, rf.seg_seq))[1], ''),
                    max(p.pairing_label),
                    (array_agg(rf.dep_arp order by rf.sch_str_dt_utc, rf.seg_seq))[1] || '-' ||
                    (array_agg(rf.arv_arp order by rf.sch_end_dt_utc desc, rf.seg_seq desc))[1],
                    (array_agg(rf.assignment_group))[1] || ':P' || rf.pairing_id) as label,
                  coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
                  coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment,
                  coalesce(nullif(string_agg(distinct nullif(ps.seg_assignment, ''), '|' order by nullif(ps.seg_assignment, '')), ''), '*') as attributes,
                  coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as qualifier,
                  coalesce((array_agg(nullif(rf.arv_arp, '') order by rf.sch_end_dt_utc desc, rf.seg_seq desc))[1], max(p.base), max(rf.base), '') as airport,
                  coalesce((array_agg(nullif(rf.role, '') order by rf.sch_str_dt_utc))[1], '') as role,
                  max(coalesce(rf.is_requested, 0))::int as is_requested,
                  coalesce((array_agg(nullif(rf.arv_arp, '') order by rf.sch_end_dt_utc desc, rf.seg_seq desc))[1], max(p.base), max(rf.base), '') as location,
                  max(rf.base) as base,
                  bool_or(upper(coalesce(rf.source, '')) = 'PA') as is_pre_assigned,
                  max(rf.sch_end_dt_utc) as duty_end_ts
             from roster_flight rf
             left join pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
            where rf.is_deleted=0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
              and ((cardinality($3::text[]) = 0 and cardinality($4::text[]) = 0) or rf.assignment_group = any($3) or rf.assignment = any($4))
              and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
           union all
           -- ground duties (no pairing_id); pairing_id=0 as B-side sentinel
           select rf.crew_id, 0 as pairing_id,
                  extract(epoch from rf.sch_str_dt_utc)::bigint as start_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs,
                  coalesce(nullif(rf.label,''), rf.assignment) as label,
                  rf.assignment_group, rf.assignment,
                  '*' as attributes,
                  coalesce(nullif(rf.assignment, ''), '') as qualifier,
                  coalesce(nullif(rf.arv_arp, ''), nullif(rf.dep_arp, ''), rf.base, '') as airport,
                  coalesce(nullif(rf.role, ''), '') as role,
                  coalesce(rf.is_requested, 0)::int as is_requested,
                  coalesce(nullif(rf.arv_arp, ''), nullif(rf.dep_arp, ''), rf.base, '') as location,
                  rf.base,
                  upper(coalesce(rf.source, '')) = 'PA' as is_pre_assigned,
                  rf.sch_end_dt_utc as duty_end_ts
             from roster_flight rf
            where rf.is_deleted=0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
              and ((cardinality($3::text[]) = 0 and cardinality($4::text[]) = 0) or rf.assignment_group = any($3) or rf.assignment = any($4))
              and rf.pairing_id is null
         )
         select d.*, coalesce(cb.base, d.base, '') as crew_base, coalesce(a.zone_id, 'UTC') as zone_id
           from duty_rows d
           left join lateral (
             select cb.base
               from crew_base cb
              where cb.crew_id = d.crew_id
                and cb.eff_dt <= d.duty_end_ts
                and (cb.exp_dt >= d.duty_end_ts or cb.exp_dt is null)
              order by cb.is_prime_base desc, cb.eff_dt desc
              limit 1
           ) cb on true
           left join airport a on a.airport = coalesce(cb.base, d.base)
          order by d.crew_id, d.duty_end_ts, d.pairing_id`, [...P, G, C])).rows
    },

    // ── rule 8030 — per-flt_id pilot age complement (cross-pairing COF) ──
    async pilotAge() {
      return (await db.query(
        `with f as (
           select coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id) as flt_id,
                  rf.pairing_id, rf.crew_id,
                  coalesce(nullif(rf.division,''), cr.division) as division,
                  coalesce(rf.sch_str_dt_utc, ps.sch_str_dt_utc) as seg_start_ts,
                  coalesce(rf.sch_end_dt_utc, ps.sch_end_dt_utc) as seg_end_ts,
                  coalesce(nullif(fl.flt_num, ''), nullif(ps.flt_num, ''), '') as flt_num,
                  coalesce(nullif(fl.airline, ''), nullif(ps.airline, ''), '') as airline,
                  coalesce(fl.sch_dep_dt_utc, ps.sch_str_dt_utc, rf.sch_str_dt_utc) as dep_ts,
                  coalesce(nullif(ap.zone_id, ''), 'UTC') as dep_zone_id,
                  cr.birthday
             from roster_flight rf
             join f8.crew cr on cr.crew_id = rf.crew_id
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and (
                (rf.flt_id is not null and ps.flt_id = rf.flt_id)
                or (rf.flt_id is null and (
                      rf.duty_seq is null
                      or (ps.duty_seq = rf.duty_seq
                          and (rf.seg_seq is null or ps.seg_seq = rf.seg_seq))
                    ))
              )
             left join flight fl
               on fl.id = coalesce(rf.flt_id, ps.flt_id)
              and coalesce(fl.is_deleted, 0) = 0
             left join airport ap
               on ap.airport = coalesce(nullif(fl.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(rf.dep_arp, ''))
            where rf.is_deleted=0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
              and rf.assignment_group='FLY' and rf.pairing_id is not null and cr.birthday is not null)
         select distinct flt_id, pairing_id, crew_id, division, flt_num, airline, dep_zone_id,
                to_char(seg_start_ts,'YYYY-MM-DD') as start_date,
                extract(epoch from seg_start_ts)::bigint as start_secs,
                extract(epoch from seg_end_ts)::bigint as end_secs,
                extract(epoch from dep_ts)::bigint as dep_secs,
                to_char(birthday,'YYYY-MM-DD') as birth_date from f`, P)).rows
    },

    // ── rule 7509 — physical-flight forbidden crew-pair complement ──
    async avoidCoPairing({ crewIds = [], focusPairingIds = [] } = {}) {
      const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const values = [fromIso, toExclusiveIso, crewIds, focusPairingIds]
      return (await db.query(
        `with pairing_candidates as (
           select rf.crew_id, rf.pairing_id,
                  min(${dutyStart}) as pairing_start_ts,
                  max(${dutyEnd}) as pairing_end_ts
             from roster_flight rf
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
              and (rf.flt_id is null or ps.flt_id = rf.flt_id)
            where rf.is_deleted = 0
              and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
              and (
                (cardinality($4::bigint[]) = 0 and rf.crew_id = any($3::varchar[]))
                or (cardinality($4::bigint[]) > 0 and
                    (rf.pairing_id = any($4::bigint[]) or rf.crew_id = any($3::varchar[])))
             )
            group by rf.crew_id, rf.pairing_id
           having min(${dutyStart}) < $2::timestamptz
              and max(${dutyEnd}) >= $1::timestamptz
         ),
         touched_flights as (
           select distinct coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id) as flight_id
             from roster_flight rf
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
              and (rf.flt_id is null or ps.flt_id = rf.flt_id)
             join pairing_candidates pc
               on pc.crew_id = rf.crew_id and pc.pairing_id = rf.pairing_id
            where rf.is_deleted = 0
              and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
         ),
         member_pairings as (
           select distinct rf.crew_id, rf.pairing_id
             from roster_flight rf
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
              and (rf.flt_id is null or ps.flt_id = rf.flt_id)
             join touched_flights tf
               on tf.flight_id = coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id)
            where rf.is_deleted = 0
              and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
         ),
         pairing_spans as (
           select rf.crew_id, rf.pairing_id,
                  min(${dutyStart}) as pairing_start_ts,
                  max(${dutyEnd}) as pairing_end_ts
             from roster_flight rf
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
              and (rf.flt_id is null or ps.flt_id = rf.flt_id)
             join member_pairings mp
               on mp.crew_id = rf.crew_id and mp.pairing_id = rf.pairing_id
            where rf.is_deleted = 0
              and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ),
         members_raw as (
           select coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id) as flight_id,
                  rf.crew_id, rf.pairing_id,
                  span.pairing_start_ts as member_start_ts,
                  span.pairing_end_ts as member_end_ts,
                  upper(coalesce(rf.source, '')) = 'PA' as source_is_pa
             from roster_flight rf
             left join pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
              and (rf.flt_id is null or ps.flt_id = rf.flt_id)
             join touched_flights tf
               on tf.flight_id = coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id)
             join pairing_spans span
               on span.crew_id = rf.crew_id and span.pairing_id = rf.pairing_id
            where rf.is_deleted = 0
              and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
         ),
         members as (
           select flight_id, crew_id, pairing_id,
                  extract(epoch from min(member_start_ts) over (partition by crew_id, pairing_id))::bigint as pairing_start_secs,
                  extract(epoch from max(member_end_ts) over (partition by crew_id, pairing_id))::bigint as pairing_end_secs,
                  bool_and(source_is_pa) over (partition by flight_id, crew_id) as source_is_pa
             from members_raw
         )
         select distinct on (m.flight_id, m.crew_id)
                m.flight_id, m.crew_id, m.pairing_id,
                m.pairing_start_secs, m.pairing_end_secs, m.source_is_pa,
                coalesce(nullif(f.flt_num, ''), '') as flight_number,
                extract(epoch from f.sch_dep_dt_utc)::bigint as dep_secs
           from members m
           left join flight f on f.id = m.flight_id and coalesce(f.is_deleted, 0) = 0
          where m.flight_id > 0
          order by m.flight_id, m.crew_id, m.pairing_id`, values)).rows
    },

    // ── rule 8004 — roster spans (R rows) ──
    async assignmentsRaw() {
      return (await db.query(
        `select crew_id, pairing_id, max(base) as base,
                to_char(min(sch_str_dt_utc),'YYYY-MM-DD') as start_date, to_char(max(sch_end_dt_utc),'YYYY-MM-DD') as end_date,
                extract(epoch from min(sch_str_dt_utc))::bigint as start_secs, extract(epoch from max(sch_end_dt_utc))::bigint as end_secs
           from roster_flight where ${W} and pairing_id is not null
           group by crew_id, pairing_id`, P)).rows
    },

    // ── rule 8004 — crew_base qualifications (Q rows) ──
    async baseQuals(crewIds) {
      return (await db.query(
        `select crew_id, base, to_char(coalesce(eff_dt_utc, eff_dt),'YYYY-MM-DD') as eff_date,
                to_char(coalesce(exp_dt_utc, exp_dt),'YYYY-MM-DD') as exp_date
           from f8.crew_base where crew_id = any($1::varchar[])`, [crewIds])).rows
    },

    // ── rule 1001 — assignment overlap timeline (pairings + ground/leave duties) ──
    async assignmentOverlapRosters() {
      const dutyBoundOpts = { rosterAlias: 'rf', segmentAlias: 'ps' }
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
      })
      return (await db.query(
        `with pairing_rows as (
           select rf.crew_id, rf.pairing_id,
                  ${pairingOverlapStartSecsSql(dutyBoundOpts)},
                  ${pairingOverlapEndDutySecsSql(dutyBoundOpts)},
                  ${endRestSql},
                  coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
                  coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment
             from roster_flight rf
             left join pairing p on p.id = rf.pairing_id
             left join pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
            where rf.is_deleted = 0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2 and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ), ground_rows as (
           select rf.crew_id, -rf.id as pairing_id,
                  extract(epoch from rf.sch_str_dt_utc)::bigint as start_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_duty_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_rest_secs,
                  coalesce(nullif(rf.assignment_group, ''), rf.assignment, 'GRD') as assignment_group,
                  coalesce(nullif(rf.assignment, ''), rf.assignment_group, 'GRD') as assignment
             from roster_flight rf
            where rf.is_deleted = 0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2 and rf.pairing_id is null
         ), rows as (
           select * from pairing_rows
           union all
           select * from ground_rows
         )
         select row_number() over (order by rows.crew_id, rows.start_secs, rows.pairing_id)::bigint as id,
                rows.crew_id, greatest(rows.pairing_id, 0)::bigint as pairing_id, rows.start_secs, rows.end_duty_secs, rows.end_rest_secs,
                rows.assignment_group, rows.assignment,
                coalesce(nullif(a.type, ''),
                  case when rows.assignment_group in ('FLY','SBY','SIM','TRN','RES') then rows.assignment_group else rows.assignment end) as assignment_type
           from rows
           left join assignment a on a.assignment = rows.assignment
          order by rows.crew_id, rows.start_secs, rows.pairing_id`, P)).rows
    },

    // ── rule 7505 — all roster rows as (crew, code, secs), with overlap buffering ──
    async assignmentsAll() {
      // Duty release: ps.duty_act_end_dt_utc → ps.duty_sch_end_dt_utc → debrief → rf.sch_end_dt_utc
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      return (await db.query(
        `select rf.crew_id, rf.pairing_id, rf.assignment as code,
                extract(epoch from rf.sch_str_dt_utc)::bigint as s,
                extract(epoch from ${dutyEnd})::bigint as e,
                extract(epoch from ${dutyEnd})::bigint
                  + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs
           from roster_flight rf
           left join pairing_segment ps
             on rf.pairing_id is not null
            and ps.pairing_id = rf.pairing_id
            and coalesce(ps.is_deleted, 0) = 0
            and ps.duty_seq = rf.duty_seq
            and ps.seg_seq = rf.seg_seq
          where rf.is_deleted=0 and rf.sch_end_dt_utc > $1 and rf.sch_str_dt_utc < $2
          order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id`, P_7505)).rows
    },

    // ── rule 7506 — check-ins: FLY pairings + ground rows (duty = assignment) ──
    async checkins() {
      return (await db.query(
        `select crew_id, pairing_id, assignment_group as duty,
                extract(epoch from min(sch_str_dt_utc))::bigint as start_secs,
                extract(epoch from max(sch_end_dt_utc))::bigint as end_secs
           from roster_flight where ${W} and assignment_group='FLY' and pairing_id is not null
          group by crew_id, pairing_id, assignment_group
         union all
         select crew_id, 0::bigint as pairing_id, assignment as duty,
                extract(epoch from sch_str_dt_utc)::bigint as start_secs,
                extract(epoch from sch_end_dt_utc)::bigint as end_secs
           from roster_flight where ${W} and pairing_id is null`, P)).rows
    },

    // ── rules 7501/7503/7504 — FLY work periods (optionally split by duty_seq) ──
    async flyDuties(byDutySeq) {
      const grp = byDutySeq ? 'rf.crew_id, rf.pairing_id, rf.duty_seq' : 'rf.crew_id, rf.pairing_id'
      const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const firstFlight = firstFlightDepartureUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const lastFlight = lastFlightArrivalUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
      })
      return (await db.query(
        `select rf.crew_id, rf.pairing_id,
                extract(epoch from min(${dutyStart}))::bigint as start_secs,
                extract(epoch from max(${dutyEnd}))::bigint as end_secs,
                extract(epoch from min(${firstFlight}))::bigint as first_flight_departure_secs,
                extract(epoch from max(${lastFlight}))::bigint as last_flight_arrival_secs,
                (array_agg(rf.duty_ref_tz order by ${dutyStart}))[1] as offset_min,
                (array_agg(rf.duty_end_ref_tz order by ${dutyEnd} desc))[1] as end_offset_min,
                ${endRestSql},
                floor(extract(epoch from min(${dutyStart})) / 86400)::bigint as day_ord,
                coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
                coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment,
                coalesce(nullif((array_agg(nullif(rf.label, '') order by rf.sch_str_dt_utc))[1], ''), max(p.pairing_label), '') as label,
                bool_and(coalesce(rf.source, '') = 'PA') as is_pre_assigned,
                coalesce(nullif(string_agg(distinct nullif(ps.seg_assignment, ''), '|' order by nullif(ps.seg_assignment, '')), ''), '*') as attributes
           from roster_flight rf
           left join pairing p on p.id = rf.pairing_id and p.is_deleted = 0
           left join pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
          where rf.is_deleted=0 and rf.sch_str_dt_utc >= $1 and rf.sch_str_dt_utc < $2
            and rf.assignment_group='FLY' and rf.pairing_id is not null
          group by ${grp}`, P)).rows
    },

    // ── rules 7501/7503 — non-rest ground work periods ──
    async groundWork(includeRest = false) {
      return (await db.query(
        `select crew_id, pairing_id, assignment,
                extract(epoch from sch_str_dt_utc)::bigint as start_secs,
                extract(epoch from sch_end_dt_utc)::bigint as end_secs,
                upper(coalesce(assignment, '')) as assignment_upper,
                true as is_pre_assigned
           from roster_flight where ${W} and pairing_id is null`, P))
        .rows
        .map((r) => ({ ...r, is_rest: REST_LEAVE_CODES.has(String(r.assignment_upper)) }))
        .filter((r) => includeRest || !r.is_rest)
    },
  }
}

const COLS = ['crew_id', 'pairing_id', 'duty_seq', 'ruleset_id', 'rule_code', 'rule_instance', 'scope_key',
  'start_dt', 'end_dt', 'window_start_dt', 'window_end_dt', 'severity', 'actual_value', 'limit_value', 'unit', 'message', 'created_by', 'updated_by']
const CONFLICT = '(crew_id, pairing_id, duty_seq, ruleset_id, rule_code, rule_instance, scope_key, start_dt)'
const UPDATE = `end_dt=excluded.end_dt, window_start_dt=excluded.window_start_dt, window_end_dt=excluded.window_end_dt,
  severity=excluded.severity, actual_value=excluded.actual_value,
  limit_value=excluded.limit_value, unit=excluded.unit, message=excluded.message, computed_at=now(), updated_by='legality_recheck'`
const ROLLING_8002_DELETE_LOOKBACK_DAYS = 365

async function main() {
  await db.connect(); await redis.connect()
  await setStatus('computing')
  try {
    const toExclusive = new Date(new Date(TO + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
    // Rule 7500 is a definition/state-builder, not a violation-producing rule. Rebuild its
    // crew-specific Ref values on every live legality pass so roster mutations and parameter
    // changes cannot leave Pairing Info behind. The source intentionally ignores FROM/TO:
    // acclimatisation state is defined over each focused crew's complete chronological line.
    const accRefRows = await loadLiveAccRefRows(db, FOCUS_CREW_IDS)
    const accRefParams = await loadLiveAccRefParams(db, RULESET_ID)
    const accRefUpdates = buildLiveAccRefUpdates(accRefRows, accRefParams)
    await db.query('begin')
    await persistLiveAccRef(db, accRefUpdates, FOCUS_CREW_IDS)
    await db.query('commit')
    const ctx = { ruleGroupCode: GROUP, rulesetId: RULESET_ID, dateFrom: FROM, dateTo: TO }
    if (Number.isFinite(FOCUS_START_SECS) && Number.isFinite(FOCUS_END_SECS)) {
      ctx.focusIntervals = [{ startSecs: FOCUS_START_SECS, endSecs: FOCUS_END_SECS }]
    }
    if (FOCUS_CREW_IDS.length > 0) ctx.focusCrewIds = FOCUS_CREW_IDS
    const all = await computeViolations(liveSource(db, FROM, toExclusive), ctx, ONLY_CODES)
    await db.query('begin')
    // Scoped recheck: when --rules is given, only clear THOSE rule codes' rows so the other
    // rules' (untouched) violations survive the delete+reinsert.
    //
    // 8002 is rolling-window cumulative. Older builds anchored those findings to a crew's
    // first pairing in the loaded range, so a June window could persist on a May/early-June
    // pairing. After the anchor fix, the upsert key no longer collides with that old row.
    // Delete a bounded lookback slice for 8002 so stale out-of-window anchors are removed
    // before the corrected rows are inserted. The 365-day bound matches manday lead-in.
    const recomputes8002 = ONLY_CODES.length === 0 || ONLY_CODES.includes('8002')
    if (recomputes8002) {
      await db.query(
        `delete from rule_violation
          where ruleset_id=$1 and rule_code='8002'
            and start_dt >= ($2::date - ($4::int * interval '1 day'))
            and start_dt < ($3::date + interval '1 day')`,
        [RULESET_ID, FROM, TO, ROLLING_8002_DELETE_LOOKBACK_DAYS])
    }
    const normalCodes = ONLY_CODES.filter((code) => code !== '8002')
    if (ONLY_CODES.length) {
      if (normalCodes.length) {
        await db.query(
          `delete from rule_violation
            where ruleset_id=$1 and rule_code = any($4::text[])
              and start_dt >= $2::timestamptz and start_dt < ($3::date + interval '1 day')`,
          [RULESET_ID, FROM, TO, normalCodes])
      }
    } else {
      await db.query(
        `delete from rule_violation
          where ruleset_id=$1 and rule_code <> '8002'
            and start_dt >= $2::timestamptz and start_dt < ($3::date + interval '1 day')`,
        [RULESET_ID, FROM, TO])
    }
    for (let i = 0; i < all.length; i += 2000) {
      const chunk = all.slice(i, i + 2000).map((r) => [r.crew_id, r.pairing_id, r.duty_seq, RULESET_ID,
        r.rule_code, r.rule_instance, r.scope_key ?? '', r.start_dt, r.end_dt, r.window_start_dt ?? null, r.window_end_dt ?? null,
        r.severity, r.actual_value, r.limit_value, r.unit, r.message, 'legality_recheck', 'legality_recheck'])
      const q = buildBulkInsert('rule_violation', COLS, chunk, CONFLICT, UPDATE)
      if (q) await db.query(q.text, q.values)
    }
    await db.query('commit')
    try {
      await invalidateLivePairingCaches(redis, accRefRows.map((row) => row.pairing_id))
    } catch (cacheErr) {
      console.error('live recheck: pairing cache invalidation failed', cacheErr)
    }
    await setStatus('done', { lastCheckedAt: new Date().toISOString(), error: '' })
    // Signal live clients to refetch recheck status instead of polling (WS plugin
    // forwards legality-recompute:* to clients whose set_rule_group matches GROUP).
    try {
      await redis.publish(`legality-recompute:${LIVE_SCHEMA_NAME}:${GROUP}`, 'done')
    } catch (pubErr) {
      console.error('live recheck: legality-updated publish failed', pubErr)
    }
    // Push to gantt Alert Center / bells: WS plugin forwards this to clients whose
    // set_rule_group matches the resolved workset id (not a legacy label alias).
    try {
      await publishViolationsUpdated(redis, LIVE_SCHEMA_NAME, String(RULESET_ID))
    } catch (pubErr) {
      console.error('live recheck: violations.updated publish failed', pubErr)
    }
    const cnt = await db.query(
      `select rule_code, count(*)::int n from rule_violation
         where ruleset_id=$1 and start_dt >= $2::timestamptz and start_dt < ($3::date + interval '1 day')
         group by rule_code order by rule_code`, [RULESET_ID, FROM, TO])
    const scope = ONLY_CODES.length ? `rules[${ONLY_CODES.join(',')}]` : 'all-rules'
    console.log(`live recheck ${GROUP} ${FROM}..${TO} (${scope}): ${all.length} computed; persisted in-window:`, cnt.rows)
  } catch (e) {
    try { await db.query('rollback') } catch { /* not in txn */ }
    await setStatus('failed', { error: e.message })
    try {
      await redis.publish(`legality-recompute:${LIVE_SCHEMA_NAME}:${GROUP}`, 'failed')
    } catch (pubErr) {
      console.error('live recheck: legality-updated publish failed', pubErr)
    }
    console.error(e); process.exitCode = 1
  } finally {
    await redis.quit().catch(() => {})
    await db.end().catch(() => {})
  }
}
if (IS_MAIN) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
