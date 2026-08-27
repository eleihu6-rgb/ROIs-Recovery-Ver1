import type { Pool } from "pg";
import type {
  PbsAwardAvailability,
  PbsAwardLifecycleStage,
} from "../../../../packages/contracts/pbs-award-results.js";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import type { LineholderDraftActor } from "../lineholder/shared.js";

type AwardPeriodRow = {
  period_id: string | number;
  period_code: string;
  rp_start: string | Date;
  rp_end: string | Date;
  bid_open_at: string | Date | null;
  bid_close_at: string | Date | null;
  award_publish_at: string | Date | null;
  award_final_at: string | Date | null;
  mis_award_deadline_at: string | Date | null;
  status: string | null;
  first_published_at: string | Date | null;
  latest_published_at: string | Date | null;
  base: string | null;
  zone_id: string | null;
};

export type AwardPeriodContext = {
  id: number | null;
  periodCode: string;
  rpStart: string | null;
  rpEnd: string | null;
  awardPublishAt: string | null;
  awardFinalAt: string | null;
  misAwardDeadlineAt: string | null;
  firstPublishedAt: string | null;
  latestPublishedAt: string | null;
  base: string | null;
  zoneId: string | null;
  timezoneLabel: string | null;
  availability: PbsAwardAvailability;
  lifecycleStage: PbsAwardLifecycleStage;
  readablePeriods?: AwardPeriodContext[];
  allPeriods?: AwardPeriodContext[];
  upcomingPeriod?: AwardPeriodContext | null;
  currentPeriod?: PbsCurrentPeriod;
};

const asIso = (value: string | Date | null): string | null => {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const asWallDateTime = (value: string | Date | null): string | null => {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 19);
  return String(value).replace(" ", "T").slice(0, 19);
};

const availabilityForStage = (stage: PbsAwardLifecycleStage): PbsAwardAvailability => {
  if (stage === "PUBLISHED" || stage === "FINAL" || stage === "MIS_AWARD_CLOSED") return "AVAILABLE";
  if (stage === "PUBLISH_PENDING") return "PUBLISH_PENDING";
  if (stage === "SCHEDULED") return "SCHEDULED";
  return "UNCONFIGURED";
};

const lifecycleForRow = (row: AwardPeriodRow, businessNow: Date): PbsAwardLifecycleStage => {
  const awardPublishAt = asIso(row.award_publish_at);
  const awardFinalAt = asIso(row.award_final_at);
  const misAwardDeadlineAt = asIso(row.mis_award_deadline_at);
  if (!awardPublishAt || !awardFinalAt || !misAwardDeadlineAt) return "UNCONFIGURED";
  const nowIso = businessNow.toISOString();
  if (awardPublishAt > nowIso) return "SCHEDULED";
  if (row.latest_published_at === null) return "PUBLISH_PENDING";
  if (awardFinalAt > nowIso) return "PUBLISHED";
  if (misAwardDeadlineAt > nowIso) return "FINAL";
  return "MIS_AWARD_CLOSED";
};

const toContext = (row: AwardPeriodRow, businessNow: Date): AwardPeriodContext => {
  const lifecycleStage = lifecycleForRow(row, businessNow);
  return ({
  id: Number(row.period_id),
  periodCode: row.period_code,
  rpStart: asWallDateTime(row.rp_start),
  rpEnd: asWallDateTime(row.rp_end),
  awardPublishAt: asIso(row.award_publish_at),
  awardFinalAt: asIso(row.award_final_at),
  misAwardDeadlineAt: asIso(row.mis_award_deadline_at),
  firstPublishedAt: asIso(row.first_published_at),
  latestPublishedAt: asIso(row.latest_published_at),
  base: row.base,
  zoneId: row.zone_id,
  timezoneLabel: row.base ? `${row.base} Local Time` : null,
  availability: availabilityForStage(lifecycleStage),
  lifecycleStage,
  currentPeriod: {
    id: Number(row.period_id),
    periodCode: row.period_code,
    status: row.status,
    computedStage: "CLOSED",
    bidOpenAt: asIso(row.bid_open_at),
    bidCloseAt: asIso(row.bid_close_at),
    base: row.base,
    zoneId: row.zone_id,
    timezoneLabel: row.base ? `${row.base} Local Time` : null,
    rpStartLocal: asWallDateTime(row.rp_start),
    rpEndLocal: asWallDateTime(row.rp_end),
    canEditBid: false,
    readOnlyReason: "Award periods are read-only.",
  },
  });
};

export const resolveCurrentAwardPeriod = async ({
  pgPool,
  schema,
  actor,
  businessNow,
}: {
  pgPool: Pick<Pool, "query">;
  schema: string;
  pbsSchema: string;
  actor: LineholderDraftActor;
  businessNow: Date;
}): Promise<AwardPeriodContext> => {
  const result = await pgPool.query<AwardPeriodRow>(`
    select
      period.id as period_id,
      period.pbs_period_code::varchar as period_code,
      to_char(period.rp_start, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_start,
      to_char(period.rp_end, 'YYYY-MM-DD"T"HH24:MI:SS') as rp_end,
      period.pbs_bid_open_at at time zone effective_base.zone_id as bid_open_at,
      period.pbs_bid_close_at at time zone effective_base.zone_id as bid_close_at,
      period.pbs_award_publish_at at time zone effective_base.zone_id as award_publish_at,
      period.pbs_award_final_at at time zone effective_base.zone_id as award_final_at,
      period.pbs_mis_award_deadline_at at time zone effective_base.zone_id as mis_award_deadline_at,
      period.pbs_status::varchar as status,
      effective_base.base,
      effective_base.zone_id,
      publication.first_published_at,
      publication.latest_published_at
    from ${schema}.roster_period period
    left join lateral (
      select
        min(base_candidate.base) as base,
        min(base_candidate.zone_id) as zone_id,
        count(distinct upper(base_candidate.base)) as base_count
      from (
        select crew_base.base, airport.zone_id
        from ${schema}.crew_base crew_base
        join ${schema}.airport airport
          on upper(airport.airport) = upper(crew_base.base)
        join pg_timezone_names timezone
          on timezone.name = airport.zone_id
        where crew_base.crew_id = $1
          and crew_base.is_prime_base = 1
          and crew_base.eff_dt < ((period.rp_start::date + 1)::timestamp at time zone airport.zone_id)
          and (
            crew_base.exp_dt is null
            or crew_base.exp_dt >= (period.rp_start::date::timestamp at time zone airport.zone_id)
          )
      ) base_candidate
    ) effective_base on true
    left join lateral (
      select
        min(record.created_at) as first_published_at,
        max(record.created_at) as latest_published_at
      from ${schema}.schedule_publish_record record
      join ${schema}.crew actor_crew
        on actor_crew.crew_id = $1
      where record.roster_period_id = period.id
        and record.published = 1
        and record.str_dt::date <= period.rp_start::date
        and record.end_dt::date >= period.rp_end::date
        and nullif(btrim(record.division), '') is not null
        and upper(btrim(record.division)) = upper(btrim(actor_crew.division))
        and effective_base.base_count = 1
        and nullif(btrim(record.base), '') is not null
        and upper(btrim(record.base)) = upper(btrim(effective_base.base))
        and nullif(btrim(record.crew_id), '') is not null
        and upper(btrim(record.crew_id)) = upper(btrim($1))
        and nullif(btrim(record.ac_type), '') is not null
        and (
          select string_agg(record_fleet, ',' order by record_fleet)
          from (
            select distinct nullif(upper(btrim(value)), '') as record_fleet
            from regexp_split_to_table(record.ac_type, ',') value
          ) record_fleets
          where record_fleet is not null
        ) = (
          select string_agg(actor_fleet_value, ',' order by actor_fleet_value)
          from (
            select distinct
              nullif(upper(btrim(coalesce(actor_fleet.ac_type, actor_fleet.fleet_specific))), '')
                as actor_fleet_value
            from ${schema}.crew_fleet actor_fleet
            where actor_fleet.crew_id = $1
              and actor_fleet.eff_dt <= period.rp_end
              and (actor_fleet.exp_dt is null or actor_fleet.exp_dt >= period.rp_start)
          ) actor_fleets
          where actor_fleet_value is not null
        )
    ) publication on true
    where nullif(btrim(period.pbs_period_code), '') is not null
      and period.rp_start is not null
      and period.rp_end is not null
    order by period.rp_start desc, period.id desc
    limit 100
  `, [actor.crewId]);

  const allPeriods = result.rows.map((row) => toContext(row, businessNow));
  const readablePeriods = allPeriods
    .filter((period) => period.availability === "AVAILABLE")
    .sort((left, right) =>
      (right.awardPublishAt ?? "").localeCompare(left.awardPublishAt ?? "")
      || (right.id ?? 0) - (left.id ?? 0));
  const visible = readablePeriods[0];
  const newerUnavailable = allPeriods.filter((period) =>
    period.availability !== "AVAILABLE"
    && (visible === undefined || (period.rpStart ?? "") > (visible.rpStart ?? "")));
  const pending = newerUnavailable
    .filter((period) => period.lifecycleStage === "PUBLISH_PENDING")
    .sort((left, right) => (right.awardPublishAt ?? "").localeCompare(left.awardPublishAt ?? ""))[0];
  const scheduled = newerUnavailable
    .filter((period) => period.lifecycleStage === "SCHEDULED")
    .sort((left, right) => (left.awardPublishAt ?? "").localeCompare(right.awardPublishAt ?? ""))[0];
  const unconfigured = newerUnavailable
    .filter((period) => period.lifecycleStage === "UNCONFIGURED")
    .sort((left, right) => (right.rpStart ?? "").localeCompare(left.rpStart ?? ""))[0];
  const upcomingPeriod = pending ?? scheduled ?? unconfigured ?? null;
  const selected = visible ?? upcomingPeriod ?? allPeriods[0];

  return selected
    ? { ...selected, readablePeriods, allPeriods, upcomingPeriod }
    : {
        id: null,
        periodCode: "Not configured",
        rpStart: null,
        rpEnd: null,
        awardPublishAt: null,
        awardFinalAt: null,
        misAwardDeadlineAt: null,
        firstPublishedAt: null,
        latestPublishedAt: null,
        base: null,
        zoneId: null,
        timezoneLabel: null,
        availability: "UNCONFIGURED",
        lifecycleStage: "UNCONFIGURED",
        readablePeriods: [],
        allPeriods: [],
        upcomingPeriod: null,
      };
};
