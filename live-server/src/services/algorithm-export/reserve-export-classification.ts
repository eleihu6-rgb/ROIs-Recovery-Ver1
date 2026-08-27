import type { PbsReserveDateScope } from "../../../../packages/contracts/pbs-reserve-bids.js";
import { parseIsoDate } from "../lineholder/date-utils.js";

export type StandardReserveLineDateScope =
  | { mode: "whole_month" }
  | { mode: "date_range"; start: string; end: string };

export type ReserveExportClassification =
  | { target: "line_rules"; dateScope: StandardReserveLineDateScope }
  | { target: "reserve_score" };

const addIsoDays = (value: string, days: number) => {
  const date = parseIsoDate(value);

  if (!date) {
    throw new Error(`Invalid roster period date: ${value}.`);
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const classifyReserveDateScope = (
  dateScope: PbsReserveDateScope,
  periodStartDate: string,
  periodEndDate: string,
): ReserveExportClassification => {
  if (!parseIsoDate(periodStartDate) || !parseIsoDate(periodEndDate) || periodStartDate > periodEndDate) {
    throw new Error("Invalid roster period range for reserve export.");
  }

  if (dateScope.mode === "specific_dates") {
    if (dateScope.dates.some((date) => date < periodStartDate || date > periodEndDate)) {
      throw new Error("Reserve specific date is outside the selected roster period.");
    }

    return { target: "reserve_score" };
  }

  if (dateScope.mode === "whole_month") {
    return {
      target: "line_rules",
      dateScope: { mode: "whole_month" },
    };
  }

  if (dateScope.mode === "date_range") {
    const start = dateScope.from.trim();
    const end = dateScope.to.trim();
    const startDate = parseIsoDate(start);
    const endDate = parseIsoDate(end);

    if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) {
      throw new Error(`Invalid reserve date range: ${dateScope.from}..${dateScope.to}`);
    }

    if (start < periodStartDate || end > periodEndDate) {
      throw new Error("Reserve date range is outside the selected roster period.");
    }

    return {
      target: "line_rules",
      dateScope: { mode: "date_range", start, end },
    };
  }

  if (dateScope.mode === "first_half") {
    return {
      target: "line_rules",
      dateScope: {
        mode: "date_range",
        start: periodStartDate,
        end: addIsoDays(periodStartDate, 14) < periodEndDate
          ? addIsoDays(periodStartDate, 14)
          : periodEndDate,
      },
    };
  }

  const secondHalfStart = addIsoDays(periodStartDate, 15);

  return {
    target: "line_rules",
    dateScope: {
      mode: "date_range",
      start: secondHalfStart,
      end: periodEndDate,
    },
  };
};
