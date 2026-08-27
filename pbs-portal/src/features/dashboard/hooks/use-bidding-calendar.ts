import { useQuery } from "@tanstack/react-query";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { biddingCalendarService } from "@/shared/services/bidding-calendar-service";

export const biddingCalendarQueryKey = ["bidding-calendar", "current"] as const;

export const fetchBiddingCalendar = () => biddingCalendarService.getCurrentCalendar();

export const useBiddingCalendar = () =>
  useQuery({
    queryKey: biddingCalendarQueryKey,
    queryFn: fetchBiddingCalendar,
    ...workbenchQueryDefaults,
  });

