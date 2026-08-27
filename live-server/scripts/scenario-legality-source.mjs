import {
  crewTeamRowsToMap,
  REST_LEAVE_CODES,
  asOfDateOnly,
  buildCrewBaseTimeline,
  resolveOffsetAtUtc,
  resolveBaseAt,
  resolveOffsetAt,
  midpointDateOnly,
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

const toDate = (value) => (value instanceof Date ? value : new Date(value))
const dateSql = (value) => toDate(value).toISOString().slice(0, 19).replace('T', ' ')
const normalizeDivision = (value) => {
  const v = String(value ?? '').trim().toUpperCase()
  if (v === 'C' || v === 'CC' || v === 'CABIN') return 'C'
  return 'P'
}
const stringArray = (value) => Array.isArray(value) ? value.map(String).filter(Boolean) : []

export function isSeedLegalityScenario(ctx) {
  return Number(ctx?.loadedRosterCount ?? 0) === 0
    && String(ctx?.fileType ?? '').toUpperCase() === 'RO'
    && ['DRAFT', 'FAILED'].includes(String(ctx?.status ?? '').toUpperCase())
}

export function selectLegalitySource(db, scenarioId, ctx, scenarioSourceFactory) {
  if (isSeedLegalityScenario(ctx)) {
    return { kind: 'seed', source: buildSeedSource(db, scenarioId, ctx) }
  }
  return { kind: 'scenario', source: scenarioSourceFactory ? scenarioSourceFactory(db, scenarioId, ctx) : null }
}

export async function resolveSeedCrewIds(db, ctx) {
  if (Array.isArray(ctx?.seedCrewIds)) return ctx.seedCrewIds.map(String)
  const fp = ctx?.filterParams ?? {}
  const crewFilter = fp.crew ?? {}
  const division = normalizeDivision(ctx?.division)
  const bases = stringArray(crewFilter.bases)
  const fleets = stringArray(crewFilter.fleets)
  const params = [division, dateSql(ctx.dateTo), dateSql(ctx.dateFrom), bases, fleets]
  const { rows } = await db.query(
    `select c.crew_id
       from f8.crew c
      where c.division = $1
        and (
          cardinality($4::text[]) = 0
          or c.crew_id in (
            select cb.crew_id from f8.crew_base cb
             where cb.base = any($4::text[])
               and cb.eff_dt <= $2::timestamp
               and (cb.exp_dt >= $3::timestamp or cb.exp_dt is null)
          )
        )
        and (
          cardinality($5::text[]) = 0
          or c.crew_id in (
            select cf.crew_id from f8.crew_fleet cf
             where cf.fleet_specific = any($5::text[])
               and cf.eff_dt <= $2::timestamp
               and (cf.exp_dt >= $3::timestamp or cf.exp_dt is null)
          )
        )
      order by c.crew_id`,
    params,
  )
  return rows.map((r) => String(r.crew_id))
}

export async function resolveSeedPairingIds(db, ctx) {
  if (Array.isArray(ctx?.seedPairingIds)) return ctx.seedPairingIds.map(Number)
  const fp = ctx?.filterParams ?? {}
  const pairingFilter = fp.pairing ?? {}
  const division = normalizeDivision(ctx?.division)
  const bases = stringArray(pairingFilter.bases)
  const fleets = stringArray(pairingFilter.fleets)
  const params = [division, dateSql(ctx.dateTo), dateSql(ctx.dateFrom), bases, fleets]
  const { rows } = await db.query(
    `select p.id
       from f8.pairing p
      where p.sch_str_dt_utc <= $2::timestamp
        and p.sch_end_dt_utc >= $3::timestamp
        and p.is_deleted = 0
        and p.division = $1
        and (cardinality($4::text[]) = 0 or p.base = any($4::text[]))
        and (cardinality($5::text[]) = 0 or p.fleet = any($5::text[]))
      order by p.id`,
    params,
  )
  return rows.map((r) => Number(r.id))
}

const crewPredicate = (alias = 'rf') => `${alias}.crew_id = any($1::varchar[])`
const pairingPredicate = (alias = 'rf') => `${alias}.pairing_id = any($2::bigint[])`
const W = (alias = 'rf') => `${crewPredicate(alias)} and ${alias}.is_deleted = 0`

async function livePairingRows(db, crewIds, pairingIds, extraWhere = 'true') {
  if (crewIds.length === 0 || pairingIds.length === 0) return []
  return (await db.query(
    `select rf.crew_id, rf.pairing_id,
            extract(epoch from min(rf.sch_str_dt_utc))::bigint::text as start_secs,
            extract(epoch from max(rf.sch_end_dt_utc))::bigint::text as end_secs,
            coalesce(nullif((array_agg(rf.label order by rf.sch_str_dt_utc, rf.seg_seq))[1], ''),
              max(p.pairing_label),
              (array_agg(rf.dep_arp order by rf.sch_str_dt_utc, rf.seg_seq))[1] || '-' ||
              (array_agg(rf.arv_arp order by rf.sch_end_dt_utc desc, rf.seg_seq desc))[1],
              (array_agg(rf.assignment_group order by rf.sch_str_dt_utc))[1] || ':P' || rf.pairing_id) as label,
            coalesce((array_agg(nullif(rf.assignment_group, '') order by rf.sch_str_dt_utc))[1], max(p.assignment_group), 'FLY') as assignment_group,
            coalesce((array_agg(nullif(rf.assignment, '') order by rf.sch_str_dt_utc))[1], max(p.assignment), 'FLY') as assignment,
            max(rf.base) as base,
            coalesce((array_agg(nullif(rf.division, '') order by rf.sch_str_dt_utc))[1], max(cr.division)) as division,
            min(rf.sch_str_dt_utc) as start_ts,
            max(rf.sch_end_dt_utc) as end_ts
       from f8.roster_flight rf
       left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
       left join f8.crew cr on cr.crew_id = rf.crew_id
      where ${W('rf')} and ${pairingPredicate('rf')} and rf.pairing_id is not null and ${extraWhere}
      group by rf.crew_id, rf.pairing_id
      order by rf.crew_id, min(rf.sch_str_dt_utc), rf.pairing_id`,
    [crewIds, pairingIds],
  )).rows
}

export function buildSeedSource(db, scenarioId, ctx) {
  let crewIdsPromise
  const crewIds = () => {
    crewIdsPromise ??= resolveSeedCrewIds(db, ctx)
    return crewIdsPromise
  }
  let pairingIdsPromise
  const pairingIds = () => {
    pairingIdsPromise ??= resolveSeedPairingIds(db, ctx)
    return pairingIdsPromise
  }
  let timelineCache = null
  const windowAsOf = () =>
    midpointDateOnly(ctx.dateFrom, ctx.dateTo)
    ?? asOfDateOnly(ctx.dateFrom) ?? asOfDateOnly(ctx.dateTo)
  async function loadTimeline(ids) {
    if (timelineCache) return timelineCache
    if (ids.length === 0) {
      timelineCache = { timeline: new Map(), zoneByBase: new Map() }
      return timelineCache
    }
    const rows = (await db.query(
      `select cb.crew_id, cb.base, cb.is_prime_base, cb.eff_dt, cb.exp_dt,
              coalesce(a.zone_id, 'UTC') as zone_id
         from f8.crew_base cb
         left join f8.airport a on a.airport = cb.base
        where cb.crew_id = any($1::varchar[])`,
      [ids],
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
      const { timeline } = await loadTimeline(await crewIds())
      return timeline
    },

    async resolveCrewOffset(crewId, utcSecs) {
      const { timeline } = await loadTimeline(await crewIds())
      return resolveOffsetAtUtc(timeline, crewId, utcSecs)
    },

    async resolveCrewTimezone(crewId, utcSecs) {
      const { timeline, zoneByBase } = await loadTimeline(await crewIds())
      const day = utcSecsToUtcDateOnly(utcSecs) ?? windowAsOf()
      const base = resolveBaseAt(timeline, crewId, day)
      return zoneByBase.get(base) ?? 'UTC'
    },

    async crewOffsets() {
      const ids = await crewIds()
      if (ids.length === 0) return new Map()
      const asOf = windowAsOf()
      const { timeline } = await loadTimeline(ids)
      const out = new Map()
      for (const crew of timeline.keys()) {
        out.set(crew, resolveOffsetAt(timeline, crew, asOf))
      }
      return out
    },

    async firstPairingByCrew() {
      const rows = await livePairingRows(db, await crewIds(), await pairingIds())
      const first = new Map()
      for (const r of rows) if (!first.has(String(r.crew_id))) first.set(String(r.crew_id), Number(r.pairing_id))
      return first
    },

    async firstPairingSpanByCrew() {
      const rows = await livePairingRows(db, await crewIds(), await pairingIds())
      const first = new Map()
      for (const r of rows) {
        const crew = String(r.crew_id)
        if (!first.has(crew)) {
          first.set(crew, {
            id: Number(r.pairing_id),
            startIso: new Date(r.start_ts).toISOString(),
            endIso: new Date(r.end_ts).toISOString(),
          })
        }
      }
      return first
    },

    async pairingSpansByCrew() {
      const rows = await livePairingRows(db, await crewIds(), await pairingIds())
      const byCrew = new Map()
      for (const r of rows) {
        const crew = String(r.crew_id)
        const list = byCrew.get(crew) ?? []
        list.push({
          id: Number(r.pairing_id),
          startIso: new Date(r.start_ts).toISOString(),
          endIso: new Date(r.end_ts).toISOString(),
        })
        byCrew.set(crew, list)
      }
      return byCrew
    },

    async crewBaseTimezone() {
      const ids = await crewIds()
      if (ids.length === 0) return new Map()
      const asOf = windowAsOf()
      const { timeline, zoneByBase } = await loadTimeline(ids)
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
      const ids = await crewIds()
      if (ids.length === 0) return new Map()
      const rows = (await db.query(
        `select ct.crew_id, ct.team
           from f8.crew_team ct
          where ct.crew_id = any($3::varchar[])
            and ct.is_valid = 1
            and nullif(ct.team, '') is not null
            and ct.eff_dt <= $1::timestamp
            and (ct.exp_dt is null or ct.exp_dt >= $2::timestamp)
          group by ct.crew_id, ct.team
          order by ct.crew_id, ct.team`,
        [dateSql(ctx.dateTo), dateSql(ctx.dateFrom), ids],
      )).rows
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
      const scenarioDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyStart = dutyStartUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyStart = `coalesce(${scenarioDutyStart}, ${liveDutyStart}, rf.sch_str_dt_utc)`
      const scenarioDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'ps' })
      const liveDutyEnd = dutyEndUtcExpr({ rosterAlias: null, segmentAlias: 'lps' })
      const dutyEnd = `coalesce(${scenarioDutyEnd}, ${liveDutyEnd}, rf.sch_end_dt_utc)`
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['f8.pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
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
             from f8.roster_flight rf
             left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join f8.pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             left join f8.pairing_segment lps
               on lps.pairing_id = rf.pairing_id
              and coalesce(lps.is_deleted, 0) = 0
              and lps.duty_seq = rf.duty_seq
              and not exists (
                select 1
                  from f8.pairing_segment ps_fallback
                 where ps_fallback.pairing_id = rf.pairing_id
                   and coalesce(ps_fallback.is_deleted, 0) = 0
                   and ps_fallback.duty_seq = rf.duty_seq
              )
            where rf.crew_id = any($1::varchar[])
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
             from f8.roster_flight rf
            where rf.crew_id = any($1::varchar[])
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
        [await crewIds()],
      )).rows
    },

    async blockByDay() {
      const ids = await crewIds()
      if (ids.length === 0) return []
      return (await db.query(
        `with crew_tz as (
           select distinct on (cb.crew_id) cb.crew_id, coalesce(a.zone_id, 'UTC') as zone_id
             from f8.crew_base cb
             left join f8.airport a on a.airport = cb.base
            where cb.crew_id = any($1::varchar[])
            order by cb.crew_id, cb.is_prime_base desc, cb.eff_dt desc
         )
         select rf.crew_id,
                to_char(date_trunc('day', rf.sch_str_dt_utc at time zone coalesce(tz.zone_id, 'UTC')), 'YYYY-MM-DD') as day,
                sum(greatest(0, extract(epoch from (rf.sch_end_dt_utc - rf.sch_str_dt_utc)) / 60))::int as blk
           from f8.roster_flight rf
           left join crew_tz tz on tz.crew_id = rf.crew_id
          where ${W('rf')} and ${pairingPredicate('rf')} and rf.assignment_group = 'FLY' and rf.pairing_id is not null
          group by rf.crew_id, tz.zone_id,
                   date_trunc('day', rf.sch_str_dt_utc at time zone coalesce(tz.zone_id, 'UTC'))
         having sum(greatest(0, extract(epoch from (rf.sch_end_dt_utc - rf.sch_str_dt_utc)) / 60)) > 0`,
        [ids, await pairingIds()],
      )).rows
    },

    async mandayMetricsByDay() {
      return []
    },

    async crewQualEntries() {
      const ids = await crewIds()
      if (ids.length === 0) return []
      return (await db.query(
        `select crew_id, 'B' as dim, base as value,
                to_char(eff_dt, 'YYYY-MM-DD') as eff, to_char(exp_dt, 'YYYY-MM-DD') as exp
           from f8.crew_base where crew_id = any($1::varchar[]) and base is not null and base <> ''
         union all
         select crew_id, 'R', rank, to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
           from f8.crew_rank where crew_id = any($1::varchar[]) and rank is not null and rank <> ''
         union all
         select crew_id, 'F', ac_type, to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
           from f8.crew_fleet where crew_id = any($1::varchar[]) and ac_type is not null and ac_type <> ''
         union all
         select crew_id, 'F', fleet_grp, to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
           from f8.crew_fleet where crew_id = any($1::varchar[]) and fleet_grp is not null and fleet_grp <> ''
         union all
         select crew_id, 'P', position, to_char(eff_dt, 'YYYY-MM-DD'), to_char(exp_dt, 'YYYY-MM-DD')
           from f8.crew_rank where crew_id = any($1::varchar[]) and position is not null and position <> ''`,
        [ids],
      )).rows
    },

    async rosterProperties(filters = {}) {
      const ids = await crewIds()
      const pids = await pairingIds()
      if (ids.length === 0 || pids.length === 0) return []
      const groups = filters.groups?.length ? filters.groups : []
      const flights = filters.flights?.length ? filters.flights : []
      const destinations = filters.destinations?.length ? filters.destinations : []
      const positions = filters.positions?.length ? filters.positions : []
      return (await db.query(
        `with crew_quals as (
           select crew_id, 'B' as dim, base as value
             from f8.crew_base
            where crew_id = any($1::varchar[]) and base is not null and base <> ''
           union all
           select crew_id, 'R', rank
             from f8.crew_rank
            where crew_id = any($1::varchar[]) and rank is not null and rank <> ''
           union all
           select crew_id, 'F', ac_type
             from f8.crew_fleet
            where crew_id = any($1::varchar[]) and ac_type is not null and ac_type <> ''
           union all
           select crew_id, 'F', fleet_grp
             from f8.crew_fleet
            where crew_id = any($1::varchar[]) and fleet_grp is not null and fleet_grp <> ''
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
           from f8.roster_flight rf
           left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
           left join f8.flight f on f.id = rf.flt_id and f.is_deleted = 0
           left join f8.pairing_segment ps on ps.pairing_id = rf.pairing_id
            and ps.duty_seq = rf.duty_seq and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0
           left join crew_quals q on q.crew_id = rf.crew_id
          where ${W('rf')} and ${pairingPredicate('rf')} and rf.pairing_id is not null
            and (cardinality($3::text[]) = 0 or coalesce(nullif(rf.assignment_group, ''), p.assignment_group, '') = any($3::text[]))
            and (cardinality($4::text[]) = 0 or coalesce(nullif(f.flt_num, ''), nullif(ps.flt_num, ''), '') = any($4::text[]))
            and (cardinality($5::text[]) = 0 or coalesce(nullif(rf.arv_arp, ''), nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), '') = any($5::text[]))
            and (cardinality($6::text[]) = 0 or coalesce(nullif(rf.position, ''), '') = any($6::text[]))
          group by rf.id, rf.crew_id, rf.pairing_id, rf.duty_seq, rf.flt_id, rf.sch_str_dt_utc,
                   rf.sch_end_dt_utc, rf.label, p.pairing_label, rf.assignment_group, p.assignment_group,
                   rf.assignment, p.assignment, f.flt_num, ps.flt_num, rf.arv_arp, f.arv_arp, ps.arv_arp,
                   rf.seg_seq,
                   rf.position
          order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id, rf.duty_seq, rf.seg_seq`,
        [ids, pids, groups, flights, destinations, positions],
      )).rows
    },

    async qualificationFlightSegments(filters = {}) {
      const ids = await crewIds()
      const pids = await pairingIds()
      if (ids.length === 0 || pids.length === 0) return []
      const groups = filters.groups?.length ? filters.groups : []
      const fleets = filters.fleets?.length ? filters.fleets : []
      const deps = filters.deps?.length ? filters.deps : []
      const arrs = filters.arrs?.length ? filters.arrs : []
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
             from f8.roster_flight rf
             left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join f8.pairing_segment ps on ps.pairing_id = rf.pairing_id
              and ps.duty_seq = rf.duty_seq and ps.seg_seq = rf.seg_seq and ps.is_deleted = 0
             left join f8.flight f on f.id = coalesce(rf.flt_id, ps.flt_id) and f.is_deleted = 0
             left join f8.crew c on c.crew_id = rf.crew_id
             left join f8.airport ap on ap.airport = coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''))
            where ${W('rf')}
              and ${pairingPredicate('rf')}
              and rf.pairing_id is not null
              and coalesce(nullif(rf.division, ''), c.division, p.division, '') = 'P'
              and (cardinality($3::text[]) = 0 or coalesce(nullif(rf.assignment_group, ''), nullif(p.assignment_group, ''), '') = any($3::text[]))
              and (cardinality($4::text[]) = 0 or coalesce(nullif(f.fleet, ''), nullif(ps.fleet_seg, ''), nullif(p.fleet, ''), '') = any($4::text[]))
              and (cardinality($5::text[]) = 0 or coalesce(nullif(f.dep_arp, ''), nullif(ps.dep_arp, ''), nullif(rf.dep_arp, ''), '') = any($5::text[]))
              and (cardinality($6::text[]) = 0 or coalesce(nullif(f.arv_arp, ''), nullif(ps.arv_arp, ''), nullif(rf.arv_arp, ''), '') = any($6::text[]))
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
             join f8.roster_flight rf on rf.pairing_id = s.pairing_id
              and coalesce(rf.duty_seq, 0) = s.duty_seq
              and coalesce(rf.seg_seq, 0) = s.seg_seq
              and rf.is_deleted = 0
              and rf.crew_id = any($1::varchar[])
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
                 from f8.flight_composition fc
                where fc.flt_id = s.flight_id and fc.division = 'P'
             ) fc on true
             left join lateral (
               select string_agg(pc.acting_rank || ':' || coalesce(pc.plan, 0)::text, '|' order by pc.acting_rank) as planned_by_rank
                 from f8.pairing_composition pc
                where pc.pairing_id = s.pairing_id and pc.division = 'P' and pc.is_deleted = 0
             ) pc on true
         ),
         filled as materialized (
           select s.segment_id,
                  string_agg(x.acting_rank || ':' || x.n::text, '|' order by x.acting_rank) as filled_by_rank
             from seg s
             join lateral (
               select coalesce(nullif(rf.flight_acting_rank, ''), nullif(rf.roster_acting_rank, ''), '*') as acting_rank,
                      count(distinct rf.crew_id)::int as n
                 from f8.roster_flight rf
                 left join f8.crew c on c.crew_id = rf.crew_id
                where rf.pairing_id = s.pairing_id
                  and coalesce(rf.duty_seq, 0) = s.duty_seq
                  and coalesce(rf.seg_seq, 0) = s.seg_seq
                  and rf.is_deleted = 0
                  and rf.crew_id = any($1::varchar[])
                  and coalesce(nullif(rf.division, ''), c.division, '') = 'P'
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
        [ids, pids, groups, fleets, deps, arrs],
      )).rows
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

    async flyByPairing(groups, codes) {
      const ids = await crewIds()
      const pids = await pairingIds()
      if (ids.length === 0) return []
      const hasG = groups && groups.length
      const hasC = codes && codes.length
      const G = hasG ? groups : []
      const C = hasC ? codes : []
      const dutyBoundOpts = { rosterAlias: 'rf', segmentAlias: 'ps' }
      const dutyStart = dutyStartUtcExpr(dutyBoundOpts)
      const dutyEnd = dutyEndUtcExpr(dutyBoundOpts)
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['f8.pairing_segment'],
        pairingIdExpr: 'rf.pairing_id',
        rosterAlias: 'rf',
        segmentAlias: 'ps',
      })
      const rows = (await db.query(
        `with duty_rows as (
           select rf.crew_id, rf.pairing_id,
                  extract(epoch from min(${dutyStart}))::bigint::text as start_secs,
                  extract(epoch from max(${dutyEnd}))::bigint::text as end_secs,
                  ${endRestSql},
                  coalesce(nullif((array_agg(rf.label order by rf.sch_str_dt_utc, rf.seg_seq))[1], ''),
                    max(p.pairing_label),
                    (array_agg(rf.dep_arp order by rf.sch_str_dt_utc, rf.seg_seq))[1] || '-' ||
                    (array_agg(rf.arv_arp order by rf.sch_end_dt_utc desc, rf.seg_seq desc))[1],
                    (array_agg(rf.assignment_group order by rf.sch_str_dt_utc))[1] || ':P' || rf.pairing_id) as label,
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
             from f8.roster_flight rf
             left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join f8.pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
            where ${W('rf')} and ${pairingPredicate('rf')} and rf.pairing_id is not null
              and ((cardinality($3::text[]) = 0 and cardinality($4::text[]) = 0) or rf.assignment_group = any($3::text[]) or rf.assignment = any($4::text[]))
            group by rf.crew_id, rf.pairing_id
           union all
           select rf.crew_id, 0 as pairing_id,
                  extract(epoch from rf.sch_str_dt_utc)::bigint::text as start_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint::text as end_secs,
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
             from f8.roster_flight rf
            where ${W('rf')}
              and rf.sch_str_dt_utc >= $5::date
              and rf.sch_str_dt_utc < ($6::date + interval '1 day')
              and ((cardinality($3::text[]) = 0 and cardinality($4::text[]) = 0) or rf.assignment_group = any($3::text[]) or rf.assignment = any($4::text[]))
              and rf.pairing_id is null
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
          order by d.crew_id, d.duty_end_ts, d.pairing_id`,
        [ids, pids, G, C, dateSql(ctx.dateFrom), dateSql(ctx.dateTo)],
      )).rows
      return rows.map((r) => ({
        ...r,
        crew_id: String(r.crew_id),
        pairing_id: Number(r.pairing_id),
        start_secs: String(r.start_secs),
        end_secs: String(r.end_secs),
        end_rest_secs: String(r.end_rest_secs ?? r.end_secs),
        zone_id: String(r.zone_id ?? 'UTC'),
      }))
    },

    async pilotAge() {
      const ids = await crewIds()
      if (ids.length === 0) return []
      const pids = await pairingIds()
      return (await db.query(
        `with scoped as (
           select coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id) as flt_id,
                  rf.pairing_id, rf.crew_id,
                  coalesce(nullif(rf.division,''), cr.division) as division,
                  coalesce(rf.sch_str_dt_utc, ps.sch_str_dt_utc) as seg_start_ts,
                  coalesce(rf.sch_end_dt_utc, ps.sch_end_dt_utc) as seg_end_ts,
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
            where ${W('rf')} and ${pairingPredicate('rf')} and rf.assignment_group='FLY'
              and rf.pairing_id is not null and cr.birthday is not null
         ),
         touched as (
           select distinct flt_id from scoped where flt_id is not null and flt_id > 0
         ),
         live_mates as (
           select coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id) as flt_id,
                  rf.pairing_id, rf.crew_id,
                  coalesce(nullif(rf.division,''), cr.division) as division,
                  coalesce(rf.sch_str_dt_utc, ps.sch_str_dt_utc) as seg_start_ts,
                  coalesce(rf.sch_end_dt_utc, ps.sch_end_dt_utc) as seg_end_ts,
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
             join touched t on t.flt_id = coalesce(rf.flt_id, ps.flt_id)
            where rf.is_deleted=0 and rf.assignment_group='FLY'
              and rf.pairing_id is not null and cr.birthday is not null
         ),
         f as (
           select * from scoped
           union all
           select * from live_mates
         )
         select distinct on (flt_id, crew_id)
                flt_id, pairing_id, crew_id, division,
                to_char(seg_start_ts,'YYYY-MM-DD') as start_date,
                extract(epoch from seg_start_ts)::bigint as start_secs,
                extract(epoch from seg_end_ts)::bigint as end_secs,
                to_char(birthday,'YYYY-MM-DD') as birth_date
           from f
          order by flt_id, crew_id, pairing_id`,
        [ids, pids],
      )).rows
    },

    // ── rule 7509 — physical-flight forbidden crew-pair complement ──
    async avoidCoPairing({ crewIds = [], focusPairingIds = [] } = {}) {
      const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const ids = await pairingIds()
      return (await db.query(
        `with pairing_candidates as (
           select rf.crew_id, rf.pairing_id,
                  min(${dutyStart}) as pairing_start_ts,
                  max(${dutyEnd}) as pairing_end_ts
             from f8.roster_flight rf
             left join f8.pairing_segment ps
               on ps.pairing_id = rf.pairing_id
              and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
            where rf.is_deleted = 0 and rf.assignment_group = 'FLY'
              and rf.pairing_id is not null
              and (
                (cardinality($3::bigint[]) = 0 and rf.crew_id = any($1::varchar[]) and rf.pairing_id = any($2::bigint[]))
                or (cardinality($3::bigint[]) > 0 and rf.pairing_id = any($3::bigint[]))
              )
            group by rf.crew_id, rf.pairing_id
           having min(${dutyStart}) < $5::timestamp
              and max(${dutyEnd}) >= $4::timestamp
         ),
         touched_flights as (
           select distinct coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id) as flight_id
             from f8.roster_flight rf
             left join f8.pairing_segment ps
               on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             join pairing_candidates pc on pc.crew_id = rf.crew_id and pc.pairing_id = rf.pairing_id
            where rf.is_deleted = 0 and rf.assignment_group = 'FLY' and rf.pairing_id is not null
         ),
         member_pairings as (
           select distinct rf.crew_id, rf.pairing_id
             from f8.roster_flight rf
             left join f8.pairing_segment ps
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
             from f8.roster_flight rf
             left join f8.pairing_segment ps
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
             from f8.roster_flight rf
             left join f8.pairing_segment ps
               on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0
              and ps.duty_seq = rf.duty_seq
             join touched_flights tf on tf.flight_id = coalesce(rf.flt_id, ps.flt_id, -rf.pairing_id)
             join pairing_spans span
               on span.crew_id = rf.crew_id and span.pairing_id = rf.pairing_id
            where rf.is_deleted = 0 and rf.assignment_group = 'FLY' and rf.pairing_id is not null
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
           left join f8.flight f on f.id = m.flight_id and coalesce(f.is_deleted, 0) = 0
          where m.flight_id > 0
          order by m.flight_id, m.crew_id, m.pairing_id`, [crewIds, ids, focusPairingIds, dateSql(ctx.dateFrom), dateSql(ctx.dateTo)])).rows
    },

    async assignmentsRaw() {
      const rows = await livePairingRows(db, await crewIds(), await pairingIds())
      return rows.map((r) => ({
        crew_id: r.crew_id,
        pairing_id: r.pairing_id,
        base: r.base,
        start_date: new Date(r.start_ts).toISOString().slice(0, 10),
        end_date: new Date(r.end_ts).toISOString().slice(0, 10),
        start_secs: r.start_secs,
        end_secs: r.end_secs,
      }))
    },

    async baseQuals(ids) {
      return (await db.query(
        `select crew_id, base, to_char(coalesce(eff_dt_utc, eff_dt),'YYYY-MM-DD') as eff_date,
                to_char(coalesce(exp_dt_utc, exp_dt),'YYYY-MM-DD') as exp_date
           from f8.crew_base where crew_id = any($1::varchar[])`,
        [ids],
      )).rows
    },

    async assignmentOverlapRosters() {
      const ids = await crewIds()
      if (ids.length === 0) return []
      const pids = await pairingIds()
      const dutyBoundOpts = { rosterAlias: 'rf', segmentAlias: 'ps' }
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['f8.pairing_segment'],
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
             from f8.roster_flight rf
             left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
             left join f8.pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
            where ${W('rf')} and ${pairingPredicate('rf')} and rf.pairing_id is not null
            group by rf.crew_id, rf.pairing_id
         ), ground_rows as (
           select rf.crew_id, -rf.id as pairing_id,
                  extract(epoch from rf.sch_str_dt_utc)::bigint as start_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_duty_secs,
                  extract(epoch from rf.sch_end_dt_utc)::bigint as end_rest_secs,
                  coalesce(nullif(rf.assignment_group, ''), rf.assignment, 'GRD') as assignment_group,
                  coalesce(nullif(rf.assignment, ''), rf.assignment_group, 'GRD') as assignment
             from f8.roster_flight rf
            where ${W('rf')} and rf.pairing_id is null
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
          order by rows.crew_id, rows.start_secs, rows.pairing_id`,
        [ids, pids],
      )).rows
    },

    async assignmentsAll() {
      const ids = await crewIds()
      if (ids.length === 0) return []
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      return (await db.query(
        `select rf.crew_id, rf.pairing_id, rf.assignment as code,
                extract(epoch from rf.sch_str_dt_utc)::bigint as s,
                extract(epoch from ${dutyEnd})::bigint as e,
                extract(epoch from ${dutyEnd})::bigint
                  + coalesce(rf.act_rest_min, 0) * 60 as end_rest_secs
           from f8.roster_flight rf
           left join f8.pairing_segment ps
             on rf.pairing_id is not null
            and ps.pairing_id = rf.pairing_id
            and coalesce(ps.is_deleted, 0) = 0
            and ps.duty_seq = rf.duty_seq
            and ps.seg_seq = rf.seg_seq
          where rf.crew_id = any($1::varchar[]) and rf.is_deleted=0
            and (rf.pairing_id is null or rf.pairing_id = any($2::bigint[]))
          order by rf.crew_id, rf.sch_str_dt_utc, rf.pairing_id`,
        [ids, await pairingIds()],
      )).rows
    },

    async checkins() {
      const ids = await crewIds()
      if (ids.length === 0) return []
      return (await db.query(
        `select crew_id, pairing_id, assignment_group as duty,
                extract(epoch from min(sch_str_dt_utc))::bigint as start_secs,
                extract(epoch from max(sch_end_dt_utc))::bigint as end_secs
           from f8.roster_flight where crew_id = any($1::varchar[]) and is_deleted=0 and assignment_group='FLY' and pairing_id is not null
             and pairing_id = any($2::bigint[])
           group by crew_id, pairing_id, assignment_group
         union all
         select crew_id, 0::bigint as pairing_id, assignment as duty,
                extract(epoch from sch_str_dt_utc)::bigint as start_secs,
                extract(epoch from sch_end_dt_utc)::bigint as end_secs
           from f8.roster_flight where crew_id = any($1::varchar[]) and is_deleted=0 and pairing_id is null`,
        [ids, await pairingIds()],
      )).rows
    },

    async flyDuties(byDutySeq) {
      const ids = await crewIds()
      if (ids.length === 0) return []
      const grp = byDutySeq ? 'rf.crew_id, rf.pairing_id, rf.duty_seq' : 'rf.crew_id, rf.pairing_id'
      const dutyStart = dutyStartUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const dutyEnd = dutyEndUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const firstFlight = firstFlightDepartureUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const lastFlight = lastFlightArrivalUtcExpr({ rosterAlias: 'rf', segmentAlias: 'ps' })
      const endRestSql = pairingEndRestSecsSql({
        segmentTables: ['f8.pairing_segment'],
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
           from f8.roster_flight rf
           left join f8.pairing p on p.id = rf.pairing_id and p.is_deleted = 0
           left join f8.pairing_segment ps on ps.pairing_id = rf.pairing_id and coalesce(ps.is_deleted, 0) = 0 and ps.duty_seq = rf.duty_seq
          where rf.crew_id = any($1::varchar[]) and rf.is_deleted=0 and rf.assignment_group='FLY' and rf.pairing_id is not null
            and rf.pairing_id = any($2::bigint[])
          group by ${grp}`,
        [ids, await pairingIds()],
      )).rows
    },

    async groundWork(includeRest = false) {
      const ids = await crewIds()
      if (ids.length === 0) return []
      return (await db.query(
        `select crew_id, pairing_id, assignment, extract(epoch from sch_str_dt_utc)::bigint as start_secs,
                extract(epoch from sch_end_dt_utc)::bigint as end_secs
           from f8.roster_flight where crew_id = any($1::varchar[]) and is_deleted=0 and pairing_id is null`,
        [ids],
      )).rows
        .map((r) => ({ ...r, is_rest: REST_LEAVE_CODES.has(String(r.assignment)), is_pre_assigned: true }))
        .filter((r) => includeRest || !r.is_rest)
    },
  }
}
