import type { PbsDaysOffCurrentDraftResponse } from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { mapRuleBidResponseToPageData } from "@/features/rule-bids/rule-bid-draft-mappers";

export type DaysOffPageData = RuleBidPageData & {
  preferOffConfig?: PbsPreferOffConfig;
};

export const mapDaysOffDraftResponseToPageData = (
  response: PbsDaysOffCurrentDraftResponse,
): DaysOffPageData => {
  const pageData = mapRuleBidResponseToPageData(response, {
    existingTitle: "EXISTING DAYS OFF PROPERTIES",
    addButtonLabel: "ADD MORE PROPERTIES",
    addSectionTitle: "ADD DAYS OFF PROPERTIES",
    allPropertiesLabel: "ALL PROPERTIES",
    favoritedPropertiesLabel: "FAVORITED PROPERTIES",
    searchPlaceholder: "Search Properties",
    showModifiers: false,
  });

  return {
    preferOffConfig: response.preferOffConfig,
    rightPanel: {
      ...pageData.rightPanel,
    },
  };
};
