import type { RuleBidPageData } from "@/features/rule-bids/types";

export const linePageData: RuleBidPageData = {
  rightPanel: {
    draftMeta: {
      periodCode: "Apr 2026",
      draftVersion: 0,
      bidContext: "Current",
      remarks: "",
      currentPeriod: {
        id: 42,
        rosterPeriodId: 42,
        rosterPeriodKey: "2026RP04",
        periodCode: "Apr 2026",
        rpStartLocal: "2026-04-01",
        rpEndLocal: "2026-04-30",
        filiale: "F8",
        status: "OPEN",
        computedStage: "OPEN",
        bidOpenAt: "2026-03-06T00:00:00.000Z",
        bidCloseAt: "2026-03-13T23:59:00.000Z",
        canEditBid: true,
        readOnlyReason: null,
      },
    },
    existingTitle: "EXISTING LINE PROPERTIES",
    addButtonLabel: "ADD MORE PROPERTIES",
    addSectionTitle: "ADD LINE PROPERTIES",
    allPropertiesLabel: "ALL PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED PROPERTIES",
    searchPlaceholder: "Search Properties",
    existingProperties: [],
    availableProperties: [],
  },
};
