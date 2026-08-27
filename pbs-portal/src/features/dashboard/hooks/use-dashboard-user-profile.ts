import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { dashboardProfileService } from "@/shared/services/dashboard-profile-service";

export const dashboardUserProfileQueryKey = ["dashboard", "user-profile"] as const;

export const fetchDashboardUserProfile = () => dashboardProfileService.getCurrentProfile();

export const useDashboardUserProfile = () =>
  useQuery({
    queryKey: dashboardUserProfileQueryKey,
    queryFn: fetchDashboardUserProfile,
    ...workbenchQueryDefaults,
  });
