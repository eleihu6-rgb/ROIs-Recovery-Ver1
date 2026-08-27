import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { lineService } from "@/shared/services/line-service";

export const linePageDataQueryKey = ["line", "page-data"] as const;

export const useLinePageData = () =>
  useQuery({
    queryKey: linePageDataQueryKey,
    queryFn: () => lineService.getPageData(),
    ...workbenchQueryDefaults,
  });
