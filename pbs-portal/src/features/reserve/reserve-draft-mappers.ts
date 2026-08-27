import type {
  PbsReserveBidValue,
  PbsReserveCurrentDraftResponse,
  PbsReserveDraftDocument,
  PbsReserveMode,
} from "../../../../packages/contracts/pbs-reserve-bids.js";
import {
  mapRuleBidResponseToPageData,
} from "@/features/rule-bids/rule-bid-draft-mappers";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { requireCurrentRuleBidContext } from "@/features/rule-bids/draft-context";

export const mapReserveDraftResponseToPageData = (
  response: PbsReserveCurrentDraftResponse,
): RuleBidPageData =>
  mapRuleBidResponseToPageData(response, {
    existingTitle: "EXISTING RESERVE PROPERTIES",
    addButtonLabel: "ADD RESERVE PREFERENCE",
    addSectionTitle: "ADD RESERVE PREFERENCE",
    allPropertiesLabel: "ALL RESERVE PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED RESERVE PROPERTIES",
    searchPlaceholder: "Search Reserve Properties",
  });

const mapReserveBidValueToDraftBid = (
  bid: RuleBidPageData["rightPanel"]["existingProperties"][number]["bid"],
): PbsReserveBidValue => {
  if (bid.type === "select") {
    return {
      ...bid,
      options: [...bid.options],
    };
  }

  if (bid.type === "reserve-call-type-date-scope") {
    return {
      ...bid,
      options: [...bid.options],
      dateScope: bid.dateScope.mode === "specific_dates"
        ? { ...bid.dateScope, dates: [...bid.dateScope.dates] }
        : { ...bid.dateScope },
    };
  }

  if (bid.type === "tag-list") {
    return {
      type: "tag-list",
      values: [...bid.values],
      suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
    };
  }

  throw new Error("Unsupported Reserve bid value.");
};

export const mapExistingPropertiesToReserveDraftDocument = (
  existingProperties: RuleBidPageData["rightPanel"]["existingProperties"],
  draftMeta: RuleBidPageData["rightPanel"]["draftMeta"],
  mode: PbsReserveMode = "legacy",
): PbsReserveDraftDocument => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodId: draftMeta.periodId,
  draftVersion: draftMeta.draftVersion,
  periodCode: draftMeta.periodCode,
  bidContext: requireCurrentRuleBidContext(draftMeta.bidContext, "Reserve Bid"),
  mode,
  remarks: draftMeta.remarks ?? "",
  properties: existingProperties.map((property, index) => ({
    propertyGroupKey: property.id,
    rowSeq: index + 1,
    propertyCode: property.propertyCode,
    name: property.name,
    bid: mapReserveBidValueToDraftBid(property.bid),
    tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
  })),
});
