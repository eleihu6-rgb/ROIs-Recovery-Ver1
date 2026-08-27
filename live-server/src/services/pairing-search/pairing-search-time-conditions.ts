import type { PbsPairingBidQuantifier, PbsPairingBidValue } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  isDateInPairingSearchPeriod,
  type PairingSearchConditionContext,
} from "./pairing-search-condition-context.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import { buildTimeCompareClause, buildTimeConditionListClause } from "./pairing-search-condition-shared.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const buildReportTimeExpression = (liveSchema: string) => `
  (
    select (min(s.brief_start_utc) at time zone 'UTC')::time
    from ${liveSchema}.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
  )
`;

const buildReportDateExpression = (liveSchema: string) =>
  `(select (min(s.brief_start_utc) at time zone 'UTC')::date from ${liveSchema}.pairing_segment s where s.pairing_id = p.id and s.is_deleted = 0)`;

const buildReleaseTimeExpression = (liveSchema: string) => `
  (
    select (max(s.debrief_end_utc) at time zone 'UTC')::time
    from ${liveSchema}.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
  )
`;

const buildReleaseDateExpression = (liveSchema: string) =>
  `(select (max(s.debrief_end_utc) at time zone 'UTC')::date from ${liveSchema}.pairing_segment s where s.pairing_id = p.id and s.is_deleted = 0)`;

const buildPairingCheckEventLocalExpression = ({
  liveSchema,
  part,
  timeType,
}: {
  liveSchema: string;
  part: "date" | "time";
  timeType: "check_in" | "check_out";
}) => {
  const timestampColumn = timeType === "check_out" ? "debrief_end_utc" : "brief_start_utc";
  const airportColumn = timeType === "check_out" ? "arv_arp" : "dep_arp";
  const direction = timeType === "check_out" ? "desc" : "asc";

  return `(
    select (
      (s.${timestampColumn} at time zone 'UTC')
      at time zone coalesce(valid_timezone.name, 'UTC')
    )::${part}
    from ${liveSchema}.pairing_segment s
    left join ${liveSchema}.airport event_airport
      on event_airport.airport = s.${airportColumn}
    left join pg_timezone_names valid_timezone
      on valid_timezone.name = nullif(btrim(event_airport.zone_id), '')
    where s.pairing_id = p.id
      and s.is_deleted = 0
      and s.${timestampColumn} is not null
    order by s.${timestampColumn} ${direction}, s.duty_seq ${direction}, s.seg_seq ${direction}
    limit 1
  )`;
};

const buildDepartureTimeExpression = (liveSchema: string) => `
  (
    select (min(s.sch_str_dt_utc) at time zone 'UTC')::time
    from ${liveSchema}.pairing_segment s
    where s.pairing_id = p.id
      and s.is_deleted = 0
  )
`;

const toTimeCompareBid = (
  bid: Extract<PbsPairingBidValue, { type: "time-date" | "time-range-date" }>,
): Extract<PbsPairingBidValue, { type: "time" | "time-range" }> =>
  bid.type === "time-date"
    ? { type: "time", value: bid.value, operator: bid.operator }
    : { type: "time-range", from: bid.from, to: bid.to };

const buildEnrouteTimeExistsClause = (
  sqlBuilder: PairingSearchSqlBuilder,
  liveSchema: string,
  columnName: "brief_start_utc" | "debrief_end_utc",
  bid: Extract<PbsPairingBidValue, { type: "time" | "time-range" }>,
  quantifier: PbsPairingBidQuantifier | null = "any",
) => {
  const timeExpression = `(s.${columnName} at time zone 'UTC')::time`;
  const baseWhereClause = `
    s.pairing_id = p.id
    and s.is_deleted = 0
    and s.duty_seq > 1
  `;

  if (quantifier === "every") {
    const compareClause = buildTimeCompareClause(sqlBuilder, timeExpression, bid);

    return `
      (
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where ${baseWhereClause}
            and s.${columnName} is not null
        )
        and not exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where ${baseWhereClause}
            and (s.${columnName} is null or not (${compareClause}))
        )
      )
    `;
  }

  return `
    exists (
      select 1
      from ${liveSchema}.pairing_segment s
      where ${baseWhereClause}
        and ${buildTimeCompareClause(sqlBuilder, timeExpression, bid)}
    )
  `;
};

export const buildTimePreviewCondition = (
  property: PbsPairingSearchPreviewProperty,
  liveSchema: string,
  sqlBuilder: PairingSearchSqlBuilder,
  context: PairingSearchConditionContext = {},
) => {
  switch (property.propertyCode) {
    case 103: {
      if (property.bid.type === "time-condition-list") {
        return buildTimeConditionListClause(
          sqlBuilder,
          buildReportTimeExpression(liveSchema),
          property.bid,
        );
      }

      if (property.bid.type !== "pairing-check-time") {
        break;
      }

      const timeExpression = buildPairingCheckEventLocalExpression({
        liveSchema,
        part: "time",
        timeType: property.bid.timeType,
      });
      const dateExpression = buildPairingCheckEventLocalExpression({
        liveSchema,
        part: "date",
        timeType: property.bid.timeType,
      });
      const timeBid = property.bid.operator === "Between"
        ? { type: "time-range" as const, from: property.bid.from, to: property.bid.to }
        : { type: "time" as const, value: property.bid.value, operator: property.bid.operator };
      const timeClause = buildTimeCompareClause(sqlBuilder, timeExpression, timeBid);

      if (!property.bid.dateScope) {
        return timeClause;
      }

      if (property.bid.dateScope.mode === "specific_dates") {
        const dates = property.bid.dateScope.dates;
        if (
          dates.length === 0
          || dates.some((date) => !ISO_DATE_PATTERN.test(date))          || dates.some((date) => !isDateInPairingSearchPeriod(date, context))
        ) {
          throw new LineholderBidServiceError(400, `Invalid event dates for ${property.name}.`);
        }

        return `(${dateExpression} = any(${sqlBuilder.addParam(dates)}::date[]) and ${timeClause})`;
      }

      if (
        !ISO_DATE_PATTERN.test(property.bid.dateScope.from)
        || !ISO_DATE_PATTERN.test(property.bid.dateScope.to)
        || property.bid.dateScope.to < property.bid.dateScope.from        || !isDateInPairingSearchPeriod(property.bid.dateScope.from, context)
        || !isDateInPairingSearchPeriod(property.bid.dateScope.to, context)
      ) {
        throw new LineholderBidServiceError(400, `Invalid event date range for ${property.name}.`);
      }

      return `(${dateExpression} between ${sqlBuilder.addParam(property.bid.dateScope.from)}::date and ${sqlBuilder.addParam(property.bid.dateScope.to)}::date and ${timeClause})`;
    }
    case 134: {
      if (property.bid.type !== "time" && property.bid.type !== "time-range") {
        break;
      }

      return buildTimeCompareClause(sqlBuilder, buildReportTimeExpression(liveSchema), property.bid);
    }
    case 139: {
      if (property.bid.type !== "time-date" && property.bid.type !== "time-range-date") {
        break;
      }

      const datePlaceholder = sqlBuilder.addParam(property.bid.date);
      const compareBid = toTimeCompareBid(property.bid);

      return `(${buildReportDateExpression(liveSchema)} = ${datePlaceholder}::date and ${buildTimeCompareClause(sqlBuilder, buildReportTimeExpression(liveSchema), compareBid)})`;
    }
    case 111:
    case 135: {
      if (property.bid.type !== "time" && property.bid.type !== "time-range") {
        break;
      }

      return buildTimeCompareClause(sqlBuilder, buildReleaseTimeExpression(liveSchema), property.bid);
    }
    case 140: {
      if (property.bid.type !== "time-date" && property.bid.type !== "time-range-date") {
        break;
      }

      const datePlaceholder = sqlBuilder.addParam(property.bid.date);
      const compareBid = toTimeCompareBid(property.bid);

      return `(${buildReleaseDateExpression(liveSchema)} = ${datePlaceholder}::date and ${buildTimeCompareClause(sqlBuilder, buildReleaseTimeExpression(liveSchema), compareBid)})`;
    }
    case 114: {
      if (property.bid.type !== "time" && property.bid.type !== "time-range") {
        break;
      }

      return buildEnrouteTimeExistsClause(sqlBuilder, liveSchema, "brief_start_utc", property.bid, property.quantifier);
    }
    case 120: {
      if (property.bid.type !== "time" && property.bid.type !== "time-range") {
        break;
      }

      const dutyOnTimeExpr = `(coalesce(s.duty_sch_str_dt_utc, s.brief_start_utc, s.sch_str_dt_utc) at time zone 'UTC')::time`;
      const compareClause = buildTimeCompareClause(sqlBuilder, dutyOnTimeExpr, property.bid);
      return `
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and ${compareClause}
        )
      `;
    }
    case 164: {
      if (property.bid.type !== "time" && property.bid.type !== "time-range") {
        break;
      }

      return buildTimeCompareClause(sqlBuilder, buildDepartureTimeExpression(liveSchema), property.bid);
    }
    case 136: {
      if (property.bid.type !== "time") {
        break;
      }

      const compareBid = { ...property.bid, operator: property.bid.operator === "<" || property.bid.operator === ">" ? property.bid.operator : ">" };
      return buildEnrouteTimeExistsClause(sqlBuilder, liveSchema, "brief_start_utc", compareBid);
    }
    case 126: {
      if (property.bid.type !== "time" && property.bid.type !== "time-range") {
        break;
      }

      return buildEnrouteTimeExistsClause(sqlBuilder, liveSchema, "debrief_end_utc", property.bid);
    }
    case 141: {
      if (property.bid.type !== "time") {
        break;
      }

      const timePlaceholder = sqlBuilder.addParam(property.bid.value);
      const operator = property.bid.operator === "<" || property.bid.operator === ">" ? property.bid.operator : "<";

      return `
        exists (
          select 1
          from ${liveSchema}.pairing_segment s
          where s.pairing_id = p.id
            and s.is_deleted = 0
            and s.duty_seq > 1
            and (s.debrief_end_utc at time zone 'UTC')::time ${operator} ${timePlaceholder}::time
        )
      `;
    }
    default:
      break;
  }

  return null;
};
