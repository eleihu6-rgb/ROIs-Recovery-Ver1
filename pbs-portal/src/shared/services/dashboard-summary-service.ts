import {
  pbsDashboardSummaryRoutes,
  type PbsDashboardSummary,
} from "../../../../packages/contracts/pbs-dashboard-summary.js";
import { request } from "@/shared/services/request";

export const dashboardSummaryService = {
  async getCurrentSummary(): Promise<PbsDashboardSummary> {
    return request.get<PbsDashboardSummary>(pbsDashboardSummaryRoutes.current);
  },
};
