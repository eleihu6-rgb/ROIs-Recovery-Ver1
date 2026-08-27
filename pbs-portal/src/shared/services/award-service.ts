import {
  pbsAwardRoutes,
  type PbsAwardCurrentResponse,
  type PbsAwardPeriodListResponse,
} from "../../../../packages/contracts/pbs-award-results.js";
import { request } from "@/shared/services/request";

export const awardService = {
  getCurrentAward(): Promise<PbsAwardCurrentResponse> {
    return request.get<PbsAwardCurrentResponse>(pbsAwardRoutes.current);
  },
  getAwardPeriods(): Promise<PbsAwardPeriodListResponse> {
    return request.get<PbsAwardPeriodListResponse>(pbsAwardRoutes.periods);
  },
  getAwardByPeriodId(rosterPeriodId: number): Promise<PbsAwardCurrentResponse> {
    return request.get<PbsAwardCurrentResponse>(pbsAwardRoutes.periodById(rosterPeriodId));
  },
};
