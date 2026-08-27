import type {
  PairingExistingProperty,
  PairingTierOption,
  PairingSearchCriteriaItem,
} from "@/features/pairing/types";

const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item === right[index]);
};

const arePairingBidValuesEqual = (
  left: PairingExistingProperty["bid"],
  right: PairingExistingProperty["bid"],
) => JSON.stringify(left) === JSON.stringify(right);

export const arePairingTierOptionsEqual = (
  left: PairingTierOption[],
  right: PairingTierOption[],
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

const arePairingEffectiveDateRangesEqual = (
  left: PairingExistingProperty["effectiveDateRange"],
  right: PairingExistingProperty["effectiveDateRange"],
) => left.from === right.from && left.to === right.to;

const arePairingExistingPropertiesShallowEqual = (
  left: PairingExistingProperty,
  right: PairingExistingProperty,
) => left.id === right.id
  && left.propertyCode === right.propertyCode
  && left.name === right.name
  && left.action === right.action
  && left.quantifier === right.quantifier
  && left.pairingNumber === right.pairingNumber
  && left.pairingType === right.pairingType
  && arePairingBidValuesEqual(left.bid, right.bid)
  && arePairingTierOptionsEqual(left.tiers, right.tiers)
  && areStringArraysEqual(left.priorityOptions, right.priorityOptions)
  && arePairingEffectiveDateRangesEqual(left.effectiveDateRange, right.effectiveDateRange);

export const arePairingExistingPropertiesEqual = (
  left: PairingExistingProperty[],
  right: PairingExistingProperty[],
) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((property, index) =>
    arePairingExistingPropertiesShallowEqual(property, right[index]),
  );
};

const arePairingSearchCriteriaItemsShallowEqual = (
  left: PairingSearchCriteriaItem,
  right: PairingSearchCriteriaItem,
) => left.id === right.id
  && left.favoriteKey === right.favoriteKey
  && left.propertyId === right.propertyId
  && left.propertyCode === right.propertyCode
  && left.name === right.name
  && left.action === right.action
  && left.quantifier === right.quantifier
  && left.favorited === right.favorited
  && left.pairingNumber === right.pairingNumber
  && left.pairingType === right.pairingType
  && arePairingBidValuesEqual(left.bid, right.bid)
  && arePairingTierOptionsEqual(left.tiers, right.tiers)
  && arePairingEffectiveDateRangesEqual(left.effectiveDateRange, right.effectiveDateRange);

export const arePairingSearchCriteriaItemsEqual = (
  left: PairingSearchCriteriaItem[],
  right: PairingSearchCriteriaItem[],
) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) =>
    arePairingSearchCriteriaItemsShallowEqual(item, right[index]),
  );
};
