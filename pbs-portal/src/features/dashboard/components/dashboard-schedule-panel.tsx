import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { DashboardSchedulePanelLoading } from "@/features/dashboard/components/dashboard-schedule-panel-loading";
import { PairingCalendarBidDetailDialog } from "@/features/dashboard/components/pairing-calendar-bid-detail-dialog";
import { useBidCalendarDateActionCoordinator } from "@/features/dashboard/hooks/use-bid-calendar-date-action-coordinator";
import { useDashboardCalendarData } from "@/features/dashboard/hooks/use-dashboard-calendar-data";
import { useDaysOffCalendarActions } from "@/features/dashboard/hooks/use-days-off-calendar-actions";
import { usePairingCalendarActions } from "@/features/dashboard/hooks/use-pairing-calendar-actions";
import {
  toDraftTierLabel,
  type CalendarDraftResponse,
} from "@/features/dashboard/dashboard-calendar-state";
import { ScheduleEventCalendar, ScheduleTierMatrix } from "@/shared/components/schedule";
import type { DashboardScheduleData } from "@/features/dashboard/types";
import { cn } from "@/shared/lib/cn";
import { CurrentPeriodStatus } from "@/shared/components/current-period-status";
import { PanelMessageState } from "@/shared/components/panel";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";
import { createEmptyDashboardScheduleData } from "@/features/dashboard/dashboard-view-model";

type DashboardSchedulePanelProps = {
  data?: DashboardScheduleData;
  contentMinWidth?: number;
  density?: "regular" | "compact";
  calendarHeight?: number;
  calendarCellHeight?: number;
  editableDaysOffCalendar?: boolean;
  onCollapse?: () => void;
  pairingCalendarAwardBid?: boolean;
};

const DAYS_PER_WEEK = 7;
const COMPACT_FIVE_WEEK_CALENDAR_CELL_HEIGHT = 84;
const COMPACT_SIX_WEEK_CALENDAR_CELL_HEIGHT = 72;

export const DashboardSchedulePanel = memo(({
  data = createEmptyDashboardScheduleData(),
  contentMinWidth,
  density = "regular",
  calendarHeight,
  calendarCellHeight,
  editableDaysOffCalendar = false,
  onCollapse,
  pairingCalendarAwardBid = false,
}: DashboardSchedulePanelProps) => {
  const storedActiveTierLabel = useBiddingCalendarStore((state) => state.activeTierLabel);
  const setActiveTierLabel = useBiddingCalendarStore((state) => state.setActiveTierLabel);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraftResponse | null>(null);
  const clearBidCalendarDateIntentRef = useRef<() => void>(() => {});
  const activeTierLabel = storedActiveTierLabel;
  const displayActiveTierLabel = activeTierLabel || "TIER-01";
  const activeDraftTierLabel = toDraftTierLabel(displayActiveTierLabel);
  const isCompactDensity = density === "compact";
  const {
    activeDates,
    blockedPairingTiersByDate,
    biddingCalendarLoadFailed,
    calendarContextInvalid,
    dayOffTiersByDate,
    daysOffPageQuery,
    editableCalendarDraft,
    isBiddingCalendarLoading,
    isWaitingForEditableDraft,
    scheduleData,
    serverBiddingCalendar,
  } = useDashboardCalendarData({
    data,
    editableDaysOffCalendar,
    storedActiveTierLabel,
    activeDraftTierLabel,
    calendarDraft,
  });
  const {
    actionPopover: dayOffCalendarActionPopover,
    clearCalendarAction,
    requestDateAction,
    requestWeekdayAction,
    resetCalendarActionState,
  } = useDaysOffCalendarActions({
    activeDraftTierLabel,
    blockedPairingTiersByDate,
    editableCalendarDraft,
    daysOffPageData: daysOffPageQuery.data,
    scheduleData,
    onDraftSaved: setCalendarDraft,
  });
  const handlePairingCalendarActionOpen = useCallback(() => {
    clearCalendarAction();
  }, [clearCalendarAction]);
  const handlePairingCalendarEventOpen = useCallback(() => {
    clearCalendarAction();
    clearBidCalendarDateIntentRef.current();
  }, [clearCalendarAction]);
  const {
    actionPopover: pairingCalendarActionPopover,
    canEditCurrentBid,
    currentPeriod,
    selectedEventDialog: selectedPairingEventDialog,
    clearAction: clearPairingCalendarAction,
    clearSelectedEvent: clearSelectedPairingEvent,
    handleCalendarEventSelect,
    requestDateAction: requestPairingDateAction,
    resetActionState: resetPairingCalendarActionState,
  } = usePairingCalendarActions({
    dayOffTiersByDate,
    daysOffPageData: daysOffPageQuery.data,
    enabled: pairingCalendarAwardBid,
    scheduleMonthLabel: scheduleData.monthLabel,
    serverBiddingCalendar,
    onActionOpen: handlePairingCalendarActionOpen,
    onEventOpen: handlePairingCalendarEventOpen,
  });
  const {
    calendarActionPopover,
    clearPendingDateIntent,
    handleRequestBidDateAction,
    handleRequestDaysOffDateAction,
    handleRequestDaysOffWeekdayAction,
    handleRequestPairingDateAction,
  } = useBidCalendarDateActionCoordinator({
    dayOffActionPopover: dayOffCalendarActionPopover,
    pairingActionPopover: pairingCalendarActionPopover,
    showDateModeTabs: editableDaysOffCalendar && pairingCalendarAwardBid,
    onDaysOffDateAction: requestDateAction,
    onDaysOffWeekdayAction: requestWeekdayAction,
    onPairingDateAction: requestPairingDateAction,
    onClearDaysOffAction: clearCalendarAction,
    onClearPairingAction: clearPairingCalendarAction,
    onClearPairingEvent: clearSelectedPairingEvent,
  });
  const calendarRowCount = Math.max(1, Math.ceil(scheduleData.calendarCells.length / DAYS_PER_WEEK));
  const compactCalendarCellHeight = calendarRowCount > 5
    ? COMPACT_SIX_WEEK_CALENDAR_CELL_HEIGHT
    : COMPACT_FIVE_WEEK_CALENDAR_CELL_HEIGHT;
  const resolvedCalendarCellHeight = calendarCellHeight
    ?? (isCompactDensity ? compactCalendarCellHeight : undefined);
  const resolvedCalendarHeight = calendarHeight
    ?? (isCompactDensity && resolvedCalendarCellHeight
      ? calendarRowCount * resolvedCalendarCellHeight
      : undefined);

  useEffect(() => {
    clearBidCalendarDateIntentRef.current = clearPendingDateIntent;
  }, [clearPendingDateIntent]);

  useEffect(() => {
    if (!editableDaysOffCalendar) {
      setCalendarDraft(null);
    }

    resetCalendarActionState();
    resetPairingCalendarActionState();
    clearPendingDateIntent();
  }, [
    activeDraftTierLabel,
    clearPendingDateIntent,
    editableDaysOffCalendar,
    pairingCalendarAwardBid,
    resetCalendarActionState,
    resetPairingCalendarActionState,
  ]);

  if ((isBiddingCalendarLoading && !serverBiddingCalendar) || isWaitingForEditableDraft) {
    return (
      <DashboardSchedulePanelLoading
        statusLabel="Loading bidding calendar..."
        testId="dashboard-schedule-panel-loading"
      />
    );
  }

  if (
    calendarContextInvalid
    || (biddingCalendarLoadFailed && !serverBiddingCalendar && !editableCalendarDraft)
    || (editableDaysOffCalendar && daysOffPageQuery.isError && !editableCalendarDraft)
  ) {
    return (
      <PanelMessageState
        message="Unable to load the current bidding calendar."
        testId="dashboard-schedule-panel-error"
        title={data.title}
      />
    );
  }

  return (
    <section
      className="relative min-h-full min-w-0 overflow-hidden rounded-3xl bg-white shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
      data-layout-density={density}
      data-uiid="dashboard-schedule-panel"
    >
      <div className={isCompactDensity ? "px-5 pt-4" : "px-6 pt-6"}>
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-8 w-[222px] shrink-0 items-center rounded-sm bg-[rgba(104,102,204,0.08)] pr-10 text-left"
            data-testid="bidding-calendar-title-strip"
          >
            <span className="h-8 w-1 rounded-l-sm bg-[#706cd5]" />
            <span className="ml-3 text-sm font-medium leading-[18px] text-[#4d4f5c]">
              {data.title}
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <CurrentPeriodStatus
              currentPeriod={currentPeriod}
              className="min-w-0 shrink-0"
              variant="compact"
            />
            {onCollapse ? (
              <button
                aria-label="Collapse bidding calendar"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="collapse-bidding-calendar-button"
                type="button"
                onClick={onCollapse}
              >
                <ChevronLeftIcon className="h-4 w-4 shrink-0" />
              </button>
            ) : null}
          </div>
        </div>
        <h2 className={cn(
          "font-semibold text-[#282c3b]",
          isCompactDensity ? "mt-3 text-lg leading-5" : "mt-6 text-xl leading-6",
        )}
        >
          {scheduleData.monthLabel}
        </h2>
      </div>

      <div
        className={isCompactDensity ? "px-5 pb-4" : "px-6 pb-6"}
        data-testid="bidding-calendar-content-region"
      >
        <ScheduleTierMatrix
          activeTierLabel={displayActiveTierLabel}
          contentMinWidth={contentMinWidth}
          density={density}
          dayLabels={scheduleData.dayLabels}
          rows={scheduleData.tierRows}
          onSelectTier={(label) => {
            setActiveTierLabel(label);
          }}
        />

        <ScheduleEventCalendar
          actionPopover={calendarActionPopover}
          activeDates={activeDates}
          calendarCellHeight={resolvedCalendarCellHeight}
          calendarCells={scheduleData.calendarCells}
          calendarEvents={scheduleData.calendarEvents}
          calendarHeight={resolvedCalendarHeight}
          contentMinWidth={contentMinWidth}
          density={density}
          dateActionLabel={
            editableDaysOffCalendar && pairingCalendarAwardBid && canEditCurrentBid
              ? (isoDate) => `Add bid for ${isoDate}`
              : pairingCalendarAwardBid && canEditCurrentBid
                ? (isoDate) => `Add pairing bid for ${isoDate}`
              : undefined
          }
          onEventSelect={handleCalendarEventSelect}
          onSelectWeekday={editableDaysOffCalendar && editableCalendarDraft && canEditCurrentBid
            ? handleRequestDaysOffWeekdayAction
            : undefined}
          onToggleDate={
            editableDaysOffCalendar && pairingCalendarAwardBid && editableCalendarDraft && canEditCurrentBid
              ? handleRequestBidDateAction
            : editableDaysOffCalendar && editableCalendarDraft && canEditCurrentBid
              ? handleRequestDaysOffDateAction
            : pairingCalendarAwardBid && canEditCurrentBid
                ? handleRequestPairingDateAction
                : undefined
          }
          weekdayLabels={scheduleData.weekdayLabels}
        />
      </div>

      {selectedPairingEventDialog ? (
        <PairingCalendarBidDetailDialog {...selectedPairingEventDialog.props} />
      ) : null}
    </section>
  );
});
