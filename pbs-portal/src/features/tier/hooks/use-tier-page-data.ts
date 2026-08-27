import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { tierService } from "@/shared/services/tier-service";

export const tierPageDataQueryKey = ["tier", "page-data"] as const;

export const fetchTierPageData = () => tierService.getPageData();

export const useTierPageData = () =>
  useQuery({
    queryKey: tierPageDataQueryKey,
    queryFn: fetchTierPageData,
    ...workbenchQueryDefaults,
  });
