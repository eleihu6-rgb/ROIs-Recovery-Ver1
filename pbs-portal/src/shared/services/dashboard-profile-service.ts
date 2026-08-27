import {
  pbsDashboardProfileRoutes,
  type PbsDashboardUserProfile,
} from "../../../../packages/contracts/pbs-dashboard-profile.js";
import { request } from "@/shared/services/request";

export const dashboardProfileService = {
  async getCurrentProfile(): Promise<PbsDashboardUserProfile> {
    return request.get<PbsDashboardUserProfile>(pbsDashboardProfileRoutes.current);
  },
};
