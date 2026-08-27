import { pbsReserveLegacyPropertyCodes } from "../../../../packages/contracts/pbs-reserve-bids.js";
import type { ReserveDateScope } from "@/features/pairing/types";
import type { RuleBidAvailableProperty, RuleBidExistingProperty } from "@/features/rule-bids/types";
import { createRuleBidTierOptions } from "@/features/rule-bids/utils";

export const RESERVE_PREFERENCE_PROPERTY_CODE = pbsReserveLegacyPropertyCodes.shortCallType;

export const isReservePreferenceProperty = (propertyCode: number) =>
  propertyCode === RESERVE_PREFERENCE_PROPERTY_CODE;

export const buildReserveDateScopeKey = (dateScope: ReserveDateScope) => {
  if (dateScope.mode === "date_range") {
    return `${dateScope.mode}:${dateScope.from}:${dateScope.to}`;
  }

  if (dateScope.mode === "specific_dates") {
    return `${dateScope.mode}:${dateScope.dates.join(",")}`;
  }

  return dateScope.mode;
};

export const buildReservePreferenceProperty = (
  template: RuleBidAvailableProperty,
  callType: string,
  selectedTiers: string[],
  dateScope: ReserveDateScope,
): RuleBidAvailableProperty => ({
  ...template,
  id: `reserve-preference-${callType}-${buildReserveDateScopeKey(dateScope)}-${selectedTiers.join("-")}`,
  favorited: false,
  bid: {
    type: "reserve-call-type-date-scope",
    callType,
    options: template.bid.type === "select" || template.bid.type === "reserve-call-type-date-scope"
      ? template.bid.options
      : [callType],
    dateScope,
  },
  tiers: createRuleBidTierOptions(selectedTiers),
});

export const normalizeReservePreferenceBid = (bid: RuleBidExistingProperty["bid"]): {
  callType: string;
  dateScope: ReserveDateScope;
} | null => {
  if (bid.type === "select") {
    return {
      callType: bid.value,
      dateScope: { mode: "whole_month" },
    };
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return {
      callType: bid.callType,
      dateScope: bid.dateScope,
    };
  }

  return null;
};

export const asRosterReservePreferenceProperty = <
  TProperty extends RuleBidAvailableProperty | RuleBidExistingProperty,
>(
  property: TProperty,
): TProperty => ({
  ...property,
  categoryLabel: "Roster",
  categorySortOrder: 3,
  sourceContext: "reserve",
});

export const getReservePreferenceProperties = <
  TProperty extends RuleBidAvailableProperty | RuleBidExistingProperty,
>(
  properties: TProperty[],
) => properties
  .filter((property) => isReservePreferenceProperty(property.propertyCode))
  .map(asRosterReservePreferenceProperty);
