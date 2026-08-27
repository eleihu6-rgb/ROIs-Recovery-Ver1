import type { PbsPairingBidQuantifier } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
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

type DateOrDowConditionOptions = {
  dateColumn: string;
  itemAlias: string;
  property: PbsPairingSearchPreviewProperty;
  quantifier: PbsPairingBidQuantifier | null;
  sourceQuery: string;
  sqlBuilder: PairingSearchSqlBuilder;
  wrapIntent: (positiveClause: string) => string;
};

export const buildDateOrDowPreviewCondition = ({
  dateColumn,
  itemAlias,
  property,
  quantifier,
  sourceQuery,
  sqlBuilder,
  wrapIntent,
}: DateOrDowConditionOptions) => {
  let matchCondition: string;

  if (property.bid.type === "date-range") {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(property.bid.from)
      || !/^\d{4}-\d{2}-\d{2}$/.test(property.bid.to)
      || property.bid.to < property.bid.from
    ) {
      throw new LineholderBidServiceError(400, `Invalid date range for ${property.name}.`);
    }

    matchCondition =
      `${itemAlias}.${dateColumn} between ${sqlBuilder.addParam(property.bid.from)}::date and ${sqlBuilder.addParam(property.bid.to)}::date`;
  } else if (property.bid.type === "date-or-dow-list") {
    const clauses: string[] = [];

    if (property.bid.dates.length > 0) {
      clauses.push(`${itemAlias}.${dateColumn} = any(${sqlBuilder.addParam(property.bid.dates)}::date[])`);
    }

    const isoDowValues = property.bid.daysOfWeek.flatMap((day) => {
      const isoDow = dayOfWeekToIsoDow.get(day);
      return isoDow ? [isoDow] : [];
    });

    if (isoDowValues.length > 0) {
      clauses.push(`extract(isodow from ${itemAlias}.${dateColumn}) = any(${sqlBuilder.addParam(isoDowValues)}::int[])`);
    }

    if (clauses.length === 0) {
      throw new LineholderBidServiceError(400, `Missing date or day values for ${property.name}.`);
    }

    matchCondition = `(${clauses.join(" or ")})`;
  } else {
    return null;
  }

  const positiveClause = quantifier === "every"
    ? `
      (
        exists (${sourceQuery})
        and not exists (
          ${sourceQuery}
          where not (${matchCondition})
        )
      )
    `
    : `
      exists (
        ${sourceQuery}
        where ${matchCondition}
      )
    `;

  return wrapIntent(positiveClause);
};
