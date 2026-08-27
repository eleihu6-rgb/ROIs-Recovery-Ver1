import {
  clonePairingBidValue,
  pairingPropertyPriorityOptions,
} from "@/features/pairing/pairing-property-catalog";
import type {
  PairingAvailableProperty,
  PairingBidAction,
  PairingBidQuantifier,
  PairingBidValue,
  PairingExistingProperty,
  PairingTierOption,
  PairingRightPanelData,
  PairingSearchCriteriaItem,
  PairingSearchPreviewProperty,
} from "@/features/pairing/types";

export const createPairingTierOptions = (activeLabels: string[]): PairingTierOption[] =>
  Array.from({ length: 7 }, (_, index) => {
    const label = `T${index + 1}`;

    return {
      key: label.toLowerCase(),
      label,
      active: activeLabels.includes(label),
    };
  });

export const clonePairingTierOptions = (tiers: PairingTierOption[]) =>
  tiers.map((tier) => ({ ...tier }));

export const buildPairingAvailablePropertyFromExisting = (
  property: PairingExistingProperty,
): PairingAvailableProperty => ({
  ...property,
  source: "catalog",
  favorited: false,
  actions: ["add", "preview"],
  tiers: property.tiers.map((tier) => ({ ...tier })),
  effectiveDateRange: { ...property.effectiveDateRange },
});

export const togglePairingTierOptions = (
  tiers: PairingTierOption[],
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

export const getActivePairingTierLabels = (properties: PairingExistingProperty[]) =>
  Array.from(
    new Set(
      properties.flatMap((property) =>
        property.tiers
          .filter((tier) => tier.active)
          .map((tier) => tier.label),
      ),
    ),
  ).sort((left, right) => {
    const leftNumber = Number.parseInt(left.replace(/^T/i, ""), 10);
    const rightNumber = Number.parseInt(right.replace(/^T/i, ""), 10);

    return leftNumber - rightNumber;
  });

export const buildPairingRightPanelHydrationKey = (
  draftMeta: PairingRightPanelData["draftMeta"],
  existingProperties: PairingExistingProperty[],
  initialSearchForm: PairingRightPanelData["initialSearchForm"],
) =>
  JSON.stringify({
    draftMeta: {
      draftKey: draftMeta.draftKey,
      bidId: draftMeta.bidId,
      periodId: draftMeta.periodId,
      periodCode: draftMeta.periodCode,
      bidContext: draftMeta.bidContext,
      remarks: draftMeta.remarks,
    },
    existingProperties,
    initialSearchForm,
  });

export const cloneSearchCriteriaItem = (
  item: PairingSearchCriteriaItem,
): PairingSearchCriteriaItem => ({
  ...item,
  bid: clonePairingBidValue(item.bid),
  tiers: clonePairingTierOptions(item.tiers),
  effectiveDateRange: { ...item.effectiveDateRange },
});

export const cloneExistingPropertyFromAvailable = (
  property: PairingAvailableProperty,
  existingCount: number,
): PairingExistingProperty => ({
  id: `existing-${property.id}-${existingCount + 1}`,
  propertyCode: property.propertyCode,
  name: property.name,
  action: property.action ?? null,
  quantifier: property.quantifier ?? null,
  bid: clonePairingBidValue(property.bid),
  tiers: clonePairingTierOptions(property.tiers),
  priorityOptions: [...pairingPropertyPriorityOptions],
  pairingNumber: property.pairingNumber,
  pairingType: property.pairingType,
  effectiveDateRange: { ...property.effectiveDateRange },
});

export const cloneAvailablePropertyFromConfiguredFavorite = (
  favorite: Pick<
    PairingAvailableProperty,
    | "favoriteKey"
    | "propertyId"
    | "propertyCode"
    | "name"
    | "action"
    | "quantifier"
    | "bid"
    | "tiers"
    | "pairingNumber"
    | "pairingType"
    | "effectiveDateRange"
  >,
): PairingAvailableProperty => ({
  id: `favorite-${favorite.favoriteKey ?? favorite.propertyCode}`,
  favoriteKey: favorite.favoriteKey,
  propertyId: favorite.propertyId,
  source: "favorite",
  propertyCode: favorite.propertyCode,
  name: favorite.name,
  favorited: true,
  action: favorite.action ?? null,
  quantifier: favorite.quantifier ?? null,
  bid: clonePairingBidValue(favorite.bid),
  tiers: clonePairingTierOptions(favorite.tiers),
  actions: ["add"],
  pairingNumber: favorite.pairingNumber,
  pairingType: favorite.pairingType,
  effectiveDateRange: { ...favorite.effectiveDateRange },
});

export const removePairingAvailablePropertyByFavoriteKey = (
  properties: PairingAvailableProperty[],
  favoriteKey: string,
) => properties.filter((property) => property.favoriteKey !== favoriteKey);

export const cloneExistingProperties = (items: PairingExistingProperty[]) =>
  items.map((item) => ({
    ...item,
    bid: clonePairingBidValue(item.bid),
    action: item.action ?? null,
    quantifier: item.quantifier ?? null,
    tiers: clonePairingTierOptions(item.tiers),
    priorityOptions: [...item.priorityOptions],
    effectiveDateRange: { ...item.effectiveDateRange },
  }));

export const cloneAvailableProperties = (items: PairingAvailableProperty[]) =>
  items.map((item) => ({
    ...item,
    bid: clonePairingBidValue(item.bid),
    action: item.action ?? null,
    quantifier: item.quantifier ?? null,
    tiers: clonePairingTierOptions(item.tiers),
    actions: [...item.actions],
    effectiveDateRange: { ...item.effectiveDateRange },
  }));

const updatePairingPropertyById = <TProperty extends { id: string }>(
  properties: TProperty[],
  propertyId: string,
  updateProperty: (property: TProperty) => TProperty,
) =>
  properties.map((property) =>
    property.id === propertyId ? updateProperty(property) : property,
  );

export const updatePairingAvailablePropertyBid = (
  properties: PairingAvailableProperty[],
  propertyId: string,
  bid: PairingBidValue,
) =>
  updatePairingPropertyById(properties, propertyId, (property) => ({
    ...property,
    bid: clonePairingBidValue(bid),
  }));

export const updatePairingAvailablePropertyAction = (
  properties: PairingAvailableProperty[],
  propertyId: string,
  action: PairingBidAction,
) =>
  updatePairingPropertyById(properties, propertyId, (property) => ({
    ...property,
    action,
  }));

export const updatePairingAvailablePropertyQuantifier = (
  properties: PairingAvailableProperty[],
  propertyId: string,
  quantifier: PairingBidQuantifier,
) =>
  updatePairingPropertyById(properties, propertyId, (property) => ({
    ...property,
    quantifier,
  }));

export const updatePairingAvailablePropertyTier = (
  properties: PairingAvailableProperty[],
  propertyId: string,
  tierKey: string,
) =>
  updatePairingPropertyById(properties, propertyId, (property) => ({
    ...property,
    tiers: togglePairingTierOptions(property.tiers, tierKey),
  }));

export const replacePairingExistingPropertyById = (
  properties: PairingExistingProperty[],
  nextProperty: PairingExistingProperty,
) =>
  updatePairingPropertyById(properties, nextProperty.id, () => nextProperty);

export const removePairingExistingPropertyById = (
  properties: PairingExistingProperty[],
  propertyId: string,
) => properties.filter((property) => property.id !== propertyId);

export const buildSavedPairingExistingPropertiesAfterAdd = (
  properties: PairingExistingProperty[],
  pendingPropertyId: string,
  savedPropertyId: string,
) =>
  cloneExistingProperties(
    properties.map((property) =>
      property.id === pendingPropertyId
        ? {
            ...property,
            id: savedPropertyId,
          }
        : property,
    ),
  );

export const buildPairingSearchPreviewProperty = (
  property: PairingAvailableProperty,
): PairingSearchPreviewProperty => ({
  favoriteKey: property.favoriteKey,
  propertyId: property.propertyId,
  propertyCode: property.propertyCode,
  name: property.name,
  action: property.action ?? null,
  quantifier: property.quantifier ?? null,
  bid: clonePairingBidValue(property.bid),
  tiers: clonePairingTierOptions(property.tiers),
  favorited: property.favorited,
  pairingNumber: property.pairingNumber,
  pairingType: property.pairingType,
  effectiveDateRange: { ...property.effectiveDateRange },
});
