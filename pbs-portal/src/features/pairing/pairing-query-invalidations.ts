import { biddingCalendarQueryKey } from "@/features/dashboard/hooks/use-bidding-calendar";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import { queryClient } from "@/shared/query/query-client";

export const invalidatePairingCalendarQueries = () => {
  void queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
  void queryClient.invalidateQueries({ queryKey: biddingCalendarQueryKey });
};
