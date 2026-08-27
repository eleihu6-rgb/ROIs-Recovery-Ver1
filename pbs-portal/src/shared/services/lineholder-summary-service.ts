import {
  pbsLineholderBidRoutes,
  type PbsLineholderCurrentSummaryResponse,
} from "../../../../packages/contracts/pbs-lineholder-summary.js";
import { request } from "@/shared/services/request";

export const lineholderSummaryService = {
  async getCurrentSummary(): Promise<PbsLineholderCurrentSummaryResponse> {
    return request.get<PbsLineholderCurrentSummaryResponse>(pbsLineholderBidRoutes.summary);
  },
};
