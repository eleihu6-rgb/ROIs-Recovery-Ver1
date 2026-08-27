import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { daysOffService } from "@/shared/services/days-off-service";

export const daysOffPageDataQueryKey = ["days-off", "page-data"] as const;

export const useDaysOffPageData = (options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: daysOffPageDataQueryKey,
    queryFn: () => daysOffService.getPageData(),
    enabled: options.enabled ?? true,
    ...workbenchQueryDefaults,
  });
