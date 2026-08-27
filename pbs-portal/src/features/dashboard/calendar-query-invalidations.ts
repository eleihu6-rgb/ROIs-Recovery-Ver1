import type { QueryKey } from "@tanstack/react-query";
import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import { biddingCalendarQueryKey } from "@/features/dashboard/hooks/use-bidding-calendar";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import { queryClient } from "@/shared/query/query-client";

export const invalidateQueriesInBackground = (queryKeys: QueryKey[]) => {
  void Promise
    .all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    .catch(() => undefined);
};

export const invalidateDaysOffCalendarMutationQueries = () => {
  invalidateQueriesInBackground([biddingCalendarQueryKey, tierPageDataQueryKey]);
};

export const invalidateDaysOffCalendarRecoveryQueries = () => {
  invalidateQueriesInBackground([daysOffPageDataQueryKey, biddingCalendarQueryKey]);
};

export const invalidatePairingCalendarMutationQueries = () => {
  invalidateQueriesInBackground([
    pairingPageDataQueryKey,
    biddingCalendarQueryKey,
    tierPageDataQueryKey,
  ]);
};
