import { asc, eq, or, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryResultRow } from "pg";
import type {
  PbsBiddingCalendarCurrentResponse,
  PbsBiddingCalendarDayOffCapacity,
  PbsBiddingCalendarEvent,
} from "../../../../packages/contracts/pbs-bidding-calendar.js";
import {
  expandPbsWeekendIntervals,
  type PbsPreferOffConfig,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import { pbsBidGroup, pbsBidPairingOccurrence, pbsBidProperty, pbsBidTier } from "../../models/index.js";
import {
  CURRENT_BID_CONTEXT,
  loadExistingBid,
  resolveCurrentPeriod,
  toPbsCurrentPeriod,
  type LineholderDraftActor,
} from "../lineholder/shared.js";
import {
  cloneLineholderPeriodContext,
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import { resolvePairingSearchActorBase } from "../pairing-search/actor-base.js";
import { loadPairingOccurrences } from "../pairing-search/pairing-occurrence-query.js";
import {
  buildPairingEvents,
  extractSpecificPairingIds,
  isAvoidPairingBidRow,
  SPECIFIC_PAIRING_PROPERTY_CODE,
  type DayOffDatesByTier,
  type PairingBidRow,
} from "./bidding-calendar-pairing-events.js";
import {
  buildPreferOffCalendarEvents,
  buildPreferOffDatesByTier,
  buildNonWeekendPreferOffDatesByTier,
  buildWeekendIntervalsByTier,
  extractPreferOffCalendarDates,
  loadPreferOffCalendarRows,
  type WeekendIntervalsByTier,
} from "./prefer-off-calendar-events.js";
import { loadPreferOffConfig } from "../days-off/prefer-off-config.js";
import type { PbsBiddingCalendarService } from "./types.js";
import type { PbsCache } from "../../utils/cache.js";
import { normalizePgDate } from "./bidding-calendar-date-utils.js";
import { validateSchemaName } from "../../utils/schema-identifier.js";

export {
  buildPairingEvents,
  extractSpecificPairingIds,
  findPairingDayOffConflicts,
  isAvoidPairingBidRow,
  occurrenceTouchesDates,
  type DayOffDatesByTier,
  type PairingDayOffConflict,
} from "./bidding-calendar-pairing-events.js";
export { listIsoDatesInRange, normalizePgDate } from "./bidding-calendar-date-utils.js";
export {
  buildPreferOffCalendarEvents,
  buildPreferOffDatesByTier,
  extractPreferOffCalendarDates,
  loadPreferOffCalendarRows,
  type PreferOffCalendarRow,
} from "./prefer-off-calendar-events.js";

type Database = ReturnType<typeof drizzle>;

type CreatePbsBiddingCalendarServiceOptions = {
  db: Database;
  pgPool: Pool;
  liveSchema: string;
  pbsSchema: string;
  cache?: PbsCache;
};

const CURRENT_PERIOD_CACHE_TTL_MS = 60_000;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = CURRENT_PERIOD_CACHE_TTL_MS / 1000;
const PLANNED_ABSENCE_SOURCE_CACHE_TTL_MS = 60_000;
const PLANNED_ABSENCE_UNAVAILABLE_WARNING = "Planned absence source is not available to PBS yet; roster events were skipped.";
export const DAY_OFF_CAPACITY_CONTEXT_WARNING = "Days off capacity is unavailable because the current crew base, division, or timezone is missing.";
export const DAY_OFF_CAPACITY_UNAVAILABLE_WARNING = "Days off capacity is unavailable because live coverage data could not be loaded.";
const MAX_LINEHOLDER_TIER = 7;

const EVENT_TYPE_SORT_ORDER = new Map([
  ["weekend", 0],
  ["planned_absence", 1],
  ["pairing_bid", 2],
  ["prefer_off_bid", 3],
]);

const buildActiveTierRange = () =>
  Array.from({ length: MAX_LINEHOLDER_TIER }, (_, index) => `T${index + 1}`);

type DayOffCapacitySqlRow = QueryResultRow & {
  capacity_date: string | Date | null;
  base_code: string | null;
  division_code: string | null;
  zone_id: string | null;
  total_crew_count: number | string | null;
  pairing_demand_count: number | string | null;
  reserve_demand_count: number | string | null;
  pre_assigned_day_off_count: number | string | null;
  max_days_off_count: number | string | null;
};

type RequestedDayOffSqlRow = QueryResultRow & {
  source_kind: "group" | "date";
  crew_id: string | null;
  operator: string | null;
  param_a: string | null;
  param_b: string | null;
  bid_date: string | Date | null;
};

type DayOffCapacityLoadResult = {
  days: PbsBiddingCalendarDayOffCapacity[];
  warnings: string[];
};

const toCapacityInteger = (value: number | string | null | undefined): number => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);

  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
};

const hasDayOffCapacityContext = (row: DayOffCapacitySqlRow | undefined): boolean =>
  Boolean(row?.base_code?.trim() && row.division_code?.trim() && row.zone_id?.trim());

const addRequestedDayOffDate = (
  crewIdsByDate: Map<string, Set<string>>,
  crewId: string | null | undefined,
  date: string | null | undefined,
  rangeStart: string,
  rangeEnd: string,
): void => {
  const normalizedCrewId = crewId?.trim();

  if (!normalizedCrewId || !date || date < rangeStart || date > rangeEnd) {
    return;
  }

  const crewIds = crewIdsByDate.get(date) ?? new Set<string>();

  crewIds.add(normalizedCrewId);
  crewIdsByDate.set(date, crewIds);
};

const loadRequestedDayOffCountsByDate = async ({
  pgPool,
  liveSchemaName,
  pbsSchemaName,
  actor,
  rosterPeriodId,
  rangeStart,
  rangeEnd,
  preferOffConfig,
}: {
  pgPool: Pick<Pool, "query">;
  liveSchemaName: string;
  pbsSchemaName: string;
  actor: LineholderDraftActor;
  rosterPeriodId: number;
  rangeStart: string;
  rangeEnd: string;
  preferOffConfig: PbsPreferOffConfig;
}): Promise<Map<string, number>> => {
  const requestedDayOffResult = await pgPool.query<RequestedDayOffSqlRow>(`
    with actor_identity as (
      select
        $1::date as range_start,
        $2::date as range_end,
        $3::varchar as crew_id,
        $4::varchar as user_code
    ),
    actor_scope as (
      select
        nullif(btrim(actor_crew_base.base), '')::varchar as base_code,
        nullif(btrim(pbs_user.division), '')::varchar as division_code
      from actor_identity
      left join ${pbsSchemaName}.pbs_user pbs_user
        on pbs_user.crew_id = actor_identity.crew_id
        and pbs_user.user_code = actor_identity.user_code
      left join lateral (
        select cb.base
        from ${liveSchemaName}.crew_base cb
        where cb.crew_id = actor_identity.crew_id
          and cb.is_prime_base = 1
          and cb.eff_dt <= now()
          and (cb.exp_dt is null or cb.exp_dt > now())
        order by cb.eff_dt desc, cb.id desc
        limit 1
      ) actor_crew_base on true
      order by pbs_user.id asc nulls last
      limit 1
    ),
    scoped_bids as (
      select distinct
        bid.id,
        bid.crew_id
      from actor_scope
      join ${pbsSchemaName}.pbs_bid bid
        on actor_scope.base_code is not null
        and actor_scope.division_code is not null
        and bid.roster_period_id = $5::bigint
        and bid.bid_context = 'Current'
        and upper(btrim(bid.status)) in ('DRAFT', 'SUBMITTED', 'LOCKED')
      join ${liveSchemaName}.crew crew
        on crew.crew_id = bid.crew_id
        and upper(btrim(crew.division)) = upper(actor_scope.division_code)
        and crew.status = 0
      join lateral (
        select cb.base
        from ${liveSchemaName}.crew_base cb
        where cb.crew_id = bid.crew_id
          and cb.is_prime_base = 1
          and cb.eff_dt <= now()
          and (cb.exp_dt is null or cb.exp_dt > now())
        order by cb.eff_dt desc, cb.id desc
        limit 1
      ) crew_base on upper(btrim(crew_base.base)) = upper(actor_scope.base_code)
    )
    select
      'group'::varchar as source_kind,
      scoped_bids.crew_id::varchar as crew_id,
      bid_group.operator::varchar as operator,
      bid_group.param_a::varchar as param_a,
      bid_group.param_b::varchar as param_b,
      null::varchar as bid_date
    from scoped_bids
    join ${pbsSchemaName}.pbs_bid_group bid_group
      on bid_group.bid_id = scoped_bids.id
      and bid_group.bid_type = 'DaysOff'
    left join ${pbsSchemaName}.pbs_bid_property bid_property
      on bid_property.id = bid_group.property_definition_id
    where bid_group.property_id = 201
      or bid_property.property_code = 201

    union all

    select
      'date'::varchar as source_kind,
      scoped_bids.crew_id::varchar as crew_id,
      null::varchar as operator,
      null::varchar as param_a,
      null::varchar as param_b,
      day_off.bid_date::text as bid_date
    from scoped_bids
    join ${pbsSchemaName}.pbs_bid_day_off day_off
      on day_off.bid_id = scoped_bids.id
      and day_off.bid_date between $1::date and $2::date
      and upper(btrim(day_off.request_type)) = 'DAY_OFF'
  `, [
    rangeStart,
    rangeEnd,
    actor.crewId,
    actor.userCode,
    rosterPeriodId,
  ]);
  const crewIdsByDate = new Map<string, Set<string>>();

  for (const row of requestedDayOffResult.rows) {
    if (row.source_kind === "group") {
      for (const date of extractPreferOffCalendarDates({
        operator: row.operator,
        paramA: row.param_a,
        paramB: row.param_b,
      }, rangeStart, rangeEnd, preferOffConfig)) {
        addRequestedDayOffDate(crewIdsByDate, row.crew_id, date, rangeStart, rangeEnd);
      }

      continue;
    }

    addRequestedDayOffDate(
      crewIdsByDate,
      row.crew_id,
      normalizePgDate(row.bid_date),
      rangeStart,
      rangeEnd,
    );
  }

  return new Map(
    Array.from(crewIdsByDate.entries()).map(([date, crewIds]) => [date, crewIds.size] as const),
  );
};

export const loadDayOffCapacityRows = async ({
  pgPool,
  schema,
  pbsSchema,
  actor,
  rosterPeriodId,
  rangeStart,
  rangeEnd,
  preferOffConfig,
}: {
  pgPool: Pick<Pool, "query">;
  schema: string;
  pbsSchema: string;
  actor: LineholderDraftActor;
  rosterPeriodId: number;
  rangeStart: string;
  rangeEnd: string;
  preferOffConfig: PbsPreferOffConfig;
}): Promise<DayOffCapacityLoadResult> => {
  const liveSchemaName = validateSchemaName(schema, "live schema name");
  const pbsSchemaName = validateSchemaName(pbsSchema, "PBS schema name");
  const [capacityResult, requestedDayOffCountsByDate] = await Promise.all([
    pgPool.query<DayOffCapacitySqlRow>(`
    with calendar as (
      select generate_series($1::date, $2::date, interval '1 day')::date as capacity_date
    ),
    actor_identity as (
      select
        $3::varchar as crew_id,
        $4::varchar as user_code
    ),
    actor_scope as (
      select
        nullif(btrim(crew_base.base), '')::varchar as base_code,
        nullif(btrim(pbs_user.division), '')::varchar as division_code,
        nullif(btrim(base_airport.zone_id), '')::varchar as zone_id
      from actor_identity
      left join ${pbsSchemaName}.pbs_user pbs_user
        on pbs_user.crew_id = actor_identity.crew_id
        and pbs_user.user_code = actor_identity.user_code
      left join lateral (
        select cb.base
        from ${liveSchemaName}.crew_base cb
        where cb.crew_id = actor_identity.crew_id
          and cb.is_prime_base = 1
          and cb.eff_dt <= now()
          and (cb.exp_dt is null or cb.exp_dt > now())
        order by cb.eff_dt desc, cb.id desc
        limit 1
      ) crew_base on true
      left join ${liveSchemaName}.airport base_airport
        on upper(btrim(base_airport.airport)) = upper(btrim(crew_base.base))
      order by pbs_user.id asc nulls last
      limit 1
    ),
    reserve_call_codes as (
      select distinct upper(coalesce(nullif(btrim(code_value), ''), nullif(btrim(code), '')))::varchar as code
      from ${liveSchemaName}.dictionary
      where parent_code = 'RES_CALL_TYPE'
        and coalesce(nullif(btrim(code_value), ''), nullif(btrim(code), '')) is not null
    ),
    active_crew_by_day as (
      select distinct
        calendar.capacity_date,
        crew.crew_id
      from calendar
      cross join actor_scope
      join ${liveSchemaName}.crew_base crew_base
        on actor_scope.base_code is not null
        and actor_scope.division_code is not null
        and upper(btrim(crew_base.base)) = upper(actor_scope.base_code)
        and crew_base.is_prime_base = 1
        and crew_base.eff_dt < (calendar.capacity_date + interval '1 day')
        and (crew_base.exp_dt is null or crew_base.exp_dt >= calendar.capacity_date)
      join ${liveSchemaName}.crew crew
        on crew.crew_id = crew_base.crew_id
        and upper(btrim(crew.division)) = upper(actor_scope.division_code)
        and crew.status = 0
        and crew.empl_dt < (calendar.capacity_date + interval '1 day')
        and (crew.term_dt is null or crew.term_dt >= calendar.capacity_date)
        and (crew.retire_dt is null or crew.retire_dt >= calendar.capacity_date)
    ),
    total_crew_by_day as (
      select
        capacity_date,
        count(distinct crew_id)::int as total_crew_count
      from active_crew_by_day
      group by capacity_date
    ),
    pairing_windows as (
      select
        p.id,
        greatest((p.sch_str_dt_utc at time zone actor_scope.zone_id)::date, $1::date) as start_date,
        least((p.sch_end_dt_utc at time zone actor_scope.zone_id)::date, $2::date) as end_date,
        (
          upper(btrim(p.assignment_group)) = 'RES'
          or upper(btrim(p.assignment)) in (select code from reserve_call_codes)
        ) as is_reserve
      from actor_scope
      join ${liveSchemaName}.pairing p
        on actor_scope.base_code is not null
        and actor_scope.division_code is not null
        and actor_scope.zone_id is not null
        and upper(btrim(p.base)) = upper(actor_scope.base_code)
        and upper(btrim(p.division)) = upper(actor_scope.division_code)
        and p.is_deleted = 0
        and p.sch_str_dt_utc < (($2::date + interval '2 days')::timestamp at time zone actor_scope.zone_id)
        and p.sch_end_dt_utc >= (($1::date - interval '1 day')::timestamp at time zone actor_scope.zone_id)
        and (p.sch_str_dt_utc at time zone actor_scope.zone_id)::date <= $2::date
        and (p.sch_end_dt_utc at time zone actor_scope.zone_id)::date >= $1::date
    ),
    pairing_days as (
      select
        pairing_windows.id,
        generated_day.capacity_date,
        pairing_windows.is_reserve
      from pairing_windows
      cross join lateral generate_series(
        pairing_windows.start_date,
        pairing_windows.end_date,
        interval '1 day'
      ) generated_day(capacity_date)
      where pairing_windows.start_date <= pairing_windows.end_date
    ),
    demand_by_pairing_day as (
      select
        pairing_days.capacity_date::date as capacity_date,
        pairing_days.is_reserve,
        coalesce(sum(coalesce(pairing_composition.plan, 0)), 0)::int as demand_count
      from pairing_days
      join ${liveSchemaName}.pairing_composition pairing_composition
        on pairing_composition.pairing_id = pairing_days.id
        and pairing_composition.is_deleted = 0
      group by pairing_days.capacity_date, pairing_days.is_reserve
    ),
    demand_by_day as (
      select
        capacity_date,
        coalesce(sum(demand_count) filter (where not is_reserve), 0)::int as pairing_demand_count,
        coalesce(sum(demand_count) filter (where is_reserve), 0)::int as reserve_demand_count
      from demand_by_pairing_day
      group by capacity_date
    ),
    active_crew_ids as (
      select distinct crew_id
      from active_crew_by_day
    ),
    pre_assigned_day_off_windows as (
      select distinct
        roster_flight.crew_id,
        roster_flight.sch_str_dt_utc,
        coalesce(roster_flight.sch_end_dt_utc, roster_flight.sch_str_dt_utc) as sch_end_dt_utc
      from actor_scope
      join ${liveSchemaName}.roster_flight roster_flight
        on actor_scope.zone_id is not null
        and roster_flight.is_deleted = 0
        and roster_flight.source = 'IMP'
        and roster_flight.assignment = 'DO'
        and roster_flight.sch_str_dt_utc < (($2::date + interval '1 day')::timestamp at time zone actor_scope.zone_id)
        and coalesce(roster_flight.sch_end_dt_utc, roster_flight.sch_str_dt_utc) >= ($1::date::timestamp at time zone actor_scope.zone_id)
      join active_crew_ids active_crew
        on active_crew.crew_id = roster_flight.crew_id
    ),
    pre_assigned_day_off_by_day as (
      select
        calendar.capacity_date,
        count(distinct pre_assigned_day_off_windows.crew_id)::int as pre_assigned_day_off_count
      from calendar
      cross join actor_scope
      join pre_assigned_day_off_windows
        on pre_assigned_day_off_windows.sch_str_dt_utc < ((calendar.capacity_date + interval '1 day')::timestamp at time zone actor_scope.zone_id)
        and pre_assigned_day_off_windows.sch_end_dt_utc >= (calendar.capacity_date::timestamp at time zone actor_scope.zone_id)
      join active_crew_by_day active_crew
        on active_crew.capacity_date = calendar.capacity_date
        and active_crew.crew_id = pre_assigned_day_off_windows.crew_id
      group by calendar.capacity_date
    )
    select
      calendar.capacity_date::text as capacity_date,
      actor_scope.base_code,
      actor_scope.division_code,
      actor_scope.zone_id,
      coalesce(total_crew_by_day.total_crew_count, 0)::int as total_crew_count,
      coalesce(demand_by_day.pairing_demand_count, 0)::int as pairing_demand_count,
      coalesce(demand_by_day.reserve_demand_count, 0)::int as reserve_demand_count,
      coalesce(pre_assigned_day_off_by_day.pre_assigned_day_off_count, 0)::int as pre_assigned_day_off_count,
      greatest(
        coalesce(total_crew_by_day.total_crew_count, 0)
        - coalesce(demand_by_day.pairing_demand_count, 0)
        - coalesce(demand_by_day.reserve_demand_count, 0)
        - coalesce(pre_assigned_day_off_by_day.pre_assigned_day_off_count, 0),
        0
      )::int as max_days_off_count
    from calendar
    cross join actor_scope
    left join total_crew_by_day on total_crew_by_day.capacity_date = calendar.capacity_date
    left join demand_by_day on demand_by_day.capacity_date = calendar.capacity_date
    left join pre_assigned_day_off_by_day on pre_assigned_day_off_by_day.capacity_date = calendar.capacity_date
    order by calendar.capacity_date
  `, [
      rangeStart,
      rangeEnd,
      actor.crewId,
      actor.userCode,
    ]),
    loadRequestedDayOffCountsByDate({
      pgPool,
      liveSchemaName,
      pbsSchemaName,
      actor,
      rosterPeriodId,
      rangeStart,
      rangeEnd,
      preferOffConfig,
    }),
  ]);

  if (!hasDayOffCapacityContext(capacityResult.rows[0])) {
    return {
      days: [],
      warnings: [DAY_OFF_CAPACITY_CONTEXT_WARNING],
    };
  }

  return {
    days: capacityResult.rows.map((row) => {
      const date = normalizePgDate(row.capacity_date) ?? "";

      return {
        date,
        requestedDayOffCount: requestedDayOffCountsByDate.get(date) ?? 0,
        totalCrewCount: toCapacityInteger(row.total_crew_count),
        pairingDemandCount: toCapacityInteger(row.pairing_demand_count),
        reserveDemandCount: toCapacityInteger(row.reserve_demand_count),
        preAssignedDayOffCount: toCapacityInteger(row.pre_assigned_day_off_count),
        maxDaysOffCount: toCapacityInteger(row.max_days_off_count),
      };
    }).filter((day) => day.date !== ""),
    warnings: [],
  };
};

export const loadSafeDayOffCapacityRows = async (
  options: Parameters<typeof loadDayOffCapacityRows>[0],
): Promise<DayOffCapacityLoadResult> => {
  try {
    return await loadDayOffCapacityRows(options);
  } catch {
    return {
      days: [],
      warnings: [DAY_OFF_CAPACITY_UNAVAILABLE_WARNING],
    };
  }
};

export const buildWeekendEvents = (
  rpStartLocal: string,
  rpEndLocal: string,
  preferOffConfig: PbsPreferOffConfig,
): PbsBiddingCalendarEvent[] =>
  expandPbsWeekendIntervals(rpStartLocal, rpEndLocal, preferOffConfig).map((interval) => ({
      id: `weekend-${interval.anchorDate}`,
      type: "weekend",
      label: "Weekend",
      startDate: interval.dates[0],
      endDate: interval.dates.at(-1)!,
      tone: "muted",
      source: "computed",
      readonly: true,
      metadata: {
        anchorDate: interval.anchorDate,
        startTime: interval.startTime,
        endBoundaryDate: interval.endDate,
        endTime: interval.endTime,
      },
    }));

export const loadSpecificPairingBidRows = async (
  db: Pick<Database, "select">,
  bidId: number,
): Promise<PairingBidRow[]> => {
  const [groupRows, occurrenceRows] = await Promise.all([
    db
      .select({
        propertyGroupKey: pbsBidGroup.propertyGroupKey,
        groupSeq: pbsBidGroup.groupSeq,
        tier: pbsBidTier.tier,
        actionId: pbsBidGroup.actionId,
        operator: pbsBidGroup.operator,
        paramA: pbsBidGroup.paramA,
        paramB: pbsBidGroup.paramB,
        paramC: pbsBidGroup.paramC,
      })
      .from(pbsBidGroup)
      .innerJoin(pbsBidTier, eq(pbsBidGroup.tierId, pbsBidTier.id))
      .leftJoin(pbsBidProperty, eq(pbsBidGroup.propertyDefinitionId, pbsBidProperty.id))
      .where(and(
        eq(pbsBidGroup.bidId, bidId),
        eq(pbsBidGroup.bidType, "Pairing"),
        or(
          eq(pbsBidGroup.legacyPropertyCode, SPECIFIC_PAIRING_PROPERTY_CODE),
          eq(pbsBidProperty.propertyCode, SPECIFIC_PAIRING_PROPERTY_CODE),
        ),
      ))
      .orderBy(asc(pbsBidGroup.groupSeq), asc(pbsBidTier.tier)),
    db
      .select({
        propertyGroupKey: pbsBidPairingOccurrence.propertyGroupKey,
        tier: pbsBidPairingOccurrence.tier,
        pairingNumber: pbsBidPairingOccurrence.pairingNumber,
        originDate: pbsBidPairingOccurrence.originDate,
        pairingId: pbsBidPairingOccurrence.pairingId,
      })
      .from(pbsBidPairingOccurrence)
      .where(and(
        eq(pbsBidPairingOccurrence.bidId, bidId),
        eq(pbsBidPairingOccurrence.isDeleted, 0),
      ))
      .orderBy(
        asc(pbsBidPairingOccurrence.propertyGroupKey),
        asc(pbsBidPairingOccurrence.tier),
        asc(pbsBidPairingOccurrence.originDate),
        asc(pbsBidPairingOccurrence.pairingId),
      ),
  ]);
  const occurrenceRowsByGroupTier = new Map<string, typeof occurrenceRows>();

  for (const occurrenceRow of occurrenceRows) {
    const key = `${occurrenceRow.propertyGroupKey}:${occurrenceRow.tier}`;
    const rows = occurrenceRowsByGroupTier.get(key) ?? [];

    rows.push(occurrenceRow);
    occurrenceRowsByGroupTier.set(key, rows);
  }

  return groupRows.flatMap((row) => {
    const occurrenceRowsForGroup = (occurrenceRowsByGroupTier.get(`${row.propertyGroupKey}:${row.tier}`) ?? [])
      .filter((occurrenceRow) => occurrenceRow.pairingId?.trim());

    if (occurrenceRowsForGroup.length === 0) {
      return [row];
    }

    return occurrenceRowsForGroup.map((occurrenceRow) => ({
      ...row,
      operator: "In",
      paramA: occurrenceRow.pairingId,
      paramB: occurrenceRow.originDate,
    }));
  });
};

export const loadPairingEvents = async (
  db: Database,
  pgPool: Pool,
  schema: string,
  bidId: number,
  rpStartLocal: string,
  rpEndLocal: string,
  dayOffDatesByTier: DayOffDatesByTier,
  resolveActorBase: () => Promise<string>,
  weekendIntervalsByTier: WeekendIntervalsByTier = new Map(),
  nonWeekendDatesByTier: DayOffDatesByTier = new Map(),
) => {
  const bidRows = (await loadSpecificPairingBidRows(db, bidId))
    .filter((row) => !isAvoidPairingBidRow(row));
  const requestedPairingIds = bidRows.flatMap(extractSpecificPairingIds);

  if (requestedPairingIds.length === 0) {
    return {
      events: [] as PbsBiddingCalendarEvent[],
      warnings: [] as string[],
    };
  }

  const actorBase = await resolveActorBase();
  const occurrencesByPairingId = await loadPairingOccurrences({
    pgPool,
    schema,
    pairingIds: requestedPairingIds,
    periodStartDate: rpStartLocal,
    periodEndDate: rpEndLocal,
    actorBase,
  });
  const pairingResult = buildPairingEvents(
    bidRows,
    occurrencesByPairingId,
    dayOffDatesByTier,
    weekendIntervalsByTier,
    nonWeekendDatesByTier,
  );
  const warnings = pairingResult.missingPairingIds.length > 0
    ? [`Specific pairing bids skipped because pairing data was not found: ${pairingResult.missingPairingIds.join(", ")}.`]
    : [];

  return {
    events: pairingResult.events,
    warnings,
  };
};

export const createPlannedAbsenceEventsLoader = (
  pgPool: Pick<Pool, "query">,
  schema: string,
  options: {
    nowMs?: () => number;
    ttlMs?: number;
  } = {},
) => {
  const nowMs = options.nowMs ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? PLANNED_ABSENCE_SOURCE_CACHE_TTL_MS;
  let cacheExpiresAt = 0;
  let cachedResult: {
    events: PbsBiddingCalendarEvent[];
    warnings: string[];
  } | null = null;

  return async () => {
    if (cachedResult && cacheExpiresAt > nowMs()) {
      return cachedResult;
    }

    try {
      await pgPool.query(`select 1 from ${schema}.roster_flight where false`);
      cachedResult = {
        events: [],
        warnings: [],
      };
      cacheExpiresAt = nowMs() + ttlMs;

      return cachedResult;
    } catch {
      cachedResult = {
        events: [],
        warnings: [PLANNED_ABSENCE_UNAVAILABLE_WARNING],
      };
      cacheExpiresAt = nowMs() + ttlMs;

      return cachedResult;
    }
  };
};

const sortEvents = (events: PbsBiddingCalendarEvent[]) =>
  [...events].sort((left, right) => {
    const dateCompare = left.startDate.localeCompare(right.startDate);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    const leftTypeOrder = EVENT_TYPE_SORT_ORDER.get(left.type) ?? 99;
    const rightTypeOrder = EVENT_TYPE_SORT_ORDER.get(right.type) ?? 99;

    if (leftTypeOrder !== rightTypeOrder) {
      return leftTypeOrder - rightTypeOrder;
    }

    return left.id.localeCompare(right.id);
  });

export const createPbsBiddingCalendarService = ({
  db,
  pgPool,
  liveSchema,
  pbsSchema,
  cache,
}: CreatePbsBiddingCalendarServiceOptions): PbsBiddingCalendarService => {
  const schema = validateSchemaName(liveSchema, "live schema name");
  const pbsSchemaName = validateSchemaName(pbsSchema, "PBS schema name");
  const businessClock = createPbsBusinessClock({ db });
  const loadPlannedAbsenceEvents = createPlannedAbsenceEventsLoader(pgPool, schema);
  let currentPeriodCache: {
    crewId: string;
    expiresAt: number;
    value: Awaited<ReturnType<typeof resolveCurrentPeriod>>;
  } | null = null;

  const getCurrentPeriod = async (actor: LineholderDraftActor): Promise<Awaited<ReturnType<typeof resolveCurrentPeriod>>> => {
    if (cache) {
      const period = await cache.getOrSet(
        cache.key("period", "current", "v3", actor.crewId),
        CURRENT_PERIOD_CACHE_TTL_SECONDS,
        async () => resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow()),
        {
          serialize: serializeLineholderPeriodContext,
          deserialize: deserializeLineholderPeriodContext,
        },
      );

      return cloneLineholderPeriodContext(period);
    }

    const now = Date.now();
    if (currentPeriodCache?.crewId === actor.crewId && currentPeriodCache.expiresAt > now) {
      return cloneLineholderPeriodContext(currentPeriodCache.value);
    }

    const period = await resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
    currentPeriodCache = {
      crewId: actor.crewId,
      expiresAt: now + CURRENT_PERIOD_CACHE_TTL_MS,
      value: cloneLineholderPeriodContext(period),
    };

    return cloneLineholderPeriodContext(period);
  };
  const resolveActorBase = (actor: LineholderDraftActor) =>
    resolvePairingSearchActorBase({
      pgPool,
      schema,
      pbsSchema: pbsSchemaName,
      actor,
    });

  return {
    async getCurrentCalendar(actor): Promise<PbsBiddingCalendarCurrentResponse> {
      const period = await getCurrentPeriod(actor);
      const [existingBid, preferOffConfig] = await Promise.all([
        loadExistingBid(db, actor, period),
        loadPreferOffConfig(db),
      ]);
      const weekendEvents = buildWeekendEvents(period.rpStartLocal, period.rpEndLocal, preferOffConfig);
      const warnings: string[] = [];

      if (!existingBid) {
        const [plannedAbsenceResult, dayOffCapacityResult] = await Promise.all([
          loadPlannedAbsenceEvents(),
          loadSafeDayOffCapacityRows({
            pgPool,
            schema,
            pbsSchema: pbsSchemaName,
            actor,
            rosterPeriodId: period.rosterPeriodId,
            rangeStart: period.rpStartLocal,
            rangeEnd: period.rpEndLocal,
            preferOffConfig,
          }),
        ]);
        warnings.push(...plannedAbsenceResult.warnings, ...dayOffCapacityResult.warnings);

        return {
          currentPeriod: toPbsCurrentPeriod(period),
          periodCode: period.periodCode,
          bidContext: CURRENT_BID_CONTEXT,
          activeTierRange: buildActiveTierRange(),
          events: sortEvents([...weekendEvents, ...plannedAbsenceResult.events]),
          dayOffCapacity: dayOffCapacityResult.days,
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }

      const preferOffRowsPromise = loadPreferOffCalendarRows(db, existingBid.id);
      const plannedAbsenceResultPromise = loadPlannedAbsenceEvents();
      const dayOffCapacityResultPromise = loadSafeDayOffCapacityRows({
        pgPool,
        schema,
        pbsSchema: pbsSchemaName,
        actor,
        rosterPeriodId: period.rosterPeriodId,
        rangeStart: period.rpStartLocal,
        rangeEnd: period.rpEndLocal,
        preferOffConfig,
      });
      const preferOffRows = await preferOffRowsPromise;
      const dayOffDatesByTier = buildPreferOffDatesByTier(
        preferOffRows,
        period.rpStartLocal,
        period.rpEndLocal,
        preferOffConfig,
      );
      const weekendIntervalsByTier = buildWeekendIntervalsByTier(
        preferOffRows,
        period.rpStartLocal,
        period.rpEndLocal,
        preferOffConfig,
      );
      const nonWeekendDatesByTier = buildNonWeekendPreferOffDatesByTier(
        preferOffRows,
        period.rpStartLocal,
        period.rpEndLocal,
        preferOffConfig,
      );
      const dayOffEvents = buildPreferOffCalendarEvents(
        preferOffRows,
        period.rpStartLocal,
        period.rpEndLocal,
        preferOffConfig,
      );
      const pairingResultPromise = loadPairingEvents(
        db,
        pgPool,
        schema,
        existingBid.id,
        period.rpStartLocal,
        period.rpEndLocal,
        dayOffDatesByTier,
        () => resolveActorBase(actor),
        weekendIntervalsByTier,
        nonWeekendDatesByTier,
      );
      const [plannedAbsenceResult, dayOffCapacityResult, pairingResult] = await Promise.all([
        plannedAbsenceResultPromise,
        dayOffCapacityResultPromise,
        pairingResultPromise,
      ]);

      warnings.push(...pairingResult.warnings, ...plannedAbsenceResult.warnings, ...dayOffCapacityResult.warnings);

      return {
        currentPeriod: toPbsCurrentPeriod(period),
        periodCode: existingBid.periodCode,
        bidContext: CURRENT_BID_CONTEXT,
        activeTierRange: buildActiveTierRange(),
        events: sortEvents([
          ...weekendEvents,
          ...plannedAbsenceResult.events,
          ...pairingResult.events,
          ...dayOffEvents,
        ]),
        dayOffCapacity: dayOffCapacityResult.days,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    },
  };
};
