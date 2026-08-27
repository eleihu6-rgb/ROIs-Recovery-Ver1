import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { reserveService } from "@/shared/services/reserve-service";

export const reservePageDataQueryKey = ["reserve", "page-data"] as const;
export const reserveCoverageQueryKey = ["reserve", "coverage"] as const;

type UseReserveCoverageOptions = {
  enabled?: boolean;
};

export const useReservePageData = () =>
  useQuery({
    queryKey: reservePageDataQueryKey,
    queryFn: () => reserveService.getPageData(),
    ...workbenchQueryDefaults,
  });

export const useReserveCoverage = ({
  enabled = true,
}: UseReserveCoverageOptions = {}) =>
  useQuery({
    queryKey: reserveCoverageQueryKey,
    queryFn: () => reserveService.getCoverage(),
    ...workbenchQueryDefaults,
    enabled,
  });
