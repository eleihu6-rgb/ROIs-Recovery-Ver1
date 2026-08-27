import { isValidIsoDate, parsePreferOffBidValues } from "./pbs-prefer-off.js";

export const pbsFavoriteDateSemanticContexts = Object.freeze({
  generic: Object.freeze({ kind: "generic" }),
});

const DATE_FREE_BID_TYPES = new Set([
  "flag",
  "efficient-flying-preference",
  "stepper",
  "stepper-range",
  "credit-density-preference",
  "minimum-base-layover",
  "credit-window-preference",
  "time",
  "time-range",
  "time-condition-list",
  "duration",
  "duration-range",
  "pairing-preference",
  "month-end-carryover",
  "select",
  "pairing-id-list",
  "crew-days-off-share",
  "employee-schedule-preference",
  "percent",
  "percent-range",
  "percent-or-duration",
  "text",
]);

const hasValidDate = (values) => values.some((value) =>
  typeof value === "string" && isValidIsoDate(value));

const hasExplicitDateScope = (dateScope) => {
  if (dateScope == null) {
    return false;
  }

  if (dateScope.mode === "specific_dates") {
    return Array.isArray(dateScope.dates) && hasValidDate(dateScope.dates);
  }

  if (dateScope.mode === "date_range") {
    return hasValidDate([dateScope.from, dateScope.to]);
  }

  if (
    dateScope.mode === "whole_month"
    || dateScope.mode === "first_half"
    || dateScope.mode === "second_half"
  ) {
    return false;
  }

  throw new TypeError(`Unsupported PBS favorite date scope: ${String(dateScope.mode)}`);
};

const assertSemanticContext = (semanticContext) => {
  if (semanticContext?.kind !== "generic" && semanticContext?.kind !== "prefer-off") {
    throw new TypeError("A valid PBS favorite date semantic context is required.");
  }
};

export const containsExplicitCalendarDate = (bid, semanticContext) => {
  assertSemanticContext(semanticContext);

  switch (bid.type) {
    case "date":
      return hasValidDate([bid.value]);
    case "stepper-date":
    case "stepper-range-date":
    case "time-date":
    case "time-range-date":
    case "tag-list-date":
      return hasValidDate([bid.date]);
    case "stepper-date-range":
    case "date-range":
      return hasValidDate([bid.from, bid.to]);
    case "days-off-on-pattern":
      return bid.dateRange != null
        && hasValidDate([bid.dateRange.from, bid.dateRange.to]);
    case "date-or-dow-list":
      return hasValidDate(bid.dates);
    case "work-day-preference":
    case "airport-preference":
    case "pairing-check-time":
    case "flight-legs-per-duty":
    case "pairing-length-preference":
    case "deadhead-flying":
    case "flight-number-preference":
    case "redeye-preference":
    case "reserve-call-type-date-scope":
      return hasExplicitDateScope(bid.dateScope);
    case "reserve-flying-date-pattern":
      return bid.segments.some((segment) => hasExplicitDateScope(segment.dateScope));
    case "tag-list": {
      if (semanticContext.kind !== "prefer-off") {
        return false;
      }

      const parsed = parsePreferOffBidValues(bid.values, semanticContext.preferOffConfig);
      return parsed.specificDates.length > 0
        || hasValidDate([parsed.rangeFrom, parsed.rangeTo]);
    }
    case "pairing-occurrence-list":
      return bid.occurrences.some((occurrence) => hasValidDate([occurrence.originDate]));
    default:
      if (DATE_FREE_BID_TYPES.has(bid.type)) {
        return false;
      }
      throw new TypeError(`Unsupported PBS favorite bid type: ${String(bid.type)}`);
  }
};
