import { useQuery } from "@tanstack/react-query";
import { mapAwardResponseToPageData } from "@/features/award/award-mappers";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { awardService } from "@/shared/services/award-service";

export const awardPageDataQueryKey = (rosterPeriodId: number | null) =>
  ["award", rosterPeriodId ?? "current"] as const;
export const awardPeriodsQueryKey = ["award", "periods"] as const;

export const fetchAwardPageData = async (rosterPeriodId: number | null = null) => {
  const response = rosterPeriodId === null
    ? await awardService.getCurrentAward()
    : await awardService.getAwardByPeriodId(rosterPeriodId);
  return mapAwardResponseToPageData(response);
};

export const useAwardPageData = (rosterPeriodId: number | null = null) =>
  useQuery({
    queryKey: awardPageDataQueryKey(rosterPeriodId),
    queryFn: () => fetchAwardPageData(rosterPeriodId),
    ...workbenchQueryDefaults,
  });

export const useAwardPeriods = () =>
  useQuery({
    queryKey: awardPeriodsQueryKey,
    queryFn: () => awardService.getAwardPeriods(),
    ...workbenchQueryDefaults,
  });
