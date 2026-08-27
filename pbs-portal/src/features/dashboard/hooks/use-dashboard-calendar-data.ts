import { useMemo } from "react";
import {
  buildDayOffTiersByDate,
  buildPairingBlockedTiersByDate,
  type CalendarDraftResponse,
} from "@/features/dashboard/dashboard-calendar-state";
import { buildDashboardScheduleDataFromBiddingCalendar } from "@/features/dashboard/bidding-calendar-mappers";
import { useBiddingCalendar } from "@/features/dashboard/hooks/use-bidding-calendar";
import type { DashboardScheduleData } from "@/features/dashboard/types";
import { createEmptyDashboardScheduleData } from "@/features/dashboard/dashboard-view-model";
import {
  buildCalendarDraftFromDaysOffPageData,
} from "@/features/days-off/days-off-calendar-prefer-off";
import { useDaysOffPageData } from "@/features/days-off/hooks/use-days-off-page-data";
import { useReserveCoverage } from "@/features/reserve/hooks/use-reserve-page-data";

type UseDashboardCalendarDataOptions = {
  data?: DashboardScheduleData;
  editableDaysOffCalendar: boolean;
  storedActiveTierLabel: string;
  activeDraftTierLabel: string;
  calendarDraft: CalendarDraftResponse | null;
};

const getCalendarDraftVersion = (draft: CalendarDraftResponse | null) =>
  draft?.draft.draftVersion ?? -1;

export const useDashboardCalendarData = ({
  data,
  editableDaysOffCalendar,
  storedActiveTierLabel,
  activeDraftTierLabel,
  calendarDraft,
}: UseDashboardCalendarDataOptions) => {
  const {
    data: serverBiddingCalendar,
    isError: biddingCalendarLoadFailed,
    isLoading: isBiddingCalendarLoading,
  } = useBiddingCalendar();
  const daysOffPageQuery = useDaysOffPageData({
    enabled: editableDaysOffCalendar,
  });
  const reserveCoverageQuery = useReserveCoverage();
  const daysOffCalendarDraft = useMemo(
    () => editableDaysOffCalendar && daysOffPageQuery.data
      ? buildCalendarDraftFromDaysOffPageData(daysOffPageQuery.data)
      : null,
    [daysOffPageQuery.data, editableDaysOffCalendar],
  );
  const shouldUsePageDraftOverLocalDraft = Boolean(
    calendarDraft
    && daysOffCalendarDraft
    && getCalendarDraftVersion(daysOffCalendarDraft) > getCalendarDraftVersion(calendarDraft),
  );
  const effectiveCalendarDraft = shouldUsePageDraftOverLocalDraft
    ? daysOffCalendarDraft
    : calendarDraft ?? daysOffCalendarDraft;
  const editableCalendarDraft = editableDaysOffCalendar
    ? effectiveCalendarDraft
    : null;
  const displayCalendarDraft = editableDaysOffCalendar
    ? shouldUsePageDraftOverLocalDraft
      ? daysOffCalendarDraft
      : calendarDraft
    : null;
  const currentPeriod = serverBiddingCalendar?.currentPeriod;
  const rosterPeriodId = currentPeriod?.rosterPeriodId ?? currentPeriod?.id ?? null;
  const calendarContextInvalid = Boolean(
    serverBiddingCalendar
    && (
      !Number.isInteger(rosterPeriodId)
      || (rosterPeriodId ?? 0) <= 0
      || !currentPeriod?.rpStartLocal
      || !currentPeriod.rpEndLocal
      || currentPeriod.rpStartLocal > currentPeriod.rpEndLocal
    )
  );
  const scheduleData = useMemo(
    () => {
      if (serverBiddingCalendar && !calendarContextInvalid) {
        return buildDashboardScheduleDataFromBiddingCalendar(
          serverBiddingCalendar,
          storedActiveTierLabel,
          displayCalendarDraft,
          {
            reserveCoverage: !reserveCoverageQuery.isError
              ? reserveCoverageQuery.data
              : null,
          },
        );
      }

      return data ?? createEmptyDashboardScheduleData();
    },
    [
      calendarContextInvalid,
      data,
      displayCalendarDraft,
      reserveCoverageQuery.data,
      reserveCoverageQuery.isError,
      serverBiddingCalendar,
      storedActiveTierLabel,
    ],
  );
  const blockedPairingTiersByDate = useMemo(
    () => buildPairingBlockedTiersByDate(serverBiddingCalendar?.events),
    [serverBiddingCalendar?.events],
  );
  const dayOffTiersByDate = useMemo(
    () => buildDayOffTiersByDate(serverBiddingCalendar?.events, editableCalendarDraft),
    [editableCalendarDraft, serverBiddingCalendar?.events],
  );
  const activeDates = editableCalendarDraft?.draft.tiers.find((tier) =>
    tier.tier === activeDraftTierLabel)?.dates ?? [];
  const isWaitingForEditableDraft = editableDaysOffCalendar && daysOffPageQuery.isLoading && !editableCalendarDraft;

  return {
    activeDates,
    blockedPairingTiersByDate,
    biddingCalendarLoadFailed,
    calendarContextInvalid,
    dayOffTiersByDate,
    daysOffPageQuery,
    editableCalendarDraft,
    isBiddingCalendarLoading,
    isWaitingForEditableDraft,
    reserveCoverageQuery,
    scheduleData,
    serverBiddingCalendar,
  };
};
