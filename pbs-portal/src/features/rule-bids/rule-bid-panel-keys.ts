import type { RuleBidRightPanelData } from "@/features/rule-bids/types";

export const buildRuleBidHydrationKey = (data: RuleBidRightPanelData) =>
  JSON.stringify({
    draftMeta: {
      draftKey: data.draftMeta.draftKey,
      bidId: data.draftMeta.bidId,
      periodId: data.draftMeta.periodId,
      periodCode: data.draftMeta.periodCode,
      bidContext: data.draftMeta.bidContext,
      remarks: data.draftMeta.remarks,
    },
    existingProperties: data.existingProperties,
    availableProperties: data.availableProperties,
    labels: {
      existingTitle: data.existingTitle,
      addButtonLabel: data.addButtonLabel,
      addSectionTitle: data.addSectionTitle,
      allPropertiesLabel: data.allPropertiesLabel,
      favoritedPropertiesLabel: data.favoritedPropertiesLabel,
      searchPlaceholder: data.searchPlaceholder,
      showModifiers: data.showModifiers,
    },
  });

export const buildRuleBidViewResetKey = (data: RuleBidRightPanelData) =>
  JSON.stringify({
    draftMeta: {
      periodCode: data.draftMeta.periodCode,
      bidContext: data.draftMeta.bidContext,
    },
    labels: {
      existingTitle: data.existingTitle,
      addSectionTitle: data.addSectionTitle,
      allPropertiesLabel: data.allPropertiesLabel,
      favoritedPropertiesLabel: data.favoritedPropertiesLabel,
      searchPlaceholder: data.searchPlaceholder,
      showModifiers: data.showModifiers,
    },
  });
