import {
  pbsStandingBidRoutes,
  type PbsSaveStandingDraftRequest,
  type PbsStandingBidMode,
  type PbsStandingCurrentResponse,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import {
  mapExistingPropertiesToStandingDraftDocument,
  mapStandingBidResponseToPageData,
  type StandingBidPageData,
} from "@/features/standing-bid/standing-bid-draft-mappers";
import type {
  RuleBidExistingProperty,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { request } from "@/shared/services/request";

export const standingBidService = {
  async getCurrent(): Promise<PbsStandingCurrentResponse> {
    return request.get<PbsStandingCurrentResponse>(pbsStandingBidRoutes.current);
  },

  async getPageData(): Promise<StandingBidPageData> {
    const response = await standingBidService.getCurrent();
    return mapStandingBidResponseToPageData(response);
  },

  async saveDraft(
    mode: PbsStandingBidMode,
    existingProperties: RuleBidExistingProperty[],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ): Promise<PbsStandingCurrentResponse> {
    const payload: PbsSaveStandingDraftRequest = {
      mode,
      draft: mapExistingPropertiesToStandingDraftDocument(existingProperties, draftMeta),
    };

    return request.put<PbsStandingCurrentResponse, PbsSaveStandingDraftRequest>(
      pbsStandingBidRoutes.current,
      payload,
    );
  },
};
