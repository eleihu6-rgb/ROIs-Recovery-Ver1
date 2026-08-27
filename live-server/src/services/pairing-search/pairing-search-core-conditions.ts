import type { PbsPairingBidValue } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import {
  buildDurationCompareClause,
  buildCompareClause,
  normalizeFleetToken,
} from "./pairing-search-condition-shared.js";
import { isStablePairingId, normalizeStablePairingIds } from "./pairing-id-utils.js";
import {
  isDateInPairingSearchPeriod,
  type PairingSearchConditionContext,
} from "./pairing-search-condition-context.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

const dayOfWeekToIsoDow = new Map([
  ["MON", 1],
  ["TUE", 2],
  ["WED", 3],
  ["THU", 4],
  ["FRI", 5],
  ["SAT", 6],
  ["SUN", 7],
]);

const buildOccurrenceStartUtcExpression = (liveSchema: string) => `
  coalesce(
    (
      select min(coalesce(s.brief_start_utc, s.sch_str_dt_utc))
      from ${liveSchema}.pairing_segment s
      where s.pairing_id = p.id
        and s.is_deleted = 0
    ),
    p.sch_str_dt_utc
  )
`;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const buildPairingLengthPreferenceClause = (
  bid: Extract<PbsPairingBidValue, { type: "pairing-length-preference" }>,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  propertyName: string,
  context: PairingSearchConditionContext,
) => {
  const clauses: string[] = [];

  if (bid.minDays == null && bid.maxDays == null) {
    throw new LineholderBidServiceError(400, `${propertyName} requires minimum days, maximum days, or both.`);
  }

  if (bid.minDays != null && (!Number.isSafeInteger(bid.minDays) || bid.minDays < 1)) {
    throw new LineholderBidServiceError(400, `Invalid pairing length for ${propertyName}.`);
  }

  if (bid.maxDays != null && (!Number.isSafeInteger(bid.maxDays) || bid.maxDays < 1)) {
    throw new LineholderBidServiceError(400, `Invalid pairing length for ${propertyName}.`);
  }

  if (bid.minDays != null && bid.maxDays != null && bid.minDays > bid.maxDays) {
    throw new LineholderBidServiceError(400, `Invalid pairing length for ${propertyName}.`);
  }

  if (bid.minDays != null && bid.maxDays != null) {
    clauses.push(`p.tafb between ${sqlBuilder.addParam(bid.minDays)} and ${sqlBuilder.addParam(bid.maxDays)}`);
  } else if (bid.minDays != null) {
    clauses.push(`p.tafb >= ${sqlBuilder.addParam(bid.minDays)}`);
  } else if (bid.maxDays != null) {
    clauses.push(`p.tafb <= ${sqlBuilder.addParam(bid.maxDays)}`);
  }

  if (bid.dateScope) {
    const dateExpression = `(${buildOccurrenceStartUtcExpression(liveSchema)} at time zone 'UTC')::date`;

    if (bid.dateScope.mode === "specific_dates") {
      const dates = bid.dateScope.dates;
      if (
        dates.length === 0
        || dates.some((date) => !ISO_DATE_PATTERN.test(date))
        || dates.some((date) => !isDateInPairingSearchPeriod(date, context))
      ) {
        throw new LineholderBidServiceError(400, `Invalid pairing start dates for ${propertyName}.`);
      }

      clauses.push(`${dateExpression} = any(${sqlBuilder.addParam(dates)}::date[])`);
    } else {
      if (
        !ISO_DATE_PATTERN.test(bid.dateScope.from)
        || !ISO_DATE_PATTERN.test(bid.dateScope.to)
        || bid.dateScope.to < bid.dateScope.from
        || !isDateInPairingSearchPeriod(bid.dateScope.from, context)
        || !isDateInPairingSearchPeriod(bid.dateScope.to, context)
      ) {
        throw new LineholderBidServiceError(400, `Invalid pairing start date range for ${propertyName}.`);
      }

      clauses.push(`${dateExpression} between ${sqlBuilder.addParam(bid.dateScope.from)}::date and ${sqlBuilder.addParam(bid.dateScope.to)}::date`);
    }
  }

  return `(${clauses.join(" and ")})`;
};

const buildPairingBaseZoneExpression = (liveSchema: string) => `
  coalesce(
    (
      select pairing_base_tz.name
      from ${liveSchema}.airport pairing_base_airport
      join pg_timezone_names pairing_base_tz
        on pairing_base_tz.name = nullif(btrim(pairing_base_airport.zone_id), '')
      where upper(btrim(pairing_base_airport.airport)) = upper(btrim(p.base))
      limit 1
    ),
    'UTC'
  )
`;

const buildMonthEndCarryoverClause = (
  bid: Extract<PbsPairingBidValue, { type: "month-end-carryover" }>,
  carryOutDaysExpression: string,
  sqlBuilder: PairingSearchSqlBuilder,
  propertyName: string,
) => {
  const isPositiveInteger = (value: number | null) =>
    value !== null && Number.isSafeInteger(value) && value > 0;
  let comparisonClause: string;

  if (bid.operator === "Between") {
    if (!isPositiveInteger(bid.from) || !isPositiveInteger(bid.to) || bid.from! > bid.to!) {
      throw new LineholderBidServiceError(400, `Invalid carry-out days for ${propertyName}.`);
    }

    comparisonClause = `month_end_carryover.carry_out_days between ${sqlBuilder.addParam(bid.from)} and ${sqlBuilder.addParam(bid.to)}`;
  } else {
    if (!isPositiveInteger(bid.days)) {
      throw new LineholderBidServiceError(400, `Invalid carry-out days for ${propertyName}.`);
    }

    comparisonClause = `month_end_carryover.carry_out_days ${bid.operator} ${sqlBuilder.addParam(bid.days)}`;
  }

  return `
    exists (
      select 1
      from lateral (
        select ${carryOutDaysExpression} as carry_out_days
      ) month_end_carryover
      where month_end_carryover.carry_out_days >= 1
        and ${comparisonClause}
    )
  `;
};

export const buildCorePreviewCondition = (
  property: PbsPairingSearchPreviewProperty,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  context: PairingSearchConditionContext = {},
) => {
  switch (property.propertyCode) {
    case 102: {
      if (property.bid.type !== "pairing-preference") {
        throw new LineholderBidServiceError(400, `${property.name} must use Pairing IDs selected from the list.`);
      }

      const rawPairingIds = property.bid.pairingIds;

      if (rawPairingIds.length === 0 || rawPairingIds.some((pairingId) => !isStablePairingId(pairingId))) {
        throw new LineholderBidServiceError(400, `${property.name} requires Pairing IDs selected from the list.`);
      }

      const valuesPlaceholder = sqlBuilder.addParam(normalizeStablePairingIds(property.bid.pairingIds));
      return `p.id = any(${valuesPlaceholder}::bigint[])`;
    }
    case 112: {
      if (property.bid.type === "pairing-length-preference") {
        return buildPairingLengthPreferenceClause(property.bid, liveSchema, sqlBuilder, property.name, context);
      }

      if (property.bid.type !== "stepper" && property.bid.type !== "stepper-range") {
        break;
      }

      return buildCompareClause(sqlBuilder, "p.tafb", property.bid);
    }
    case 131: {
      if (property.bid.type !== "stepper" && property.bid.type !== "stepper-range") {
        break;
      }

      return buildCompareClause(sqlBuilder, "p.tafb", property.bid);
    }
    case 108: {
      if (property.bid.type !== "stepper" && property.bid.type !== "stepper-range") {
        break;
      }

      return buildCompareClause(
        sqlBuilder,
        `(
          select count(*)::numeric
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        )`,
        property.bid,
      );
    }
    case 105: {
      if (property.bid.type !== "duration" && property.bid.type !== "duration-range") {
        break;
      }

      const creditMinutesExpression = `
        (
          select sum(coalesce(s.act_credited_minutes_seg::numeric, s.duty_act_credited_minutes::numeric, 0))
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        )
      `;

      return buildDurationCompareClause(sqlBuilder, creditMinutesExpression, property.bid);
    }
    case 109: {
      if (property.bid.type !== "duration" && property.bid.type !== "duration-range") {
        break;
      }

      const creditMinutesExpression = `
        (
          select sum(coalesce(s.act_credited_minutes_seg::numeric, s.duty_act_credited_minutes::numeric, 0))
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
        )
      `;
      const averageDailyCreditExpression = `
        (${creditMinutesExpression} / greatest(coalesce(p.duration_days, 1), 1))
      `;

      return buildDurationCompareClause(sqlBuilder, averageDailyCreditExpression, property.bid);
    }
    case 106: {
      const departingDateExpression = `(${buildOccurrenceStartUtcExpression(liveSchema)} at time zone 'UTC')::date`;

      if (property.bid.type === "date-or-dow-list") {
        const clauses: string[] = [];

        if (property.bid.dates.length > 0) {
          clauses.push(`${departingDateExpression} = any(${sqlBuilder.addParam(property.bid.dates)}::date[])`);
        }

        const isoDowValues = property.bid.daysOfWeek.flatMap((day) => {
          const isoDow = dayOfWeekToIsoDow.get(day);
          return isoDow ? [isoDow] : [];
        });

        if (isoDowValues.length > 0) {
          clauses.push(`extract(isodow from ${departingDateExpression}) = any(${sqlBuilder.addParam(isoDowValues)}::int[])`);
        }

        if (clauses.length === 0) {
          throw new LineholderBidServiceError(400, `Missing date or day values for ${property.name}.`);
        }

        return `(${clauses.join(" or ")})`;
      }

      if (property.bid.type === "date-range") {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(property.bid.from)
          || !/^\d{4}-\d{2}-\d{2}$/.test(property.bid.to)
          || property.bid.to < property.bid.from
        ) {
          throw new LineholderBidServiceError(400, `Invalid date range for ${property.name}.`);
        }

        return `${departingDateExpression} between ${sqlBuilder.addParam(property.bid.from)}::date and ${sqlBuilder.addParam(property.bid.to)}::date`;
      }

      break;
    }
    case 113: {
      if (property.bid.type !== "stepper" && property.bid.type !== "stepper-range") {
        break;
      }

      return buildCompareClause(sqlBuilder, "p.tafb", property.bid);
    }
    case 132: {
      if (property.bid.type !== "stepper-date" && property.bid.type !== "stepper-range-date") {
        break;
      }

      const datePlaceholder = sqlBuilder.addParam(property.bid.date);
      const compareBid: Extract<PbsPairingBidValue, { type: "stepper" | "stepper-range" }> =
        property.bid.type === "stepper-date"
          ? { type: "stepper", value: property.bid.value, min: property.bid.min, max: property.bid.max, operator: property.bid.operator }
          : { type: "stepper-range", from: property.bid.from, to: property.bid.to, min: property.bid.min, max: property.bid.max };

      return `(${datePlaceholder}::date between (p.sch_str_dt_utc at time zone 'UTC')::date and (p.sch_end_dt_utc at time zone 'UTC')::date and ${buildCompareClause(sqlBuilder, "p.tafb", compareBid)})`;
    }
    case 133: {
      if (property.bid.type !== "stepper" && property.bid.type !== "stepper-range") {
        break;
      }

      return buildCompareClause(sqlBuilder, "p.duty_count", property.bid);
    }
    case 137: {
      if (property.bid.type !== "select" && property.bid.type !== "text") {
        break;
      }

      const pairingType = normalizeFleetToken(property.bid.value);

      if (pairingType.length === 0) {
        throw new LineholderBidServiceError(400, `Missing pairing type value for ${property.name}.`);
      }

      const patternPlaceholder = sqlBuilder.addParam(`%${pairingType}%`);
      return `
        regexp_replace(
          upper(concat_ws(' ', p.assignment_group, p.assignment, p.pairing_label, p.interface_id)),
          '[^A-Z0-9]',
          '',
          'g'
        ) like ${patternPlaceholder}
      `;
    }
    case 163: {
      const carryoverBid = property.bid.type === "month-end-carryover"
        ? property.bid
        : property.bid.type === "stepper"
          ? {
            type: "month-end-carryover" as const,
            operator: property.bid.operator === "<" || property.bid.operator === ">"
              ? property.bid.operator
              : "=" as const,
            days: property.bid.value,
          }
          : property.bid.type === "stepper-range"
            ? {
              type: "month-end-carryover" as const,
              operator: "Between" as const,
              from: property.bid.from,
              to: property.bid.to,
            }
            : null;

      if (!carryoverBid) {
        break;
      }

      if (!context.periodEndDate) {
        throw new LineholderBidServiceError(400, "Roster period range is required for Carry-Out Days.");
      }

      const periodEndPlaceholder = sqlBuilder.addParam(context.periodEndDate);
      const pairingBaseZoneExpression = context.pairingBaseZoneExpression
        ?? buildPairingBaseZoneExpression(liveSchema);
      const carryOutDaysExpression = `
        greatest(
          0,
          (
            (
              (coalesce(p.sch_end_dt_utc, p.sch_str_dt_utc) at time zone 'UTC')
              at time zone ${pairingBaseZoneExpression}
            )::date - ${periodEndPlaceholder}::date
          )
        )
      `;

      return buildMonthEndCarryoverClause(carryoverBid, carryOutDaysExpression, sqlBuilder, property.name);
    }
    default:
      break;
  }

  return null;
};
