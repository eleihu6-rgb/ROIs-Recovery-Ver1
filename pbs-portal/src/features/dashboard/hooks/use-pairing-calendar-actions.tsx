import { useCallback, useMemo, useState } from "react";
import type { PbsBiddingCalendarCurrentResponse } from "../../../../../packages/contracts/pbs-bidding-calendar.js";
import type { PbsCurrentPeriod } from "../../../../../packages/contracts/pbs-current-period.js";
import type { PairingCalendarBidDetailDialogViewModel, PendingPairingCalendarAction } from "@/features/dashboard/hooks/pairing-calendar-action-model";
import { usePairingCalendarDateAddAction } from "@/features/dashboard/hooks/use-pairing-calendar-date-add-action";
import { usePairingCalendarEventDetailAction } from "@/features/dashboard/hooks/use-pairing-calendar-event-detail-action";
import { resolvePairingSearchPeriod } from "@/features/pairing/pairing-search-period";
import { usePairingPageData } from "@/features/pairing/hooks/use-pairing-page-data";
import { usePairingPoolCountsRefreshStore } from "@/features/pairing/pairing-pool-counts-refresh-store";
import type { ScheduleCalendarActionAnchor, ScheduleCalendarActionPopover } from "@/shared/components/schedule/schedule-event-calendar";
import type { ScheduleCalendarEvent } from "@/shared/components/schedule/types";
import type { RuleBidPageData } from "@/features/rule-bids/types";

type UsePairingCalendarActionsOptions = {
  dayOffTiersByDate: Map<string, Set<string>>;
  daysOffPageData: RuleBidPageData | undefined;
  enabled: boolean;
  scheduleMonthLabel: string;
  serverBiddingCalendar: PbsBiddingCalendarCurrentResponse | undefined;
  onActionOpen: () => void;
  onEventOpen: () => void;
};

type UsePairingCalendarActionsResult = {
  actionPopover: ScheduleCalendarActionPopover | null;
  canEditCurrentBid: boolean;
  currentPeriod: PbsCurrentPeriod | undefined;
  hasOpenAction: boolean;
  readOnlyMessage: string;
  selectedEventDialog: {
    event: ScheduleCalendarEvent;
    props: PairingCalendarBidDetailDialogViewModel;
  } | null;
  clearAction: () => void;
  clearSelectedEvent: () => void;
  handleCalendarEventSelect: (event: ScheduleCalendarEvent) => void;
  requestDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  resetActionState: () => void;
};

export const usePairingCalendarActions = ({
  dayOffTiersByDate,
  daysOffPageData,
  enabled,
  scheduleMonthLabel,
  serverBiddingCalendar,
  onActionOpen,
  onEventOpen,
}: UsePairingCalendarActionsOptions): UsePairingCalendarActionsResult => {
  const requestPairingPoolCountsRefresh = usePairingPoolCountsRefreshStore(
    (state) => state.requestPairingPoolCountsRefresh,
  );
  const [pendingPairingCalendarAction, setPendingPairingCalendarAction] = useState<PendingPairingCalendarAction | null>(null);
  const [selectedPairingEvent, setSelectedPairingEvent] = useState<ScheduleCalendarEvent | null>(null);

  const pairingPageQuery = usePairingPageData({
    enabled: enabled && (
      pendingPairingCalendarAction !== null
      || selectedPairingEvent !== null
    ),
  });
  const pairingPageDataState = useMemo(() => ({
    data: pairingPageQuery.data,
    isError: pairingPageQuery.isError,
    isFetching: pairingPageQuery.isFetching,
    refetch: pairingPageQuery.refetch,
  }), [
    pairingPageQuery.data,
    pairingPageQuery.isError,
    pairingPageQuery.isFetching,
    pairingPageQuery.refetch,
  ]);

  const currentPeriod = pairingPageQuery.data?.rightPanel.draftMeta.currentPeriod
    ?? daysOffPageData?.rightPanel.draftMeta.currentPeriod
    ?? serverBiddingCalendar?.currentPeriod;
  const canEditCurrentBid = currentPeriod?.canEditBid === true;
  const readOnlyMessage = currentPeriod?.readOnlyReason
    ?? `Bidding is not open for ${currentPeriod?.periodCode ?? scheduleMonthLabel}.`;
  const pairingCalendarPeriodCode = pairingPageQuery.data?.rightPanel.draftMeta.periodCode
    ?? serverBiddingCalendar?.periodCode
    ?? "";
  const pairingCalendarPeriod = resolvePairingSearchPeriod(currentPeriod, pairingCalendarPeriodCode);

  const {
    actionPopover,
    clearAction,
    hasOpenAction,
    requestDateAction,
    resetActionState: resetDateActionState,
  } = usePairingCalendarDateAddAction({
    canEditCurrentBid,
    dayOffTiersByDate,
    enabled,
    pairingCalendarPeriod,
    pairingPageQuery: pairingPageDataState,
    pendingPairingCalendarAction,
    readOnlyMessage,
    requestPairingPoolCountsRefresh,
    setPendingPairingCalendarAction,
    onActionOpen,
    onSelectedPairingEventChange: setSelectedPairingEvent,
  });
  const {
    selectedEventDialog,
    clearSelectedEvent,
    handleCalendarEventSelect,
    resetSelectedEventState,
  } = usePairingCalendarEventDetailAction({
    canEditCurrentBid,
    enabled,
    pairingCalendarPeriod,
    pairingPageQuery: pairingPageDataState,
    readOnlyMessage,
    selectedPairingEvent,
    setPendingPairingCalendarAction,
    setSelectedPairingEvent,
    onEventOpen,
  });

  const resetActionState = useCallback(() => {
    resetDateActionState();
    resetSelectedEventState();
  }, [resetDateActionState, resetSelectedEventState]);

  return {
    actionPopover,
    canEditCurrentBid,
    currentPeriod,
    hasOpenAction,
    readOnlyMessage,
    selectedEventDialog,
    clearAction,
    clearSelectedEvent,
    handleCalendarEventSelect,
    requestDateAction,
    resetActionState,
  };
};
