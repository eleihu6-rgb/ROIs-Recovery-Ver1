import { useQuery } from "@tanstack/react-query";
import { dashboardSummaryService } from "@/shared/services/dashboard-summary-service";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";

export const dashboardSummaryQueryKey = ["dashboard", "summary"] as const;

export const fetchDashboardSummary = () => dashboardSummaryService.getCurrentSummary();

export const useDashboardSummary = () =>
  useQuery({
    queryKey: dashboardSummaryQueryKey,
    queryFn: fetchDashboardSummary,
    ...workbenchQueryDefaults,
  });
