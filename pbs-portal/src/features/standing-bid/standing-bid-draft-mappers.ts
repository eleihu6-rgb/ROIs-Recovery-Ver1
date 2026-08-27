import type {
  PbsStandingBidMode,
  PbsStandingBidValue,
  PbsStandingCurrentResponse,
  PbsStandingDraftDocument,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import { mapRuleBidResponseToPageData } from "@/features/rule-bids/rule-bid-draft-mappers";
import {
  MIXED_LINE_BID_DISPLAY_NAME,
  getLineBidPersistenceName,
  isMixedLineShortCallPropertyGroupKey,
  MIXED_LINE_SHORT_CALL_PROPERTY_CODE,
  withMixedLineBidDisplayName,
} from "@/features/line/mixed-line-bid";
import type {
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { cloneRuleBidValue } from "@/features/rule-bids/utils";

export type StandingBidPageData = RuleBidPageData & {
  preferOffConfig: PbsPreferOffConfig;
  contexts: Record<PbsStandingBidMode, {
    draftMeta: RuleBidRightPanelData["draftMeta"];
  }>;
};

const getStandingDraftForMode = (
  response: PbsStandingCurrentResponse,
  mode: PbsStandingBidMode,
) => mode === "lineholder" ? response.lineholderDraft : response.reserveDraft;

const getStandingCatalogForMode = (
  response: PbsStandingCurrentResponse,
  mode: PbsStandingBidMode,
) => mode === "lineholder" ? response.propertyCatalog.lineholder : response.propertyCatalog.reserve;

const standingCategoryByBidType = {
  DaysOff: { label: "Days Off", sortOrder: 1 },
  Pairing: { label: "Pairing", sortOrder: 2 },
  Line: { label: "Roster", sortOrder: 3 },
  Reserve: { label: "Roster", sortOrder: 3 },
} as const;

const getStandingCategory = (
  property: PbsStandingCurrentResponse["propertyCatalog"]["lineholder"][number],
) => standingCategoryByBidType[property.bidType];

const getStandingExistingCategory = (
  property: PbsStandingCurrentResponse["propertyCatalog"]["lineholder"][number],
  propertyGroupKey: string | undefined,
) => property.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
  ? isMixedLineShortCallPropertyGroupKey(propertyGroupKey)
    ? standingCategoryByBidType.Line
    : standingCategoryByBidType.Reserve
  : standingCategoryByBidType[property.bidType];

const withStandingExistingDisplayName = <TProperty extends RuleBidExistingProperty>(
  property: TProperty,
): TProperty => property.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
  && !isMixedLineShortCallPropertyGroupKey(property.id)
    ? property
    : withMixedLineBidDisplayName(property);

const getSmallestActiveTier = (property: RuleBidExistingProperty) => {
  let smallestTier = Number.MAX_SAFE_INTEGER;

  for (const tier of property.tiers) {
    if (!tier.active) {
      continue;
    }

    const tierNumber = Number.parseInt(tier.label.replace(/^T/i, ""), 10);

    if (Number.isFinite(tierNumber)) {
      smallestTier = Math.min(smallestTier, tierNumber);
    }
  }

  return smallestTier;
};

const compareStandingExistingProperties = (
  left: RuleBidExistingProperty,
  right: RuleBidExistingProperty,
) => getSmallestActiveTier(left) - getSmallestActiveTier(right)
  || (left.categorySortOrder ?? Number.MAX_SAFE_INTEGER)
    - (right.categorySortOrder ?? Number.MAX_SAFE_INTEGER)
  || (left.sourceRowSeq ?? Number.MAX_SAFE_INTEGER)
    - (right.sourceRowSeq ?? Number.MAX_SAFE_INTEGER)
  || (left.sourceContext === "lineholder" ? 0 : 1)
    - (right.sourceContext === "lineholder" ? 0 : 1)
  || left.id.localeCompare(right.id);

const isStandingReserveDateScope = (
  dateScope: Extract<PbsStandingBidValue, { type: "reserve-call-type-date-scope" }>["dateScope"],
) => dateScope.mode === "whole_month" || dateScope.mode === "first_half" || dateScope.mode === "second_half";

const hasStandingDateBoundScope = (bid: PbsStandingBidValue) => {
  if (bid.type === "reserve-call-type-date-scope") {
    return !isStandingReserveDateScope(bid.dateScope);
  }

  if (bid.type === "reserve-flying-date-pattern") {
    return bid.segments.some((segment) => !isStandingReserveDateScope(segment.dateScope));
  }

  return false;
};

export const mapStandingBidResponseToPageData = (
  response: PbsStandingCurrentResponse,
): StandingBidPageData => {
  const lineholderPageData = mapStandingBidContextToPageData(response, "lineholder");
  const reservePageData = mapStandingBidContextToPageData(response, "reserve");
  const existingProperties = [
    ...lineholderPageData.rightPanel.existingProperties,
    ...reservePageData.rightPanel.existingProperties,
  ].sort(compareStandingExistingProperties);
  const availableProperties = [
    ...lineholderPageData.rightPanel.availableProperties,
    ...reservePageData.rightPanel.availableProperties,
  ].sort((left, right) =>
    (left.categorySortOrder ?? Number.MAX_SAFE_INTEGER)
      - (right.categorySortOrder ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name)
    || left.propertyCode - right.propertyCode);

  return {
    preferOffConfig: response.preferOffConfig,
    contexts: {
      lineholder: {
        draftMeta: lineholderPageData.rightPanel.draftMeta,
      },
      reserve: {
        draftMeta: reservePageData.rightPanel.draftMeta,
      },
    },
    rightPanel: {
      ...lineholderPageData.rightPanel,
      draftMeta: lineholderPageData.rightPanel.draftMeta,
      existingTitle: "EXISTING STANDING BID",
      addButtonLabel: "ADD STANDING BID",
      addSectionTitle: "ADD STANDING BID",
      allPropertiesLabel: "ALL PROPERTIES",
      favoritedPropertiesLabel: "FAVORITED PROPERTIES",
      searchPlaceholder: "Search Standing Properties",
      existingProperties,
      availableProperties,
    },
  };
};

const mapStandingBidContextToPageData = (
  response: PbsStandingCurrentResponse,
  mode: PbsStandingBidMode,
): RuleBidPageData => {
  const propertyCatalog = getStandingCatalogForMode(response, mode);
  const standingDraft = getStandingDraftForMode(response, mode);
  const catalogByCode = new Map(propertyCatalog.map((property) => [property.propertyCode, property]));
  const draftPropertyByKey = new Map(
    standingDraft.properties.map((property) => [property.propertyGroupKey, property]),
  );
  const pageData = mapRuleBidResponseToPageData({
    currentPeriod: response.currentPeriod,
    draft: standingDraft,
    propertyCatalog,
    favoriteProperties: [],
    recommendedPropertyCodes: [],
  }, {
    existingTitle: "EXISTING STANDING BID",
    addButtonLabel: "ADD STANDING BID",
    addSectionTitle: "ADD STANDING BID",
    allPropertiesLabel: "ALL PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED PROPERTIES",
    searchPlaceholder: "Search Standing Properties",
  });

  return {
    rightPanel: {
      ...pageData.rightPanel,
      availableProperties: pageData.rightPanel.availableProperties.map((property) => {
        const sourceProperty = catalogByCode.get(property.propertyCode);
        const category = sourceProperty ? getStandingCategory(sourceProperty) : undefined;
        const propertyWithContext = {
          ...property,
          categoryLabel: category?.label,
          categorySortOrder: category?.sortOrder,
          sourceContext: mode,
        };

        return property.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
          ? propertyWithContext
          : withMixedLineBidDisplayName(propertyWithContext);
      }),
      existingProperties: pageData.rightPanel.existingProperties.map((property) => {
        const sourceProperty = catalogByCode.get(property.propertyCode);
        const sourceDraftProperty = draftPropertyByKey.get(property.id);
        const category = sourceProperty
          ? getStandingExistingCategory(sourceProperty, sourceDraftProperty?.propertyGroupKey)
          : sourceDraftProperty?.bidType
            ? standingCategoryByBidType[sourceDraftProperty.bidType]
            : undefined;

        return withStandingExistingDisplayName({
          ...property,
          name: property.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
            && isMixedLineShortCallPropertyGroupKey(property.id)
            ? MIXED_LINE_BID_DISPLAY_NAME
            : property.name,
          categoryLabel: category?.label,
          categorySortOrder: category?.sortOrder,
          sourceContext: mode,
          sourceRowSeq: sourceDraftProperty?.rowSeq,
          supportedActions: sourceProperty?.supportedActions,
        });
      }),
    },
  };
};

const mapStandingBidValueToDraftBid = (
  bid: RuleBidPageData["rightPanel"]["existingProperties"][number]["bid"],
): PbsStandingBidValue => {
  if (
    bid.type === "date"
    || bid.type === "date-range"
    || bid.type === "stepper-date"
    || bid.type === "stepper-range-date"
    || bid.type === "time-date"
    || bid.type === "time-range-date"
    || bid.type === "tag-list-date"
    || bid.type === "pairing-id-list"
    || bid.type === "pairing-occurrence-list"
  ) {
    throw new Error("Date-bound bids are not valid for Standing Bid.");
  }

  if (bid.type === "stepper-date-range" && (bid.from.length > 0 || bid.to.length > 0)) {
    throw new Error("Date-bound bids are not valid for Standing Bid.");
  }

  if (bid.type === "date-or-dow-list" && bid.dates.length > 0) {
    throw new Error("Date-bound bids are not valid for Standing Bid.");
  }

  if (hasStandingDateBoundScope(bid)) {
    throw new Error("Date-bound bids are not valid for Standing Bid.");
  }

  return cloneRuleBidValue(bid) as PbsStandingBidValue;
};

export const mapExistingPropertiesToStandingDraftDocument = (
  existingProperties: RuleBidPageData["rightPanel"]["existingProperties"],
  draftMeta: RuleBidPageData["rightPanel"]["draftMeta"],
): PbsStandingDraftDocument => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodId: null,
  draftVersion: draftMeta.draftVersion,
  periodCode: draftMeta.periodCode,
  bidContext: draftMeta.bidContext === "StandingReserve" ? "StandingReserve" : "StandingLineholder",
  remarks: draftMeta.remarks ?? "",
  properties: existingProperties.map((property, index) => ({
    propertyGroupKey: property.id,
    rowSeq: index + 1,
    propertyCode: property.propertyCode,
    name: getLineBidPersistenceName(property),
    action: property.action ?? null,
    bid: mapStandingBidValueToDraftBid(property.bid),
    tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
  })),
});
