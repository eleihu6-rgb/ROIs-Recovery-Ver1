import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { standingBidService } from "@/shared/services/standing-bid-service";

export const standingBidPageDataQueryKey = ["standing-bid", "page-data"] as const;

export const useStandingBidPageData = () =>
  useQuery({
    queryKey: standingBidPageDataQueryKey,
    queryFn: () => standingBidService.getPageData(),
    ...workbenchQueryDefaults,
  });
