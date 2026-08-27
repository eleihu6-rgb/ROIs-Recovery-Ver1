import type {
  PbsLineBidValue,
  PbsLineCurrentDraftResponse,
  PbsLineDraftDocument,
} from "../../../../packages/contracts/pbs-line-bids.js";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { requireCurrentRuleBidContext } from "@/features/rule-bids/draft-context";
import {
  mapRuleBidResponseToPageData,
} from "@/features/rule-bids/rule-bid-draft-mappers";
import {
  getLineBidPersistenceName,
  MIXED_LINE_SHORT_CALL_PROPERTY_CODE,
  withMixedLineBidDisplayName,
} from "@/features/line/mixed-line-bid";
import {
  findRuleBidExistingPropertyTierMerge,
  mergeRuleBidExistingPropertyActiveTiers,
} from "@/features/rule-bids/utils";

const mergeLineExistingPropertiesByBidAndModifiers = (
  properties: RuleBidPageData["rightPanel"]["existingProperties"],
) => properties.reduce<RuleBidPageData["rightPanel"]["existingProperties"]>((mergedProperties, property) => {
  const mergeResult = findRuleBidExistingPropertyTierMerge(mergedProperties, property);

  if (!mergeResult) {
    mergedProperties.push(property);
    return mergedProperties;
  }

  return mergedProperties.map((existingProperty) =>
    existingProperty.id === mergeResult.targetProperty.id
      ? mergeRuleBidExistingPropertyActiveTiers(existingProperty, property)
      : existingProperty);
}, []);

export const mapLineDraftResponseToPageData = (
  response: PbsLineCurrentDraftResponse,
): RuleBidPageData => {
  const pageData = mapRuleBidResponseToPageData({
    ...response,
    draft: {
      ...response.draft,
      properties: response.draft.properties.filter((property) => property.propertyCode !== 428),
    },
    favoriteProperties: response.favoriteProperties.filter((property) =>
      property.propertyCode !== 428 && property.propertyCode !== MIXED_LINE_SHORT_CALL_PROPERTY_CODE),
    propertyCatalog: response.propertyCatalog.filter((property) =>
      property.propertyCode !== 428 && property.propertyCode !== MIXED_LINE_SHORT_CALL_PROPERTY_CODE),
    recommendedPropertyCodes: response.recommendedPropertyCodes.filter((propertyCode) =>
      propertyCode !== 428 && propertyCode !== MIXED_LINE_SHORT_CALL_PROPERTY_CODE),
  }, {
    existingTitle: "EXISTING LINE PROPERTIES",
    addButtonLabel: "ADD MORE PROPERTIES",
    addSectionTitle: "ADD LINE PROPERTIES",
    allPropertiesLabel: "ALL PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED PROPERTIES",
    searchPlaceholder: "Search Properties",
  });

  return {
    ...pageData,
    rightPanel: {
      ...pageData.rightPanel,
      availableProperties: pageData.rightPanel.availableProperties.map(withMixedLineBidDisplayName),
      existingProperties: mergeLineExistingPropertiesByBidAndModifiers(
        pageData.rightPanel.existingProperties.map(withMixedLineBidDisplayName),
      ),
    },
  };
};

const mapLineBidValueToDraftBid = (
  bid: RuleBidPageData["rightPanel"]["existingProperties"][number]["bid"],
): PbsLineBidValue => {
  if (bid.type === "efficient-flying-preference") {
    throw new Error("Efficient Flying First bids are not valid for Line.");
  }

  if (bid.type === "flight-legs-per-duty") {
    throw new Error("Flight Legs per Duty bids are not valid for Line.");
  }

  if (bid.type === "pairing-occurrence-list") {
    throw new Error("Pairing occurrence bids are not valid for Line.");
  }

  if (bid.type === "pairing-id-list") {
    throw new Error("Pairing ID bids are not valid for Line.");
  }

  if (bid.type === "time-condition-list") {
    throw new Error("Pairing time condition bids are not valid for Line.");
  }

  if (bid.type === "duration" || bid.type === "duration-range") {
    throw new Error("Pairing duration bids are not valid for Line.");
  }

  if (bid.type === "date-or-dow-list") {
    throw new Error("Pairing date or day bids are not valid for Line.");
  }

  if (bid.type === "work-day-preference") {
    throw new Error("Work Day Preference bids are not valid for Line.");
  }

  if (bid.type === "percent-or-duration") {
    throw new Error("Pairing percent or duration bids are not valid for Line.");
  }

  if (bid.type === "airport-preference") {
    throw new Error("Pairing airport preference bids are not valid for Line.");
  }

  if (bid.type === "pairing-preference") {
    throw new Error("Pairing preference bids are not valid for Line.");
  }

  if (bid.type === "pairing-check-time") {
    throw new Error("Pairing check-time bids are not valid for Line.");
  }

  if (bid.type === "pairing-length-preference") {
    throw new Error("Pairing length bids are not valid for Line.");
  }

  if (bid.type === "flight-number-preference") {
    throw new Error("Flight number preference bids are not valid for Line.");
  }

  if (bid.type === "redeye-preference") {
    throw new Error("Redeye preference bids are not valid for Line.");
  }

  if (bid.type === "month-end-carryover") {
    throw new Error("Month-End Carryover bids are not valid for Line.");
  }

  if (bid.type === "deadhead-flying") {
    throw new Error("Deadhead Flying bids are not valid for Line.");
  }

  if (bid.type === "tag-list") {
    return {
      type: "tag-list",
      values: [...bid.values],
    };
  }

  if (bid.type === "tag-list-date") {
    return {
      type: "tag-list-date",
      values: [...bid.values],
      date: bid.date,
    };
  }

  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
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

  return { ...bid };
};

export const mapExistingPropertiesToLineDraftDocument = (
  existingProperties: RuleBidPageData["rightPanel"]["existingProperties"],
  draftMeta: RuleBidPageData["rightPanel"]["draftMeta"],
): PbsLineDraftDocument => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodId: draftMeta.periodId,
  draftVersion: draftMeta.draftVersion,
  periodCode: draftMeta.periodCode,
  bidContext: requireCurrentRuleBidContext(draftMeta.bidContext, "Line Bid"),
  remarks: draftMeta.remarks ?? "",
  properties: existingProperties.map((property, index) => ({
    propertyGroupKey: property.id,
    rowSeq: index + 1,
    propertyCode: property.propertyCode,
    name: getLineBidPersistenceName(property),
    action: property.action ?? null,
    bid: mapLineBidValueToDraftBid(property.bid),
    tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
  })),
});
