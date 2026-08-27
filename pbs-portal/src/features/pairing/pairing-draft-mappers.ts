import type {
  PbsPairingBidValue,
  PbsPairingCurrentDraftResponse,
  PbsPairingDraftDocument,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import { pairingMockFactories, pairingPageData } from "@/features/pairing/mock";
import {
  clonePairingBidValue,
  getPairingPropertyDefaultQuantifierByCode,
  getPairingPropertyDefinitionByCode,
} from "@/features/pairing/pairing-property-catalog";
import {
  clonePairingTierOptions,
  cloneAvailablePropertyFromConfiguredFavorite,
  createPairingTierOptions,
} from "@/features/pairing/pairing-property-transform";
import { PAIRING_NUMBER_PROPERTY_CODE } from "@/features/pairing/pairing-number-occurrences";
import type {
  PairingAvailableProperty,
  PairingBidQuantifier,
  PairingExistingProperty,
  PairingPageData,
} from "@/features/pairing/types";

type PairingDraftPropertyInput = Pick<
  PairingExistingProperty,
  "propertyCode" | "name" | "action" | "quantifier" | "bid" | "tiers"
>;
type PairingCatalogProperty = PbsPairingCurrentDraftResponse["propertyCatalog"][number];
type PairingFavoriteProperty = PbsPairingCurrentDraftResponse["favoriteProperties"][number];

const getMinimumNumberValue = (bid: { min?: number }) => bid.min ?? 0;

const buildEmptyCatalogBid = (catalogProperty: PairingCatalogProperty): PairingAvailableProperty["bid"] => {
  const bid = clonePairingBidValue(catalogProperty.defaultBid);

  if (catalogProperty.propertyCode === PAIRING_NUMBER_PROPERTY_CODE) {
    return { type: "pairing-id-list", pairingIds: [] };
  }

  if (bid.type === "airport-preference") {
    return {
      ...bid,
      event: "landing",
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    };
  }

  if (bid.type === "date" || bid.type === "time" || bid.type === "text" || bid.type === "percent") {
    return { ...bid, value: "" };
  }

  if (bid.type === "percent-or-duration") {
    return {
      ...bid,
      value: "",
    };
  }

  if (bid.type === "stepper") {
    return { ...bid, value: getMinimumNumberValue(bid) };
  }

  if (bid.type === "stepper-range") {
    const value = getMinimumNumberValue(bid);
    return { ...bid, from: value, to: value };
  }

  if (bid.type === "stepper-date") {
    return { ...bid, value: getMinimumNumberValue(bid), date: "" };
  }

  if (bid.type === "stepper-range-date") {
    const value = getMinimumNumberValue(bid);
    return { ...bid, from: value, to: value, date: "" };
  }

  if (bid.type === "stepper-date-range") {
    return { ...bid, value: getMinimumNumberValue(bid), from: "", to: "" };
  }

  if (
    bid.type === "time-range"
    || bid.type === "date-range"
    || bid.type === "percent-range"
    || bid.type === "duration-range"
  ) {
    return { ...bid, from: "", to: "" };
  }

  if (bid.type === "time-date") {
    return { ...bid, value: "", date: "" };
  }

  if (bid.type === "duration") {
    return { ...bid, value: "" };
  }

  if (bid.type === "time-range-date") {
    return { ...bid, from: "", to: "", date: "" };
  }

  if (bid.type === "time-condition-list") {
    return { ...bid, conditions: [] };
  }

  if (bid.type === "date-or-dow-list") {
    return { ...bid, dates: [], daysOfWeek: [] };
  }

  if (bid.type === "pairing-length-preference") {
    return { ...bid, minDays: null, maxDays: null, dateScope: null };
  }

  if (bid.type === "flight-number-preference") {
    return {
      ...bid,
      flightNumbers: [],
      dateScope: null,
    };
  }

  if (bid.type === "redeye-preference") {
    return { ...bid, dateScope: null };
  }

  if (bid.type === "deadhead-flying") {
    return { type: "deadhead-flying", mode: "any-deadhead" };
  }

  if (bid.type === "select") {
    return { ...bid, value: "", options: [...bid.options] };
  }

  if (bid.type === "tag-list") {
    return { ...bid, values: [], suggestions: undefined };
  }

  if (bid.type === "tag-list-date") {
    return { ...bid, values: [], date: "", suggestions: undefined };
  }

  if (bid.type === "pairing-occurrence-list") {
    return { ...bid, occurrences: [], suggestions: undefined };
  }

  if (bid.type === "crew-days-off-share") {
    return { ...bid, employeeNumber: "" };
  }

  if (bid.type === "employee-schedule-preference") {
    return { ...bid, crewId: "", crewName: undefined };
  }

  return bid;
};

const buildCatalogByCode = (response: PbsPairingCurrentDraftResponse) =>
  new Map(response.propertyCatalog.map((property) => [property.propertyCode, property]));

const mergeAvailablePropertyWithCatalog = (
  property: PairingAvailableProperty,
  catalogByCode: Map<number, PairingCatalogProperty>,
): PairingAvailableProperty => {
  const catalogProperty = catalogByCode.get(property.propertyCode);

  if (!catalogProperty) {
    return {
      ...property,
      bid: clonePairingBidValue(property.bid),
      tiers: clonePairingTierOptions(property.tiers),
      actions: [...property.actions],
      effectiveDateRange: { ...property.effectiveDateRange },
    };
  }

  return {
    ...property,
    name: catalogProperty.name,
    action: property.action ?? catalogProperty.defaultAction ?? null,
    bid: buildEmptyCatalogBid(catalogProperty),
    tiers: clonePairingTierOptions(property.tiers),
    actions: [...property.actions],
    effectiveDateRange: { ...property.effectiveDateRange },
  };
};

const buildAvailablePropertyFromCatalog = (
  catalogProperty: PairingCatalogProperty,
  template?: PairingAvailableProperty,
): PairingAvailableProperty => ({
  id: template?.id ?? `available-${catalogProperty.propertyCode}`,
  source: "catalog",
  propertyCode: catalogProperty.propertyCode,
  name: catalogProperty.name,
  favorited: false,
  action: template?.action ?? catalogProperty.defaultAction ?? null,
  quantifier: resolveAvailablePropertyQuantifier(catalogProperty.propertyCode, template?.quantifier),
  bid: buildEmptyCatalogBid(catalogProperty),
  tiers: createPairingTierOptions(["T1"]),
  actions: template ? [...template.actions] : ["add", "preview"],
  pairingNumber: catalogProperty.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
    ? ""
    : (template?.pairingNumber ?? ""),
  pairingType: template?.pairingType ?? "",
  effectiveDateRange: template?.effectiveDateRange
    ? { ...template.effectiveDateRange }
    : { from: "", to: "" },
});

const buildAvailablePropertyFromFavorite = (
  favoriteProperty: PairingFavoriteProperty,
  template?: PairingAvailableProperty,
): PairingAvailableProperty =>
  cloneAvailablePropertyFromConfiguredFavorite({
    favoriteKey: favoriteProperty.favoriteKey,
    propertyId: favoriteProperty.propertyId,
    propertyCode: favoriteProperty.propertyCode,
    name: favoriteProperty.name,
    action: favoriteProperty.action ?? null,
    quantifier: favoriteProperty.quantifier ?? null,
    bid: clonePairingBidValue(favoriteProperty.bid),
    tiers: createPairingTierOptions([]),
    pairingNumber: template?.pairingNumber ?? "",
    pairingType: template?.pairingType ?? "",
    effectiveDateRange: template?.effectiveDateRange
      ? { ...template.effectiveDateRange }
      : { from: "", to: "" },
  });

const buildExistingPropertyFromDraft = (
  property: PbsPairingDraftDocument["properties"][number],
  availableProperties: PairingAvailableProperty[],
  priorityOptions: string[],
): PairingExistingProperty => {
  const template = availableProperties.find((item) => item.propertyCode === property.propertyCode);
  const catalogProperty = getPairingPropertyDefinitionByCode(property.propertyCode);

  return {
    id: property.propertyGroupKey ?? `existing-${property.propertyCode}-${property.rowSeq}`,
    propertyCode: property.propertyCode,
    name: property.name,
    action: property.action ?? null,
    quantifier: property.quantifier ?? null,
    bid: clonePairingBidValue(property.bid),
    tiers: createPairingTierOptions(property.tiers),
    priorityOptions: [...priorityOptions],
    pairingNumber: template?.pairingNumber ?? "",
    pairingType: template?.pairingType ?? (catalogProperty?.defaultBid.type === "select" ? catalogProperty.defaultBid.value : ""),
    effectiveDateRange: template?.effectiveDateRange
      ? { ...template.effectiveDateRange }
      : { from: "", to: "" },
  };
};

const resolveAvailablePropertyQuantifier = (
  propertyCode: number,
  quantifier: PairingBidQuantifier | null | undefined,
) => quantifier ?? getPairingPropertyDefaultQuantifierByCode(propertyCode);

export const mapPairingDraftResponseToPageData = (
  response: PbsPairingCurrentDraftResponse,
): PairingPageData => {
  const catalogByCode = buildCatalogByCode(response);
  const recommendedOrderByCode = new Map(
    (response.recommendedPropertyCodes ?? []).map((propertyCode, index) => [propertyCode, index + 1]),
  );
  const priorityOptions = response.propertyCatalog.map((property) => property.name);
  const fallbackAvailablePropertiesByCode = new Map(
    pairingMockFactories
      .cloneAvailableProperties()
      .map((property) => [property.propertyCode, mergeAvailablePropertyWithCatalog(property, catalogByCode)]),
  );
  const availableProperties = response.propertyCatalog.map((property) => {
    const availableProperty = buildAvailablePropertyFromCatalog(
      property,
      fallbackAvailablePropertiesByCode.get(property.propertyCode),
    );

    return {
      ...availableProperty,
      favorited: false,
      recommendedSortOrder: recommendedOrderByCode.get(property.propertyCode),
    };
  });
  const favoriteProperties = (response.favoriteProperties ?? []).map((favorite) =>
    buildAvailablePropertyFromFavorite(
      favorite,
      fallbackAvailablePropertiesByCode.get(favorite.propertyCode),
    ),
  );

  const existingProperties = response.draft.properties.length > 0
    ? response.draft.properties.map((property) =>
      buildExistingPropertyFromDraft(property, availableProperties, priorityOptions),
    )
    : [];

  return {
    rightPanel: {
      ...structuredClone(pairingPageData.rightPanel),
      draftMeta: {
        draftKey: response.draft.draftKey,
        bidId: response.draft.bidId,
        periodId: response.draft.periodId,
        draftVersion: response.draft.draftVersion,
        periodCode: response.draft.periodCode,
        bidContext: response.draft.bidContext,
        remarks: response.draft.remarks ?? "",
        currentPeriod: response.currentPeriod,
      },
      existingProperties,
      availableProperties: [...availableProperties, ...favoriteProperties],
    },
  };
};

export const mapPairingPropertyToDraftProperty = (
  property: PairingDraftPropertyInput,
): Omit<PbsPairingDraftDocument["properties"][number], "propertyGroupKey" | "rowSeq"> => ({
    propertyCode: property.propertyCode,
    name: property.name,
    action: property.action ?? null,
    quantifier: property.quantifier ?? null,
    bid: clonePairingBidValue(property.bid as PbsPairingBidValue) as PbsPairingBidValue,
    tiers: property.tiers
      .filter((tier) => tier.active)
      .map((tier) => tier.label),
});
