import {
  type PbsPairingBidQuantifier,
  type PbsPairingBidValue,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  isDateInPairingSearchPeriod,
  type PairingSearchConditionContext,
} from "./pairing-search-condition-context.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import {
  buildCompareClause,
  buildDurationCompareClause,
  buildFleetPatterns,
  normalizeAirportCodes,
  parseDurationToMinutes,
  parsePercentToNumber,
} from "./pairing-search-condition-shared.js";
import { buildDateOrDowPreviewCondition } from "./pairing-search-date-or-dow-condition.js";
import { buildUtcTimestampToLocalDateExpression } from "./pairing-local-date-sql.js";
import { buildRedeyePairingWindowCondition } from "./pairing-search-redeye-condition.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

const normalizeCrewIds = (values: string[]) =>
  Array.from(
    new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean)),
  );

const normalizeFlightNumbers = (values: string[]) =>
  Array.from(
    new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean)),
  );

type AirportPreferenceBid = Extract<
  PbsPairingBidValue,
  { type: "airport-preference" }
>;
type FlightLegsPerDutyBid = Extract<
  PbsPairingBidValue,
  { type: "flight-legs-per-duty" }
>;
type RedeyePreferenceBid = Extract<
  PbsPairingBidValue,
  { type: "redeye-preference" }
>;
type WorkDayPreferenceBid = Extract<
  PbsPairingBidValue,
  { type: "work-day-preference" }
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO_WEEKDAY_BY_CODE = new Map([
  ["MON", 1],
  ["TUE", 2],
  ["WED", 3],
  ["THU", 4],
  ["FRI", 5],
  ["SAT", 6],
  ["SUN", 7],
]);

const buildWorkDayPreferenceCondition = (
  bid: WorkDayPreferenceBid,
  propertyName: string,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
) => {
  if (
    bid.days.length === 0 ||
    bid.days.some(
      (day) =>
        (day.checkInFrom != null && !TIME_OF_DAY_PATTERN.test(day.checkInFrom)) ||
        (day.checkInTo != null && !TIME_OF_DAY_PATTERN.test(day.checkInTo)) ||
        (day.checkInFrom != null && day.checkInTo != null && day.checkInFrom === day.checkInTo),
    )
  ) {
    return "false";
  }

  const dateScope = bid.dateScope;
  const dateClause = !dateScope
    ? null
    : dateScope.mode === "specific_dates"
      ? dateScope.dates.length > 0 &&
        dateScope.dates.every((date) => ISO_DATE_PATTERN.test(date))
        ? `work_day_events.event_date = any(${sqlBuilder.addParam(dateScope.dates)}::date[])`
        : null
      : ISO_DATE_PATTERN.test(dateScope.from) &&
          ISO_DATE_PATTERN.test(dateScope.to) &&
          dateScope.from <= dateScope.to
        ? `work_day_events.event_date between ${sqlBuilder.addParam(dateScope.from)}::date and ${sqlBuilder.addParam(dateScope.to)}::date`
        : null;

  if (dateScope && !dateClause) {
    throw new LineholderBidServiceError(
      400,
      `Invalid event date scope for ${propertyName}.`,
    );
  }

  const dayClauses = bid.days.flatMap((day) => {
    const isoWeekday = ISO_WEEKDAY_BY_CODE.get(day.dayOfWeek);
    if (!isoWeekday) return [];

    const weekdayClause = `extract(isodow from work_day_events.event_date) = ${isoWeekday}`;
    if (day.checkInFrom && day.checkInTo) {
      const from = sqlBuilder.addParam(day.checkInFrom);
      const to = sqlBuilder.addParam(day.checkInTo);
      const timeClause =
        day.checkInFrom <= day.checkInTo
          ? `work_day_events.event_time between ${from}::time and ${to}::time`
          : `(work_day_events.event_time >= ${from}::time or work_day_events.event_time <= ${to}::time)`;
      return [`(${weekdayClause} and ${timeClause})`];
    }

    if (day.checkInFrom) {
      return [`(${weekdayClause} and work_day_events.event_time >= ${sqlBuilder.addParam(day.checkInFrom)}::time)`];
    }

    if (day.checkInTo) {
      return [`(${weekdayClause} and work_day_events.event_time <= ${sqlBuilder.addParam(day.checkInTo)}::time)`];
    }

    return [`(${weekdayClause})`];
  });

  if (dayClauses.length === 0) {
    throw new LineholderBidServiceError(
      400,
      `Missing work days for ${propertyName}.`,
    );
  }

  return `
    exists (
      select 1
      from (
        select distinct on (event_segment.pairing_id, event_segment.duty_seq)
          event_segment.duty_seq,
          (((event_segment.brief_start_utc at time zone 'UTC') at time zone coalesce(valid_timezone.name, 'UTC'))::date) as event_date,
          (((event_segment.brief_start_utc at time zone 'UTC') at time zone coalesce(valid_timezone.name, 'UTC'))::time) as event_time
        from ${liveSchema}.pairing_segment event_segment
        left join ${liveSchema}.airport event_airport
          on event_airport.airport = event_segment.dep_arp
        left join pg_timezone_names valid_timezone
          on valid_timezone.name = nullif(btrim(event_airport.zone_id), '')
        where event_segment.pairing_id = p.id
          and event_segment.is_deleted = 0
          and event_segment.brief_start_utc is not null
        order by event_segment.pairing_id, event_segment.duty_seq,
          event_segment.brief_start_utc, event_segment.seg_seq, event_segment.id
      ) work_day_events
      where ${dateClause ? `${dateClause} and ` : ""}(${dayClauses.join(" or ")})
    )
  `;
};

const buildFlightLegsDateClause = (
  bid: FlightLegsPerDutyBid,
  sqlBuilder: PairingSearchSqlBuilder,
  propertyName: string,
) => {
  if (!bid.dateScope) {
    return null;
  }

  if (bid.dateScope.mode === "specific_dates") {
    if (
      bid.dateScope.dates.length === 0 ||
      bid.dateScope.dates.some((date) => !ISO_DATE_PATTERN.test(date))
    ) {
      throw new LineholderBidServiceError(
        400,
        `Invalid event dates for ${propertyName}.`,
      );
    }

    return `duty_counts.event_date = any(${sqlBuilder.addParam(bid.dateScope.dates)}::date[])`;
  }

  if (
    !ISO_DATE_PATTERN.test(bid.dateScope.from) ||
    !ISO_DATE_PATTERN.test(bid.dateScope.to) ||
    bid.dateScope.to < bid.dateScope.from
  ) {
    throw new LineholderBidServiceError(
      400,
      `Invalid event date range for ${propertyName}.`,
    );
  }

  return `duty_counts.event_date between ${sqlBuilder.addParam(bid.dateScope.from)}::date and ${sqlBuilder.addParam(bid.dateScope.to)}::date`;
};

const buildEnrouteDateQuery = (
  liveSchema: string,
  columnName: "brief_start_utc" | "debrief_end_utc",
  dateAlias: string,
) => `
  select enroute_dates.duty_seq, enroute_dates.${dateAlias}
  from (
    select distinct on (s.pairing_id, s.duty_seq)
      s.duty_seq,
      (s.${columnName} at time zone 'UTC')::date as ${dateAlias}
    from ${liveSchema}.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
      and s.duty_seq > 1
      and s.${columnName} is not null
    order by s.pairing_id, s.duty_seq, s.seg_seq
  ) enroute_dates
`;

const buildAirportPreferenceRowsQuery = (
  bid: AirportPreferenceBid,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  propertyName: string,
  useCurrentRulesFacts: boolean,
) => {
  const airportCodes = normalizeAirportCodes(
    bid.locations
      .filter((location) => location.kind === "airport")
      .map((location) => location.code),
  );
  const cityCodes = normalizeAirportCodes(
    bid.locations
      .filter((location) => location.kind === "city")
      .map((location) => location.code),
  );

  if (airportCodes.length === 0 && cityCodes.length === 0) {
    throw new LineholderBidServiceError(
      400,
      `Missing airport or city values for ${propertyName}.`,
    );
  }

  const locationClauses: string[] = [];
  if (airportCodes.length > 0) {
    locationClauses.push(
      `airport_events.airport_code = any(${sqlBuilder.addParam(airportCodes)}::text[])`,
    );
  }
  if (cityCodes.length > 0) {
    locationClauses.push(
      `airport_events.city_code = any(${sqlBuilder.addParam(cityCodes)}::text[])`,
    );
  }

  const eventClause =
    bid.event === "landing"
      ? "airport_events.event_type = 'landing'"
      : bid.event === "layover"
        ? "airport_events.event_type = 'layover'"
        : "airport_events.event_type in ('landing', 'layover')";
  const landingDate = buildUtcTimestampToLocalDateExpression({
    timestampExpression: "s.sch_end_dt_utc",
    zoneExpression: "landing_airport.zone_id",
  });
  const layoverDate = buildUtcTimestampToLocalDateExpression({
    timestampExpression: "coalesce(s.duty_sch_end_dt_utc, s.sch_end_dt_utc)",
    zoneExpression: "layover_airport.zone_id",
  });

  if (useCurrentRulesFacts) {
    return {
      eventClause,
      locationClause: `(${locationClauses.join(" or ")})`,
      sourceQuery: `
        select airport_events.event_type, airport_events.airport_code, airport_events.city_code,
          airport_events.event_date, airport_events.layover_minutes
        from jsonb_to_recordset(facts.airport_events) as airport_events(
          event_type text,
          airport_code text,
          city_code text,
          event_date date,
          layover_minutes numeric
        )
      `,
    };
  }

  return {
    eventClause,
    locationClause: `(${locationClauses.join(" or ")})`,
    sourceQuery: `
      select airport_events.event_type, airport_events.airport_code, airport_events.city_code,
        airport_events.event_date, airport_events.layover_minutes
      from (
        select
          'landing'::text as event_type,
          upper(s.arv_arp) as airport_code,
          upper(landing_airport.city) as city_code,
          ${landingDate} as event_date,
          null::numeric as layover_minutes
        from ${liveSchema}.pairing_segment s
        join ${liveSchema}.airport landing_airport
          on landing_airport.airport = s.arv_arp
        where s.pairing_id = p.id
          and s.is_deleted = 0
          and s.arv_arp is not null
          and exists (
            select 1
            from ${liveSchema}.pairing_segment later_s
            where later_s.pairing_id = s.pairing_id
              and later_s.is_deleted = 0
              and (
                later_s.duty_seq > s.duty_seq
                or (
                  later_s.duty_seq = s.duty_seq
                  and later_s.seg_seq > s.seg_seq
                )
              )
          )

        union all

        select layover_events.event_type, layover_events.airport_code, layover_events.city_code,
          layover_events.event_date, layover_events.layover_minutes
        from (
          select distinct on (s.pairing_id, s.duty_seq)
            'layover'::text as event_type,
            upper(s.duty_end_arp) as airport_code,
            upper(layover_airport.city) as city_code,
            ${layoverDate} as event_date,
            coalesce(s.duty_sch_rest_min, s.duty_act_rest_min)::numeric as layover_minutes,
            s.pairing_id,
            s.duty_seq,
            s.seg_seq
          from ${liveSchema}.pairing_segment s
          join ${liveSchema}.airport layover_airport
            on layover_airport.airport = s.duty_end_arp
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_layover_nits > 0
            and s.duty_end_arp is not null
          order by s.pairing_id, s.duty_seq, s.seg_seq
        ) layover_events
      ) airport_events
    `,
  };
};

const buildAirportPreferenceDateClause = (
  dateScope: AirportPreferenceBid["dateScope"],
  sqlBuilder: PairingSearchSqlBuilder,
  propertyName: string,
) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    if (dateScope.dates.length === 0) {
      throw new LineholderBidServiceError(
        400,
        `Missing date values for ${propertyName}.`,
      );
    }

    return `airport_events.event_date = any(${sqlBuilder.addParam(dateScope.dates)}::date[])`;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateScope.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateScope.to) ||
    dateScope.to < dateScope.from
  ) {
    throw new LineholderBidServiceError(
      400,
      `Invalid date range for ${propertyName}.`,
    );
  }

  return `airport_events.event_date between ${sqlBuilder.addParam(dateScope.from)}::date and ${sqlBuilder.addParam(dateScope.to)}::date`;
};

const buildAirportPreferenceCondition = (
  property: PbsPairingSearchPreviewProperty & { bid: AirportPreferenceBid },
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  context: PairingSearchConditionContext,
) => {
  if (property.bid.event === "landing" && property.bid.minimumLayoverDuration) {
    throw new LineholderBidServiceError(
      400,
      `Landing Airport Preference cannot include layover duration.`,
    );
  }

  const { eventClause, locationClause, sourceQuery } =
    buildAirportPreferenceRowsQuery(
      property.bid,
      liveSchema,
      sqlBuilder,
      property.name,
      context.useCurrentRulesFacts === true,
    );
  const clauses = [
    eventClause,
    locationClause,
    buildAirportPreferenceDateClause(
      property.bid.dateScope,
      sqlBuilder,
      property.name,
    ),
    property.bid.minimumLayoverDuration
      ? `(airport_events.event_type = 'landing' or airport_events.layover_minutes >= ${sqlBuilder.addParam(
          parseDurationToMinutes(property.bid.minimumLayoverDuration),
        )})`
      : null,
  ].filter((clause): clause is string => Boolean(clause));
  const filteredQuery =
    clauses.length > 0
      ? `${sourceQuery} where ${clauses.join(" and ")}`
      : sourceQuery;

  return `exists (${filteredQuery})`;
};

const buildRedeyePreferenceDateClause = (
  dateScope: RedeyePreferenceBid["dateScope"],
  sqlBuilder: PairingSearchSqlBuilder,
  propertyName: string,
  context: PairingSearchConditionContext,
) => {
  if (!dateScope) {
    return null;
  }

  if (dateScope.mode === "specific_dates") {
    if (
      dateScope.dates.length === 0 ||
      dateScope.dates.some((date) => !ISO_DATE_PATTERN.test(date)) ||
      dateScope.dates.some(
        (date) => !isDateInPairingSearchPeriod(date, context),
      )
    ) {
      throw new LineholderBidServiceError(
        400,
        `Invalid flight dates for ${propertyName}.`,
      );
    }

    return `redeye_windows.redeye_date = any(${sqlBuilder.addParam(dateScope.dates)}::date[])`;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateScope.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateScope.to) ||
    dateScope.to < dateScope.from ||
    !isDateInPairingSearchPeriod(dateScope.from, context) ||
    !isDateInPairingSearchPeriod(dateScope.to, context)
  ) {
    throw new LineholderBidServiceError(
      400,
      `Invalid date range for ${propertyName}.`,
    );
  }

  return `redeye_windows.redeye_date between ${sqlBuilder.addParam(dateScope.from)}::date and ${sqlBuilder.addParam(dateScope.to)}::date`;
};

const buildRedeyePreferenceCondition = (
  property: PbsPairingSearchPreviewProperty,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  context: PairingSearchConditionContext,
) => {
  if (!context.redeye?.available) {
    throw new LineholderBidServiceError(
      503,
      `Redeye configuration is unavailable for ${property.name}.`,
    );
  }
  const dateScope =
    property.bid.type === "redeye-preference" ? property.bid.dateScope : null;
  const dateClause = buildRedeyePreferenceDateClause(
    dateScope,
    sqlBuilder,
    property.name,
    context,
  );

  return buildRedeyePairingWindowCondition({
    dateClause,
    liveSchema,
    redeye: context.redeye,
    sqlBuilder,
  });
};

export const buildDetailPreviewCondition = (
  property: PbsPairingSearchPreviewProperty,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  quantifier: PbsPairingBidQuantifier | null,
  wrapIntent: (positiveClause: string) => string,
  context: PairingSearchConditionContext,
) => {
  switch (property.propertyCode) {
    case 107: {
      if (property.bid.type !== "flight-legs-per-duty") {
        break;
      }

      const comparisonClause =
        property.bid.operator === "Between"
          ? `duty_counts.leg_count between ${sqlBuilder.addParam(property.bid.from)} and ${sqlBuilder.addParam(property.bid.to)}`
          : `duty_counts.leg_count ${property.bid.operator} ${sqlBuilder.addParam(property.bid.legs)}`;
      const dateClause = buildFlightLegsDateClause(
        property.bid,
        sqlBuilder,
        property.name,
      );
      const dutyCountsQuery = context.useCurrentRulesFacts
        ? `
          select duty_counts.duty_seq, duty_counts.leg_count, duty_counts.event_date
          from jsonb_to_recordset(facts.duty_counts) as duty_counts(
            duty_seq integer,
            leg_count numeric,
            event_date date
          )
          ${dateClause ? `where ${dateClause}` : ""}
        `
        : `
          select duty_counts.duty_seq, duty_counts.leg_count, duty_counts.event_date
          from (
          select
            s.duty_seq,
            count(*) filter (
              where upper(btrim(coalesce(s.seg_assignment, ''))) in ('FLT', 'FLY')
            )::numeric as leg_count,
            (
              select (
                (event_segment.brief_start_utc at time zone 'UTC')
                at time zone coalesce(valid_timezone.name, 'UTC')
              )::date
              from ${liveSchema}.pairing_segment event_segment
              left join ${liveSchema}.airport event_airport
                on event_airport.airport = event_segment.dep_arp
              left join pg_timezone_names valid_timezone
                on valid_timezone.name = nullif(btrim(event_airport.zone_id), '')
              where event_segment.pairing_id = p.id
                and event_segment.duty_seq = s.duty_seq
                and event_segment.is_deleted = 0
                and event_segment.brief_start_utc is not null
              order by event_segment.brief_start_utc, event_segment.seg_seq
              limit 1
            ) as event_date
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
          group by s.duty_seq
          ) duty_counts
          ${dateClause ? `where ${dateClause}` : ""}
        `;

      const positiveClause =
        quantifier === "every"
          ? `
          (
            exists (${dutyCountsQuery})
            and not exists (
              ${dutyCountsQuery}
              ${dateClause ? "and" : "where"} not (${comparisonClause})
            )
          )
        `
          : `
          exists (
            ${dutyCountsQuery}
            ${dateClause ? "and" : "where"} ${comparisonClause}
          )
        `;

      return wrapIntent(positiveClause);
    }
    case 110: {
      if (property.bid.type !== "work-day-preference") {
        break;
      }
      return wrapIntent(
        buildWorkDayPreferenceCondition(
          property.bid,
          property.name,
          liveSchema,
          sqlBuilder,
        ),
      );
    }
    case 123: {
      if (
        property.bid.type !== "date-or-dow-list" &&
        property.bid.type !== "date-range"
      ) {
        break;
      }

      const layoverDatesQuery = `
        select layover_dates.duty_seq, layover_dates.layover_date
        from (
          select distinct on (s.pairing_id, s.duty_seq)
            s.duty_seq,
            (coalesce(s.duty_sch_end_dt_utc, s.sch_end_dt_utc) at time zone 'UTC')::date as layover_date
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_layover_nits > 0
          order by s.pairing_id, s.duty_seq, s.seg_seq
        ) layover_dates
      `;

      return buildDateOrDowPreviewCondition({
        dateColumn: "layover_date",
        itemAlias: "layover_dates",
        property,
        quantifier,
        sourceQuery: layoverDatesQuery,
        sqlBuilder,
        wrapIntent,
      });
    }
    case 166: {
      if (
        property.bid.type !== "date-or-dow-list" &&
        property.bid.type !== "date-range"
      ) {
        break;
      }

      return buildDateOrDowPreviewCondition({
        dateColumn: "enroute_check_in_date",
        itemAlias: "enroute_dates",
        property,
        quantifier,
        sourceQuery: buildEnrouteDateQuery(
          liveSchema,
          "brief_start_utc",
          "enroute_check_in_date",
        ),
        sqlBuilder,
        wrapIntent,
      });
    }
    case 167: {
      if (
        property.bid.type !== "date-or-dow-list" &&
        property.bid.type !== "date-range"
      ) {
        break;
      }

      return buildDateOrDowPreviewCondition({
        dateColumn: "enroute_check_out_date",
        itemAlias: "enroute_dates",
        property,
        quantifier,
        sourceQuery: buildEnrouteDateQuery(
          liveSchema,
          "debrief_end_utc",
          "enroute_check_out_date",
        ),
        sqlBuilder,
        wrapIntent,
      });
    }
    case 124: {
      if (property.bid.type !== "stepper") {
        break;
      }

      const firstDutyLegCountExpression = `
        (
          select count(*)::numeric
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_seq = 1
        )
      `;

      return wrapIntent(
        buildCompareClause(
          sqlBuilder,
          firstDutyLegCountExpression,
          property.bid,
        ),
      );
    }
    case 130: {
      if (property.bid.type !== "stepper") {
        break;
      }

      const lastDutyLegCountExpression = `
        (
          select count(*)::numeric
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_seq = (
              select max(last_s.duty_seq)
              from ${liveSchema}.pairing_segment last_s
              where last_s.pairing_id = p.id
                and last_s.is_deleted = 0
            )
        )
      `;

      return wrapIntent(
        buildCompareClause(
          sqlBuilder,
          lastDutyLegCountExpression,
          property.bid,
        ),
      );
    }
    case 115: {
      if (property.bid.type !== "tag-list") {
        break;
      }

      const values = normalizeCrewIds(property.bid.values);

      if (values.length === 0) {
        throw new LineholderBidServiceError(
          400,
          `Missing crew id values for ${property.name}.`,
        );
      }

      const valuesPlaceholder = sqlBuilder.addParam(values);
      const matchingLegExists = `
        exists (
          select 1
          from ${liveSchema}.roster_flight rf
          where rf.pairing_id = s.pairing_id
            and rf.flt_id is not distinct from s.flt_id
            and rf.duty_seq = s.duty_seq
            and rf.seg_seq = s.seg_seq
            and rf.is_deleted = 0
            and upper(rf.crew_id) = any(${valuesPlaceholder}::text[])
        )
      `;
      const positiveClause =
        quantifier === "every"
          ? `
          (
            exists (
              select 1
              from ${liveSchema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            )
            and not exists (
              select 1
              from ${liveSchema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
                and not (${matchingLegExists})
            )
          )
        `
          : `
          exists (
            select 1
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
              and ${matchingLegExists}
          )
        `;

      return wrapIntent(positiveClause);
    }
    case 116: {
      if (property.bid.type !== "flight-number-preference") {
        break;
      }

      const values = normalizeFlightNumbers(property.bid.flightNumbers);

      if (values.length === 0) {
        throw new LineholderBidServiceError(
          400,
          `Missing flight number values for ${property.name}.`,
        );
      }

      const valuesPlaceholder = sqlBuilder.addParam(values);
      const dateScope = property.bid.dateScope;
      if (
        dateScope?.mode === "specific_dates" &&
        (dateScope.dates.length === 0 ||
          dateScope.dates.some(
            (date) =>
              !ISO_DATE_PATTERN.test(date) ||
              !isDateInPairingSearchPeriod(date, context),
          ))
      ) {
        throw new LineholderBidServiceError(
          400,
          `Invalid flight dates for ${property.name}.`,
        );
      }
      if (
        dateScope?.mode === "date_range" &&
        (!ISO_DATE_PATTERN.test(dateScope.from) ||
          !ISO_DATE_PATTERN.test(dateScope.to) ||
          dateScope.to < dateScope.from ||
          !isDateInPairingSearchPeriod(dateScope.from, context) ||
          !isDateInPairingSearchPeriod(dateScope.to, context))
      ) {
        throw new LineholderBidServiceError(
          400,
          `Invalid flight date range for ${property.name}.`,
        );
      }
      const dateClause =
        dateScope?.mode === "specific_dates"
          ? `and s.flt_dt = any(${sqlBuilder.addParam(dateScope.dates)}::date[])`
          : dateScope?.mode === "date_range"
            ? `and s.flt_dt between ${sqlBuilder.addParam(dateScope.from)}::date and ${sqlBuilder.addParam(dateScope.to)}::date`
            : "";
      return wrapIntent(`
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and upper(btrim(coalesce(s.seg_assignment, ''))) in ('FLT', 'FLY')
            and upper(btrim(s.flt_num)) = any(${valuesPlaceholder}::text[])
            ${dateClause}
        )
      `);
    }
    case 117: {
      if (property.bid.type !== "redeye-preference") {
        break;
      }

      return wrapIntent(
        buildRedeyePreferenceCondition(
          property,
          liveSchema,
          sqlBuilder,
          context,
        ),
      );
    }
    case 118: {
      if (
        property.bid.type !== "duration" &&
        property.bid.type !== "duration-range"
      ) {
        break;
      }

      const dutyDurationsQuery = `
        select duty_durations.duty_seq, duty_durations.duty_minutes
        from (
          select distinct on (s.pairing_id, s.duty_seq)
            s.duty_seq,
            coalesce(s.duty_sch_duty_min, s.duty_act_duty_min)::numeric as duty_minutes
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
          order by s.pairing_id, s.duty_seq, s.seg_seq
        ) duty_durations
        where duty_durations.duty_minutes is not null
      `;
      const compareClause = buildDurationCompareClause(
        sqlBuilder,
        "duty_durations.duty_minutes",
        property.bid,
      );
      const positiveClause =
        quantifier === "every"
          ? `
          (
            exists (${dutyDurationsQuery})
            and not exists (
              ${dutyDurationsQuery}
                and not (${compareClause})
            )
          )
        `
          : `
          exists (
            ${dutyDurationsQuery}
              and ${compareClause}
          )
        `;

      return wrapIntent(positiveClause);
    }
    case 119: {
      if (property.bid.type !== "duration") {
        break;
      }

      const layoverDurationsQuery = `
        select layover_durations.duty_seq, layover_durations.layover_minutes
        from (
          select distinct on (s.pairing_id, s.duty_seq)
            s.duty_seq,
            coalesce(s.duty_sch_rest_min, s.duty_act_rest_min)::numeric as layover_minutes
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_layover_nits > 0
          order by s.pairing_id, s.duty_seq, s.seg_seq
        ) layover_durations
        where layover_durations.layover_minutes is not null
      `;
      const compareClause = buildDurationCompareClause(
        sqlBuilder,
        "layover_durations.layover_minutes",
        property.bid,
      );
      const positiveClause =
        quantifier === "every"
          ? `
          (
            exists (${layoverDurationsQuery})
            and not exists (
              ${layoverDurationsQuery}
                and not (${compareClause})
            )
          )
        `
          : `
          exists (
            ${layoverDurationsQuery}
              and ${compareClause}
          )
        `;

      return wrapIntent(positiveClause);
    }
    case 129: {
      if (property.bid.type !== "duration") {
        break;
      }

      const timeBetweenFlightsQuery = `
        select connections.connection_minutes
        from (
          select extract(epoch from (
            lead(s.sch_str_dt_utc) over (partition by s.pairing_id, s.duty_seq order by s.seg_seq)
            - s.sch_end_dt_utc
          )) / 60 as connection_minutes
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        ) connections
        where connections.connection_minutes is not null
      `;
      const compareClause = buildDurationCompareClause(
        sqlBuilder,
        "time_between_flights.connection_minutes",
        property.bid,
      );
      const positiveClause =
        quantifier === "every"
          ? `
          (
            exists (${timeBetweenFlightsQuery})
            and not exists (
              select 1
              from (${timeBetweenFlightsQuery}) time_between_flights
              where not (${compareClause})
            )
          )
        `
          : `
          exists (
            select 1
            from (${timeBetweenFlightsQuery}) time_between_flights
            where ${compareClause}
          )
        `;

      return wrapIntent(positiveClause);
    }
    case 121: {
      if (property.bid.type !== "duration") {
        break;
      }

      if (property.bid.operator !== "<" && property.bid.operator !== ">") {
        throw new LineholderBidServiceError(
          400,
          `Average Daily Block Time supports < or > only.`,
        );
      }

      const thresholdPlaceholder = sqlBuilder.addParam(
        parseDurationToMinutes(property.bid.value),
      );

      return wrapIntent(`
        (
          select coalesce(sum(coalesce(f.blk_min, 0))::numeric, 0)
            / greatest(coalesce(p.duration_days, 1), 1)
          from ${liveSchema}.pairing_segment s
          join ${liveSchema}.flight f
            on f.id = s.flt_id
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.flt_id is not null
        ) ${property.bid.operator} ${thresholdPlaceholder}
      `);
    }
    case 127: {
      if (
        property.bid.type !== "duration" &&
        property.bid.type !== "duration-range"
      ) {
        break;
      }

      const totalBlockMinutesExpression = `
        (
          select coalesce(sum(coalesce(f.blk_min, 0))::numeric, 0)
          from ${liveSchema}.pairing_segment s
          join ${liveSchema}.flight f
            on f.id = s.flt_id
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.flt_id is not null
        )
      `;

      return wrapIntent(
        buildDurationCompareClause(
          sqlBuilder,
          totalBlockMinutesExpression,
          property.bid,
        ),
      );
    }
    case 125: {
      if (property.bid.type !== "percent-or-duration") {
        break;
      }

      if (property.bid.operator !== "<" && property.bid.operator !== ">") {
        throw new LineholderBidServiceError(
          400,
          `Credit Per Time Away From Base supports < or > only.`,
        );
      }

      const creditMinutesExpression = `
        (
          select sum(coalesce(s.act_credited_minutes_seg::numeric, s.duty_act_credited_minutes::numeric, 0))
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        )
      `;

      if (property.bid.unit === "percent") {
        const thresholdPlaceholder = sqlBuilder.addParam(
          parsePercentToNumber(property.bid.value),
        );

        return wrapIntent(`
          (
            ${creditMinutesExpression}
            / nullif(p.tafb::numeric, 0)
            * 100
          ) ${property.bid.operator} ${thresholdPlaceholder}
        `);
      }

      if (property.bid.unit === "duration") {
        const thresholdPlaceholder = sqlBuilder.addParam(
          parseDurationToMinutes(property.bid.value),
        );

        return wrapIntent(`
          (
            ${creditMinutesExpression}
            / nullif(p.tafb::numeric, 0)
            * 1440
          ) ${property.bid.operator} ${thresholdPlaceholder}
        `);
      }

      break;
    }
    case 122: {
      if (property.bid.type !== "deadhead-flying") {
        break;
      }

      const dateScope = property.bid.dateScope;
      if (
        dateScope?.mode === "specific_dates" &&
        (dateScope.dates.length === 0 ||
          dateScope.dates.some(
            (date) =>
              !ISO_DATE_PATTERN.test(date) ||
              !isDateInPairingSearchPeriod(date, context),
          ))
      ) {
        throw new LineholderBidServiceError(
          400,
          `Invalid flight dates for ${property.name}.`,
        );
      }
      if (
        dateScope?.mode === "date_range" &&
        (!ISO_DATE_PATTERN.test(dateScope.from) ||
          !ISO_DATE_PATTERN.test(dateScope.to) ||
          dateScope.to < dateScope.from ||
          !isDateInPairingSearchPeriod(dateScope.from, context) ||
          !isDateInPairingSearchPeriod(dateScope.to, context))
      ) {
        throw new LineholderBidServiceError(
          400,
          `Invalid flight date range for ${property.name}.`,
        );
      }

      const datePredicate =
        dateScope?.mode === "specific_dates"
          ? `s.flt_dt = any(${sqlBuilder.addParam(dateScope.dates)}::date[])`
          : dateScope?.mode === "date_range"
            ? `s.flt_dt between ${sqlBuilder.addParam(dateScope.from)}::date and ${sqlBuilder.addParam(dateScope.to)}::date`
            : null;

      if (property.bid.mode === "any-deadhead") {
        return wrapIntent(`
          exists (
            select 1
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
              and s.seg_assignment = 'DHD'
              ${datePredicate ? `and ${datePredicate}` : ""}
          )
        `);
      }

      if (property.bid.mode === "deadhead-only-duty") {
        return wrapIntent(`
          exists (
            select 1
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
              and s.duty_seq is not null
            group by s.duty_seq
            having count(*) > 0
              and count(*) filter (where s.seg_assignment = 'DHD') = count(*)
              ${datePredicate ? `and bool_or(${datePredicate})` : ""}
          )
        `);
      }

      break;
    }
    case 101: {
      if (property.bid.type !== "tag-list" && property.bid.type !== "text") {
        break;
      }

      const values =
        property.bid.type === "tag-list"
          ? normalizeAirportCodes(property.bid.values)
          : normalizeAirportCodes([property.bid.value]);

      if (values.length === 0) {
        throw new LineholderBidServiceError(
          400,
          `Missing airport values for ${property.name}.`,
        );
      }

      const valuesPlaceholder = sqlBuilder.addParam(values);
      return wrapIntent(`
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and upper(s.arv_arp) = any(${valuesPlaceholder})
        )
      `);
    }
    case 168: {
      if (property.bid.type !== "airport-preference") {
        break;
      }

      return wrapIntent(
        buildAirportPreferenceCondition(
          { ...property, bid: property.bid },
          liveSchema,
          sqlBuilder,
          context,
        ),
      );
    }
    case 165: {
      if (property.bid.type !== "tag-list" && property.bid.type !== "text") {
        break;
      }

      const values =
        property.bid.type === "tag-list"
          ? normalizeAirportCodes(property.bid.values)
          : normalizeAirportCodes([property.bid.value]);

      if (values.length === 0) {
        throw new LineholderBidServiceError(
          400,
          `Missing station values for ${property.name}.`,
        );
      }

      const valuesPlaceholder = sqlBuilder.addParam(values);
      return wrapIntent(`
        upper((
          select s.duty_str_arp
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_str_arp is not null
          order by s.duty_seq, s.seg_seq
          limit 1
        )) = any(${valuesPlaceholder})
      `);
    }
    case 142: {
      if (property.bid.type !== "text" && property.bid.type !== "duration") {
        break;
      }

      const thresholdPlaceholder = sqlBuilder.addParam(
        parseDurationToMinutes(property.bid.value),
      );

      return wrapIntent(`
        (
          select avg(duty_credit.credit_minutes)
          from (
            select distinct on (s.pairing_id, s.duty_seq)
              s.pairing_id,
              s.duty_seq,
              coalesce(s.duty_act_credited_minutes::numeric, 0) as credit_minutes
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
            order by s.pairing_id, s.duty_seq, s.seg_seq
          ) duty_credit
        ) >= ${thresholdPlaceholder}
      `);
    }
    case 143: {
      if (property.bid.type !== "text" && property.bid.type !== "duration") {
        break;
      }

      const thresholdPlaceholder = sqlBuilder.addParam(
        parseDurationToMinutes(property.bid.value),
      );
      return wrapIntent(`
        (
          select max(coalesce(s.duty_act_duty_min, 0))
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        ) <= ${thresholdPlaceholder}
      `);
    }
    case 144: {
      if (property.bid.type !== "text" && property.bid.type !== "duration") {
        break;
      }

      const thresholdPlaceholder = sqlBuilder.addParam(
        parseDurationToMinutes(property.bid.value),
      );
      return wrapIntent(`
        (
          select max(coalesce(s.duty_act_flt_min, 0))
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        ) <= ${thresholdPlaceholder}
      `);
    }
    case 145:
    case 146: {
      if (property.bid.type !== "text" && property.bid.type !== "duration") {
        break;
      }

      const thresholdPlaceholder = sqlBuilder.addParam(
        parseDurationToMinutes(property.bid.value),
      );
      const comparison = property.propertyCode === 145 ? "<" : ">";

      return wrapIntent(`
        (
          exists (
            select 1
            from (
              select extract(epoch from (lead(s.sch_str_dt_utc) over (partition by s.pairing_id, s.duty_seq order by s.seg_seq) - s.sch_end_dt_utc)) / 60 as connection_minutes
              from ${liveSchema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ) connections
            where connections.connection_minutes is not null
          )
          and not exists (
            select 1
            from (
              select extract(epoch from (lead(s.sch_str_dt_utc) over (partition by s.pairing_id, s.duty_seq order by s.seg_seq) - s.sch_end_dt_utc)) / 60 as connection_minutes
              from ${liveSchema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
            ) connections
            where connections.connection_minutes is not null
              and connections.connection_minutes ${comparison} ${thresholdPlaceholder}
          )
        )
      `);
    }
    case 128:
    case 147:
    case 148: {
      const clause = `
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.seg_assignment = 'DHD'
        )
      `;

      return wrapIntent(clause);
    }
    case 104:
    case 150:
    case 151:
    case 152: {
      if (
        property.bid.type !== "tag-list" &&
        property.bid.type !== "tag-list-date" &&
        property.bid.type !== "text"
      ) {
        break;
      }

      const values =
        property.bid.type === "tag-list"
          ? normalizeAirportCodes(property.bid.values)
          : property.bid.type === "tag-list-date"
            ? normalizeAirportCodes(property.bid.values)
            : normalizeAirportCodes([property.bid.value]);

      if (values.length === 0) {
        throw new LineholderBidServiceError(
          400,
          `Missing airport values for ${property.name}.`,
        );
      }

      const valuesPlaceholder = sqlBuilder.addParam(values);
      const dateClause =
        property.propertyCode === 152 && property.bid.type === "tag-list-date"
          ? `and (s.duty_sch_end_dt_utc at time zone 'UTC')::date = ${sqlBuilder.addParam(property.bid.date)}::date`
          : "";

      const positiveClause =
        quantifier === "every"
          ? `
          (
            exists (
              select 1
              from ${liveSchema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
                and s.duty_layover_nits > 0
                ${dateClause}
            )
            and not exists (
              select 1
              from ${liveSchema}.pairing_segment s
              where s.pairing_id = p.id
                and s.is_deleted = 0
                and s.duty_layover_nits > 0
                ${dateClause}
                and upper(s.duty_end_arp) <> all(${valuesPlaceholder})
            )
          )
        `
          : `
          exists (
            select 1
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
              and s.duty_layover_nits > 0
              ${dateClause}
              and upper(s.duty_end_arp) = any(${valuesPlaceholder})
          )
        `;

      return wrapIntent(positiveClause);
    }
    case 153:
    case 154: {
      if (property.bid.type !== "text" && property.bid.type !== "duration") {
        break;
      }

      const thresholdPlaceholder = sqlBuilder.addParam(
        parseDurationToMinutes(property.bid.value),
      );
      const comparison = property.propertyCode === 153 ? "<" : ">";

      return wrapIntent(`
        (
          exists (
            select 1
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
              and s.duty_layover_nits > 0
          )
          and not exists (
            select 1
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
              and s.duty_layover_nits > 0
              and coalesce(s.duty_sch_rest_min, 0) ${comparison} ${thresholdPlaceholder}
          )
        )
      `);
    }
    case 155:
    case 156: {
      if (property.bid.type !== "tag-list") {
        break;
      }

      const values = normalizeAirportCodes(property.bid.values);
      const valuesPlaceholder = sqlBuilder.addParam(values);
      return wrapIntent(`
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and upper(s.arv_arp) = any(${valuesPlaceholder})
        )
      `);
    }
    case 157: {
      const clause = `
        (
          select count(*)
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_seq = 1
        ) = 1
      `;

      return wrapIntent(clause);
    }
    case 158: {
      const clause = `
        (
          select count(*)
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_seq = (
              select max(last_s.duty_seq)
              from ${liveSchema}.pairing_segment last_s
              where last_s.pairing_id = p.id
                and last_s.is_deleted = 0
            )
        ) = 1
      `;

      return wrapIntent(clause);
    }
    case 159:
    case 160: {
      if (property.bid.type !== "tag-list") {
        break;
      }

      const patterns = buildFleetPatterns(property.bid.values);

      if (patterns.length === 0) {
        throw new LineholderBidServiceError(
          400,
          `Missing aircraft values for ${property.name}.`,
        );
      }

      const likeConditions = patterns.map(
        (pattern) =>
          `upper(coalesce(s.fleet_seg, p.fleet)) like ${sqlBuilder.addParam(`%${pattern}%`)}`,
      );
      return wrapIntent(`
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and (${likeConditions.join(" or ")})
        )
      `);
    }
    case 161: {
      if (property.bid.type !== "stepper") {
        break;
      }

      const thresholdPlaceholder = sqlBuilder.addParam(property.bid.value);
      return wrapIntent(`
        (
          select max(duty_counts.segment_count)
          from (
            select s.duty_seq, count(*)::int as segment_count
            from ${liveSchema}.pairing_segment s
            where s.pairing_id = p.id
              and s.is_deleted = 0
            group by s.duty_seq
          ) duty_counts
        ) <= ${thresholdPlaceholder}
      `);
    }
    default:
      break;
  }

  return null;
};
