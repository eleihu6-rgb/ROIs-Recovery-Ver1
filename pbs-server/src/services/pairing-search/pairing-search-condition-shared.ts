import type { PbsPairingBidValue } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import type { PairingSearchSqlBuilder } from "./pairing-search-sql-builder.js";

export const parseDurationToMinutes = (raw: string) => {
  const value = raw.trim();
  const match = value.match(/^(\d{1,3}):(\d{2})$/);

  if (!match || Number.parseInt(match[2], 10) >= 60) {
    throw new LineholderBidServiceError(400, `Unsupported duration value: ${raw}`);
  }

  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
};

export const parsePercentToNumber = (raw: string) => {
  const value = raw.trim().replace(/\s*%$/, "");

  if (value.length === 0) {
    throw new LineholderBidServiceError(400, `Unsupported percent value: ${raw}`);
  }

  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(value)) {
    throw new LineholderBidServiceError(400, `Unsupported percent value: ${raw}`);
  }

  return Number.parseFloat(value);
};

export const buildDurationCompareClause = (
  sqlBuilder: PairingSearchSqlBuilder,
  expression: string,
  bid: Extract<PbsPairingBidValue, { type: "duration" | "duration-range" }>,
) => {
  if (bid.type === "duration-range") {
    const fromPlaceholder = sqlBuilder.addParam(parseDurationToMinutes(bid.from));
    const toPlaceholder = sqlBuilder.addParam(parseDurationToMinutes(bid.to));
    return `${expression} between ${fromPlaceholder} and ${toPlaceholder}`;
  }

  const placeholder = sqlBuilder.addParam(parseDurationToMinutes(bid.value));

  if (bid.operator === "<" || bid.operator === ">") {
    return `${expression} ${bid.operator} ${placeholder}`;
  }

  return `${expression} = ${placeholder}`;
};

export const normalizeAirportCodes = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim().toUpperCase()).filter((value) => value.length > 0)));

export const normalizePairingNumbers = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim().toUpperCase()).filter((value) => value.length > 0)));

export const normalizeFleetToken = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const buildFleetPatterns = (values: string[]) => {
  const patterns = values
    .map(normalizeFleetToken)
    .filter((value) => value.length > 0)
    .flatMap((value) => {
      if (value.includes("737")) {
        return ["737", "7M8", "7M9", "MAX8", "MAX9"];
      }

      if (value.includes("321")) {
        return ["321", "32N", "32Q"];
      }

      if (value.includes("319")) {
        return ["319"];
      }

      if (value.includes("787")) {
        return ["787"];
      }

      return [value];
    });

  return Array.from(new Set(patterns));
};

export const buildCompareClause = (
  sqlBuilder: PairingSearchSqlBuilder,
  expression: string,
  bid: Extract<PbsPairingBidValue, { type: "stepper" | "stepper-range" | "percent" | "percent-range" }>,
) => {
  if (bid.type === "stepper-range" || bid.type === "percent-range") {
    const fromPlaceholder = sqlBuilder.addParam(
      bid.type === "stepper-range" ? bid.from : Number.parseFloat(bid.from),
    );
    const toPlaceholder = sqlBuilder.addParam(
      bid.type === "stepper-range" ? bid.to : Number.parseFloat(bid.to),
    );
    return `${expression} between ${fromPlaceholder} and ${toPlaceholder}`;
  }

  const placeholder = sqlBuilder.addParam(
    bid.type === "stepper" ? bid.value : Number.parseFloat(bid.value),
  );

  if (bid.operator === "<" || bid.operator === ">") {
    return `${expression} ${bid.operator} ${placeholder}`;
  }

  return `${expression} = ${placeholder}`;
};

export const buildTimeCompareClause = (
  sqlBuilder: PairingSearchSqlBuilder,
  expression: string,
  bid:
    | Extract<PbsPairingBidValue, { type: "time" | "time-range" }>
    | Extract<PbsPairingBidValue, { type: "time-date" | "time-range-date" }>,
) => {
  if (bid.type === "time-range" || bid.type === "time-range-date") {
    const fromPlaceholder = sqlBuilder.addParam(bid.from);
    const toPlaceholder = sqlBuilder.addParam(bid.to);
    return `${expression} between ${fromPlaceholder}::time and ${toPlaceholder}::time`;
  }

  const placeholder = sqlBuilder.addParam(bid.value);

  if (bid.operator === "<" || bid.operator === ">") {
    return `${expression} ${bid.operator} ${placeholder}::time`;
  }

  return `${expression} = ${placeholder}::time`;
};

export const buildTimeConditionListClause = (
  sqlBuilder: PairingSearchSqlBuilder,
  expression: string,
  bid: Extract<PbsPairingBidValue, { type: "time-condition-list" }>,
) => {
  const clauses = bid.conditions.map((condition) => {
    if (condition.operator === "Between") {
      return buildTimeCompareClause(sqlBuilder, expression, {
        type: "time-range",
        from: condition.from,
        to: condition.to,
      });
    }

    return buildTimeCompareClause(sqlBuilder, expression, {
      type: "time",
      value: condition.value,
      operator: condition.operator,
    });
  });

  return clauses.length > 0 ? `(${clauses.join(" or ")})` : null;
};
