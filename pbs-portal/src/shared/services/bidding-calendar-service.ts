import {
  pbsBiddingCalendarRoutes,
  type PbsBiddingCalendarCurrentResponse,
} from "../../../../packages/contracts/pbs-bidding-calendar.js";
import { request } from "@/shared/services/request";

export const biddingCalendarService = {
  async getCurrentCalendar(): Promise<PbsBiddingCalendarCurrentResponse> {
    return request.get<PbsBiddingCalendarCurrentResponse>(pbsBiddingCalendarRoutes.current);
  },
};

