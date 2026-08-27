import {
  pbsPairingPropertyCatalog,
  type PbsPairingBidValue,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingSearchPreviewProperty } from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PairingSearchConditionContext } from "./pairing-search-condition-context.js";
import { generatedSqlPreflightManifest } from "./generated-sql-preflight-manifest.js";

export type GeneratedSqlPreflightCase = {
  id: string;
  propertyCode: number;
  propertyName: string;
  property: PbsPairingSearchPreviewProperty;
  context: PairingSearchConditionContext;
  expected: { kind: "sql" } | { kind: "error"; messagePattern: RegExp };
};

const catalogByCode = new Map(
  pbsPairingPropertyCatalog.map((definition) => [definition.propertyCode, definition]),
);

const materializeBid = (propertyCode: number, source: PbsPairingBidValue): PbsPairingBidValue => {
  const bid = structuredClone(source);

  switch (bid.type) {
    case "pairing-preference":
      return { ...bid, pairingIds: ["1001"], pairingLabels: ["PAIRING-1001"] };
    case "airport-preference":
      return { ...bid, locations: [{ code: "YVR", kind: "airport" }] };
    case "work-day-preference":
      return {
        ...bid,
        days: [{ dayOfWeek: "MON", checkInFrom: "08:00", checkInTo: "12:00" }],
      };
    case "pairing-length-preference":
      return { ...bid, minDays: 1, maxDays: 3 };
    case "flight-number-preference":
      return { ...bid, flightNumbers: ["F8123"] };
    case "tag-list":
      if (propertyCode === 159 || propertyCode === 160) return { ...bid, values: ["A321"] };
      if (propertyCode === 115) return { ...bid, values: ["F8001"] };
      return { ...bid, values: ["YVR"] };
    case "tag-list-date":
      return { ...bid, values: ["YVR"], date: "2026-06-06" };
    case "date-or-dow-list":
      return { ...bid, dates: ["2026-06-06"], daysOfWeek: [] };
    case "duration":
      return { ...bid, value: bid.value || "01:00" };
    case "time":
      return { ...bid, value: bid.value || "08:00" };
    case "text":
      return { ...bid, value: bid.value || "YVR" };
    default:
      return bid;
  }
};

const resolveVariantBid = (
  propertyCode: number,
  variant: string,
  baseBid: PbsPairingBidValue,
): PbsPairingBidValue => {
  if (propertyCode === 112) {
    const dateScope = variant === "specific-dates"
      ? { mode: "specific_dates" as const, dates: ["2026-06-06"] }
      : variant === "date-range"
        ? { mode: "date_range" as const, from: "2026-06-06", to: "2026-06-12" }
        : null;
    return { type: "pairing-length-preference", minDays: 1, maxDays: 3, dateScope };
  }
  if (propertyCode === 163) {
    if (variant === "current-range") {
      return { type: "month-end-carryover", operator: "Between", from: 1, to: 3 };
    }
    if (variant === "current-single") {
      return { type: "month-end-carryover", operator: ">", days: 2 };
    }
    return { type: "stepper", value: 2, min: 1, max: 7, operator: ">" };
  }
  if (propertyCode === 103) {
    if (variant !== "legacy") {
      const dateScope = variant === "current-specific"
        ? { mode: "specific_dates" as const, dates: ["2026-06-06"] }
        : variant === "current-range"
          ? { mode: "date_range" as const, from: "2026-06-06", to: "2026-06-12" }
          : null;
      return {
        type: "pairing-check-time",
        timeType: variant === "current-range" ? "check_out" : "check_in",
        operator: "Between",
        from: "08:00",
        to: "12:00",
        dateScope,
      };
    }
    return {
      type: "time-condition-list",
      conditions: [{ operator: "Between", from: "08:00", to: "12:00" }],
    };
  }
  if (propertyCode === 107) {
    if (variant.startsWith("current")) {
      return variant === "current-range"
        ? {
          type: "flight-legs-per-duty",
          operator: "Between",
          from: 1,
          to: 3,
          dateScope: { mode: "date_range", from: "2026-06-06", to: "2026-06-12" },
        }
        : {
          type: "flight-legs-per-duty",
          operator: "=",
          legs: 2,
          dateScope: { mode: "specific_dates", dates: ["2026-06-06"] },
        };
    }
    return { type: "stepper", value: 2, min: 1, max: 7, operator: "=" };
  }
  if (propertyCode === 110) {
    return {
      type: "work-day-preference",
      days: [{ dayOfWeek: "MON", checkInFrom: "08:00", checkInTo: "12:00" }],
      dateScope: variant === "specific-dates"
        ? { mode: "specific_dates", dates: ["2026-06-06"] }
        : { mode: "date_range", from: "2026-06-06", to: "2026-06-12" },
    };
  }
  if (propertyCode === 123) {
    return { type: "date-or-dow-list", dates: ["2026-06-06"], daysOfWeek: [] };
  }
  if (propertyCode === 116) {
    return { type: "flight-number-preference", flightNumbers: ["F8123"], dateScope: null };
  }
  if (propertyCode === 117) {
    return {
      type: "redeye-preference",
      dateScope: variant === "specific-dates"
        ? { mode: "specific_dates", dates: ["2026-06-06"] }
        : variant === "date-range"
          ? { mode: "date_range", from: "2026-06-06", to: "2026-06-12" }
          : null,
    };
  }
  if (propertyCode === 122) {
    return {
      type: "deadhead-flying",
      mode: variant === "deadhead-only-duty" ? "deadhead-only-duty" : "any-deadhead",
      dateScope: null,
    };
  }
  if (propertyCode === 129) {
    return { type: "duration", value: "01:00", operator: ">" };
  }
  if (propertyCode === 168) {
    return {
      type: "airport-preference",
      event: variant === "landing" ? "landing" : variant === "layover" ? "layover" : "landing_or_layover",
      locations: [{ code: "YVR", kind: "airport" }],
      dateScope: variant === "both-date-range-minimum"
        ? { mode: "date_range", from: "2026-06-06", to: "2026-06-12" }
        : null,
      minimumLayoverDuration: variant === "both-date-range-minimum" ? "12:00" : null,
    };
  }
  if ([104, 150, 151, 152].includes(propertyCode)) {
    return propertyCode === 152
      ? { type: "tag-list-date", values: ["YVR"], date: "2026-06-06" }
      : { type: "tag-list", values: ["YVR"] };
  }
  if ([142, 143, 144, 145, 146, 153, 154].includes(propertyCode)) {
    return { type: "text", value: "06:00" };
  }

  return materializeBid(propertyCode, baseBid);
};

export const generatedSqlPreflightCases = Object.freeze(
  generatedSqlPreflightManifest.flatMap((manifestEntry) => {
    const definition = catalogByCode.get(manifestEntry.propertyCode)
      ?? (manifestEntry.propertyCode === 111
        ? {
            name: "Release Time",
            defaultBid: { type: "time" as const, value: "12:00" },
          }
        : undefined);
    if (!definition) {
      throw new Error(`Missing Pairing property definition for ${manifestEntry.propertyCode}.`);
    }

    return manifestEntry.requiredCaseIds.map((id): GeneratedSqlPreflightCase => {
      const variant = id.split(":").at(-1) ?? "default";
      const quantifier = variant.includes("every") ? "every" : "any";

      return {
        id,
        propertyCode: manifestEntry.propertyCode,
        propertyName: definition.name,
        property: {
          propertyCode: manifestEntry.propertyCode,
          name: definition.name,
          action: "award",
          quantifier,
          bid: resolveVariantBid(manifestEntry.propertyCode, variant, definition.defaultBid),
        },
        context: {
          periodStartDate: "2026-06-01",
          periodEndDate: "2026-06-30",
          ...(manifestEntry.propertyCode === 117
            ? { redeye: { available: true as const, startTime: "03:30", endTime: "05:30", crossesMidnight: false, version: "03:30|05:30" } }
            : {}),
        },
        expected: { kind: "sql" },
      };
    });
  }),
);
