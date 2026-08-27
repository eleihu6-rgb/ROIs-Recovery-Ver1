import type { PbsEfficientFlyingConfig } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import {
  buildBidPropertySummary,
  type BidSummaryProperty,
} from "@/features/bid/bid-property-summary";
import {
  buildBidPropertyTextSummary,
  type BidPropertySummary,
} from "@/features/bid/bid-property-summary-types";
import { pluralizeBidSummaryUnit } from "@/features/bid/bid-property-summary-format";
import { formatPairingBidValue } from "@/features/pairing/pairing-bid-summary";
import {
  isPairingBidValue,
  type RuleBidExistingProperty,
} from "@/features/rule-bids/types";

const buildNeedsReviewSummary = (
  property: RuleBidExistingProperty,
): BidPropertySummary =>
  buildBidPropertyTextSummary(`${property.name} needs review`);

const formatStandingWeekdays = (
  property: RuleBidExistingProperty,
  preferOffConfig: PbsPreferOffConfig,
): string | null => {
  if (
    property.bid.type !== "date-or-dow-list"
    || property.bid.dates.length > 0
    || property.bid.daysOfWeek.length === 0
  ) {
    return null;
  }

  const weekdayByCode = new Map(
    preferOffConfig.weekdays.map((weekday) => [weekday.code, weekday]),
  );
  const weekdays = property.bid.daysOfWeek.map((code) => weekdayByCode.get(code));

  if (weekdays.some((weekday) => !weekday)) {
    return null;
  }

  const names = weekdays
    .filter((weekday): weekday is NonNullable<typeof weekday> => Boolean(weekday))
    .sort((left, right) => left.order - right.order)
    .map((weekday) => weekday.name);

  return names.length === 1 ? `${names[0]}s` : names.join(", ");
};

const buildStandingOnlySummary = (
  property: RuleBidExistingProperty,
  preferOffConfig: PbsPreferOffConfig,
): BidPropertySummary | null => {
  if (property.propertyCode === 204) {
    if (
      property.bid.type !== "stepper-date-range"
      || property.bid.from !== ""
      || property.bid.to !== ""
      || !Number.isSafeInteger(property.bid.value)
      || property.bid.value <= 0
    ) {
      return buildNeedsReviewSummary(property);
    }

    return buildBidPropertyTextSummary(
      `Award at least ${pluralizeBidSummaryUnit(property.bid.value, "consecutive day")} off`,
    );
  }

  if (property.propertyCode === 218 || property.propertyCode === 312) {
    const weekdays = formatStandingWeekdays(property, preferOffConfig);

    if (!weekdays) {
      return buildNeedsReviewSummary(property);
    }

    return buildBidPropertyTextSummary(
      property.propertyCode === 312
        ? `Reserve day off on ${weekdays}`
        : `Day off on ${weekdays}`,
    );
  }

  if (property.propertyCode === 313) {
    if (
      property.bid.type !== "stepper-range"
      || !Number.isSafeInteger(property.bid.from)
      || !Number.isSafeInteger(property.bid.to)
      || property.bid.from > property.bid.to
    ) {
      return buildNeedsReviewSummary(property);
    }

    return buildBidPropertyTextSummary(
      `Reserve work blocks of ${property.bid.from}–${property.bid.to} days`,
    );
  }

  if (property.propertyCode === 314) {
    return property.bid.type === "flag"
      ? buildBidPropertyTextSummary("Waive to allow carryover to be days off")
      : buildNeedsReviewSummary(property);
  }

  return null;
};

export const buildStandingBidPropertySummary = (
  property: RuleBidExistingProperty,
  preferOffConfig: PbsPreferOffConfig,
  efficientFlyingConfig?: PbsEfficientFlyingConfig,
): BidPropertySummary => {
  const standingOnlySummary = buildStandingOnlySummary(property, preferOffConfig);

  if (standingOnlySummary) {
    return standingOnlySummary;
  }

  if (
    property.sourceContext === "reserve"
    || property.bid.type === "reserve-call-type-date-scope"
  ) {
    if (!isPairingBidValue(property.bid)) {
      return buildNeedsReviewSummary(property);
    }

    const value = formatPairingBidValue(property.bid);
    return value === "--"
      ? buildNeedsReviewSummary(property)
      : buildBidPropertyTextSummary(value);
  }

  if (property.categoryLabel === "Days Off") {
    return buildBidPropertySummary(
      "days-off",
      property as BidSummaryProperty,
      preferOffConfig,
    );
  }

  if (property.categoryLabel === "Pairing") {
    return buildBidPropertySummary(
      "pairing",
      property as BidSummaryProperty,
      undefined,
      efficientFlyingConfig,
    );
  }

  if (property.categoryLabel === "Roster") {
    return buildBidPropertySummary("line", property as BidSummaryProperty);
  }

  return buildNeedsReviewSummary(property);
};
