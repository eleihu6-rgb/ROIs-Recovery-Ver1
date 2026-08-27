import {
  clonePairingBidValue,
  pairingPropertyPriorityOptions,
} from "@/features/pairing/pairing-property-catalog";
import {
  clonePairingTierOptions,
  createPairingTierOptions,
} from "@/features/pairing/pairing-property-transform";
import { buildPairingRuleExpressionTiers } from "@/features/pairing/pairing-rule-logic";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingTierOption,
  PairingSearchCriteriaItem,
  PairingSearchPreviewProperty,
} from "@/features/pairing/types";

type PairingSearchExistingPropertyTemplate = Pick<
  PairingAvailableProperty,
  "pairingNumber" | "pairingType" | "effectiveDateRange"
>;

export type PairingSearchPickerTab = "all" | "favorites";

const PAIRING_SEARCH_SUPPORTED_PROPERTY_CODES = new Set([
  101,
  102,
  103,
  104,
  108,
  112,
  114,
  126,
  128,
  131,
  132,
  133,
  134,
  135,
  136,
  137,
  138,
  139,
  140,
  141,
  142,
  143,
  144,
  145,
  146,
  147,
  148,
  150,
  151,
  152,
  153,
  154,
  155,
  156,
  157,
  158,
  159,
  160,
  161,
  163,
  165,
  168,
]);

export const buildPairingSearchFallbackTierOptions = (): PairingTierOption[] =>
  createPairingTierOptions(["T1"]);

export const buildPairingSearchTierOptionsForLabel = (
  activeTier: string,
): PairingTierOption[] => createPairingTierOptions([activeTier]);

export const buildPairingSearchCriteriaItemFromPreviewProperty = (
  property: PairingSearchPreviewProperty,
): PairingSearchCriteriaItem => ({
  id: `preview-${property.propertyCode}`,
  favoriteKey: property.favoriteKey,
  propertyId: property.propertyId,
  propertyCode: property.propertyCode,
  name: property.name,
  action: property.action ?? null,
  quantifier: property.quantifier ?? null,
  bid: clonePairingBidValue(property.bid),
  tiers: property.tiers
    ? clonePairingTierOptions(property.tiers)
    : buildPairingSearchFallbackTierOptions(),
  favorited: property.favorited ?? false,
  pairingNumber: property.pairingNumber ?? "",
  pairingType: property.pairingType ?? "",
  effectiveDateRange: property.effectiveDateRange
    ? { ...property.effectiveDateRange }
    : { from: "", to: "" },
});

export const buildPairingSearchCriteriaItemFromAvailableProperty = (
  property: PairingAvailableProperty,
  index: number,
): PairingSearchCriteriaItem => ({
  id: `criteria-${property.propertyCode}-${index + 1}`,
  favoriteKey: property.favoriteKey,
  propertyId: property.propertyId,
  propertyCode: property.propertyCode,
  name: property.name,
  action: property.action ?? null,
  quantifier: property.quantifier ?? null,
  bid: clonePairingBidValue(property.bid),
  tiers: buildPairingSearchFallbackTierOptions(),
  favorited: property.favorited,
  pairingNumber: property.pairingNumber,
  pairingType: property.pairingType,
  effectiveDateRange: { ...property.effectiveDateRange },
});

export const buildPairingAvailablePropertyFromSearchCriteria = (
  criteria: PairingSearchCriteriaItem,
): PairingAvailableProperty => ({
  id: criteria.id,
  favoriteKey: criteria.favoriteKey,
  propertyId: criteria.propertyId,
  source: criteria.favorited ? "favorite" : "catalog",
  propertyCode: criteria.propertyCode,
  name: criteria.name,
  favorited: criteria.favorited,
  action: criteria.action ?? null,
  quantifier: criteria.quantifier ?? null,
  bid: clonePairingBidValue(criteria.bid),
  tiers: clonePairingTierOptions(criteria.tiers),
  actions: ["add", "preview"],
  pairingNumber: criteria.pairingNumber,
  pairingType: criteria.pairingType,
  effectiveDateRange: { ...criteria.effectiveDateRange },
});

export const buildPairingSearchCriteriaItemFromDialogDraft = (
  original: PairingSearchCriteriaItem,
  draft: PairingAvailableProperty,
): PairingSearchCriteriaItem => ({
  ...original,
  favoriteKey: draft.favoriteKey,
  propertyId: draft.propertyId,
  action: draft.action ?? null,
  quantifier: draft.quantifier ?? null,
  bid: clonePairingBidValue(draft.bid),
  tiers: clonePairingTierOptions(draft.tiers),
  favorited: draft.favorited,
  pairingNumber: draft.pairingNumber,
  pairingType: draft.pairingType,
  effectiveDateRange: { ...draft.effectiveDateRange },
});

export const isPairingSearchSupportedPropertyCode = (propertyCode: number) =>
  PAIRING_SEARCH_SUPPORTED_PROPERTY_CODES.has(propertyCode);

export const buildPairingSearchPickerProperties = (
  baseProperties: PairingAvailableProperty[],
  query: string,
  tab: PairingSearchPickerTab,
): PairingAvailableProperty[] => {
  const supportedProperties = baseProperties.filter((property) =>
    isPairingSearchSupportedPropertyCode(property.propertyCode),
  );
  const normalizedQuery = query.trim().toLowerCase();

  return supportedProperties.filter((property) => {
    if (tab === "favorites" && !property.favorited) {
      return false;
    }

    return normalizedQuery.length === 0
      || property.name.toLowerCase().includes(normalizedQuery)
      || String(property.propertyCode).includes(normalizedQuery);
  });
};

export const buildPairingExistingPropertyFromSearchCriteria = (
  criteria: PairingSearchCriteriaItem,
  existingCount: number,
  template?: PairingSearchExistingPropertyTemplate,
): PairingExistingProperty => ({
  id: `existing-search-${criteria.propertyCode}-${existingCount + 1}`,
  propertyCode: criteria.propertyCode,
  name: criteria.name,
  action: criteria.action ?? null,
  quantifier: criteria.quantifier ?? null,
  bid: clonePairingBidValue(criteria.bid),
  tiers: clonePairingTierOptions(criteria.tiers),
  priorityOptions: [...pairingPropertyPriorityOptions],
  pairingNumber: criteria.pairingNumber || template?.pairingNumber || "",
  pairingType: criteria.pairingType || template?.pairingType || "",
  effectiveDateRange:
    criteria.effectiveDateRange.from || criteria.effectiveDateRange.to
      ? { ...criteria.effectiveDateRange }
      : template?.effectiveDateRange
        ? { ...template.effectiveDateRange }
        : { from: "", to: "" },
});

export const getPairingCurrentRulesTierLabels = (
  properties: PairingExistingProperty[],
) => buildPairingRuleExpressionTiers(properties).map((tier) => tier.tier);

export const resolvePairingCurrentRulesTier = (
  tiers: string[],
  preferredTier?: string,
) => (preferredTier && tiers.includes(preferredTier) ? preferredTier : tiers[0] ?? "");
