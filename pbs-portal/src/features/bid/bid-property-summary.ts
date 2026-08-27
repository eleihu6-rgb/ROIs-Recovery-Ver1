import {
  BID_SUMMARY_COLLAPSED_GROUP_LIMIT,
  BID_SUMMARY_COLLAPSED_VALUE_LIMIT,
  buildBidPropertyTextSummary,
  type BidPropertySelectionSummary,
  type BidPropertySummary,
} from "@/features/bid/bid-property-summary-types";
import {
  formatBidSummaryAction,
  formatBidSummaryComparison,
  formatBidSummaryDate,
  formatBidSummaryDateOrValue,
  formatBidSummaryDateRange,
  formatBidSummaryDateScope,
  pluralizeBidSummaryUnit,
} from "@/features/bid/bid-property-summary-format";
import { formatPairingBidValue } from "@/features/pairing/pairing-bid-summary";
import type {
  PairingBidAction,
  PairingBidQuantifier,
  PairingBidValue,
} from "@/features/pairing/types";
import { formatPbsPairingLengthSummary } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsEfficientFlyingConfig } from "../../../../packages/contracts/pbs-pairing-bids.js";
import { parsePreferOffBidValues } from "../../../../packages/contracts/pbs-prefer-off.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import { pbsReserveLegacyPropertyCodes } from "../../../../packages/contracts/pbs-reserve-bids.js";

export type BidSummaryCategory = "days-off" | "pairing" | "line";

export type BidSummaryProperty = {
  propertyCode: number;
  name: string;
  action?: PairingBidAction | null;
  quantifier?: PairingBidQuantifier | null;
  bid: PairingBidValue | {
    type: "minimum-base-layover";
    minimumDuration: string;
  };
};

const DAY_LABELS: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const sortPreferOffWeekdays = (
  weekdays: string[],
  preferOffConfig?: PbsPreferOffConfig,
): string[] => {
  const configuredWeekdays = preferOffConfig?.weekdays
    ?? Object.entries(DAY_LABELS).map(([code, name], index) => ({
      code,
      isoDay: index + 1,
      name,
      order: index + 1,
    }));
  const orderByName = new Map(
    configuredWeekdays.map((weekday) => [weekday.name.toLocaleLowerCase(), weekday.order]),
  );

  return [...weekdays].sort((left, right) =>
    (orderByName.get(left.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER)
    - (orderByName.get(right.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER));
};

const buildNeedsReviewSummary = (property: BidSummaryProperty): BidPropertySummary =>
  buildBidPropertyTextSummary(`${property.name} needs review`);

const withDateScope = (
  text: string,
  dateScope: Parameters<typeof formatBidSummaryDateScope>[0],
  prefix: "on" | "starting on" = "on",
): string | null => {
  const scope = formatBidSummaryDateScope(dateScope, prefix);

  return scope === null ? null : [text, scope].filter(Boolean).join(" ");
};

const buildSelectionSummary = ({
  groupLabel,
  headline,
  rawValues,
  values,
}: {
  groupLabel: string;
  headline: string;
  rawValues: string[];
  values: string[];
}): BidPropertySelectionSummary => ({
  kind: "selection-list",
  headline,
  groups: [{
    key: groupLabel.toLowerCase().replaceAll(" ", "-"),
    label: groupLabel,
    values,
    rawValues,
  }],
  totalItemCount: rawValues.length,
  collapsedGroupLimit: BID_SUMMARY_COLLAPSED_GROUP_LIMIT,
  collapsedValueLimit: BID_SUMMARY_COLLAPSED_VALUE_LIMIT,
  title: `${headline}\n${groupLabel}: ${values.join(", ")}`,
});

const formatWorkDayPreferenceWindowSummary = (
  day: Extract<PairingBidValue, { type: "work-day-preference" }>["days"][number],
) => {
  const label = DAY_LABELS[day.dayOfWeek];
  const from = day.checkInFrom?.trim() ?? "";
  const to = day.checkInTo?.trim() ?? "";

  if (!label || (from && to && from === to)) {
    return null;
  }

  if (from && to) return `${label} between ${from} and ${to}`;
  if (from) return `${label} at or after ${from}`;
  if (to) return `${label} at or before ${to}`;
  return label;
};

const buildDaysOffBidPropertySummary = (
  property: BidSummaryProperty,
  preferOffConfig?: PbsPreferOffConfig,
): BidPropertySummary => {
  const { bid } = property;

  if (property.propertyCode === 201 && bid.type === "tag-list") {
    const parsed = parsePreferOffBidValues(bid.values, preferOffConfig);
    const withTimeWindow = (text: string): string => parsed.timeWindow
      ? `${text} from ${parsed.timeWindow.from} to ${parsed.timeWindow.to}`
      : text;

    if (
      !parsed.isTimeWindowValid
      || parsed.invalidValues.length > 0
      || (parsed.mode === "weekends" && !preferOffConfig?.weekend.available)
    ) {
      return buildNeedsReviewSummary(property);
    }

    if (parsed.mode === "date_range") {
      const range = formatBidSummaryDateRange(parsed.rangeFrom, parsed.rangeTo);
      return range
        ? buildBidPropertyTextSummary(withTimeWindow(`Prefer off ${range}`))
        : buildNeedsReviewSummary(property);
    }

    if (parsed.mode === "days_of_week" && parsed.weekdays.length > 0) {
      const sortedWeekdays = sortPreferOffWeekdays(parsed.weekdays, preferOffConfig);
      const weekdays = sortedWeekdays.length === 1
        ? `${sortedWeekdays[0]}s`
        : sortedWeekdays.join(", ");
      return buildBidPropertyTextSummary(withTimeWindow(`Prefer off on ${weekdays}`));
    }

    if (parsed.mode === "weekends") {
      return buildBidPropertyTextSummary(withTimeWindow("Prefer off on weekends"));
    }

    if (parsed.mode !== "specific_dates") {
      return buildNeedsReviewSummary(property);
    }

    const formattedDates = parsed.specificDates
      .map(formatBidSummaryDate)
      .filter((date): date is string => Boolean(date));

    if (formattedDates.length !== parsed.specificDates.length || formattedDates.length === 0) {
      return buildNeedsReviewSummary(property);
    }

    if (formattedDates.length > BID_SUMMARY_COLLAPSED_VALUE_LIMIT) {
      return buildSelectionSummary({
        groupLabel: "Dates",
        headline: withTimeWindow(
          `Prefer off on ${pluralizeBidSummaryUnit(formattedDates.length, "selected date")}`,
        ),
        rawValues: parsed.specificDates,
        values: formattedDates,
      });
    }

    return buildBidPropertyTextSummary(withTimeWindow(`Prefer off on ${formattedDates.join(", ")}`));
  }

  if (property.propertyCode === 204 && bid.type === "stepper-date-range") {
    const range = formatBidSummaryDateRange(bid.from, bid.to);

    return Number.isSafeInteger(bid.value) && bid.value > 0 && range
      ? buildBidPropertyTextSummary(
          `Award at least ${pluralizeBidSummaryUnit(bid.value, "consecutive day")} off ${range}`,
        )
      : buildNeedsReviewSummary(property);
  }

  return buildNeedsReviewSummary(property);
};

const buildPairingPreferenceSummary = (
  property: BidSummaryProperty,
  bid: Extract<PairingBidValue, { type: "pairing-preference" }>,
): BidPropertySummary => {
  const labels = bid.pairingLabels?.map((label) => label.trim()) ?? [];

  if (
    bid.pairingIds.length === 0
    || labels.length !== bid.pairingIds.length
    || labels.some((label) => label.length === 0)
  ) {
    return buildNeedsReviewSummary(property);
  }

  const counts = new Map<string, number>();

  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const action = formatBidSummaryAction(property.action);
  const labelCounts = Array.from(counts, ([label, count]) => `${label} ×${count}`);
  const headline = `${action ?? "Select"} pairings ${labelCounts.join(", ")}`;

  if (labelCounts.length <= BID_SUMMARY_COLLAPSED_GROUP_LIMIT) {
    return buildBidPropertyTextSummary(headline);
  }

  return {
    kind: "selection-list",
    headline: `${action ?? "Select"} ${pluralizeBidSummaryUnit(labels.length, "selected pairing")}`,
    groups: Array.from(counts, ([label, count]) => ({
      key: label,
      label,
      values: [`${count} selected`],
      rawValues: labels.filter((candidate) => candidate === label),
    })),
    totalItemCount: labels.length,
    collapsedGroupLimit: BID_SUMMARY_COLLAPSED_GROUP_LIMIT,
    collapsedValueLimit: BID_SUMMARY_COLLAPSED_VALUE_LIMIT,
    title: headline,
  };
};

const buildPairingBidPropertySummary = (
  property: BidSummaryProperty,
  efficientFlyingConfig?: PbsEfficientFlyingConfig,
): BidPropertySummary => {
  const { bid } = property;
  const action = formatBidSummaryAction(property.action);

  if (property.propertyCode === 428 && bid.type === "efficient-flying-preference") {
    const percentile = efficientFlyingConfig?.percentile;

    if (!Number.isInteger(percentile) || percentile === undefined || percentile < 1 || percentile > 50) {
      return buildBidPropertyTextSummary("Efficient flying configuration is unavailable.");
    }

    return buildBidPropertyTextSummary(
      `${bid.mode === "efficient" ? "Efficient flying · Top" : "Inefficient flying · Bottom"} ${percentile}% by average daily credit`,
    );
  }

  if (property.propertyCode === 102 && bid.type === "pairing-preference") {
    return buildPairingPreferenceSummary(property, bid);
  }

  if (property.propertyCode === 103 && bid.type === "pairing-check-time" && action) {
    const timeType = bid.timeType === "check_out" ? "check-out" : "check-in";
    const comparison = bid.operator === "Between"
      ? `between ${bid.from} and ${bid.to}`
      : formatBidSummaryComparison(bid.operator, bid.value);
    const text = comparison
      ? withDateScope(`${action} pairings checking ${timeType} ${comparison}`, bid.dateScope)
      : null;

    return text ? buildBidPropertyTextSummary(text) : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 107 && bid.type === "flight-legs-per-duty" && action) {
    const comparison = bid.operator === "Between"
      ? `between ${bid.from} and ${bid.to}`
      : formatBidSummaryComparison(bid.operator, bid.legs);
    const quantifier = property.quantifier === "every" ? "every" : "any";
    const text = comparison
      ? withDateScope(
          `${action} pairings with ${quantifier} duty having ${comparison} flying legs`,
          bid.dateScope,
        )
      : null;

    return text ? buildBidPropertyTextSummary(text) : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 110 && bid.type === "work-day-preference" && action) {
    if (bid.days.length === 0) {
      return buildNeedsReviewSummary(property);
    }

    const windows = bid.days.map(formatWorkDayPreferenceWindowSummary);
    if (windows.some((window) => window === null)) {
      return buildNeedsReviewSummary(property);
    }
    const formattedWindows = windows.filter((window): window is string => window !== null);

    const text = withDateScope(
      `${action} pairings checking in on ${formattedWindows.join("; ")}`,
      bid.dateScope,
    );

    return text ? buildBidPropertyTextSummary(text) : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 112 && bid.type === "pairing-length-preference") {
    const text = property.action === "award" || property.action === "avoid"
      ? formatPbsPairingLengthSummary({
          action: property.action,
          dateScope: bid.dateScope,
          maxDays: bid.maxDays,
          minDays: bid.minDays,
        })
      : null;

    return text ? buildBidPropertyTextSummary(text) : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 116 && bid.type === "flight-number-preference" && action) {
    const flights = bid.flightNumbers.map((flight) => flight.trim().toUpperCase());

    if (flights.length === 0 || flights.some((flight) => flight.length === 0)) {
      return buildNeedsReviewSummary(property);
    }

    const dateScope = formatBidSummaryDateScope(bid.dateScope);
    const text = dateScope === null
      ? null
      : [
          `${action} pairings with ${flights.length === 1 ? "flight" : "flights"} ${flights.join(", ")}`,
          dateScope,
        ].filter(Boolean).join(" ");

    if (!text) {
      return buildNeedsReviewSummary(property);
    }

    return flights.length > BID_SUMMARY_COLLAPSED_VALUE_LIMIT
      ? buildSelectionSummary({
          groupLabel: "Flights",
          headline: [
            `${action} pairings with ${pluralizeBidSummaryUnit(flights.length, "selected flight")}`,
            dateScope,
          ].filter(Boolean).join(" "),
          rawValues: bid.flightNumbers,
          values: flights,
        })
      : buildBidPropertyTextSummary(text);
  }

  if (property.propertyCode === 117 && bid.type === "redeye-preference" && action) {
    const text = withDateScope(`${action} pairings with a redeye leg`, bid.dateScope);
    return text ? buildBidPropertyTextSummary(text) : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 122 && bid.type === "deadhead-flying" && action) {
    const mode = bid.mode === "any-deadhead"
      ? "any deadhead"
      : bid.mode === "deadhead-only-duty"
        ? "a deadhead-only duty"
        : null;
    const text = mode ? withDateScope(`${action} pairings with ${mode}`, bid.dateScope) : null;
    return text ? buildBidPropertyTextSummary(text) : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 129 && bid.type === "duration" && action) {
    const comparison = formatBidSummaryComparison(bid.operator, bid.value);
    return comparison
      ? buildBidPropertyTextSummary(`${action} pairings with ${comparison} between flights`)
      : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 163 && bid.type === "month-end-carryover" && action) {
    const comparison = bid.operator === "Between"
      ? bid.from != null && bid.to != null
        ? `between ${bid.from} and ${bid.to} days`
        : null
      : bid.days != null
        ? bid.operator === ">"
          ? `greater than ${bid.days} days`
          : bid.operator === "<"
            ? `less than ${bid.days} days`
            : `exactly ${bid.days} days`
        : null;

    return comparison
      ? buildBidPropertyTextSummary(`${action} pairings with month-end carryover ${comparison}`)
      : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 168 && bid.type === "airport-preference" && action) {
    const locations = bid.locations.map(({ code }) => code.trim().toUpperCase());
    const event = bid.event === "layover"
      ? "laying over at"
      : bid.event === "landing_or_layover"
        ? "landing or laying over at"
        : "landing at";

    if (locations.length === 0 || locations.some((location) => location.length === 0)) {
      return buildNeedsReviewSummary(property);
    }

    const dateScope = formatBidSummaryDateScope(bid.dateScope);
    const layoverDuration = bid.minimumLayoverDuration?.trim()
      ? `with preferred layover at least ${bid.minimumLayoverDuration.trim()}`
      : "";
    const text = dateScope === null
      ? null
      : [
          `${action} pairings ${event} ${locations.join(", ")}`,
          dateScope,
          layoverDuration,
        ].filter(Boolean).join(" ");

    if (!text) {
      return buildNeedsReviewSummary(property);
    }

    return locations.length > BID_SUMMARY_COLLAPSED_VALUE_LIMIT
      ? buildSelectionSummary({
          groupLabel: "Airports",
          headline: [
            `${action} pairings ${event} ${pluralizeBidSummaryUnit(locations.length, "selected airport")}`,
            dateScope,
            layoverDuration,
          ].filter(Boolean).join(" "),
          rawValues: bid.locations.map(({ code }) => code),
          values: locations,
        })
      : buildBidPropertyTextSummary(text);
  }

  const fallback = formatPairingBidValue(bid as PairingBidValue);
  return fallback !== "--"
    ? buildBidPropertyTextSummary([action, fallback].filter(Boolean).join(" · "))
    : buildNeedsReviewSummary(property);
};

const formatReserveDateScope = (
  dateScope: Extract<PairingBidValue, { type: "reserve-flying-date-pattern" }>["segments"][number]["dateScope"],
): string | null => {
  if (dateScope.mode === "whole_month") {
    return "for the whole month";
  }

  if (dateScope.mode === "first_half") {
    return "for the first half";
  }

  if (dateScope.mode === "second_half") {
    return "for the second half";
  }

  if (dateScope.mode === "date_range") {
    return formatBidSummaryDateRange(dateScope.from, dateScope.to);
  }

  const dates = dateScope.dates.map(formatBidSummaryDateOrValue);
  return dates.length > 0 ? `on ${dates.join(", ")}` : null;
};

const buildLineBidPropertySummary = (
  property: BidSummaryProperty,
): BidPropertySummary => {
  const { bid } = property;

  if (property.propertyCode === 407 && bid.type === "minimum-base-layover") {
    return bid.minimumDuration.trim()
      ? buildBidPropertyTextSummary(`At least ${bid.minimumDuration.trim()} base layover`)
      : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 408 && bid.type === "days-off-on-pattern") {
    if (bid.minDaysOff <= 0 || bid.minDaysOn <= 0 || bid.maxDaysOn < bid.minDaysOn) {
      return buildNeedsReviewSummary(property);
    }

    const daysOn = bid.minDaysOn === bid.maxDaysOn
      ? String(bid.minDaysOn)
      : `${bid.minDaysOn}–${bid.maxDaysOn}`;
    const range = bid.dateRange
      ? formatBidSummaryDateRange(bid.dateRange.from, bid.dateRange.to)
      : "";

    return range === null
      ? buildNeedsReviewSummary(property)
      : buildBidPropertyTextSummary(
          `Work ${daysOn} days, then ${pluralizeBidSummaryUnit(bid.minDaysOff, "day")} off${range ? ` ${range}` : ""}`,
        );
  }

  if (property.propertyCode === 410 && bid.type === "reserve-flying-date-pattern") {
    if (bid.segments.length === 0) {
      return buildNeedsReviewSummary(property);
    }

    const segments = bid.segments.map((segment) => {
      const scope = formatReserveDateScope(segment.dateScope);
      if (!scope) {
        return null;
      }

      return segment.workType === "reserve"
        ? `Reserve ${segment.callType} ${scope}`
        : `flying ${scope}`;
    });

    return segments.some((segment) => !segment)
      ? buildNeedsReviewSummary(property)
      : buildBidPropertyTextSummary(segments.join("; "));
  }

  if (
    property.propertyCode === pbsReserveLegacyPropertyCodes.shortCallType
    && bid.type === "reserve-call-type-date-scope"
  ) {
    const scope = formatReserveDateScope(bid.dateScope);

    return scope
      ? buildBidPropertyTextSummary(
          `${property.action === "avoid" ? "Avoid" : "Award"} ${bid.callType} short call ${scope}`,
        )
      : buildNeedsReviewSummary(property);
  }

  if (property.propertyCode === 427 && bid.type === "flag") {
    return buildBidPropertyTextSummary(
      property.action === "avoid"
        ? "Pairing only for the whole bid month"
        : property.action === "award"
          ? "Reserve only for the whole bid month"
          : "Mixed line for the whole bid month",
    );
  }

  if (property.propertyCode === 428 && bid.type === "flag") {
    return buildBidPropertyTextSummary(
      `${property.action === "avoid" ? "Avoid" : "Award"} Efficient Flying First`,
    );
  }

  if (property.propertyCode === 429 && bid.type === "credit-window-preference") {
    return buildBidPropertyTextSummary(
      bid.direction === "more" ? "More credit" : "Less credit",
    );
  }

  return buildNeedsReviewSummary(property);
};

export const buildBidPropertySummary = (
  category: BidSummaryCategory,
  property: BidSummaryProperty,
  preferOffConfig?: PbsPreferOffConfig,
  efficientFlyingConfig?: PbsEfficientFlyingConfig,
): BidPropertySummary => {
  if (category === "days-off") {
    return buildDaysOffBidPropertySummary(property, preferOffConfig);
  }

  if (category === "pairing") {
    return buildPairingBidPropertySummary(property, efficientFlyingConfig);
  }

  return buildLineBidPropertySummary(property);
};
