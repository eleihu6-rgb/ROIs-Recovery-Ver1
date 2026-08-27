import { mapLineholderSummaryToTierPageData } from "@/features/tier/tier-draft-mappers";
import type { TierPageData } from "@/features/tier/types";
import { lineholderSummaryService } from "@/shared/services/lineholder-summary-service";

export const tierService = {
  async getPageData(): Promise<TierPageData> {
    const response = await lineholderSummaryService.getCurrentSummary();
    return mapLineholderSummaryToTierPageData(response);
  },
};
