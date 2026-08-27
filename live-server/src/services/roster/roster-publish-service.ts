import { eq, and, asc, desc, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from 'pg'
import { rosterPublish } from '../../models/roster/roster-publish.js'
import { rosterPublishAdjust } from '../../models/roster/roster-publish-adjust.js'
import { getOrSet, invalidate, invalidatePattern } from '../../utils/cache.js'
import { auditCreate, auditUpdate } from '../../utils/audit.js'
import type { PaginationQuery } from '../../utils/pagination.js'
import { paginate } from '../../utils/pagination.js'
import { liveSchema } from '../../utils/db-schema.js'

const CACHE_PREFIX = 'roster-publish'
const CACHE_TTL = 600 // 10min

export type RosterPublishStatus = 'ADD' | 'UPDATE' | 'DELETE' | 'NO_CHANGE'
export type RosterPublishKind = 'FLYING' | 'GROUND'
export type RosterPublishFilterStatus = 'ALL' | 'PUBLISHED' | 'UNPUBLISHED'

export interface RosterPublishDiffInput {
  rosterPeriodId: number
  divisions?: string[]
  crewFleets?: string[]
  bases?: string[]
  crewId?: string
  pairingId?: number
  pairingLabel?: string
  publishStatus?: RosterPublishFilterStatus
  statuses?: RosterPublishStatus[]
  page?: number
  pageSize?: number
  keys?: string[]
}

export interface RosterPublishDiffRow {
  key: string
  kind: RosterPublishKind
  status: RosterPublishStatus
  crewId: string
  crewName: string | null
  crewFleet: string | null
  base: string | null
  pairingId: number | null
  pairingLabel: string | null
  rosterIds: number[]
  publishIds: number[]
  assignmentGroup: string | null
  assignment: string | null
  actingRank: string | null
  schStrDtUtc: string | null
  schEndDtUtc: string | null
  depArp: string | null
  arvArp: string | null
  segmentCount: number
  changedFields: string[]
  publishStatus: 'PUBLISHED' | 'UNPUBLISHED'
  source: string | null
  noc: 'Ignore' | 'Pending' | 'Success' | null
}

export interface RosterPublishDiffResult {
  items: RosterPublishDiffRow[]
  total: number
  page: number
  pageSize: number
  summary: {
    add: number
    update: number
    delete: number
    noChange: number
    actionable: number
  }
}

export interface RosterPublishApplyInput {
  rosterPeriodId: number
  keys: string[]
}

export interface RosterPublishApplyResult {
  batchId: number | null
  applied: number
  inserted: number
  updated: number
  deleted: number
  skipped: number
  staleKeys: string[]
}

interface RawDiffRow {
  key: string
  kind: RosterPublishKind
  status: RosterPublishStatus
  crew_id: string
  crew_name: string | null
  crew_fleet: string | null
  base: string | null
  pairing_id: string | number | null
  pairing_label: string | null
  roster_ids: Array<string | number> | null
  publish_ids: Array<string | number> | null
  assignment_group: string | null
  assignment: string | null
  acting_rank: string | null
  sch_str_dt_utc: Date | string | null
  sch_end_dt_utc: Date | string | null
  dep_arp: string | null
  arv_arp: string | null
  segment_count: string | number | null
  changed_fields: string[] | null
  publish_status: 'PUBLISHED' | 'UNPUBLISHED'
  total_count?: string | number
  add_count?: string | number
  update_count?: string | number
  delete_count?: string | number
  no_change_count?: string | number
}

const toArray = (values: Array<string | number> | null | undefined): number[] =>
  (values ?? []).map((value) => Number(value)).filter((value) => Number.isFinite(value))

const toIso = (value: Date | string | null): string | null => {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const normalizeList = (values: string[] | undefined): string[] | null => {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
  return normalized.length ? normalized : null
}

const normalizeDivisionList = (values: string[] | undefined): string[] | null => {
  const normalized = [...new Set((values ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean))]
  return normalized.length ? normalized : null
}

const normalizeStatuses = (values: RosterPublishStatus[] | undefined): RosterPublishStatus[] | null => {
  const allowed = new Set<RosterPublishStatus>(['ADD', 'UPDATE', 'DELETE', 'NO_CHANGE'])
  const normalized = [...new Set((values ?? []).filter((value) => allowed.has(value)))]
  return normalized.length ? normalized : null
}

const quote = (): string => liveSchema()

const diffSql = (): string => {
  const s = quote()
  return `
    with rp as (
      select rp_start, rp_end
      from ${s}.roster_period
      where id = $1
    ),
    crew_scope_raw as (
      select
        c.crew_id,
        nullif(trim(concat_ws(' ', c.last_name, c.first_name)), '') as crew_name,
        nullif(string_agg(distinct cb.base, ' | ' order by cb.base), '') as base,
        nullif(string_agg(distinct cf.fleet_specific, ' | ' order by cf.fleet_specific), '') as crew_fleet
      from ${s}.crew c
      cross join rp
      left join ${s}.crew_base cb
        on cb.crew_id = c.crew_id
       and cb.eff_dt <= rp.rp_end
       and (cb.exp_dt is null or cb.exp_dt >= rp.rp_start)
      left join ${s}.crew_fleet cf
        on cf.crew_id = c.crew_id
       and cf.eff_dt <= rp.rp_end
       and (cf.exp_dt is null or cf.exp_dt >= rp.rp_start)
      where ($2::text[] is null or exists (
          select 1 from ${s}.crew_fleet cff
          where cff.crew_id = c.crew_id
            and cff.fleet_specific = any($2::text[])
            and cff.eff_dt <= rp.rp_end
            and (cff.exp_dt is null or cff.exp_dt >= rp.rp_start)
        ))
        and ($3::text[] is null or exists (
          select 1 from ${s}.crew_base cbb
          where cbb.crew_id = c.crew_id
            and cbb.base = any($3::text[])
            and cbb.eff_dt <= rp.rp_end
            and (cbb.exp_dt is null or cbb.exp_dt >= rp.rp_start)
        ))
        and ($4::text is null or c.crew_id = $4::text)
        and ($12::text[] is null or c.division = any($12::text[]))
        and ($13::text[] is null or c.crew_id = any($13::text[]))
      group by c.crew_id, c.last_name, c.first_name
    ),
    crew_scope as (
      select
        csr.*,
        coalesce(base_airport.zone_id, 'UTC') as base_zone_id
      from crew_scope_raw csr
      left join ${s}.airport base_airport
        on base_airport.airport = split_part(csr.base, ' | ', 1)
    ),
    source_rows as (
      select
        rf.id as roster_id,
        rf.crew_id,
        cs.crew_name,
        cs.crew_fleet,
        cs.base as crew_base,
        rf.pairing_id,
        p.pairing_label,
        rf.assignment_group,
        rf.assignment,
        rf.flight_acting_rank as acting_rank,
        rf.active_rank,
        rf.position,
        rf.seq_order,
        rf.division,
        rf.flt_id,
        coalesce(rf.flt_dt, to_char(rf.sch_str_dt_utc, 'YYYY-MM-DD')) as flt_dt,
        rf.duty_seq,
        rf.seg_seq,
        rf.sch_str_dt_utc,
        rf.sch_end_dt_utc,
        rf.dep_arp,
        rf.arv_arp,
        rf.label,
        coalesce(rf.sch_credited_minutes, ps.duty_sch_credited_minutes, ps.duty_act_credited_minutes)
          as effective_sch_credited_minutes,
        coalesce(rf.act_credited_minutes, ps.duty_act_credited_minutes)
          as effective_act_credited_minutes,
        ps.pickup_start_utc,
        ps.pickup_end_utc,
        ps.brief_start_utc,
        ps.brief_end_utc,
        ps.debrief_start_utc,
        ps.debrief_end_utc,
        ps.dropoff_start_utc,
        ps.dropoff_end_utc
      from ${s}.roster_flight rf
      join crew_scope cs on cs.crew_id = rf.crew_id
      cross join rp
      left join ${s}.pairing p on p.id = rf.pairing_id
      left join ${s}.pairing_segment ps
        on ps.pairing_id = rf.pairing_id
       and ps.duty_seq = rf.duty_seq
       and ps.seg_seq = rf.seg_seq
       and ps.is_deleted = 0
      where rf.is_deleted = 0
        and (
          case
            when rf.pairing_id is null
             and coalesce(rf.sch_end_dt_utc, rf.sch_str_dt_utc) is not null
             and ((coalesce(rf.sch_end_dt_utc, rf.sch_str_dt_utc) at time zone 'UTC') at time zone cs.base_zone_id)::time = time '00:00'
              then (((coalesce(rf.sch_end_dt_utc, rf.sch_str_dt_utc) - interval '1 second') at time zone 'UTC') at time zone cs.base_zone_id)::date
            else (coalesce(rf.sch_end_dt_utc, rf.sch_str_dt_utc) at time zone cs.base_zone_id)::date
          end
        ) >= ((rp.rp_start at time zone 'UTC')::date)
        and (
          (coalesce(rf.sch_str_dt_utc, rf.sch_end_dt_utc) at time zone cs.base_zone_id)::date
        ) <= ((rp.rp_end at time zone 'UTC')::date)
        and ($5::bigint is null or rf.pairing_id = $5::bigint)
        and ($6::text is null or coalesce(p.pairing_label, rf.label, '') ilike ('%' || $6::text || '%'))
    ),
    publish_rows as (
      select
        rpbl.id as publish_id,
        rpbl.roster_flight_id as roster_id,
        rpbl.crew_id,
        cs.crew_name,
        cs.crew_fleet,
        cs.base as crew_base,
        rpbl.pairing_id,
        coalesce(rpbl.pairing_label, p.pairing_label) as pairing_label,
        rpbl.assignment_group,
        rpbl.assignment,
        rpbl.flight_acting_rank as acting_rank,
        rpbl.sch_str_dt_utc,
        rpbl.sch_end_dt_utc,
        rpbl.pick_up_start_utc,
        rpbl.brief_start_utc,
        rpbl.dep_arp,
        rpbl.arv_arp,
        rpbl.label,
        rpbl.sch_credited_minutes,
        rpbl.act_credited_minutes
      from ${s}.roster_publish rpbl
      join crew_scope cs on cs.crew_id = rpbl.crew_id
      cross join rp
      left join ${s}.pairing p on p.id = rpbl.pairing_id
      where (
          case
            when rpbl.pairing_id is null
             and coalesce(rpbl.sch_end_dt_utc, rpbl.sch_str_dt_utc) is not null
             and ((coalesce(rpbl.sch_end_dt_utc, rpbl.sch_str_dt_utc) at time zone 'UTC') at time zone cs.base_zone_id)::time = time '00:00'
              then (((coalesce(rpbl.sch_end_dt_utc, rpbl.sch_str_dt_utc) - interval '1 second') at time zone 'UTC') at time zone cs.base_zone_id)::date
            else (coalesce(rpbl.sch_end_dt_utc, rpbl.sch_str_dt_utc) at time zone cs.base_zone_id)::date
          end
        ) >= ((rp.rp_start at time zone 'UTC')::date)
        and (
          (coalesce(rpbl.sch_str_dt_utc, rpbl.sch_end_dt_utc) at time zone cs.base_zone_id)::date
        ) <= ((rp.rp_end at time zone 'UTC')::date)
        and ($5::bigint is null or rpbl.pairing_id = $5::bigint)
        and ($6::text is null or coalesce(rpbl.pairing_label, p.pairing_label, rpbl.label, '') ilike ('%' || $6::text || '%'))
    ),
    source_flying as (
      select
        ('F|' || crew_id || '|' || pairing_id::text) as key,
        'FLYING'::text as kind,
        crew_id,
        max(crew_name) as crew_name,
        max(crew_fleet) as crew_fleet,
        max(crew_base) as base,
        pairing_id,
        max(pairing_label) as pairing_label,
        array_agg(roster_id order by duty_seq nulls last, seg_seq nulls last, roster_id) as roster_ids,
        min(assignment_group) as assignment_group,
        min(assignment) as assignment,
        min(acting_rank) as acting_rank,
        min(sch_str_dt_utc) as sch_str_dt_utc,
        max(sch_end_dt_utc) as sch_end_dt_utc,
        count(*)::int as segment_count,
        array_agg(coalesce(acting_rank, '') order by duty_seq nulls last, seg_seq nulls last, roster_id) as acting_sig,
        array_agg(coalesce(assignment, '') order by duty_seq nulls last, seg_seq nulls last, roster_id) as assignment_sig,
        array_agg(coalesce(pickup_start_utc::text, '') order by duty_seq nulls last, seg_seq nulls last, roster_id) as pickup_sig,
        array_agg(coalesce(brief_start_utc::text, '') order by duty_seq nulls last, seg_seq nulls last, roster_id) as brief_sig,
        array_agg(effective_sch_credited_minutes order by duty_seq nulls last, seg_seq nulls last, roster_id) as sch_credit_sig,
        array_agg(effective_act_credited_minutes order by duty_seq nulls last, seg_seq nulls last, roster_id) as act_credit_sig
      from source_rows
      where pairing_id is not null
      group by crew_id, pairing_id
    ),
    publish_flying as (
      select
        ('F|' || crew_id || '|' || pairing_id::text) as key,
        crew_id,
        max(crew_name) as crew_name,
        max(crew_fleet) as crew_fleet,
        max(crew_base) as base,
        pairing_id,
        max(pairing_label) as pairing_label,
        array_agg(publish_id order by roster_id nulls last, publish_id) as publish_ids,
        min(assignment_group) as assignment_group,
        min(assignment) as assignment,
        min(acting_rank) as acting_rank,
        min(sch_str_dt_utc) as sch_str_dt_utc,
        max(sch_end_dt_utc) as sch_end_dt_utc,
        count(*)::int as segment_count,
        array_agg(coalesce(acting_rank, '') order by roster_id nulls last, publish_id) as acting_sig,
        array_agg(coalesce(assignment, '') order by roster_id nulls last, publish_id) as assignment_sig,
        array_agg(coalesce(pick_up_start_utc::text, '') order by roster_id nulls last, publish_id) as pickup_sig,
        array_agg(coalesce(brief_start_utc::text, '') order by roster_id nulls last, publish_id) as brief_sig,
        array_agg(sch_credited_minutes order by roster_id nulls last, publish_id) as sch_credit_sig,
        array_agg(act_credited_minutes order by roster_id nulls last, publish_id) as act_credit_sig
      from publish_rows
      where pairing_id is not null
      group by crew_id, pairing_id
    ),
    flying_diff as (
      select
        coalesce(sf.key, pf.key) as key,
        'FLYING'::text as kind,
        case
          when pf.key is null then 'ADD'
          when sf.key is null then 'DELETE'
          when sf.segment_count is distinct from pf.segment_count
            or sf.acting_sig is distinct from pf.acting_sig
            or sf.assignment_sig is distinct from pf.assignment_sig
            or sf.pickup_sig is distinct from pf.pickup_sig
            or sf.brief_sig is distinct from pf.brief_sig
            or sf.sch_credit_sig is distinct from pf.sch_credit_sig
            or sf.act_credit_sig is distinct from pf.act_credit_sig
            then 'UPDATE'
          else 'NO_CHANGE'
        end as status,
        coalesce(sf.crew_id, pf.crew_id) as crew_id,
        coalesce(sf.crew_name, pf.crew_name) as crew_name,
        coalesce(sf.crew_fleet, pf.crew_fleet) as crew_fleet,
        coalesce(sf.base, pf.base) as base,
        coalesce(sf.pairing_id, pf.pairing_id) as pairing_id,
        coalesce(sf.pairing_label, pf.pairing_label) as pairing_label,
        coalesce(sf.roster_ids, array[]::bigint[]) as roster_ids,
        coalesce(pf.publish_ids, array[]::bigint[]) as publish_ids,
        coalesce(sf.assignment_group, pf.assignment_group) as assignment_group,
        coalesce(sf.assignment, pf.assignment) as assignment,
        coalesce(sf.acting_rank, pf.acting_rank) as acting_rank,
        coalesce(sf.sch_str_dt_utc, pf.sch_str_dt_utc) as sch_str_dt_utc,
        coalesce(sf.sch_end_dt_utc, pf.sch_end_dt_utc) as sch_end_dt_utc,
        null::varchar(3) as dep_arp,
        null::varchar(3) as arv_arp,
        coalesce(sf.segment_count, pf.segment_count, 0) as segment_count,
        array_remove(array[
          case when sf.segment_count is distinct from pf.segment_count then 'segment_count' end,
          case when sf.acting_sig is distinct from pf.acting_sig then 'flight_acting_rank' end,
          case when sf.assignment_sig is distinct from pf.assignment_sig then 'assignment' end,
          case when sf.pickup_sig is distinct from pf.pickup_sig then 'pick_up_start_utc' end,
          case when sf.brief_sig is distinct from pf.brief_sig then 'brief_start_utc' end,
          case when sf.sch_credit_sig is distinct from pf.sch_credit_sig then 'sch_credited_minutes' end,
          case when sf.act_credit_sig is distinct from pf.act_credit_sig then 'act_credited_minutes' end
        ], null) as changed_fields
      from source_flying sf
      full join publish_flying pf on pf.key = sf.key
    ),
    source_ground as (
      select
        (
          'G|' || crew_id || '|' ||
          coalesce(assignment_group, '') || '|' ||
          coalesce(assignment, '') || '|' ||
          coalesce(sch_str_dt_utc::text, '') || '|' ||
          coalesce(sch_end_dt_utc::text, '') || '|' ||
          coalesce(dep_arp, '') || '|' ||
          coalesce(arv_arp, '')
        ) as key,
        'GROUND'::text as kind,
        crew_id,
        max(crew_name) as crew_name,
        max(crew_fleet) as crew_fleet,
        max(crew_base) as base,
        null::bigint as pairing_id,
        max(label) as pairing_label,
        array_agg(distinct roster_id order by roster_id) as roster_ids,
        assignment_group,
        assignment,
        min(acting_rank) as acting_rank,
        sch_str_dt_utc,
        sch_end_dt_utc,
        count(distinct roster_id)::int as segment_count,
        dep_arp,
        arv_arp,
        array_agg(effective_sch_credited_minutes order by roster_id) as sch_credit_sig,
        array_agg(effective_act_credited_minutes order by roster_id) as act_credit_sig
      from source_rows
      where pairing_id is null
      group by crew_id, assignment_group, assignment, sch_str_dt_utc, sch_end_dt_utc, dep_arp, arv_arp
    ),
    publish_ground as (
      select
        (
          'G|' || crew_id || '|' ||
          coalesce(assignment_group, '') || '|' ||
          coalesce(assignment, '') || '|' ||
          coalesce(sch_str_dt_utc::text, '') || '|' ||
          coalesce(sch_end_dt_utc::text, '') || '|' ||
          coalesce(dep_arp, '') || '|' ||
          coalesce(arv_arp, '')
        ) as key,
        crew_id,
        max(crew_name) as crew_name,
        max(crew_fleet) as crew_fleet,
        max(crew_base) as base,
        max(label) as pairing_label,
        array_agg(distinct publish_id order by publish_id) as publish_ids,
        assignment_group,
        assignment,
        min(acting_rank) as acting_rank,
        sch_str_dt_utc,
        sch_end_dt_utc,
        dep_arp,
        arv_arp,
        count(distinct publish_id)::int as segment_count,
        array_agg(sch_credited_minutes order by roster_id nulls last, publish_id) as sch_credit_sig,
        array_agg(act_credited_minutes order by roster_id nulls last, publish_id) as act_credit_sig
      from publish_rows
      where pairing_id is null
      group by crew_id, assignment_group, assignment, sch_str_dt_utc, sch_end_dt_utc, dep_arp, arv_arp
    ),
    ground_diff as (
      select
        coalesce(sg.key, pg.key) as key,
        'GROUND'::text as kind,
        case
          when pg.key is null then 'ADD'
          when sg.key is null then 'DELETE'
          when sg.sch_str_dt_utc is distinct from pg.sch_str_dt_utc
            or sg.sch_end_dt_utc is distinct from pg.sch_end_dt_utc
            or sg.assignment_group is distinct from pg.assignment_group
            or sg.assignment is distinct from pg.assignment
            or sg.dep_arp is distinct from pg.dep_arp
            or sg.arv_arp is distinct from pg.arv_arp
            or sg.sch_credit_sig is distinct from pg.sch_credit_sig
            or sg.act_credit_sig is distinct from pg.act_credit_sig
            then 'UPDATE'
          else 'NO_CHANGE'
        end as status,
        coalesce(sg.crew_id, pg.crew_id) as crew_id,
        coalesce(sg.crew_name, pg.crew_name) as crew_name,
        coalesce(sg.crew_fleet, pg.crew_fleet) as crew_fleet,
        coalesce(sg.base, pg.base) as base,
        null::bigint as pairing_id,
        coalesce(sg.pairing_label, pg.pairing_label) as pairing_label,
        coalesce(sg.roster_ids, array[]::bigint[]) as roster_ids,
        coalesce(pg.publish_ids, array[]::bigint[]) as publish_ids,
        coalesce(sg.assignment_group, pg.assignment_group) as assignment_group,
        coalesce(sg.assignment, pg.assignment) as assignment,
        coalesce(sg.acting_rank, pg.acting_rank) as acting_rank,
        coalesce(sg.sch_str_dt_utc, pg.sch_str_dt_utc) as sch_str_dt_utc,
        coalesce(sg.sch_end_dt_utc, pg.sch_end_dt_utc) as sch_end_dt_utc,
        coalesce(sg.dep_arp, pg.dep_arp) as dep_arp,
        coalesce(sg.arv_arp, pg.arv_arp) as arv_arp,
        coalesce(sg.segment_count, pg.segment_count, 0) as segment_count,
        array_remove(array[
          case when sg.sch_str_dt_utc is distinct from pg.sch_str_dt_utc then 'sch_str_dt_utc' end,
          case when sg.sch_end_dt_utc is distinct from pg.sch_end_dt_utc then 'sch_end_dt_utc' end,
          case when sg.assignment_group is distinct from pg.assignment_group then 'assignment_group' end,
          case when sg.assignment is distinct from pg.assignment then 'assignment' end,
          case when sg.dep_arp is distinct from pg.dep_arp then 'dep_arp' end,
          case when sg.arv_arp is distinct from pg.arv_arp then 'arv_arp' end,
          case when sg.sch_credit_sig is distinct from pg.sch_credit_sig then 'sch_credited_minutes' end,
          case when sg.act_credit_sig is distinct from pg.act_credit_sig then 'act_credited_minutes' end
        ], null) as changed_fields
      from source_ground sg
      full join publish_ground pg on pg.key = sg.key
    ),
    combined as (
      select *, case when status = 'NO_CHANGE' then 'PUBLISHED' else 'UNPUBLISHED' end as publish_status
      from flying_diff
      union all
      select *, case when status = 'NO_CHANGE' then 'PUBLISHED' else 'UNPUBLISHED' end as publish_status
      from ground_diff
    ),
    filtered as (
      select *
      from combined
      where ($7::text is null or publish_status = $7::text)
        and ($8::text[] is null or status = any($8::text[]))
        and ($9::text[] is null or key = any($9::text[]))
    ),
    counted as (
      select
        *,
        count(*) over() as total_count,
        count(*) filter (where status = 'ADD') over() as add_count,
        count(*) filter (where status = 'UPDATE') over() as update_count,
        count(*) filter (where status = 'DELETE') over() as delete_count,
        count(*) filter (where status = 'NO_CHANGE') over() as no_change_count
      from filtered
    )
    select *
    from counted
    order by
      case status when 'ADD' then 1 when 'UPDATE' then 2 when 'DELETE' then 3 else 4 end,
      crew_id,
      sch_str_dt_utc nulls last,
      key
    limit case when $10::int <= 0 then null else $10::int end
    offset $11::int
  `
}

const applyInsertSql = (kind: RosterPublishKind): string => {
  const s = quote()
  const predicate = kind === 'FLYING'
    ? 'rf.id = any($2::bigint[]) and rf.pairing_id is not null'
    : 'rf.id = any($2::bigint[]) and rf.pairing_id is null'
  return `
    insert into ${s}.roster_publish (
      created_by, created_at, updated_by, updated_at,
      division, flt_id, flt_dt, pairing_id, roster_flight_id,
      ver, base, source, is_requested, is_deleted, is_swapped, preference, comments, score,
      working_hour, sch_credited_minutes, sch_fm_credited_minutes, sch_per_diem_mins,
      sch_lh_per_diem_mins, sch_fm_per_diem_mins, sch_fm_lh_per_diem_mins,
      act_credited_minutes, act_fm_credited_minutes, act_per_diem_mins, act_lh_per_diem_mins,
      act_fm_per_diem_mins, act_fm_lh_per_diem_mins, dp_min, duty_seq, seg_seq, crew_id,
      flight_acting_rank, active_rank, roster_acting_rank, position,
      assignment_group, assignment, label, seq_order,
      sch_str_dt_utc, sch_end_dt_utc, act_str_dt_utc, act_end_dt_utc, dep_arp, arv_arp,
      tag_set, is_extra_course, seq_order_source, exception_code, act_rest_min,
      pairing_label, pairing_base, pairing_fleet, fleet_seg, tafb,
      pick_up_start_utc, pick_up_end_utc, brief_start_utc, brief_end_utc,
      debrief_start_utc, debrief_end_utc, drop_off_start_utc, drop_off_end_utc,
      resource_code, role, tm_program_course_id, group_id,
      request_source, request_id, is_publish, sub_role, sub_group_id
    )
    select
      $1, now(), $1, now(),
      coalesce(rf.division, c.division, 'P') as division,
      rf.flt_id,
      coalesce(rf.flt_dt, to_char(rf.sch_str_dt_utc, 'YYYY-MM-DD')) as flt_dt,
      rf.pairing_id,
      rf.id as roster_flight_id,
      rf.ver,
      rf.base,
      rf.source,
      rf.is_requested,
      0::smallint as is_deleted,
      rf.is_swapped,
      rf.preference,
      rf.comments,
      rf.score,
      rf.working_hour,
      coalesce(rf.sch_credited_minutes, ps.duty_sch_credited_minutes, ps.duty_act_credited_minutes),
      rf.sch_fm_credited_minutes,
      rf.sch_per_diem_mins,
      rf.sch_lh_per_diem_mins,
      rf.sch_fm_per_diem_mins,
      rf.sch_fm_lh_per_diem_mins,
      coalesce(rf.act_credited_minutes, ps.duty_act_credited_minutes),
      rf.act_fm_credited_minutes,
      rf.act_per_diem_mins,
      rf.act_lh_per_diem_mins,
      rf.act_fm_per_diem_mins,
      rf.act_fm_lh_per_diem_mins,
      rf.dp_min,
      rf.duty_seq,
      rf.seg_seq,
      rf.crew_id,
      rf.flight_acting_rank,
      rf.active_rank,
      rf.roster_acting_rank,
      rf.position,
      rf.assignment_group,
      coalesce(rf.assignment, rf.assignment_group, 'UNKNOWN') as assignment,
      coalesce(rf.label, p.pairing_label),
      coalesce(rf.seq_order, 0),
      rf.sch_str_dt_utc,
      rf.sch_end_dt_utc,
      rf.act_str_dt_utc,
      rf.act_end_dt_utc,
      coalesce(rf.dep_arp, ps.dep_arp),
      coalesce(rf.arv_arp, ps.arv_arp),
      rf.tag_set,
      rf.is_extra_course,
      rf.seq_order_source,
      rf.exception_code,
      rf.act_rest_min,
      p.pairing_label,
      p.base,
      p.fleet,
      ps.fleet_seg,
      p.tafb,
      ps.pickup_start_utc,
      ps.pickup_end_utc,
      ps.brief_start_utc,
      ps.brief_end_utc,
      ps.debrief_start_utc,
      ps.debrief_end_utc,
      ps.dropoff_start_utc,
      ps.dropoff_end_utc,
      rf.resource_code,
      rf.role,
      rf.tm_program_course_id,
      rf.group_id,
      rf.request_source,
      rf.request_id,
      1,
      rf.sub_role,
      rf.sub_group_id
    from ${s}.roster_flight rf
    left join ${s}.crew c on c.crew_id = rf.crew_id
    left join ${s}.pairing p on p.id = rf.pairing_id
    left join ${s}.pairing_segment ps
      on ps.pairing_id = rf.pairing_id
     and ps.duty_seq = rf.duty_seq
     and ps.seg_seq = rf.seg_seq
     and ps.is_deleted = 0
    where rf.is_deleted = 0
      and ${predicate}
    order by rf.crew_id, rf.pairing_id nulls last, rf.duty_seq nulls last, rf.seg_seq nulls last, rf.id
    returning roster_flight_id
  `
}

const adjustSnapshotSql = (kind: RosterPublishKind): string => {
  const s = quote()
  const oldPredicate = kind === 'FLYING'
    ? `rpbl.crew_id = $4
       and rpbl.pairing_id = $5::bigint`
    : `rpbl.crew_id = $4::text
       and rpbl.assignment_group is not distinct from $5::text
       and rpbl.assignment is not distinct from $6::text
       and rpbl.sch_str_dt_utc is not distinct from $7::timestamp
       and rpbl.sch_end_dt_utc is not distinct from $8::timestamp
       and rpbl.dep_arp is not distinct from $9::text
       and rpbl.arv_arp is not distinct from $10::text`
  const newPredicate = kind === 'FLYING'
    ? `rf.crew_id = $4
       and rf.pairing_id = $5::bigint`
    : `rf.crew_id = $4::text
       and rf.assignment_group is not distinct from $5::text
       and rf.assignment is not distinct from $6::text
       and rf.sch_str_dt_utc is not distinct from $7::timestamp
       and rf.sch_end_dt_utc is not distinct from $8::timestamp
       and rf.dep_arp is not distinct from $9::text
       and rf.arv_arp is not distinct from $10::text`
  const oldEnabledParam = kind === 'FLYING' ? '$6' : '$11'
  const newEnabledParam = kind === 'FLYING' ? '$7' : '$12'
  const rpStartParam = kind === 'FLYING' ? '$8' : '$13'
  const rpEndParam = kind === 'FLYING' ? '$9' : '$14'
  const joinPredicate = kind === 'FLYING'
    ? 'n.roster_id = o.roster_id'
    : `n.crew_id = o.crew_id
     and n.assignment_group is not distinct from o.assignment_group
     and n.assignment is not distinct from o.assignment
     and n.sch_str_dt_utc is not distinct from o.sch_str_dt_utc
     and n.sch_end_dt_utc is not distinct from o.sch_end_dt_utc
     and n.dep_arp is not distinct from o.dep_arp
     and n.arv_arp is not distinct from o.arv_arp`

  return `
    insert into ${s}.roster_publish_adjust (
      created_by, created_at, updated_by, updated_at,
      batch_id, rp_start, rp_end, published_dt, filiale, division, action_type, crew_id,
      old_roster_flight_id, old_pairing_id, old_pair_interface_id, old_flt_id, old_base,
      old_sch_str_dt_utc, old_sch_end_dt_utc, old_act_str_dt_utc, old_act_end_dt_utc,
      old_dep_arp, old_arv_arp, old_assignment_group, old_assignment,
      old_roster_acting_rank, old_flight_acting_rank, old_active_rank,
      old_position, old_role, old_course_code, old_resource_code,
      old_seq_order, old_brief_start_utc, old_brief_end_utc, old_source,
      new_roster_flight_id, new_pairing_id, new_pair_interface_id, new_flt_id, new_base,
      new_sch_str_dt_utc, new_sch_end_dt_utc, new_act_str_dt_utc, new_act_end_dt_utc,
      new_dep_arp, new_arv_arp, new_assignment_group, new_assignment,
      new_roster_acting_rank, new_flight_acting_rank, new_active_rank,
      new_position, new_role, new_course_code, new_resource_code,
      new_seq_order, new_brief_start_utc, new_brief_end_utc, new_source,
      published
    )
    with old_rows as (
      select
        rpbl.id as publish_id,
        rpbl.filiale,
        rpbl.division,
        rpbl.crew_id,
        rpbl.roster_flight_id as roster_id,
        rpbl.pairing_id,
        p.interface_id as pair_interface_id,
        rpbl.flt_id,
        null::varchar(3) as base,
        rpbl.sch_str_dt_utc,
        rpbl.sch_end_dt_utc,
        null::timestamp as act_str_dt_utc,
        null::timestamp as act_end_dt_utc,
        rpbl.dep_arp,
        rpbl.arv_arp,
        rpbl.assignment_group,
        rpbl.assignment,
        left(rpbl.roster_acting_rank, 10) as roster_acting_rank,
        left(rpbl.flight_acting_rank, 10) as flight_acting_rank,
        left(rpbl.active_rank, 10) as active_rank,
        left(rpbl.position, 10) as position,
        left(rpbl.role, 30) as role,
        left(rpbl.course_code, 30) as course_code,
        left(rpbl.resource_code, 30) as resource_code,
        rpbl.seq_order,
        rpbl.brief_start_utc,
        rpbl.brief_end_utc,
        rpbl.source
      from ${s}.roster_publish rpbl
      left join ${s}.pairing p on p.id = rpbl.pairing_id
      where ${oldEnabledParam}::boolean
        and ${oldPredicate}
    ),
    new_rows as (
      select
        c.filiale,
        coalesce(rf.division, c.division) as division,
        rf.crew_id,
        rf.id as roster_id,
        rf.pairing_id,
        p.interface_id as pair_interface_id,
        rf.flt_id,
        rf.base,
        rf.sch_str_dt_utc,
        rf.sch_end_dt_utc,
        rf.act_str_dt_utc,
        rf.act_end_dt_utc,
        coalesce(rf.dep_arp, ps.dep_arp) as dep_arp,
        coalesce(rf.arv_arp, ps.arv_arp) as arv_arp,
        rf.assignment_group,
        rf.assignment,
        left(rf.roster_acting_rank, 10) as roster_acting_rank,
        left(rf.flight_acting_rank, 10) as flight_acting_rank,
        left(rf.active_rank, 10) as active_rank,
        left(rf.position, 10) as position,
        left(rf.role, 30) as role,
        left(coalesce(rf.course_code, rf.sub_course_code), 30) as course_code,
        left(rf.resource_code, 30) as resource_code,
        rf.seq_order,
        ps.brief_start_utc,
        ps.brief_end_utc,
        rf.source
      from ${s}.roster_flight rf
      left join ${s}.crew c on c.crew_id = rf.crew_id
      left join ${s}.pairing p on p.id = rf.pairing_id
      left join ${s}.pairing_segment ps
        on ps.pairing_id = rf.pairing_id
       and ps.duty_seq = rf.duty_seq
       and ps.seg_seq = rf.seg_seq
       and ps.is_deleted = 0
      where ${newEnabledParam}::boolean
        and rf.is_deleted = 0
        and ${newPredicate}
    )
    select
      $1, now(), $1, now(),
      $2::bigint, ${rpStartParam}::timestamp, ${rpEndParam}::timestamp, now(), coalesce(n.filiale, o.filiale), coalesce(n.division, o.division), $3, coalesce(n.crew_id, o.crew_id),
      o.roster_id, o.pairing_id, o.pair_interface_id, o.flt_id, o.base,
      o.sch_str_dt_utc, o.sch_end_dt_utc, o.act_str_dt_utc, o.act_end_dt_utc,
      o.dep_arp, o.arv_arp, o.assignment_group, o.assignment,
      o.roster_acting_rank, o.flight_acting_rank, o.active_rank,
      o.position, o.role, o.course_code, o.resource_code,
      o.seq_order, o.brief_start_utc, o.brief_end_utc, o.source,
      n.roster_id, n.pairing_id, n.pair_interface_id, n.flt_id, n.base,
      n.sch_str_dt_utc, n.sch_end_dt_utc, n.act_str_dt_utc, n.act_end_dt_utc,
      n.dep_arp, n.arv_arp, n.assignment_group, n.assignment,
      n.roster_acting_rank, n.flight_acting_rank, n.active_rank,
      n.position, n.role, n.course_code, n.resource_code,
      n.seq_order, n.brief_start_utc, n.brief_end_utc, n.source,
      0::smallint
    from old_rows o
    full join new_rows n on ${joinPredicate}
    order by coalesce(n.crew_id, o.crew_id), coalesce(n.pairing_id, o.pairing_id) nulls last, coalesce(n.roster_id, o.roster_id)
  `
}

const adjustDeleteSnapshotSql = (): string => {
  const s = quote()
  return `
    insert into ${s}.roster_publish_adjust (
      created_by, created_at, updated_by, updated_at,
      batch_id, rp_start, rp_end, published_dt, filiale, division, action_type, crew_id,
      old_roster_flight_id, old_pairing_id, old_pair_interface_id, old_flt_id, old_base,
      old_sch_str_dt_utc, old_sch_end_dt_utc, old_act_str_dt_utc, old_act_end_dt_utc,
      old_dep_arp, old_arv_arp, old_assignment_group, old_assignment,
      old_roster_acting_rank, old_flight_acting_rank, old_active_rank,
      old_position, old_role, old_course_code, old_resource_code,
      old_seq_order, old_brief_start_utc, old_brief_end_utc, old_source,
      published
    )
    select
      $1, now(), $1, now(),
      $2::bigint, $5::timestamp, $6::timestamp, now(), rpbl.filiale, rpbl.division, $3, rpbl.crew_id,
      rpbl.roster_flight_id, rpbl.pairing_id, p.interface_id, rpbl.flt_id, null::varchar(3),
      rpbl.sch_str_dt_utc, rpbl.sch_end_dt_utc, null::timestamp, null::timestamp,
      rpbl.dep_arp, rpbl.arv_arp, rpbl.assignment_group, rpbl.assignment,
      left(rpbl.roster_acting_rank, 10), left(rpbl.flight_acting_rank, 10), left(rpbl.active_rank, 10),
      left(rpbl.position, 10), left(rpbl.role, 30), left(rpbl.course_code, 30), left(rpbl.resource_code, 30),
      rpbl.seq_order, rpbl.brief_start_utc, rpbl.brief_end_utc, rpbl.source,
      0::smallint
    from ${s}.roster_publish rpbl
    left join ${s}.pairing p on p.id = rpbl.pairing_id
    where rpbl.id = any($4::bigint[])
    order by rpbl.crew_id, rpbl.pairing_id nulls last, rpbl.roster_flight_id nulls last, rpbl.id
  `
}

const nextPublishAdjustBatchId = async (client: Pick<PoolClient, 'query'>): Promise<number> => {
  const result = await client.query<{ batch_id: string | number }>(
    `select (extract(epoch from clock_timestamp()) * 1000000)::bigint as batch_id`,
  )
  return Number(result.rows[0]?.batch_id ?? Date.now())
}

const loadRosterPeriod = async (
  client: Pick<PoolClient, 'query'>,
  rosterPeriodId: number,
): Promise<{ rpStart: Date; rpEnd: Date } | null> => {
  const result = await client.query<{ rp_start: Date; rp_end: Date }>(
    `select rp_start, rp_end from ${quote()}.roster_period where id = $1`,
    [rosterPeriodId],
  )
  const row = result.rows[0]
  return row ? { rpStart: row.rp_start, rpEnd: row.rp_end } : null
}

interface ApplySelection {
  key: string
  crew_id: string
  kind: RosterPublishKind
  status: Exclude<RosterPublishStatus, 'NO_CHANGE'>
  roster_ids: number[]
  publish_ids: number[]
}

interface PublishCrewScope {
  crew_id: string
  division: string
  base: string | null
  base_count: string | number
  ac_type: string | null
}

export class RosterPublishProductError extends Error {
  readonly statusCode = 409
}

const uniqueIds = (ids: number[]): number[] => [...new Set(ids)].sort((a, b) => a - b)

const applyDiffParams = (
  rosterPeriodId: number,
  keys: string[] | null,
  crewIds: string[] | null = null,
): unknown[] => [
  rosterPeriodId,
  null,
  null,
  null,
  null,
  null,
  null,
  ['ADD', 'UPDATE', 'DELETE', 'NO_CHANGE'],
  keys,
  0,
  0,
  null,
  crewIds,
]

const loadPublishCrewScopes = async (
  client: Pick<PoolClient, 'query'>,
  rosterPeriodId: number,
  crewIds: string[],
): Promise<PublishCrewScope[]> => {
  const schema = quote()
  const result = await client.query<PublishCrewScope>(
    `with rp as (
       select rp_start, rp_end
       from ${schema}.roster_period
       where id = $1
     )
     select
       c.crew_id,
       c.division,
       base_scope.base,
       coalesce(base_scope.base_count, 0) as base_count,
       fleet_scope.ac_type
     from ${schema}.crew c
     cross join rp
     left join lateral (
       select
         min(base_candidate.base) as base,
         count(distinct upper(base_candidate.base)) as base_count
       from (
         select cb.base
         from ${schema}.crew_base cb
         join ${schema}.airport airport
           on upper(airport.airport) = upper(cb.base)
         join pg_timezone_names timezone
           on timezone.name = airport.zone_id
         where cb.crew_id = c.crew_id
           and cb.is_prime_base = 1
           and cb.eff_dt < ((rp.rp_start::date + 1)::timestamp at time zone airport.zone_id)
           and (
             cb.exp_dt is null
             or cb.exp_dt >= (rp.rp_start::date::timestamp at time zone airport.zone_id)
           )
       ) base_candidate
     ) base_scope on true
     left join lateral (
       select string_agg(distinct fleet_value, ',' order by fleet_value) as ac_type
       from (
         select nullif(upper(btrim(coalesce(cf.ac_type, cf.fleet_specific))), '') as fleet_value
         from ${schema}.crew_fleet cf
         where cf.crew_id = c.crew_id
           and cf.eff_dt <= rp.rp_end
           and (cf.exp_dt is null or cf.exp_dt >= rp.rp_start)
       ) fleet_values
       where fleet_value is not null
     ) fleet_scope on true
     where c.crew_id = any($2::text[])
     order by c.crew_id`,
    [rosterPeriodId, crewIds],
  )
  return result.rows
}

const validatePublishCrewScopes = (crewIds: string[], scopes: PublishCrewScope[]): void => {
  const byCrew = new Map(scopes.map((scope) => [scope.crew_id, scope]))
  for (const crewId of crewIds) {
    const scope = byCrew.get(crewId)
    if (!scope || !scope.division || Number(scope.base_count) !== 1 || !scope.base || !scope.ac_type) {
      throw new RosterPublishProductError(
        `Crew ${crewId} is missing a unique roster-start base, division, or effective fleet. Correct the crew data before publishing.`,
      )
    }
  }
}

const insertSchedulePublishRecords = async (
  client: Pick<PoolClient, 'query'>,
  input: {
    username: string
    rosterPeriodId: number
    batchId: number
    rpStart: Date
    rpEnd: Date
    scopes: PublishCrewScope[]
  },
): Promise<string[]> => {
  const schema = quote()
  const scopeJson = JSON.stringify(input.scopes.map((scope) => ({
    crew_id: scope.crew_id,
    division: scope.division,
    base: scope.base,
    ac_type: scope.ac_type,
  })))
  const result = await client.query<{ crew_id: string }>(
    `insert into ${schema}.schedule_publish_record (
       created_by, created_at, updated_by, updated_at,
       str_dt, end_dt, ac_type, division, roster_period_id,
       published, crew_id, publish_type, base, batch_id
     )
     select
       $1, now(), $1, now(),
       $2, $3, scope.ac_type, scope.division, $4,
       1, scope.crew_id, 'Normal', scope.base, $5
     from jsonb_to_recordset($6::jsonb) as scope(
       crew_id text,
       division text,
       base text,
       ac_type text
     )
     where not exists (
       select 1
       from ${schema}.schedule_publish_record existing
       where existing.roster_period_id = $4
         and existing.batch_id = $5
         and existing.crew_id = scope.crew_id
         and existing.published = 1
     )
     returning crew_id`,
    [
      input.username,
      input.rpStart,
      input.rpEnd,
      input.rosterPeriodId,
      input.batchId,
      scopeJson,
    ],
  )
  return result.rows.map((row) => row.crew_id).sort()
}

type CommitVerification = 'COMMITTED' | 'NOT_COMMITTED' | 'UNCERTAIN'

const verifyPublicationCommit = async (
  fastify: FastifyInstance,
  input: {
    rosterPeriodId: number
    batchId: number
    crewIds: string[]
    expectedAdjustCount: number
  },
): Promise<CommitVerification> => {
  try {
    const schema = quote()
    const [recordResult, adjustResult] = await Promise.all([
      fastify.pgPool.query<{ crew_id: string }>(
        `select crew_id
         from ${schema}.schedule_publish_record
         where roster_period_id = $1
           and batch_id = $2
           and published = 1
         order by crew_id`,
        [input.rosterPeriodId, input.batchId],
      ),
      fastify.pgPool.query<{ count: string | number }>(
        `select count(*) as count
         from ${schema}.roster_publish_adjust
         where batch_id = $1`,
        [input.batchId],
      ),
    ])
    const actualCrewIds = recordResult.rows.map((row) => row.crew_id).sort()
    const expectedCrewIds = [...input.crewIds].sort()
    const adjustCount = Number(adjustResult.rows[0]?.count ?? 0)
    const exactCrewSet = actualCrewIds.length === expectedCrewIds.length
      && actualCrewIds.every((crewId, index) => crewId === expectedCrewIds[index])

    if (exactCrewSet && adjustCount === input.expectedAdjustCount) return 'COMMITTED'
    if (actualCrewIds.length === 0 && adjustCount === 0) return 'NOT_COMMITTED'
    return 'UNCERTAIN'
  } catch {
    return 'UNCERTAIN'
  }
}

const bulkAdjustSnapshotSql = (): string => {
  const s = quote()
  return `
    insert into ${s}.roster_publish_adjust (
      created_by, created_at, updated_by, updated_at,
      batch_id, rp_start, rp_end, published_dt, filiale, division, action_type, crew_id,
      old_roster_flight_id, old_pairing_id, old_pair_interface_id, old_flt_id, old_base,
      old_sch_str_dt_utc, old_sch_end_dt_utc, old_act_str_dt_utc, old_act_end_dt_utc,
      old_dep_arp, old_arv_arp, old_assignment_group, old_assignment,
      old_roster_acting_rank, old_flight_acting_rank, old_active_rank,
      old_position, old_role, old_course_code, old_resource_code,
      old_seq_order, old_brief_start_utc, old_brief_end_utc, old_source,
      new_roster_flight_id, new_pairing_id, new_pair_interface_id, new_flt_id, new_base,
      new_sch_str_dt_utc, new_sch_end_dt_utc, new_act_str_dt_utc, new_act_end_dt_utc,
      new_dep_arp, new_arv_arp, new_assignment_group, new_assignment,
      new_roster_acting_rank, new_flight_acting_rank, new_active_rank,
      new_position, new_role, new_course_code, new_resource_code,
      new_seq_order, new_brief_start_utc, new_brief_end_utc, new_source,
      published
    )
    with selected as (
      select *
      from jsonb_to_recordset($5::jsonb) as x(
        key text,
        kind text,
        status text,
        roster_ids bigint[],
        publish_ids bigint[]
      )
    ),
    old_ids as (
      select
        s.key,
        s.kind,
        s.status,
        u.publish_id,
        u.ordinality::int as pair_order
      from selected s
      cross join lateral unnest(s.publish_ids) with ordinality as u(publish_id, ordinality)
    ),
    new_ids as (
      select
        s.key,
        s.kind,
        s.status,
        u.roster_id,
        u.ordinality::int as pair_order
      from selected s
      cross join lateral unnest(s.roster_ids) with ordinality as u(roster_id, ordinality)
    ),
    update_flying_pairs as (
      select
        coalesce(o.key, n.key) as key,
        'UPDATE'::text as status,
        o.publish_id,
        n.roster_id
      from (
        select oi.key, oi.publish_id, rpbl.roster_flight_id
        from old_ids oi
        join ${s}.roster_publish rpbl on rpbl.id = oi.publish_id
        where oi.status = 'UPDATE' and oi.kind = 'FLYING'
      ) o
      full join (
        select key, roster_id
        from new_ids
        where status = 'UPDATE' and kind = 'FLYING'
      ) n
        on n.key = o.key
       and n.roster_id is not distinct from o.roster_flight_id
    ),
    update_ground_pairs as (
      select
        coalesce(o.key, n.key) as key,
        'UPDATE'::text as status,
        o.publish_id,
        n.roster_id
      from (
        select key, publish_id, pair_order
        from old_ids
        where status = 'UPDATE' and kind = 'GROUND'
      ) o
      full join (
        select key, roster_id, pair_order
        from new_ids
        where status = 'UPDATE' and kind = 'GROUND'
      ) n
        on n.key = o.key
       and n.pair_order = o.pair_order
    ),
    pairs as (
      select key, status, null::bigint as publish_id, roster_id
      from new_ids
      where status = 'ADD'
      union all
      select key, status, publish_id, null::bigint as roster_id
      from old_ids
      where status = 'DELETE'
      union all
      select key, status, publish_id, roster_id from update_flying_pairs
      union all
      select key, status, publish_id, roster_id from update_ground_pairs
    )
    select
      $1, now(), $1, now(),
      $2::bigint, $3::timestamp, $4::timestamp, now(),
      coalesce(c.filiale, old.filiale),
      coalesce(rf.division, c.division, old.division),
      pairs.status,
      coalesce(rf.crew_id, old.crew_id),
      old.roster_flight_id, old.pairing_id, old_pair.interface_id, old.flt_id, null::varchar(3),
      old.sch_str_dt_utc, old.sch_end_dt_utc, null::timestamp, null::timestamp,
      old.dep_arp, old.arv_arp, old.assignment_group, old.assignment,
      left(old.roster_acting_rank, 10), left(old.flight_acting_rank, 10), left(old.active_rank, 10),
      left(old.position, 10), left(old.role, 30), left(old.course_code, 30), left(old.resource_code, 30),
      old.seq_order, old.brief_start_utc, old.brief_end_utc, old.source,
      rf.id, rf.pairing_id, new_pair.interface_id, rf.flt_id, rf.base,
      rf.sch_str_dt_utc, rf.sch_end_dt_utc, rf.act_str_dt_utc, rf.act_end_dt_utc,
      coalesce(rf.dep_arp, ps.dep_arp), coalesce(rf.arv_arp, ps.arv_arp),
      rf.assignment_group, rf.assignment,
      left(rf.roster_acting_rank, 10), left(rf.flight_acting_rank, 10), left(rf.active_rank, 10),
      left(rf.position, 10), left(rf.role, 30), left(coalesce(rf.course_code, rf.sub_course_code), 30),
      left(rf.resource_code, 30), rf.seq_order, ps.brief_start_utc, ps.brief_end_utc, rf.source,
      0::smallint
    from pairs
    left join ${s}.roster_publish old on old.id = pairs.publish_id
    left join ${s}.pairing old_pair on old_pair.id = old.pairing_id
    left join ${s}.roster_flight rf on rf.id = pairs.roster_id
    left join ${s}.crew c on c.crew_id = rf.crew_id
    left join ${s}.pairing new_pair on new_pair.id = rf.pairing_id
    left join ${s}.pairing_segment ps
      on ps.pairing_id = rf.pairing_id
     and ps.duty_seq = rf.duty_seq
     and ps.seg_seq = rf.seg_seq
     and ps.is_deleted = 0
    order by pairs.key, coalesce(pairs.roster_id, pairs.publish_id)
  `
}

const isSerializationFailure = (error: unknown): boolean =>
  typeof error === 'object'
  && error !== null
  && 'code' in error
  && (error as { code?: unknown }).code === '40001'

const assertReturnedIds = (expected: number[], actual: number[], operation: string): void => {
  const normalizedExpected = uniqueIds(expected)
  const normalizedActual = uniqueIds(actual)
  if (
    normalizedExpected.length !== normalizedActual.length
    || normalizedExpected.some((id, index) => id !== normalizedActual[index])
  ) {
    throw new Error(`Roster publish ${operation} count validation failed`)
  }
}

const mapDiffRow = (row: RawDiffRow): RosterPublishDiffRow => ({
  key: row.key,
  kind: row.kind,
  status: row.status,
  crewId: row.crew_id,
  crewName: row.crew_name,
  crewFleet: row.crew_fleet,
  base: row.base,
  pairingId: row.pairing_id == null ? null : Number(row.pairing_id),
  pairingLabel: row.pairing_label,
  rosterIds: toArray(row.roster_ids),
  publishIds: toArray(row.publish_ids),
  assignmentGroup: row.assignment_group,
  assignment: row.assignment,
  actingRank: row.acting_rank,
  schStrDtUtc: toIso(row.sch_str_dt_utc),
  schEndDtUtc: toIso(row.sch_end_dt_utc),
  depArp: row.dep_arp,
  arvArp: row.arv_arp,
  segmentCount: Number(row.segment_count ?? 0),
  changedFields: row.changed_fields ?? [],
  publishStatus: row.publish_status,
  source: null,
  noc: null,
})

const enrichDiffWithSourceNoc = async (
  pool: Pick<PoolClient, 'query'>,
  items: RosterPublishDiffRow[],
): Promise<RosterPublishDiffRow[]> => {
  if (items.length === 0) return items
  const rosterIds = uniqueIds(items.flatMap((row) => (row.status === 'DELETE' ? [] : row.rosterIds)))
  const publishIds = uniqueIds(items.flatMap((row) => (row.status === 'DELETE' ? row.publishIds : [])))
  const schema = quote()

  const [sourceResult, adjustResult] = await Promise.all([
    pool.query<{ id: string | number; source: string | null }>(
      `select id, source from ${schema}.roster_flight where id = any($1::bigint[])
       union all
       select id, source from ${schema}.roster_publish where id = any($2::bigint[])`,
      [rosterIds, publishIds],
    ),
    pool.query<{ new_roster_flight_id: string | number; published: string | number }>(
      `select distinct on (new_roster_flight_id) new_roster_flight_id, published
       from ${schema}.roster_publish_adjust
       where new_roster_flight_id = any($1::bigint[])
       order by new_roster_flight_id, id desc`,
      [rosterIds],
    ),
  ])

  const sourceById = new Map<number, string>()
  for (const row of sourceResult.rows) {
    const source = row.source?.trim()
    if (source) sourceById.set(Number(row.id), source)
  }
  const publishedByRosterId = new Map<number, number>()
  for (const row of adjustResult.rows) {
    publishedByRosterId.set(Number(row.new_roster_flight_id), Number(row.published))
  }

  const rowSources = (row: RosterPublishDiffRow): string[] => {
    const ids = row.status === 'DELETE' ? row.publishIds : row.rosterIds
    return [...new Set(ids.map((id) => sourceById.get(id)).filter((value): value is string => !!value))]
  }

  const resolveNoc = (
    row: RosterPublishDiffRow,
    sources: string[],
  ): 'Ignore' | 'Pending' | 'Success' | null => {
    if (sources.length === 0) return null
    if (sources.includes('IMP')) return 'Ignore'
    if (row.status !== 'ADD' && row.status !== 'UPDATE') return null
    const latest = row.rosterIds
      .map((id) => publishedByRosterId.get(id))
      .filter((value): value is number => value != null)
    if (latest.length === 0) return null
    if (latest.some((published) => published === 0)) return 'Pending'
    if (latest.every((published) => published === 1)) return 'Success'
    return null
  }

  return items.map((row) => {
    const sources = rowSources(row)
    return {
      ...row,
      source: sources.length > 0 ? sources.join(',') : null,
      noc: resolveNoc(row, sources),
    }
  })
}

export const rosterPublishService = {
  async listDiff(fastify: FastifyInstance, input: RosterPublishDiffInput): Promise<RosterPublishDiffResult> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(500, Math.max(0, input.pageSize ?? 100))
    const offset = pageSize > 0 ? (page - 1) * pageSize : 0
    const publishStatus = input.publishStatus === 'PUBLISHED' || input.publishStatus === 'UNPUBLISHED'
      ? input.publishStatus
      : null
    const params = [
      input.rosterPeriodId,
      normalizeList(input.crewFleets),
      normalizeList(input.bases),
      input.crewId?.trim() || null,
      input.pairingId ?? null,
      input.pairingLabel?.trim() || null,
      publishStatus,
      normalizeStatuses(input.statuses),
      normalizeList(input.keys),
      pageSize,
      offset,
      normalizeDivisionList(input.divisions),
      null,
    ]

    const result = await fastify.pgPool.query<RawDiffRow>(diffSql(), params)
    const rows = result.rows
    const first = rows[0]
    const items = await enrichDiffWithSourceNoc(fastify.pgPool, rows.map(mapDiffRow))
    return {
      items,
      total: Number(first?.total_count ?? 0),
      page,
      pageSize,
      summary: {
        add: Number(first?.add_count ?? 0),
        update: Number(first?.update_count ?? 0),
        delete: Number(first?.delete_count ?? 0),
        noChange: Number(first?.no_change_count ?? 0),
        actionable: Number(first?.add_count ?? 0) + Number(first?.update_count ?? 0) + Number(first?.delete_count ?? 0),
      },
    }
  },

  async applyDiff(fastify: FastifyInstance, input: RosterPublishApplyInput, username: string): Promise<RosterPublishApplyResult> {
    const keys = [...new Set(input.keys.map((key) => key.trim()).filter(Boolean))]
    if (keys.length === 0) {
      return { batchId: null, applied: 0, inserted: 0, updated: 0, deleted: 0, skipped: 0, staleKeys: [] }
    }

    const client = await fastify.pgPool.connect()
    let inserted = 0
    let deleted = 0
    let batchId: number | null = null
    let actionable: ApplySelection[] = []
    let staleKeys: string[] = []
    let expectedAdjustCount = 0
    let publishedCrewIds: string[] = []

    try {
      await client.query('begin isolation level serializable')
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`${quote()}:roster-publish`])

      const period = await loadRosterPeriod(client, input.rosterPeriodId)
      if (!period) {
        throw new Error(`Roster period ${input.rosterPeriodId} not found`)
      }

      const diffResult = await client.query<RawDiffRow>(diffSql(), applyDiffParams(input.rosterPeriodId, keys))
      const freshRows = diffResult.rows.map(mapDiffRow)
      actionable = freshRows
        .filter((row): row is RosterPublishDiffRow & { status: Exclude<RosterPublishStatus, 'NO_CHANGE'> } =>
          row.status !== 'NO_CHANGE')
        .map((row) => ({
          key: row.key,
          crew_id: row.crewId,
          kind: row.kind,
          status: row.status,
          roster_ids: uniqueIds(row.rosterIds),
          publish_ids: uniqueIds(row.publishIds),
        }))
      const actionableKeys = new Set(actionable.map((row) => row.key))
      staleKeys = keys.filter((key) => !actionableKeys.has(key))

      if (actionable.length === 0) {
        await client.query('commit')
        return {
          batchId: null,
          applied: 0,
          inserted: 0,
          updated: 0,
          deleted: 0,
          skipped: staleKeys.length,
          staleKeys,
        }
      }

      publishedCrewIds = [...new Set(actionable.map((row) => row.crew_id))].sort()
      // No per-crew completeness check: a publish batch may apply a subset of
      // a crew's changes. The remaining diff rows stay in roster_publish /
      // roster_flight and are surfaced again on the next diff query so the
      // user can publish them in subsequent batches.

      const publishCrewScopes = await loadPublishCrewScopes(
        client,
        input.rosterPeriodId,
        publishedCrewIds,
      )
      validatePublishCrewScopes(publishedCrewIds, publishCrewScopes)

      const sourceIds = uniqueIds(actionable.flatMap((row) =>
        row.status === 'DELETE' ? [] : row.roster_ids))
      const publishIds = uniqueIds(actionable.flatMap((row) =>
        row.status === 'ADD' ? [] : row.publish_ids))
      const flyingSourceIds = uniqueIds(actionable.flatMap((row) =>
        row.kind === 'FLYING' && row.status !== 'DELETE' ? row.roster_ids : []))
      const groundSourceIds = uniqueIds(actionable.flatMap((row) =>
        row.kind === 'GROUND' && row.status !== 'DELETE' ? row.roster_ids : []))

      if (sourceIds.length !== flyingSourceIds.length + groundSourceIds.length) {
        throw new Error('Roster publish source rows overlap across selected keys')
      }

      const lockedSource = await client.query<{ id: string | number }>(
        `select id from ${quote()}.roster_flight where id = any($1::bigint[]) and is_deleted = 0 for update`,
        [sourceIds],
      )
      assertReturnedIds(sourceIds, lockedSource.rows.map((row) => Number(row.id)), 'source lock')

      const lockedPublish = await client.query<{ id: string | number }>(
        `select id from ${quote()}.roster_publish where id = any($1::bigint[]) for update`,
        [publishIds],
      )
      assertReturnedIds(publishIds, lockedPublish.rows.map((row) => Number(row.id)), 'snapshot lock')

      batchId = await nextPublishAdjustBatchId(client)
      const selectedJson = JSON.stringify(actionable)
      const adjustResult = await client.query(
        bulkAdjustSnapshotSql(),
        [username, batchId, period.rpStart, period.rpEnd, selectedJson],
      )
      expectedAdjustCount = adjustResult.rowCount ?? 0

      const deleteResult = await client.query<{ id: string | number }>(
        `delete from ${quote()}.roster_publish
         where id = any($1::bigint[])
         returning id`,
        [publishIds],
      )
      const deletedIds = deleteResult.rows.map((row) => Number(row.id))
      assertReturnedIds(publishIds, deletedIds, 'delete')
      deleted = deletedIds.length

      const flyingInsert = await client.query<{ roster_flight_id: string | number }>(
        applyInsertSql('FLYING'),
        [username, flyingSourceIds],
      )
      const flyingInsertedIds = flyingInsert.rows.map((row) => Number(row.roster_flight_id))
      assertReturnedIds(flyingSourceIds, flyingInsertedIds, 'flying insert')

      const groundInsert = await client.query<{ roster_flight_id: string | number }>(
        applyInsertSql('GROUND'),
        [username, groundSourceIds],
      )
      const groundInsertedIds = groundInsert.rows.map((row) => Number(row.roster_flight_id))
      assertReturnedIds(groundSourceIds, groundInsertedIds, 'ground insert')
      inserted = flyingInsertedIds.length + groundInsertedIds.length

      const insertedCrewIds = await insertSchedulePublishRecords(client, {
        username,
        rosterPeriodId: input.rosterPeriodId,
        batchId,
        rpStart: period.rpStart,
        rpEnd: period.rpEnd,
        scopes: publishCrewScopes,
      })
      if (
        insertedCrewIds.length !== publishedCrewIds.length
        || insertedCrewIds.some((crewId, index) => crewId !== publishedCrewIds[index])
      ) {
        throw new Error('Schedule publish records do not match the completed crew set')
      }

      try {
        await client.query('commit')
      } catch (commitError) {
        const commitState = await verifyPublicationCommit(fastify, {
          rosterPeriodId: input.rosterPeriodId,
          batchId,
          crewIds: publishedCrewIds,
          expectedAdjustCount,
        })
        if (commitState === 'NOT_COMMITTED') {
          throw commitError
        }
        if (commitState === 'UNCERTAIN') {
          throw new RosterPublishProductError(
            'Publish result could not be confirmed. Refresh the roster before retrying.',
          )
        }
      }
    } catch (err) {
      await client.query('rollback').catch(() => undefined)
      if (err instanceof RosterPublishProductError) throw err
      if (isSerializationFailure(err)) {
        throw new Error('Roster data changed during publishing. Refresh the diff and try again.')
      }
      fastify.log?.error(
        { rosterPeriodId: input.rosterPeriodId },
        'Roster publish transaction failed',
      )
      throw new Error('Roster publishing could not be completed. Refresh the diff and try again.')
    } finally {
      client.release()
    }

    try {
      await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:*`)
    } catch {
      fastify.log?.warn(
        { rosterPeriodId: input.rosterPeriodId },
        'Roster publish committed but cache invalidation failed',
      )
    }

    return {
      batchId,
      applied: actionable.length,
      inserted,
      updated: actionable.filter((row) => row.status === 'UPDATE').length,
      deleted,
      skipped: staleKeys.length,
      staleKeys,
    }
  },

  /**
   * Publish roster: create a roster_publish record.
   */
  async publish(fastify: FastifyInstance, data: typeof rosterPublish.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(rosterPublish)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await invalidatePattern(fastify.redis, `${CACHE_PREFIX}:crew:*`)
    return row
  },

  /**
   * Get published roster for a specific crew member.
   */
  async getByCrewId(fastify: FastifyInstance, crewId: string) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:crew:${crewId}`, CACHE_TTL, async () => {
      return fastify.db
        .select()
        .from(rosterPublish)
        .where(eq(rosterPublish.crewId, crewId))
        .orderBy(asc(rosterPublish.fltDt))
    })
  },

  /**
   * Get a single publish record by ID.
   */
  async getById(fastify: FastifyInstance, id: number) {
    return getOrSet(fastify.redis, `${CACHE_PREFIX}:${id}`, CACHE_TTL, async () => {
      const [row] = await fastify.db
        .select()
        .from(rosterPublish)
        .where(eq(rosterPublish.id, id))
      return row ?? null
    })
  },

  async update(fastify: FastifyInstance, id: number, data: Partial<typeof rosterPublish.$inferInsert>, username: string) {
    const [row] = await fastify.db
      .update(rosterPublish)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(rosterPublish.id, id))
      .returning()
    if (row) {
      await Promise.all([
        invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
        invalidate(fastify.redis, `${CACHE_PREFIX}:crew:${row.crewId}`),
      ])
    }
    return row
  },

  async remove(fastify: FastifyInstance, id: number) {
    const [row] = await fastify.db
      .delete(rosterPublish)
      .where(eq(rosterPublish.id, id))
      .returning()
    if (row) {
      await Promise.all([
        invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
        invalidate(fastify.redis, `${CACHE_PREFIX}:crew:${row.crewId}`),
      ])
    }
    return row
  },

  // --- Publish Adjust ---

  /**
   * Record a post-publish adjustment.
   */
  async createAdjust(fastify: FastifyInstance, data: typeof rosterPublishAdjust.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(rosterPublishAdjust)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    return row
  },

  async listAdjustByCrewId(fastify: FastifyInstance, crewId: string, query: PaginationQuery) {
    const { page, pageSize } = query

    const conditions = eq(rosterPublishAdjust.crewId, crewId)

    const [items, countResult] = await Promise.all([
      fastify.db
        .select()
        .from(rosterPublishAdjust)
        .where(conditions)
        .orderBy(desc(rosterPublishAdjust.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      fastify.db
        .select({ count: sql<number>`count(*)::int` })
        .from(rosterPublishAdjust)
        .where(conditions),
    ])

    return paginate({ page, pageSize }, items, countResult[0].count)
  },
}
