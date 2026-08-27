import type { RuleBidPageData, RuleBidRightPanelData, RuleBidValue } from "@/features/rule-bids/types";
import type { PbsCurrentPeriod } from "../../../../packages/contracts/pbs-current-period.js";
import {
  buildRuleBidAvailablePropertyFromConfiguredFavorite,
  cloneRuleBidValue,
  createRuleBidTierOptions,
} from "@/features/rule-bids/utils";

type RuleBidDraftResponse<TBidValue extends RuleBidValue> = {
  currentPeriod?: PbsCurrentPeriod;
  draft: {
    draftKey?: string;
    bidId?: number;
    periodId?: number | null;
    draftVersion: number;
    periodCode: string;
    bidContext: "Current" | "StandingLineholder" | "StandingReserve";
    remarks?: string;
    properties: Array<{
      propertyGroupKey?: string;
      rowSeq: number;
      propertyCode: number;
      name: string;
      bid: TBidValue;
      tiers: string[];
      allOrNothing?: boolean;
      minimumN?: number | null;
      maximumN?: number | null;
      action?: "award" | "avoid" | null;
      supportedActions?: readonly ("award" | "avoid")[];
    }>;
  };
  propertyCatalog: Array<{
    propertyCode: number;
    name: string;
    defaultBid: TBidValue;
    defaultAction?: "award" | "avoid" | null;
    supportedActions?: readonly ("award" | "avoid")[];
  }>;
  favoriteProperties?: Array<{
    favoriteKey: string;
    propertyId: number;
    propertyCode: number;
    name?: string;
    bid?: TBidValue;
    allOrNothing?: boolean;
    minimumN?: number | null;
    maximumN?: number | null;
    action?: "award" | "avoid" | null;
  }>;
  recommendedPropertyCodes?: number[];
};

type RuleBidPanelCopy = Omit<RuleBidRightPanelData, "draftMeta" | "existingProperties" | "availableProperties">;

export const mapRuleBidResponseToPageData = <TBidValue extends RuleBidValue>(
  response: RuleBidDraftResponse<TBidValue>,
  copy: RuleBidPanelCopy,
): RuleBidPageData => {
  const configuredFavorites = (response.favoriteProperties ?? []).filter((favorite) =>
    favorite.bid && favorite.name);
  const recommendedOrderByCode = new Map(
    (response.recommendedPropertyCodes ?? []).map((propertyCode, index) => [propertyCode, index + 1]),
  );

  return {
    rightPanel: {
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
      existingTitle: copy.existingTitle,
      addButtonLabel: copy.addButtonLabel,
      addSectionTitle: copy.addSectionTitle,
      allPropertiesLabel: copy.allPropertiesLabel,
      favoritedPropertiesLabel: copy.favoritedPropertiesLabel,
      searchPlaceholder: copy.searchPlaceholder,
      showModifiers: copy.showModifiers,
      existingProperties: response.draft.properties.map((property) => ({
        id: property.propertyGroupKey ?? `existing-${property.propertyCode}-${property.rowSeq}`,
        propertyCode: property.propertyCode,
        name: property.name,
        action: property.action ?? null,
        supportedActions: property.supportedActions,
        bid: cloneRuleBidValue(property.bid),
        tiers: createRuleBidTierOptions(property.tiers),
        allOrNothing: property.allOrNothing ?? false,
        minimumN: property.minimumN ?? null,
        maximumN: property.maximumN ?? null,
      })),
      availableProperties: [
        ...response.propertyCatalog.map((property) => ({
          source: "catalog" as const,
          id: `available-${property.propertyCode}`,
          propertyCode: property.propertyCode,
          name: property.name,
          action: property.defaultAction ?? null,
          supportedActions: property.supportedActions,
          favorited: false,
          recommendedSortOrder: recommendedOrderByCode.get(property.propertyCode),
          bid: cloneRuleBidValue(property.defaultBid),
          tiers: createRuleBidTierOptions(["T1"]),
          allOrNothing: false,
          minimumN: null,
          maximumN: null,
        })),
        ...configuredFavorites.map((favorite) =>
          buildRuleBidAvailablePropertyFromConfiguredFavorite({
            favoriteKey: favorite.favoriteKey,
            propertyId: favorite.propertyId,
            propertyCode: favorite.propertyCode,
            name: favorite.name!,
            bid: favorite.bid!,
            action: favorite.action ?? null,
            allOrNothing: favorite.allOrNothing ?? false,
            minimumN: favorite.minimumN ?? null,
            maximumN: favorite.maximumN ?? null,
          })),
      ],
    },
  };
};

export const mapExistingPropertiesToRuleBidDraftDocument = (
  existingProperties: RuleBidPageData["rightPanel"]["existingProperties"],
  draftMeta: RuleBidPageData["rightPanel"]["draftMeta"],
) => ({
  draftKey: draftMeta.draftKey,
  bidId: draftMeta.bidId,
  periodId: draftMeta.periodId,
  draftVersion: draftMeta.draftVersion,
  periodCode: draftMeta.periodCode,
  bidContext: draftMeta.bidContext,
  remarks: draftMeta.remarks ?? "",
  properties: existingProperties.map((property, index) => ({
    propertyGroupKey: property.id,
    rowSeq: index + 1,
    propertyCode: property.propertyCode,
    name: property.name,
    action: property.action ?? null,
    bid: cloneRuleBidValue(property.bid),
    tiers: property.tiers.filter((tier) => tier.active).map((tier) => tier.label),
    allOrNothing: property.allOrNothing ?? false,
    minimumN: property.minimumN ?? null,
    maximumN: property.maximumN ?? null,
  })),
});
