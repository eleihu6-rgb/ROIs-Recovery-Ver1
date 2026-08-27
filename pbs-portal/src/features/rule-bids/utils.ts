import type { PairingBidValue } from "@/features/pairing/types";
import type {
  RuleBidAvailableProperty,
  RuleBidConfiguredFavoriteProperty,
  RuleBidExistingProperty,
  RuleBidTierOption,
  RuleBidValue,
} from "@/features/rule-bids/types";

type RuleBidModifierPatch = Pick<RuleBidExistingProperty, "allOrNothing" | "minimumN" | "maximumN">;

export const createRuleBidTierOptions = (activeLabels: string[]): RuleBidTierOption[] =>
  Array.from({ length: 7 }, (_, index) => {
    const label = `T${index + 1}`;

    return {
      key: label.toLowerCase(),
      label,
      active: activeLabels.includes(label),
    };
  });

export const cloneRuleBidValue = (bid: RuleBidValue): RuleBidValue => {
  if (
    bid.type === "time-range"
    || bid.type === "time-range-date"
    || bid.type === "date-range"
    || bid.type === "stepper-date"
    || bid.type === "stepper-range"
    || bid.type === "stepper-range-date"
    || bid.type === "stepper-date-range"
    || bid.type === "days-off-on-pattern"
    || bid.type === "credit-density-preference"
    || bid.type === "reserve-call-type-date-scope"
    || bid.type === "crew-days-off-share"
    || bid.type === "employee-schedule-preference"
    || bid.type === "time-date"
    || bid.type === "percent-range"
    || bid.type === "duration-range"
  ) {
    if (bid.type === "reserve-call-type-date-scope") {
      return {
        ...bid,
        options: [...bid.options],
        dateScope: bid.dateScope.mode === "specific_dates"
          ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
          : { ...bid.dateScope },
      };
    }

    return {
      ...bid,
      ...(bid.type === "days-off-on-pattern" && bid.dateRange ? { dateRange: { ...bid.dateRange } } : {}),
    };
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return {
      ...bid,
      segments: bid.segments.map((segment) =>
        segment.workType === "reserve"
          ? {
              ...segment,
              dateScope: segment.dateScope.mode === "specific_dates"
                ? { ...segment.dateScope, dates: [...segment.dateScope.dates] }
                : { ...segment.dateScope },
            }
          : {
              ...segment,
              dateScope: segment.dateScope.mode === "specific_dates"
                ? { ...segment.dateScope, dates: [...segment.dateScope.dates] }
                : { ...segment.dateScope },
            }),
      callTypeOptions: [...bid.callTypeOptions],
    };
  }

  if (bid.type === "date-or-dow-list") {
    return {
      ...bid,
      dates: [...bid.dates],
      daysOfWeek: [...bid.daysOfWeek],
    };
  }

  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
    };
  }

  if (bid.type === "tag-list" || bid.type === "tag-list-date") {
    return {
      ...bid,
      values: [...bid.values],
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    };
  }

  if (bid.type === "pairing-occurrence-list") {
    return {
      ...bid,
      occurrences: bid.occurrences.map((occurrence) => ({ ...occurrence })),
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    };
  }

  if (bid.type === "time-condition-list") {
    return {
      ...bid,
      conditions: bid.conditions.map((condition) => ({ ...condition })),
    };
  }

  return { ...bid };
};

export const cloneRuleBidExistingProperties = (items: RuleBidExistingProperty[]) =>
  items.map((item) => ({
    ...item,
    action: item.action ?? null,
    supportedActions: item.supportedActions ? [...item.supportedActions] : undefined,
    bid: cloneRuleBidValue(item.bid),
    tiers: item.tiers.map((tier) => ({ ...tier })),
    allOrNothing: item.allOrNothing ?? false,
    minimumN: item.minimumN ?? null,
    maximumN: item.maximumN ?? null,
  }));

export const cloneRuleBidAvailableProperties = (items: RuleBidAvailableProperty[]) =>
  items.map((item) => ({
    ...item,
    action: item.action ?? null,
    supportedActions: item.supportedActions ? [...item.supportedActions] : undefined,
    bid: cloneRuleBidValue(item.bid),
    tiers: item.tiers.map((tier) => ({ ...tier })),
    allOrNothing: item.allOrNothing ?? false,
    minimumN: item.minimumN ?? null,
    maximumN: item.maximumN ?? null,
  }));

export const buildRuleBidExistingPropertyFromAvailable = (
  property: RuleBidAvailableProperty,
  id: string,
): RuleBidExistingProperty => ({
  id,
  propertyCode: property.propertyCode,
  name: property.name,
  action: property.action ?? null,
  supportedActions: property.supportedActions,
  bid: cloneRuleBidValue(property.bid),
  tiers: property.tiers.map((tier) => ({ ...tier })),
  allOrNothing: property.allOrNothing ?? false,
  minimumN: property.minimumN ?? null,
  maximumN: property.maximumN ?? null,
});

export const buildRuleBidAvailablePropertyFromConfiguredFavorite = (
  favorite: RuleBidConfiguredFavoriteProperty,
): RuleBidAvailableProperty => ({
  id: `favorite-${favorite.favoriteKey}`,
  favoriteKey: favorite.favoriteKey,
  propertyId: favorite.propertyId,
  source: "favorite",
  propertyCode: favorite.propertyCode,
  name: favorite.name,
  action: favorite.action ?? null,
  favorited: true,
  bid: cloneRuleBidValue(favorite.bid),
  tiers: createRuleBidTierOptions([]),
  allOrNothing: favorite.allOrNothing ?? false,
  minimumN: favorite.minimumN ?? null,
  maximumN: favorite.maximumN ?? null,
});

const updateRuleBidPropertyById = <Property extends { id: string }>(
  properties: Property[],
  propertyId: string,
  updateProperty: (property: Property) => Property,
) =>
  properties.map((property) => (
    property.id === propertyId ? updateProperty(property) : property
  ));

export const updateRuleBidExistingPropertyBid = (
  properties: RuleBidExistingProperty[],
  propertyId: string,
  bid: PairingBidValue,
) =>
  updateRuleBidPropertyById(properties, propertyId, (property) => ({
    ...property,
    bid: cloneRuleBidValue(bid),
  }));

export const updateRuleBidExistingPropertyTier = (
  properties: RuleBidExistingProperty[],
  propertyId: string,
  tierKey: string,
) =>
  updateRuleBidPropertyById(properties, propertyId, (property) => ({
    ...property,
    tiers: toggleRuleBidTierOptions(property.tiers, tierKey),
  }));

export const updateRuleBidExistingPropertyModifiers = (
  properties: RuleBidExistingProperty[],
  propertyId: string,
  patch: RuleBidModifierPatch,
) =>
  updateRuleBidPropertyById(properties, propertyId, (property) => ({
    ...property,
    ...patch,
  }));

export const removeRuleBidExistingPropertyById = (
  properties: RuleBidExistingProperty[],
  propertyId: string,
) => properties.filter((property) => property.id !== propertyId);

export const buildRuleBidSavedExistingPropertiesAfterAdd = (
  properties: RuleBidExistingProperty[],
  property: RuleBidExistingProperty,
  savedPropertyId: string,
) => cloneRuleBidExistingProperties([
  ...properties,
  {
    ...property,
    id: savedPropertyId,
  },
]);

const areRuleBidMergeFieldsEqual = (
  left: RuleBidExistingProperty,
  right: RuleBidExistingProperty,
) => left.propertyCode === right.propertyCode
  && (left.action ?? null) === (right.action ?? null)
  && areRuleBidValuesEqual(left.bid, right.bid)
  && (left.allOrNothing ?? false) === (right.allOrNothing ?? false)
  && (left.minimumN ?? null) === (right.minimumN ?? null)
  && (left.maximumN ?? null) === (right.maximumN ?? null);

const getRuleBidTierSortValue = (tier: RuleBidTierOption) => {
  const numericLabel = Number.parseInt(tier.label.replace(/^T/i, ""), 10);

  return Number.isFinite(numericLabel) ? numericLabel : Number.MAX_SAFE_INTEGER;
};

export const mergeRuleBidExistingPropertyActiveTiers = (
  target: RuleBidExistingProperty,
  source: RuleBidExistingProperty,
): RuleBidExistingProperty => {
  const activeLabels = new Set([
    ...getActiveRuleBidTierLabels(target.tiers),
    ...getActiveRuleBidTierLabels(source.tiers),
  ]);
  const tiersByLabel = new Map<string, RuleBidTierOption>();

  for (const tier of [...target.tiers, ...source.tiers]) {
    tiersByLabel.set(tier.label, {
      ...tier,
      active: activeLabels.has(tier.label),
    });
  }

  return {
    ...target,
    tiers: [...tiersByLabel.values()]
      .sort((left, right) =>
        getRuleBidTierSortValue(left) - getRuleBidTierSortValue(right)
        || left.label.localeCompare(right.label)),
  };
};

export const findRuleBidExistingPropertyTierMerge = (
  existingProperties: RuleBidExistingProperty[],
  candidate: RuleBidExistingProperty,
) => {
  const targetProperty = existingProperties.find((property) =>
    areRuleBidMergeFieldsEqual(property, candidate));

  if (!targetProperty) {
    return null;
  }

  const mergedProperty = mergeRuleBidExistingPropertyActiveTiers(targetProperty, candidate);

  return {
    targetProperty,
    mergedProperty,
    hasNewActiveTier: !areRuleBidActiveTierLabelsEqual(targetProperty.tiers, mergedProperty.tiers),
  };
};

export const toggleRuleBidAvailablePropertyFavoriteById = (
  properties: RuleBidAvailableProperty[],
  propertyId: string,
) =>
  updateRuleBidPropertyById(properties, propertyId, (property) => ({
    ...property,
    favorited: !property.favorited,
  }));

const areRuleBidValuesEqual = (
  left: RuleBidExistingProperty["bid"],
  right: RuleBidExistingProperty["bid"],
) => JSON.stringify(left) === JSON.stringify(right);

const areRuleBidTierOptionsEqual = (
  left: RuleBidTierOption[],
  right: RuleBidTierOption[],
) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((tier, index) => {
    const rightTier = right[index];

    return tier.key === rightTier.key
      && tier.label === rightTier.label
      && tier.active === rightTier.active;
  });
};

const getActiveRuleBidTierLabels = (tiers: RuleBidTierOption[]) =>
  tiers
    .filter((tier) => tier.active)
    .map((tier) => tier.label)
    .sort();

const areRuleBidActiveTierLabelsEqual = (
  left: RuleBidTierOption[],
  right: RuleBidTierOption[],
) => {
  const leftLabels = getActiveRuleBidTierLabels(left);
  const rightLabels = getActiveRuleBidTierLabels(right);

  if (leftLabels.length !== rightLabels.length) {
    return false;
  }

  return leftLabels.every((label, index) => label === rightLabels[index]);
};

export const hasDuplicateRuleBidExistingProperty = (
  existingProperties: RuleBidExistingProperty[],
  candidate: RuleBidExistingProperty,
) =>
  existingProperties.some((property) =>
    property.propertyCode === candidate.propertyCode
    && areRuleBidValuesEqual(property.bid, candidate.bid)
    && areRuleBidActiveTierLabelsEqual(property.tiers, candidate.tiers)
    && (property.allOrNothing ?? false) === (candidate.allOrNothing ?? false)
    && (property.minimumN ?? null) === (candidate.minimumN ?? null)
    && (property.maximumN ?? null) === (candidate.maximumN ?? null));

const areRuleBidExistingPropertiesShallowEqual = (
  left: RuleBidExistingProperty,
  right: RuleBidExistingProperty,
) => left.id === right.id
  && left.propertyCode === right.propertyCode
  && left.name === right.name
  && (left.allOrNothing ?? false) === (right.allOrNothing ?? false)
  && (left.minimumN ?? null) === (right.minimumN ?? null)
  && (left.maximumN ?? null) === (right.maximumN ?? null)
  && areRuleBidValuesEqual(left.bid, right.bid)
  && areRuleBidTierOptionsEqual(left.tiers, right.tiers);

export const areRuleBidExistingPropertiesEqual = (
  left: RuleBidExistingProperty[],
  right: RuleBidExistingProperty[],
) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((property, index) =>
    areRuleBidExistingPropertiesShallowEqual(property, right[index]),
  );
};

export const toggleRuleBidTierOptions = (
  tiers: RuleBidExistingProperty["tiers"] | RuleBidAvailableProperty["tiers"],
  tierKey: string,
) => {
  const activeCount = tiers.filter((tier) => tier.active).length;

  return tiers.map((tier) => {
    if (tier.key !== tierKey) {
      return tier;
    }

    if (tier.active && activeCount === 1) {
      return tier;
    }

    return {
      ...tier,
      active: !tier.active,
    };
  });
};

export {
  buildRuleBidAvailablePropertiesPage,
  buildRuleBidPaginationItems,
  clampRuleBidPage,
} from "@/features/rule-bids/rule-bid-pagination";
export {
  buildRuleBidAvailableCategoryFilters,
  filterRuleBidAvailableProperties,
  normalizeRuleBidSearchText,
  RULE_BID_ALL_CATEGORY_KEY,
} from "@/features/rule-bids/rule-bid-filtering";
export type {
  RuleBidAvailableCategoryFilter,
  RuleBidAvailablePropertyTab,
} from "@/features/rule-bids/rule-bid-filtering";
export {
  buildRuleBidHydrationKey,
  buildRuleBidViewResetKey,
} from "@/features/rule-bids/rule-bid-panel-keys";
export { getRuleBidSaveErrorMessage } from "@/features/rule-bids/rule-bid-errors";
