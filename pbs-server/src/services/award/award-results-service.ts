import type { Pool } from "pg";
import { LineholderBidServiceError, type LineholderDraftActor } from "../lineholder/shared.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import { resolveCurrentAwardPeriod, type AwardPeriodContext } from "./award-period-resolver.js";
import { buildAwardCurrentResponse } from "./award-results-mapper.js";
import type {
  AwardResultRow,
  AwardRosterRow,
  CreatePbsAwardResultsServiceOptions,
  PbsAwardResultsService,
} from "./types.js";
import type {
  PbsAwardCurrentResponse,
  PbsAwardPeriodSummary,
  PbsAwardTimeZoneInfo,
} from "../../../../packages/contracts/pbs-award-results.js";

type PeriodRange = {
  startIsoDate: string;
  nextIsoDate: string;
  bufferStartIsoDate: string;
  bufferNextIsoDate: string;
};

const DEFAULT_TIME_ZONE: PbsAwardTimeZoneInfo = {
  base: null,
  zoneId: "UTC",
  timezoneLabel: "UTC",
  fallback: true,
};

const addUtcDays = (date: Date, dayDelta: number): Date => {
  const nextDate = new Date(date);

  nextDate.setUTCDate(nextDate.getUTCDate() + dayDelta);
  return nextDate;
};

const validateSchemaName = (schemaName: string, label: string) => {
  if (!/^[a-z][a-z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid ${label}: ${schemaName}`);
  }

  return schemaName;
};

const buildPeriodRange = (rpStart: string | null, rpEnd: string | null): PeriodRange | null => {
  if (!rpStart || !rpEnd) return null;
  const startDate = new Date(`${rpStart.slice(0, 10)}T00:00:00.000Z`);
  const endDate = new Date(`${rpEnd.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return null;
  const nextDate = addUtcDays(endDate, 1);

  return {
    startIsoDate: startDate.toISOString().slice(0, 10),
    nextIsoDate: nextDate.toISOString().slice(0, 10),
    bufferStartIsoDate: addUtcDays(startDate, -2).toISOString().slice(0, 10),
    bufferNextIsoDate: addUtcDays(nextDate, 2).toISOString().slice(0, 10),
  };
};

const resolveAwardTimeZone = (period: {
  base: string | null;
  zoneId: string | null;
  timezoneLabel: string | null;
}): PbsAwardTimeZoneInfo => period.base && period.zoneId
  ? {
      base: period.base,
      zoneId: period.zoneId,
      timezoneLabel: period.timezoneLabel ?? `${period.base} Local Time`,
      fallback: false,
    }
  : DEFAULT_TIME_ZONE;

const loadRosterRows = async ({
  pgPool,
  schema,
  crewId,
  range,
}: {
  pgPool: Pool;
  schema: string;
  crewId: string;
  range: PeriodRange;
}): Promise<AwardRosterRow[]> => {
  const result = await pgPool.query<AwardRosterRow>(`
    select
      rp.id::text as publish_id,
      rp.roster_flight_id::text as roster_id,
      rp.crew_id::varchar as crew_id,
      rp.pairing_id::text as pairing_id,
      rp.pairing_label::varchar as pairing_label,
      rp.assignment_group::varchar as assignment_group,
      rp.assignment::varchar as assignment,
      rp.label::varchar as label,
      rp.flt_id::text as flt_id,
      rp.flt_dt::varchar as flt_dt,
      to_char(rp.sch_str_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start_utc,
      to_char(rp.sch_end_dt_utc, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as end_utc,
      rp.dep_arp::varchar as dep_arp,
      rp.arv_arp::varchar as arv_arp,
      rp.position::varchar as position,
      rp.flight_acting_rank::varchar as acting_rank,
      rp.active_rank::varchar as active_rank,
      rp.duty_seq::int as duty_seq,
      rp.seg_seq::int as seg_seq,
      rp.seq_order::int as seq_order,
      rp.sch_credited_minutes::text as sch_credit_minutes,
      rp.act_credited_minutes::text as act_credit_minutes,
      rp.tafb::text as tafb_days,
      coalesce(rp.pairing_base, rp.base)::varchar as base,
      rp.pairing_fleet::varchar as fleet,
      rp.fleet_seg::varchar as fleet_seg,
      rp.comments::varchar as comments,
      rp.source::varchar as source,
      rp.request_source::varchar as request_source,
      rp.request_id::text as request_id
    from ${schema}.roster_publish rp
    where rp.crew_id = $1
      and (
        (rp.sch_str_dt_utc >= $2::date and rp.sch_str_dt_utc < $3::date)
        or (
          rp.sch_str_dt_utc is null
          and rp.flt_dt::date >= $2::date
          and rp.flt_dt::date < $3::date
        )
      )
    order by
      coalesce(rp.sch_str_dt_utc, rp.flt_dt::timestamp) asc nulls last,
      rp.pairing_id asc nulls last,
      rp.roster_flight_id asc nulls last,
      rp.id asc
  `, [crewId, range.bufferStartIsoDate, range.bufferNextIsoDate]);

  return result.rows;
};

const loadAwardRows = async ({
  pgPool,
  pbsSchema,
  crewId,
  rosterPeriodId,
}: {
  pgPool: Pool;
  pbsSchema: string;
  crewId: string;
  rosterPeriodId: number;
}): Promise<AwardResultRow[]> => {
  const result = await pgPool.query<AwardResultRow>(`
    select
      ar.awarded_tier::text as awarded_tier,
      ar.status::varchar as status,
      ar.published_at::text as published_at,
      ai.item_type::varchar as item_type,
      ai.pairing_id::text as pairing_id,
      ai.date_off::text as date_off,
      ai.matched_tier::text as matched_tier,
      ai.rejection_reason::varchar as rejection_reason
    from ${pbsSchema}.pbs_award_result ar
    left join ${pbsSchema}.pbs_award_item ai
      on ai.award_result_id = ar.id
    where ar.crew_id = $1
      and ar.roster_period_id = $2
    order by ar.id desc, ai.id asc
  `, [crewId, rosterPeriodId]);

  return result.rows;
};

export const createPbsAwardResultsService = ({
  db,
  pgPool,
  liveSchema,
  pbsSchema,
}: CreatePbsAwardResultsServiceOptions): PbsAwardResultsService => {
  const schema = validateSchemaName(liveSchema, "live schema name");
  const pbsSchemaName = validateSchemaName(pbsSchema, "PBS schema name");
  const businessClock = createPbsBusinessClock({ db });

  const toPeriodSummary = (period: AwardPeriodContext): PbsAwardPeriodSummary => ({
    rosterPeriodId: period.id!,
    periodCode: period.periodCode,
    rpStart: period.rpStart!,
    rpEnd: period.rpEnd!,
    lifecycleStage: period.lifecycleStage,
    awardPublishAt: period.awardPublishAt!,
    awardFinalAt: period.awardFinalAt!,
    misAwardDeadlineAt: period.misAwardDeadlineAt!,
    firstPublishedAt: period.firstPublishedAt!,
    latestPublishedAt: period.latestPublishedAt!,
  });

  const toUpcomingPeriod = (period: AwardPeriodContext | null | undefined) => period?.id
    && period.rpStart
    && period.rpEnd
    ? {
        rosterPeriodId: period.id,
        periodCode: period.periodCode,
        rpStart: period.rpStart,
        rpEnd: period.rpEnd,
        lifecycleStage: period.lifecycleStage,
        awardPublishAt: period.awardPublishAt,
        awardFinalAt: period.awardFinalAt,
        misAwardDeadlineAt: period.misAwardDeadlineAt,
      }
    : null;

  const buildResponse = async (
    actor: LineholderDraftActor,
    period: AwardPeriodContext,
    upcomingPeriod: AwardPeriodContext | null,
  ): Promise<PbsAwardCurrentResponse> => {
    const range = buildPeriodRange(period.rpStart, period.rpEnd);
    const timeZone = resolveAwardTimeZone(period);
    const common = {
      rosterPeriodId: period.id,
      periodCode: period.periodCode,
      currentPeriod: period.currentPeriod,
      timeZone,
      availability: period.availability,
      lifecycleStage: period.lifecycleStage,
      upcomingPeriod: toUpcomingPeriod(upcomingPeriod),
      awardPublishAt: period.awardPublishAt,
      awardFinalAt: period.awardFinalAt,
      misAwardDeadlineAt: period.misAwardDeadlineAt,
      firstPublishedAt: period.firstPublishedAt,
      latestPublishedAt: period.latestPublishedAt,
      rpStart: period.rpStart,
      rpEnd: period.rpEnd,
    };

    if (!range || period.availability !== "AVAILABLE" || period.id === null) {
      return buildAwardCurrentResponse({ ...common, rosterRows: [], awardRows: [] });
    }

    const [rosterRows, awardRows] = await Promise.all([
      loadRosterRows({ pgPool, schema, crewId: actor.crewId, range }),
      loadAwardRows({
        pgPool,
        pbsSchema: pbsSchemaName,
        crewId: actor.crewId,
        rosterPeriodId: period.id,
      }),
    ]);

    return buildAwardCurrentResponse({ ...common, rosterRows, awardRows });
  };

  return {
    async getCurrentAward(actor: LineholderDraftActor) {
      const businessNow = await businessClock.getBusinessNow();
      const period = await resolveCurrentAwardPeriod({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
        businessNow,
      });
      const upcomingPeriod = period.availability === "AVAILABLE"
        ? period.upcomingPeriod ?? null
        : null;
      return buildResponse(actor, period, upcomingPeriod);
    },

    async getAwardPeriods(actor: LineholderDraftActor) {
      const businessNow = await businessClock.getBusinessNow();
      const resolution = await resolveCurrentAwardPeriod({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
        businessNow,
      });
      return { periods: (resolution.readablePeriods ?? []).map(toPeriodSummary) };
    },

    async getAwardByPeriodId(actor: LineholderDraftActor, rosterPeriodId: number) {
      const businessNow = await businessClock.getBusinessNow();
      const resolution = await resolveCurrentAwardPeriod({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
        businessNow,
      });
      const period = (resolution.allPeriods ?? []).find((candidate) => candidate.id === rosterPeriodId);
      if (!period) {
        throw new LineholderBidServiceError(404, "Award period not found.", "AWARD_PERIOD_NOT_FOUND");
      }
      if (period.availability !== "AVAILABLE") {
        throw new LineholderBidServiceError(
          409,
          "Award results are not available for this period.",
          "AWARD_PERIOD_NOT_AVAILABLE",
        );
      }
      return buildResponse(actor, period, null);
    },
  };
};
