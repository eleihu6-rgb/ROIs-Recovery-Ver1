// scenario-legality.mjs — compute scenario rule violations with the Rust engine and persist
// them to scenario.rule_violation, mirroring how ruletool.mjs fills scenario.crew_manday_*.
//
//   node scripts/scenario-legality.mjs <scenarioId>
//
// Each rule reuses the proven rule-engine-rs check_* binary (the same one the LIVE
// persist-*/check-* feeders drive), fed from scenario.* instead of the live tables, and
// writes the emitted violations to scenario.rule_violation tagged by scenario_id +
// roster_version, then flips scenario.legality_status to READY.
//
// The rule logic + engine plumbing now live in legality-recheck-core.mjs (§Gantt-Unify):
// this entry only supplies a scenario `source` adapter (the SQL reading scenario.* under a
// scenario_id) and the scenario-specific persistence below.
//
// Engine note: the 14 pbs_solver_ruleset rules live in rule-engine-rs (Rust), NOT the TS
// @rois/rule-engine. See docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md §5c.
//
// Data-model note (§4b): an RO scenario's roster_flight carries crew/pairing/times/label
// directly (under the RO scenario_id); block minutes are DERIVED from scheduled times
// (pairing_segment.flt_id is null in scenario). Rules driven purely off roster_flight
// (8002 block, 8056 spacing) need only the RO scenario_id.

import fs from 'node:fs'
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
  selectLegalitySource,
  resolveSeedCrewIds,
  resolveSeedPairingIds,
} from './scenario-legality-source.mjs'
import {
  pairingEndRestSecsSql,
  dutyStartUtcExpr,
  dutyEndUtcExpr,
  firstFlightDepartureUtcExpr,
  lastFlightArrivalUtcExpr,
} from './assignment-overlap-rest-sql.mjs'
import { recalculateAccRefTz } from './acc-ref-tz.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Read DATABASE_URL from the live-server env (same source as live-legality.mjs / the rest of
// live-server) — no hardcoded host/credentials. (§信息安全规范: no plaintext passwords in code.)
function readEnv(key) {
  if (process.env[key]) return process.env[key]
  const env = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8')
  const line = env.split('\n').find((l) => l.startsWith(`${key}=`))
  if (!line) throw new Error(`${key} not found in live-server/.env`)
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}
const DB_URL = readEnv('DATABASE_URL')

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
const LIVE_SCHEMA = quoteIdent(readEnvDefault('LIVE_SCHEMA', 'f8'))
const SCENARIO_SCHEMA = quoteIdent(readEnvDefault('SCENARIO_SCHEMA', 'scenario'))
export const applySchemas = (text) =>
  text.replaceAll('f8.', `${LIVE_SCHEMA}.`).replaceAll('scenario.', `${SCENARIO_SCHEMA}.`)

export const recalculateScenarioAccRefTz = async (client, scenarioId, rulesetId) =>
  recalculateAccRefTz(client, {
    liveSchema: LIVE_SCHEMA,
    rosterTable: `${SCENARIO_SCHEMA}.roster_flight`,
    pairingSegmentTable: `${SCENARIO_SCHEMA}.pairing_segment`,
    pairingSegmentWhereSql: 'and ps.scenario_id = $1',
    // Align with flyDuties: live-backed pairings have no scenario segments.
    livePairingSegmentTable: `${LIVE_SCHEMA}.pairing_segment`,
    airportTable: `${LIVE_SCHEMA}.airport`,
    whereSql: 'rf.scenario_id = $1 and',
    values: [scenarioId],
    rulesetId,
  })

export const recalculateSeedAccRefTz = async (client, crewIds, pairingIds, rulesetId) =>
  recalculateAccRefTz(client, {
    liveSchema: LIVE_SCHEMA,
    rosterTable: `${LIVE_SCHEMA}.roster_flight`,
    pairingSegmentTable: `${LIVE_SCHEMA}.pairing_segment`,
    airportTable: `${LIVE_SCHEMA}.airport`,
    whereSql: 'rf.crew_id = any($1::varchar[]) and rf.pairing_id = any($2::bigint[]) and',
    values: [crewIds, pairingIds],
    rulesetId,
  })

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const SCENARIO_ID = Number(process.argv[2])
if (IS_MAIN && !SCENARIO_ID) {
  console.error('usage: node scripts/scenario-legality.mjs <scenarioId>')
  process.exit(2)
}

/**
 * Signal live-server to push the updated legality to WS clients so they targeted-refresh
 * (channel: scenario-recompute:{airlineSchema}:{scenarioId}). Non-fatal on failure — the
 * DB legality_status is the source of truth and the frontend can still read it.
 */
async function publishScenarioLegalityCompletion() {
  try {
    const redisUrl = readEnvDefault('REDIS_URL', '')
    if (!redisUrl) return
    const rc = createClient({ url: redisUrl })
    await rc.connect()
    const schema = process.env.WS_AIRLINE_SCHEMA || readEnvDefault('LIVE_SCHEMA', 'f8').replace(/^"|"$/g, '')
    await rc.publish(`scenario-recompute:${schema}:${SCENARIO_ID}`, String(Date.now()))
    await rc.quit()
  } catch (e) {
    console.error(`scenario ${SCENARIO_ID}: publish completion failed:`, e?.message ?? e)
  }
}

const db = new pg.Client({ connectionString: DB_URL })
const rawQuery = db.query.bind(db)
db.query = (queryConfig, values, callback) => {
  if (typeof queryConfig === 'string') return rawQuery(applySchemas(queryConfig), values, callback)
  if (queryConfig && typeof queryConfig.text === 'string') {
    return rawQuery({ ...queryConfig, text: applySchemas(queryConfig.text) }, values, callback)
  }
  return rawQuery(queryConfig, values, callback)
}

/**
 * Resolve the RO scenario's data context + rule group + period.
 *
 * `queryDb` must be a connected client (or schema-aware wrapper). The module-level
 * `db` is only connected in CLI `main()` — library callers (preview-draft) MUST pass
 * their own connected client or loadContext hangs forever on an unconnected Client.
 */
export async function loadContext(scenarioId, queryDb = db) {
  const r = await queryDb.query(
    `select s.ruleset_id, s.workset_id, s.status, s.file_type, s.str_dt_loc, s.end_dt_loc,
            coalesce(s.filter_params, '{}'::jsonb) as filter_params,
            coalesce(nullif(w.division, ''), 'P') as division
       from f8.scenario s
       left join f8.workset w on w.id = s.workset_id
      where s.id = $1`, [scenarioId])
  if (!r.rows.length) return null
  const m = r.rows[0]
  const loaded = await queryDb.query(
    `select count(*)::int as n from scenario.roster_flight where scenario_id=$1 and is_deleted=0`,
    [scenarioId])
  const d = (v) => (v instanceof Date ? v : new Date(v)).toISOString().slice(0, 10)
  // ruleset_id (bigint = workset/法规集合 id) replaced the dropped f8.scenario.rule_group_code.
  return {
    rulesetId: m.ruleset_id,
    worksetId: m.workset_id,
    status: m.status,
    fileType: m.file_type,
    filterParams: m.filter_params ?? {},
    division: m.division,
    loadedRosterCount: Number(loaded.rows[0]?.n ?? 0),
    dateFrom: d(m.str_dt_loc),
    dateTo: d(m.end_dt_loc),
    strDtLoc: m.str_dt_loc,
    endDtLoc: m.end_dt_loc,
  }
}

/**
 * Scenario source adapter: the EXACT SQL formerly inline in each rule, reading scenario.*
 * roster rows under a single scenario_id plus the shared f8 crew/crew_base/rule tables.
 */
export function scenarioSource(db, scenarioId, ctx) {
  let timelineCache = null
  const windowAsOf = () =>
    midpointDateOnly(ctx.dateFrom, ctx.dateTo)
    ?? asOfDateOnly(ctx.dateFrom) ?? asOfDateOnly(ctx.dateTo)
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

    /** First FLY pairing per crew (for attaching roster-level bells, which drop pairing_id NULL). */
    async firstPairingByCrew() {
      const rows = (await db.query(
        `select distinct on (crew_id) crew_id, pairing_id from scenario.roster_flight
           where scenario_id=$1 and is_deleted=0 and pairing_id is not null
           order by crew_id, sch_str_dt_utc`, [scenarioId])).rows
      return new Map(rows.map((r) => [String(r.crew_id), Number(r.pairing_id)]))
    },

    /** First FLY pairing per crew WITH its UTC span (scenario.* under scenario_id). */
    async firstPairingSpanByCrew() {
      const rows = (await db.query(
        `with firstp as (
           select distinct on (crew_id) crew_id, pairing_id
             from scenario.roster_flight where scenario_id=$1 and is_deleted=0 and pairing_id is not null
             order by crew_id, sch_str_dt_utc)
         select f.crew_id, f.pairing_id, min(rf.sch_str_dt_utc) as s, max(rf.sch_end_dt_utc) as e
           from firstp f
           join scenario.roster_flight rf on rf.crew_id=f.crew_id and rf.pairing_id=f.pairing_id
             and rf.scenario_id=$1 and rf.is_deleted=0
          group by f.crew_id, f.pairing_id`, [scenarioId])).rows
      return new Map(rows.map((r) => [String(r.crew_id),
        { id: Number(r.pairing_id), startIso: new Date(r.s).toISOString(), endIso: new Date(r.e).toISOString() }]))
    },

    /** All FLY pairing spans per crew, used to attach cumulative-window findings near the window. */
    async pairingSpansByCrew() {
      const rows = (await db.query(
        `select crew_id, pairing_id, min(sch_str_dt_utc) as s, max(sch_end_dt_utc) as e
           from scenario.roster_flight
          where scenario_id=$1 and is_deleted=0 and pairing_id is not null
          group by crew_id, pairing_id
          order by crew_id, min(sch_str_dt_utc), pairing_id`, [scenarioId])).rows
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
           from f8.roster_period
          where rp_start <= $2::date + interval '400 days'
            and rp_end >= $1::date - interval '400 days'
          order by rp_start`,
        [ctx.dateFrom, ctx.dateTo],
      )).rows
      return rows
    },

    async crewTeams() {
      const rows = (await db.query(
        `with active_window as (
           select min(sch_str_dt_utc) as start_ts, max(sch_end_dt_utc) as end_ts
             from scenario.roster_flight
            where scenario_id = $1 and is_deleted = 0
         ),
         active_crew as (
           select distinct crew_id
             from scenario.roster_flight
            where scenario_id = $1 and is_deleted = 0
         )
         select ct.crew_id, ct.team
           from f8.crew_team ct
           join active_crew ac on ac.crew_id = ct.crew_id
           cross join active_window w
          where ct.is_valid = 1
            and nullif(ct.team, '') is not null
            and w.start_ts is not null
            and ct.eff_dt <= w.end_ts
            and (ct.exp_dt is null or ct.exp_dt >= w.start_ts)
          group by ct.crew_id, ct.team
          order by ct.crew_id, ct.team`, [scenarioId])).rows
      return crewTeamRowsToMap(rows)
    },

    async assignmentGroups() {
      return (await db.query(
        `select a.assignment,
                ag.assignment_group
           from f8.assignment_group_map agm
           join f8.assignment_group ag on ag.id = agm.assignment_group_id
           join f8.assignment a on a.id = agm.assignment_id
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
        segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
        scenarioIdParam: '$1',
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
                  coalesce(
                    nullif(string_agg(distinct nullif(ps.seg_assignment, ''), '|' order by nullif(ps.seg_assignment, '')), ''),
                    nullif(string_agg(distinct nullif(lps.seg_assignment, ''), '|' order by nullif(lps.seg_assignment, '')), ''),
                    ''
                  ) as attributes
             from scenario.roster_flight rf
             left join scenario.pairing p
               on p.scenario_id = rf.scenario_id
              and p.id = rf.pairing_id
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id
              and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1
                  from scenario.pairing_segment ps_fallback
                 where ps_fallback.scenario_id = rf.scenario_id
                   and ps_fallback.pairing_id = rf.pairing_id
                   and coalesce(ps_fallback.is_deleted, 0) = 0
                   and ps_fallback.duty_seq = rf.duty_seq
              )
            where rf.scenario_id = $1
              and rf.is_deleted = 0
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
             from scenario.roster_flight rf
            where rf.scenario_id = $1
              and rf.is_deleted = 0
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
        [scenarioId],
      )).rows
    },

    // ── rule 8002 — block minutes per crew per LOCAL day (crew base timezone) ──
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
           from scenario.roster_flight rf
           left join crew_tz tz on tz.crew_id = rf.crew_id
          where rf.scenario_id = $1 and rf.is_deleted = 0 and rf.assignment_group = 'FLY' and rf.pairing_id is not null
          group by rf.crew_id, tz.zone_id,
                   date_trunc('day', rf.sch_str_dt_utc at time zone coalesce(tz.zone_id, 'UTC'))
         having sum(greatest(0, extract(epoch from (rf.sch_end_dt_utc - rf.sch_str_dt_utc)) / 60)) > 0`, [scenarioId])).rows
    },

    // ── rule 8002 full port — per-crew per-LOCAL-day manday metrics (scenario) ──
    // Mirrors live-legality.mjs: crew_manday_fd_daily rows for THIS scenario
    // (populated by ruletool). Crews without scenario manday rows fall back to
    // blockByDay synthesis in the core. credit hours → ×60 minutes.
    async mandayMetricsByDay() {
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
          where scenario_id = $1
            and (blh > 0 or ft > 0 or dp > 0 or credit > 0 or standby > 0
                 or coalesce(int_blh,0) > 0 or augument_blh > 0
                 or coalesce(cust_data1,0) > 0 or coalesce(cross_tz_duty_count,0) > 0)`,
        [scenarioId])).rows
    },

    // ── rule 8002 full port — effective-dated crew qualification windows ──
    // Identical to the live source (master data, not scenario-scoped).
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
           from scenario.roster_flight rf
           left join scenario.pairing p on p.scenario_id = $1 and p.id = rf.pairing_id and p.is_deleted = 0
           left join scenario.flight f on f.scenario_id = $1 and f.id = rf.flt_id and f.is_deleted = 0
           left join scenario.pairing_segment ps on ps.scenario_id = $1 and ps.pairing_id = rf.pairing_id
            and ps.duty_seq = rf.duty_seq and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0
           left join crew_quals q on q.crew_id = rf.crew_id
          where rf.scenario_id = $1 and rf.is_deleted = 0
            and (cardinality($2::text[]) = 0 or coalesce(nullif(rf.assignment_group, ''), p.assignment_group, '') = any($2::text[]))
            and (cardinality($3::text[]) = 0 or coalesce(nullif(f.flt_num, ''), nullif(ps.flt_num, ''), '') = any($3::text[]))
            and (cardinality($4::text[]) = 0 or coalesce(nullif(rf.arv_arp, ''), nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), '') = any($4::text[]))
            and (cardinality($5::text[]) = 0 or coalesce(nullif(rf.position, ''), '') = any($5::text[]))
          group by rf.id, rf.crew_id, rf.pairing_id, rf.duty_seq, rf.flt_id, rf.sch_str_dt_utc,
                   rf.sch_end_dt_utc, rf.label, p.pairing_label, rf.assignment_group, p.assignment_group,
                   rf.assignment, p.assignment, f.flt_num, ps.flt_num, rf.arv_arp, f.arv_arp, ps.arv_arp,
                   rf.seg_seq,
                   rf.position
          order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id nulls last, rf.duty_seq, rf.seg_seq`,
        [scenarioId, groups, flights, destinations, positions])).rows
    },

    // ── rule 8072 — crew-on-flight segment qualification rows ──
    async qualificationFlightSegments(filters = {}) {
      const groups = filters.groups?.length ? filters.groups : []
      const fleets = filters.fleets?.length ? filters.fleets : []
      const deps = filters.deps?.length ? filters.deps : []
      const arrs = filters.arrs?.length ? filters.arrs : []
      // Preview-draft: only segments on the edited pairings (filled COF then follows seg).
      const focusPairingIds = [...new Set(
        (Array.isArray(filters.focusPairingIds) ? filters.focusPairingIds : (ctx?.focusPairingIds ?? []))
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
             from scenario.roster_flight rf
             left join scenario.pairing p on p.scenario_id = $1 and p.id = rf.pairing_id and p.is_deleted = 0
             left join scenario.pairing_segment ps on ps.scenario_id = $1 and ps.pairing_id = rf.pairing_id
              and ps.duty_seq = rf.duty_seq and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0
             left join scenario.flight f on f.scenario_id = $1 and f.id = coalesce(rf.flt_id, ps.flt_id) and f.is_deleted = 0
             left join f8.crew c on c.crew_id = rf.crew_id
             left join f8.airport ap on ap.airport = coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''))
            where rf.scenario_id = $1
              and rf.is_deleted = 0
              and rf.pairing_id is not null
              and coalesce(nullif(rf.division, ''), c.division, p.division, '') = 'P'
              and (cardinality($2::text[]) = 0 or coalesce(nullif(rf.assignment_group, ''), nullif(p.assignment_group, ''), '') = any($2::text[]))
              and (cardinality($3::text[]) = 0 or coalesce(nullif(f.fleet, ''), nullif(ps.fleet_seg, ''), nullif(p.fleet, ''), '') = any($3::text[]))
              and (cardinality($4::text[]) = 0 or coalesce(nullif(f.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(rf.dep_arp, ''), '') = any($4::text[]))
              and (cardinality($5::text[]) = 0 or coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''), '') = any($5::text[]))
              and (cardinality($6::bigint[]) = 0 or rf.pairing_id = any($6::bigint[]))
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
             join scenario.roster_flight rf on rf.scenario_id = $1
              and rf.pairing_id = s.pairing_id
              and coalesce(rf.duty_seq, 0) = s.duty_seq
              and coalesce(rf.seg_seq, 0) = s.seg_seq
              and rf.is_deleted = 0
             left join f8.crew c on c.crew_id = rf.crew_id
             left join lateral (
               select string_agg(distinct cq.qualification, '|' order by cq.qualification) as quals
                 from f8.crew_qualification cq
                where cq.crew_id = rf.crew_id
                  and cq.is_valid = 1
                  and cq.eff_dt <= s.end_ts
                  and (cq.exp_dt is null or cq.exp_dt >= s.start_ts)
             ) q on true
             left join lateral (
               select string_agg(distinct ct.team, '|' order by ct.team) as teams
                 from f8.crew_team ct
                where ct.crew_id = rf.crew_id
                  and ct.is_valid = 1
                  and ct.eff_dt <= s.end_ts
                  and (ct.exp_dt is null or ct.exp_dt >= s.start_ts)
             ) tm on true
            where coalesce(nullif(rf.division, ''), c.division, '') = 'P'
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
                 from scenario.flight_composition fc
                where fc.scenario_id = $1 and fc.flt_id = s.flight_id and fc.division = 'P'
             ) fc on true
             left join lateral (
               select string_agg(pc.acting_rank || ':' || coalesce(pc.plan, 0)::text, '|' order by pc.acting_rank) as planned_by_rank
                 from scenario.pairing_composition pc
                where pc.scenario_id = $1 and pc.pairing_id = s.pairing_id and pc.division = 'P' and pc.is_deleted = 0
             ) pc on true
         ),
         -- Set-based COF fill (scenario ∪ live by flt_id). Avoid per-segment LATERAL
         -- scans of live.roster_flight — those dominated preview-draft (~12s) with no flt_id index.
         filled_rows as materialized (
           select u.flight_id,
                  coalesce(nullif(u.flight_acting_rank, ''), nullif(u.roster_acting_rank, ''), '*') as acting_rank,
                  count(distinct u.crew_id)::int as n
             from (
               select rf.flt_id as flight_id, rf.crew_id, rf.flight_acting_rank, rf.roster_acting_rank
                 from scenario.roster_flight rf
                where rf.scenario_id = $1
                  and rf.is_deleted = 0
                  and rf.assignment_group = 'FLY'
                  and rf.pairing_id is not null
                  and rf.flt_id is not null
                  and rf.flt_id in (select s.flight_id from seg s where s.flight_id <> 0)
               union
               select rf.flt_id, rf.crew_id, rf.flight_acting_rank, rf.roster_acting_rank
                 from f8.roster_flight rf
                where rf.is_deleted = 0
                  and rf.assignment_group = 'FLY'
                  and rf.pairing_id is not null
                  and rf.flt_id is not null
                  and rf.flt_id in (select s.flight_id from seg s where s.flight_id <> 0)
             ) u
            group by u.flight_id,
                     coalesce(nullif(u.flight_acting_rank, ''), nullif(u.roster_acting_rank, ''), '*')
         ),
         filled as materialized (
           select s.segment_id,
                  string_agg(f.acting_rank || ':' || f.n::text, '|' order by f.acting_rank) as filled_by_rank
             from seg s
             join filled_rows f on f.flight_id = s.flight_id
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
        [scenarioId, groups, fleets, deps, arrs, focusPairingIds])).rows
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
      const scenarioDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyStart = `coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)`
      const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
        scenarioIdParam: '$1',
      })
      return (await db.query(
        `with duty_rows as (
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
             from scenario.roster_flight rf
             left join scenario.pairing p on p.scenario_id = rf.scenario_id and p.id = rf.pairing_id
             left join scenario.pairing_segment ps on ps.scenario_id = rf.scenario_id and ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1
                  from scenario.pairing_segment ps_fallback
                 where ps_fallback.scenario_id = rf.scenario_id
                   and ps_fallback.pairing_id = rf.pairing_id
                   and coalesce(ps_fallback.is_deleted, 0) = 0
                   and ps_fallback.duty_seq = rf.duty_seq
              )
            where rf.scenario_id = $1 and rf.is_deleted = 0
              and ((cardinality($2::text[]) = 0 and cardinality($3::text[]) = 0) or rf.assignment_group = any($2) or rf.assignment = any($3)) and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
           union all
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
             from scenario.roster_flight rf
            where rf.scenario_id = $1 and rf.is_deleted = 0
              and ((cardinality($2::text[]) = 0 and cardinality($3::text[]) = 0) or rf.assignment_group = any($2) or rf.assignment = any($3)) and rf.pairing_id is null
         )
         select d.*, coalesce(tz.base, d.base, '') as crew_base, coalesce(tz.zone_id, 'UTC') as zone_id
           from duty_rows d
           left join lateral (
             select cb.base, a.zone_id
               from f8.crew_base cb
               left join f8.airport a on a.airport = cb.base
              where cb.crew_id = d.crew_id
                and cb.eff_dt <= d.duty_end_ts
                and (cb.exp_dt >= d.duty_end_ts or cb.exp_dt is null)
              order by cb.is_prime_base desc, cb.eff_dt desc
              limit 1
           ) tz on true
          order by d.crew_id, d.duty_end_ts, d.pairing_id`, [scenarioId, G, C])).rows
    },

    // ── rule 8030 — per-flt_id pilot age complement (scenario ∪ live same flt_id) ──
    async pilotAge() {
      const focusPairingIds = [...new Set(
        (Array.isArray(ctx?.focusPairingIds) ? ctx.focusPairingIds : [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      )]
      return (await db.query(
        `with scen as (
           select coalesce(rf.flt_id, ps.flt_id, lps.flt_id, -rf.pairing_id) as flt_id,
                  rf.pairing_id, rf.crew_id,
                  coalesce(nullif(rf.division,''), cr.division) as division,
                  coalesce(rf.sch_str_dt_utc, ps.sch_str_dt_utc, lps.sch_str_dt_utc) as seg_start_ts,
                  coalesce(rf.sch_end_dt_utc, ps.sch_end_dt_utc, lps.sch_end_dt_utc) as seg_end_ts,
                  coalesce(
                    nullif(sf.flt_num, ''), nullif(ps.flt_num, ''),
                    nullif(lf.flt_num, ''), nullif(lps.flt_num, ''), ''
                  ) as flt_num,
                  coalesce(
                    nullif(sf.airline, ''), nullif(ps.airline, ''),
                    nullif(lf.airline, ''), nullif(lps.airline, ''), ''
                  ) as airline,
                  coalesce(
                    sf.sch_dep_dt_utc, lf.sch_dep_dt_utc,
                    ps.sch_str_dt_utc, lps.sch_str_dt_utc, rf.sch_str_dt_utc
                  ) as dep_ts,
                  coalesce(nullif(ap.zone_id, ''), 'UTC') as dep_zone_id,
                  cr.birthday
             from scenario.roster_flight rf
             join f8.crew cr on cr.crew_id = rf.crew_id
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and (
                (rf.flt_id is not null and ps.flt_id = rf.flt_id)
                or (rf.flt_id is null and (
                      rf.duty_seq is null
                      or (ps.duty_seq = rf.duty_seq
                          and (rf.seg_seq is null or ps.seg_seq = rf.seg_seq))
                    ))
              )
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and ps.pairing_id is null
              and (
                (rf.flt_id is not null and lps.flt_id = rf.flt_id)
                or (rf.flt_id is null and (
                      rf.duty_seq is null
                      or (lps.duty_seq = rf.duty_seq
                          and (rf.seg_seq is null or lps.seg_seq = rf.seg_seq))
                    ))
              )
             left join scenario.flight sf
               on sf.scenario_id = rf.scenario_id
              and sf.id = coalesce(rf.flt_id, ps.flt_id)
              and coalesce(sf.is_deleted, 0) = 0
             left join f8.flight lf
               on lf.id = coalesce(rf.flt_id, ps.flt_id, lps.flt_id)
              and coalesce(lf.is_deleted, 0) = 0
             left join f8.airport ap
               on ap.airport = coalesce(
                    nullif(sf.dep_arp, ''), nullif(lf.dep_arp, ''),
                    nullif(ps.dep_arp, ''), nullif(lps.dep_arp, ''), nullif(rf.dep_arp, '')
                  )
            where rf.scenario_id=$1 and rf.is_deleted=0 and rf.assignment_group='FLY'
              and rf.pairing_id is not null and cr.birthday is not null
         ),
         -- Preview focusPairingIds ($2): Live mates only for those pairings' flights.
         -- Full recheck (empty $2): Live mates for every scen flt_id.
         touched_live as (
           select distinct s.flt_id
             from scen s
            where s.flt_id is not null and s.flt_id > 0
              and (
                cardinality($2::bigint[]) = 0
                or s.pairing_id = any($2::bigint[])
                or s.flt_id in (
                  select ps.flt_id
                    from f8.pairing_segment ps
                   where cardinality($2::bigint[]) > 0
                     and ps.pairing_id = any($2::bigint[])
                     and coalesce(ps.is_deleted, 0) = 0
                     and ps.flt_id is not null
                )
              )
         ),
         live_mates as (
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
             from f8.roster_flight rf
             join f8.crew cr on cr.crew_id = rf.crew_id
             left join f8.pairing_segment ps
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
             left join f8.flight fl
               on fl.id = coalesce(rf.flt_id, ps.flt_id)
              and coalesce(fl.is_deleted, 0) = 0
             left join f8.airport ap
               on ap.airport = coalesce(nullif(fl.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(rf.dep_arp, ''))
             join touched_live t on t.flt_id = coalesce(rf.flt_id, ps.flt_id)
            where rf.is_deleted=0 and rf.assignment_group='FLY'
              and rf.pairing_id is not null and cr.birthday is not null
         ),
         f as (
           select * from scen
           union all
           select * from live_mates
         )
         select distinct on (flt_id, crew_id)
                flt_id, pairing_id, crew_id, division, flt_num, airline, dep_zone_id,
                to_char(seg_start_ts,'YYYY-MM-DD') as start_date,
                extract(epoch from seg_start_ts)::bigint as start_secs,
                extract(epoch from seg_end_ts)::bigint as end_secs,
                extract(epoch from dep_ts)::bigint as dep_secs,
                to_char(birthday,'YYYY-MM-DD') as birth_date
           from f
          order by flt_id, crew_id, pairing_id`, [scenarioId, focusPairingIds])).rows
    },

    // ── rule 7509 — physical-flight forbidden crew-pair complement ──
    async avoidCoPairing({ crewIds = [], focusPairingIds = [] } = {}) {
      const scenarioDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const values = [scenarioId, focusPairingIds, crewIds, ctx.dateTo, ctx.dateFrom]
      return (await db.query(
        `with scenario_candidates as (
           select rf.crew_id, rf.pairing_id,
                  min(coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)) as pairing_start_ts,
                  max(coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)) as pairing_end_ts
             from scenario.roster_flight rf
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id
              and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1 from scenario.pairing_segment ps_fallback
                 where ps_fallback.scenario_id = rf.scenario_id
                   and ps_fallback.pairing_id = rf.pairing_id
                   and ps_fallback.duty_seq = rf.duty_seq
                   and coalesce(ps_fallback.is_deleted, 0) = 0
              )
            where rf.scenario_id = $1
              and rf.is_deleted = 0
              and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
              and (
                (cardinality($2::bigint[]) = 0 and rf.crew_id = any($3::varchar[]))
                or (cardinality($2::bigint[]) > 0 and
                    (rf.pairing_id = any($2::bigint[]) or rf.crew_id = any($3::varchar[])))
              )
            group by rf.crew_id, rf.pairing_id
           having min(coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)) < $4::timestamptz
              and max(coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)) >= $5::timestamptz
         ),
         touched_flights as (
           select distinct coalesce(rf.flt_id, ps.flt_id, lps.flt_id, -rf.pairing_id) as flight_id
             from scenario.roster_flight rf
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id
              and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
             join scenario_candidates sc
               on sc.crew_id = rf.crew_id and sc.pairing_id = rf.pairing_id
            where rf.scenario_id = $1 and rf.is_deleted = 0
              and rf.assignment_group = 'FLY' and rf.pairing_id is not null
         ),
         scenario_member_pairings as (
           select distinct rf.crew_id, rf.pairing_id
             from scenario.roster_flight rf
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id
              and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1 from scenario.pairing_segment ps_fallback
                 where ps_fallback.scenario_id = rf.scenario_id
                   and ps_fallback.pairing_id = rf.pairing_id
                   and ps_fallback.duty_seq = rf.duty_seq
                   and coalesce(ps_fallback.is_deleted, 0) = 0
              )
             join touched_flights tf
               on tf.flight_id = coalesce(rf.flt_id, ps.flt_id, lps.flt_id, -rf.pairing_id)
            where rf.scenario_id = $1 and rf.is_deleted = 0
              and rf.assignment_group = 'FLY' and rf.pairing_id is not null
         ),
         scenario_pairing_spans as (
           select rf.crew_id, rf.pairing_id,
                  min(coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)) as pairing_start_ts,
                  max(coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)) as pairing_end_ts
             from scenario.roster_flight rf
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id
              and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1 from scenario.pairing_segment ps_fallback
                 where ps_fallback.scenario_id = rf.scenario_id
                   and ps_fallback.pairing_id = rf.pairing_id
                   and ps_fallback.duty_seq = rf.duty_seq
                   and coalesce(ps_fallback.is_deleted, 0) = 0
              )
             join scenario_member_pairings mp
               on mp.crew_id = rf.crew_id and mp.pairing_id = rf.pairing_id
            where rf.scenario_id = $1 and rf.is_deleted = 0
              and rf.assignment_group = 'FLY' and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ),
         scenario_members_raw as (
           select coalesce(rf.flt_id, ps.flt_id, lps.flt_id, -rf.pairing_id) as flight_id,
                  rf.crew_id, rf.pairing_id,
                  scenario_span.pairing_start_ts as member_start_ts,
                  scenario_span.pairing_end_ts as member_end_ts,
                  upper(coalesce(rf.source, '')) = 'PA' as source_is_pa
             from scenario.roster_flight rf
             left join scenario.pairing_segment ps
               on ps.scenario_id = rf.scenario_id and ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0 and lps.duty_seq = rf.duty_seq
             join touched_flights tf on tf.flight_id = coalesce(rf.flt_id, ps.flt_id, lps.flt_id, -rf.pairing_id)
             join scenario_pairing_spans scenario_span
               on scenario_span.crew_id = rf.crew_id and scenario_span.pairing_id = rf.pairing_id
            where rf.scenario_id = $1 and rf.is_deleted = 0
              and rf.assignment_group = 'FLY' and rf.pairing_id is not null
         ),
         live_member_pairings as (
           select distinct rf.crew_id, rf.pairing_id
             from f8.roster_flight rf
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
             join touched_flights tf
               on tf.flight_id = coalesce(rf.flt_id, lps.flt_id, -rf.pairing_id)
            where rf.is_deleted = 0 and rf.assignment_group = 'FLY' and rf.pairing_id is not null
         ),
         live_pairing_spans as (
           select rf.crew_id, rf.pairing_id,
                  min(coalesce(lps.duty_act_str_dt_utc, lps.duty_sch_str_dt_utc, rf.sch_str_dt_utc)) as pairing_start_ts,
                  max(coalesce(lps.duty_act_end_dt_utc, lps.duty_sch_end_dt_utc, lps.debrief_end_utc, rf.sch_end_dt_utc)) as pairing_end_ts
             from f8.roster_flight rf
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
             join live_member_pairings mp
               on mp.crew_id = rf.crew_id and mp.pairing_id = rf.pairing_id
            where rf.is_deleted = 0 and rf.assignment_group = 'FLY' and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ),
         live_members_raw as (
           select coalesce(rf.flt_id, lps.flt_id, -rf.pairing_id) as flight_id,
                  rf.crew_id, rf.pairing_id,
                  live_span.pairing_start_ts as member_start_ts,
                  live_span.pairing_end_ts as member_end_ts,
                  upper(coalesce(rf.source, '')) = 'PA' as source_is_pa
             from f8.roster_flight rf
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id and coalesce(lps.is_deleted, 0) = 0
              and (rf.flt_id is null or lps.flt_id = rf.flt_id)
             join touched_flights tf on tf.flight_id = coalesce(rf.flt_id, lps.flt_id, -rf.pairing_id)
             join live_pairing_spans live_span
               on live_span.crew_id = rf.crew_id and live_span.pairing_id = rf.pairing_id
            where rf.is_deleted = 0 and rf.assignment_group = 'FLY' and rf.pairing_id is not null
         ),
         members_raw as (
           select * from scenario_members_raw
           union all
           select lm.*
             from live_members_raw lm
            where not exists (
              select 1
                from scenario_members_raw sm
               where sm.flight_id = lm.flight_id
                 and sm.crew_id = lm.crew_id
            )
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
                coalesce(nullif(sf.flt_num, ''), nullif(lf.flt_num, ''), '') as flight_number,
                extract(epoch from coalesce(sf.sch_dep_dt_utc, lf.sch_dep_dt_utc))::bigint as dep_secs
           from members m
           left join scenario.flight sf on sf.scenario_id = $1 and sf.id = m.flight_id and coalesce(sf.is_deleted, 0) = 0
           left join f8.flight lf on lf.id = m.flight_id and coalesce(lf.is_deleted, 0) = 0
          where m.flight_id > 0
          order by m.flight_id, m.crew_id, m.pairing_id`, [scenarioId, focusPairingIds, crewIds, ctx.dateTo, ctx.dateFrom])).rows
    },

    // ── rule 8004 — roster spans (R rows) ──
    async assignmentsRaw() {
      return (await db.query(
        `select crew_id, pairing_id, max(base) as base,
                to_char(min(sch_str_dt_utc),'YYYY-MM-DD') as start_date, to_char(max(sch_end_dt_utc),'YYYY-MM-DD') as end_date,
                extract(epoch from min(sch_str_dt_utc))::bigint as start_secs, extract(epoch from max(sch_end_dt_utc))::bigint as end_secs
           from scenario.roster_flight where scenario_id=$1 and is_deleted=0 and pairing_id is not null
           group by crew_id, pairing_id`, [scenarioId])).rows
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
      // RO scenarios often keep live pairing_segment rows (scenario segments empty).
      const scenarioDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyStart = `coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)`
      const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
        scenarioIdParam: '$1',
      })
      return (await db.query(
        `with pairing_rows as (
           select rf.crew_id, rf.pairing_id,
                  extract(epoch from min(${dutyStart}))::bigint as start_secs,
                  extract(epoch from max(${dutyEnd}))::bigint as end_duty_secs,
                  ${endRestSql},
                  coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
                  coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment
             from scenario.roster_flight rf
             left join scenario.pairing p on p.scenario_id = rf.scenario_id and p.id = rf.pairing_id
             left join scenario.pairing_segment ps on ps.scenario_id = rf.scenario_id and ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1
                  from scenario.pairing_segment ps_fallback
                 where ps_fallback.scenario_id = rf.scenario_id
                   and ps_fallback.pairing_id = rf.pairing_id
                   and coalesce(ps_fallback.is_deleted, 0) = 0
                   and ps_fallback.duty_seq = rf.duty_seq
              )
            where rf.scenario_id = $1 and rf.is_deleted = 0 and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ), ground_rows as (
           select rf.crew_id, -rf.id as pairing_id,
                  extract(epoch from rf.sch_str_dt_utc)::bigint as start_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_duty_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_rest_secs,
                  coalesce(nullif(rf.assignment_group, ''), rf.assignment, 'GRD') as assignment_group,
                  coalesce(nullif(rf.assignment, ''), rf.assignment_group, 'GRD') as assignment
             from scenario.roster_flight rf
            where rf.scenario_id = $1 and rf.is_deleted = 0 and rf.pairing_id is null
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
           left join f8.assignment a on a.assignment = rows.assignment
          order by rows.crew_id, rows.start_secs, rows.pairing_id`, [scenarioId])).rows
    },

    // ── rule 7505/7507 — all roster rows as (crew, code, secs); pairing_id required for RP anchor ──
    async assignmentsAll() {
      const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
      return (await db.query(
        `select rf.crew_id, rf.pairing_id, rf.assignment as code,
                extract(epoch from rf.sch_str_dt_utc)::bigint as s,
                extract(epoch from ${dutyEnd})::bigint as e,
                extract(epoch from ${dutyEnd})::bigint
                  + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs
           from scenario.roster_flight rf
           left join scenario.pairing_segment ps
             on rf.pairing_id is not null
            and ps.scenario_id = rf.scenario_id
            and ps.pairing_id = rf.pairing_id
            and coalesce(ps.is_deleted, 0) = 0
            and ps.duty_seq = rf.duty_seq
            and ps.seg_seq = rf.seg_seq
           left join f8.pairing_segment lps
             on rf.pairing_id is not null
            and lps.pairing_id = rf.pairing_id
            and coalesce(lps.is_deleted, 0) = 0
            and lps.duty_seq = rf.duty_seq
            and lps.seg_seq = rf.seg_seq
            and not exists (
              select 1
                from scenario.pairing_segment ps_fallback
               where ps_fallback.scenario_id = rf.scenario_id
                 and ps_fallback.pairing_id = rf.pairing_id
                 and coalesce(ps_fallback.is_deleted, 0) = 0
                 and ps_fallback.duty_seq = rf.duty_seq
            )
          where rf.scenario_id = $1 and rf.is_deleted = 0
          order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id`, [scenarioId])).rows
    },

    // ── rule 7506 — check-ins: FLY pairings + ground rows (duty = assignment) ──
    async checkins() {
      return (await db.query(
        `select crew_id, pairing_id, assignment_group as duty,
                extract(epoch from min(sch_str_dt_utc))::bigint as start_secs,
                extract(epoch from max(sch_end_dt_utc))::bigint as end_secs
           from scenario.roster_flight
          where scenario_id=$1 and is_deleted=0 and assignment_group='FLY' and pairing_id is not null
          group by crew_id, pairing_id, assignment_group
         union all
         select crew_id, 0::bigint as pairing_id, assignment as duty,
                extract(epoch from sch_str_dt_utc)::bigint as start_secs,
                extract(epoch from sch_end_dt_utc)::bigint as end_secs
           from scenario.roster_flight
          where scenario_id=$1 and is_deleted=0 and pairing_id is null`, [scenarioId])).rows
    },

    // ── rules 7501/7503/7504 — FLY work periods (optionally split by duty_seq) ──
    async flyDuties(byDutySeq) {
      const grp = byDutySeq ? 'rf.crew_id, rf.pairing_id, rf.duty_seq' : 'rf.crew_id, rf.pairing_id'
      const scenarioDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyStart = `coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)`
      const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
      const scenarioFirstFlight = firstFlightDepartureUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveFirstFlight = firstFlightDepartureUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const firstFlight = `coalesce(${scenarioFirstFlight}, ${liveFirstFlight}, rf.sch_str_dt_utc)`
      const scenarioLastFlight = lastFlightArrivalUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveLastFlight = lastFlightArrivalUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const lastFlight = `coalesce(${scenarioLastFlight}, ${liveLastFlight}, rf.sch_end_dt_utc)`
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['scenario.pairing_segment', 'f8.pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
        scenarioIdParam: '$1',
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
                coalesce(
                  nullif(string_agg(distinct nullif(ps.seg_assignment, ''), '|' order by nullif(ps.seg_assignment, '')), ''),
                  nullif(string_agg(distinct nullif(lps.seg_assignment, ''), '|' order by nullif(lps.seg_assignment, '')), ''),
                  '*'
                ) as attributes
           from scenario.roster_flight rf
           left join scenario.pairing p on p.scenario_id = rf.scenario_id and p.id = rf.pairing_id
           left join scenario.pairing_segment ps on ps.scenario_id = rf.scenario_id and ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
           left join f8.pairing_segment lps
             on lps.pairing_id = rf.pairing_id
            and coalesce(lps.is_deleted, 0) = 0
            and lps.duty_seq = rf.duty_seq
            and not exists (
              select 1
                from scenario.pairing_segment ps_fallback
               where ps_fallback.scenario_id = rf.scenario_id
                 and ps_fallback.pairing_id = rf.pairing_id
                 and coalesce(ps_fallback.is_deleted, 0) = 0
                 and ps_fallback.duty_seq = rf.duty_seq
            )
          where rf.scenario_id=$1 and rf.is_deleted=0 and rf.assignment_group='FLY' and rf.pairing_id is not null
          group by ${grp}`, [scenarioId])).rows
    },

    // ── rules 7501/7503 — non-rest ground work periods ──
    async groundWork(includeRest = false) {
      return (await db.query(
        `select crew_id, pairing_id, assignment,
                extract(epoch from sch_str_dt_utc)::bigint as start_secs,
                extract(epoch from sch_end_dt_utc)::bigint as end_secs
           from scenario.roster_flight where scenario_id=$1 and is_deleted=0 and pairing_id is null`, [scenarioId]))
        .rows
        .map((r) => ({ ...r, is_rest: REST_LEAVE_CODES.has(String(r.assignment)) }))
        .filter((r) => includeRest || !r.is_rest)
    },
  }
}

// scenario.rule_violation.ruleset_id holds the scenario's numeric ruleset_id (workset id) as a
// tag — the scenario read path (routes/scenario/legality.ts) selects/filters by scenario_id only,
// so this column's value isn't queried. (Migrated from rule_group_code → ruleset_id alongside
// f8.* + scenario.legality_status; see 2026-06-23-scenario-rule-violation-rule-group-code-to-ruleset-id.sql.)
const COLS = ['scenario_id', 'roster_version', 'crew_id', 'pairing_id', 'duty_seq', 'ruleset_id',
  'rule_code', 'rule_instance', 'scope_key', 'start_dt', 'end_dt', 'window_start_dt', 'window_end_dt',
  'severity', 'actual_value', 'limit_value', 'unit', 'message']
const CONFLICT = '(scenario_id, crew_id, pairing_id, duty_seq, ruleset_id, rule_code, rule_instance, scope_key)'
const UPDATE = `roster_version=excluded.roster_version, start_dt=excluded.start_dt, end_dt=excluded.end_dt,
  window_start_dt=excluded.window_start_dt, window_end_dt=excluded.window_end_dt,
  severity=excluded.severity, actual_value=excluded.actual_value, limit_value=excluded.limit_value,
  unit=excluded.unit, message=excluded.message, computed_at=now()`

async function main() {
  await db.connect()
  const ctx = await loadContext(SCENARIO_ID)
  if (!ctx) { console.error(`scenario ${SCENARIO_ID} not found`); process.exit(1) }

  const v = await db.query(
    `insert into scenario.legality_status (scenario_id, ruleset_id, roster_version, status)
       values ($1, $2, 1, 'COMPUTING')
     on conflict (scenario_id) do update set status='COMPUTING', updated_at=now()
     returning roster_version`, [SCENARIO_ID, ctx.rulesetId])
  const rosterVersion = Number(v.rows[0].roster_version)

  const selectedSource = selectLegalitySource(db, SCENARIO_ID, ctx, scenarioSource)
  if (selectedSource.kind === 'seed') {
    console.log(`scenario ${SCENARIO_ID}: using seed/live-backed legality source`)
  }
  const source = selectedSource.source
  try {
    // 7500 is a state-builder for dependent rules. Persist crew-specific Ref TZ
    // values before any rule reads flyDuties(), including a manual Scenario Recheck.
    if (selectedSource.kind === 'seed') {
      const seedCrewIds = await resolveSeedCrewIds(db, ctx)
      const seedPairingIds = await resolveSeedPairingIds(db, ctx)
      await recalculateSeedAccRefTz(db, seedCrewIds, seedPairingIds, ctx.rulesetId)
    } else {
      await recalculateScenarioAccRefTz(db, SCENARIO_ID, ctx.rulesetId)
    }
    // Shared path (§Gantt-Unify): computeViolations resolves the scenario's own ruleset
    // (ctx.rulesetId) → ctx.instancesOf, then runs every kernel dynamically (same as live).
    // Kept inside this try (not just the write transaction below) so a missing/stale rule-engine
    // binary — or any other compute failure — flips legality_status to FAILED with the real
    // error instead of leaving it stuck at COMPUTING forever (the "spins forever" bug).
    const all = await computeViolations(source, ctx, null)

    await db.query('begin')
    try {
      await db.query(`delete from scenario.rule_violation where scenario_id=$1`, [SCENARIO_ID])
      for (let i = 0; i < all.length; i += 2000) {
        const chunk = all.slice(i, i + 2000).map((r) => [SCENARIO_ID, rosterVersion, r.crew_id, r.pairing_id,
          r.duty_seq, ctx.rulesetId, r.rule_code, r.rule_instance, r.scope_key ?? '', r.start_dt, r.end_dt,
          r.window_start_dt ?? null, r.window_end_dt ?? null, r.severity,
          r.actual_value, r.limit_value, r.unit, r.message])
        const q = buildBulkInsert('scenario.rule_violation', COLS, chunk, CONFLICT, UPDATE)
        if (q) await db.query(q.text, q.values)
      }
      await db.query(
        `update scenario.legality_status set status='READY', computed_version=roster_version,
           computed_at=now(), error_text=null, updated_at=now() where scenario_id=$1`, [SCENARIO_ID])
      await db.query('commit')
    } catch (e) { await db.query('rollback'); throw e }
  } catch (e) {
    await db.query(
      `update scenario.legality_status set status='FAILED', error_text=$2, updated_at=now()
         where scenario_id=$1`, [SCENARIO_ID, String(e?.message ?? e).slice(0, 2000)])
    await publishScenarioLegalityCompletion()
    throw e
  }

  const cnt = await db.query(`select rule_code, count(*)::int n from scenario.rule_violation where scenario_id=$1 group by rule_code order by rule_code`, [SCENARIO_ID])
  console.log(`persisted for scenario ${SCENARIO_ID}:`, cnt.rows, '— status READY')
  await publishScenarioLegalityCompletion()
  await db.end()
}

if (IS_MAIN) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
