import { useCallback, useMemo, useState } from "react";
import { cn } from "@/shared/lib/cn";
import type {
  ScheduleCalendarActionAnchor,
  ScheduleCalendarActionPopover,
} from "@/shared/components/schedule/schedule-event-calendar";

type BidCalendarDateMode = "days-off" | "pairing";

type PendingBidCalendarDateIntent = {
  isoDate: string;
  anchor: ScheduleCalendarActionAnchor;
};

type UseBidCalendarDateActionCoordinatorOptions = {
  dayOffActionPopover: ScheduleCalendarActionPopover | null;
  pairingActionPopover: ScheduleCalendarActionPopover | null;
  showDateModeTabs: boolean;
  onDaysOffDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  onDaysOffWeekdayAction: (weekdayIndex: number, weekdayLabel: string, anchor: ScheduleCalendarActionAnchor) => void;
  onPairingDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  onClearDaysOffAction: () => void;
  onClearPairingAction: () => void;
  onClearPairingEvent: () => void;
};

type UseBidCalendarDateActionCoordinatorResult = {
  calendarActionPopover: ScheduleCalendarActionPopover | null;
  clearPendingDateIntent: () => void;
  handleRequestBidDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  handleRequestDaysOffDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  handleRequestDaysOffWeekdayAction: (
    weekdayIndex: number,
    weekdayLabel: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => void;
  handleRequestPairingDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
};

const BID_CALENDAR_MODE_STORAGE_KEY = "pbs.bid.calendar-date-mode";
const DATE_MODE_POPOVER_MIN_WIDTH = 380;
const BID_CALENDAR_DATE_MODES = [
  ["days-off", "DAYS OFF"],
  ["pairing", "PAIRING"],
] as const satisfies readonly [BidCalendarDateMode, string][];

const readBidCalendarDateMode = (): BidCalendarDateMode => {
  const storedMode = window.sessionStorage.getItem(BID_CALENDAR_MODE_STORAGE_KEY);

  return storedMode === "pairing" ? "pairing" : "days-off";
};

export const useBidCalendarDateActionCoordinator = ({
  dayOffActionPopover,
  pairingActionPopover,
  showDateModeTabs,
  onDaysOffDateAction,
  onDaysOffWeekdayAction,
  onPairingDateAction,
  onClearDaysOffAction,
  onClearPairingAction,
  onClearPairingEvent,
}: UseBidCalendarDateActionCoordinatorOptions): UseBidCalendarDateActionCoordinatorResult => {
  const [dateMode, setDateMode] = useState<BidCalendarDateMode>(readBidCalendarDateMode);
  const [pendingDateIntent, setPendingDateIntent] = useState<PendingBidCalendarDateIntent | null>(null);

  const clearPendingDateIntent = useCallback(() => {
    setPendingDateIntent(null);
  }, []);

  const handleRequestDaysOffDateAction = useCallback((
    isoDate: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => {
    onClearPairingAction();
    onClearPairingEvent();
    onDaysOffDateAction(isoDate, anchor);
  }, [onClearPairingAction, onClearPairingEvent, onDaysOffDateAction]);

  const handleRequestPairingDateAction = useCallback((
    isoDate: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => {
    onClearDaysOffAction();
    onPairingDateAction(isoDate, anchor);
  }, [onClearDaysOffAction, onPairingDateAction]);

  const openDateMode = useCallback((
    mode: BidCalendarDateMode,
    intent: PendingBidCalendarDateIntent,
  ) => {
    setDateMode(mode);
    window.sessionStorage.setItem(BID_CALENDAR_MODE_STORAGE_KEY, mode);

    if (mode === "days-off") {
      handleRequestDaysOffDateAction(intent.isoDate, intent.anchor);
      return;
    }

    handleRequestPairingDateAction(intent.isoDate, intent.anchor);
  }, [handleRequestDaysOffDateAction, handleRequestPairingDateAction]);

  const handleRequestBidDateAction = useCallback((
    isoDate: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => {
    const intent = { isoDate, anchor };

    setPendingDateIntent(intent);
    openDateMode(dateMode, intent);
  }, [dateMode, openDateMode]);

  const handleRequestDaysOffWeekdayAction = useCallback((
    weekdayIndex: number,
    weekdayLabel: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => {
    onClearPairingAction();
    onClearPairingEvent();
    setPendingDateIntent(null);
    onDaysOffWeekdayAction(weekdayIndex, weekdayLabel, anchor);
  }, [onClearPairingAction, onClearPairingEvent, onDaysOffWeekdayAction]);

  const handleDateModeChange = useCallback((mode: BidCalendarDateMode) => {
    if (!pendingDateIntent || mode === dateMode) {
      return;
    }

    openDateMode(mode, pendingDateIntent);
  }, [dateMode, openDateMode, pendingDateIntent]);

  const baseCalendarActionPopover = dayOffActionPopover ?? pairingActionPopover;
  const calendarActionPopover = useMemo(() => {
    if (!showDateModeTabs || !pendingDateIntent || !baseCalendarActionPopover) {
      return baseCalendarActionPopover;
    }

    return {
      ...baseCalendarActionPopover,
      width: Math.max(baseCalendarActionPopover.width ?? 0, DATE_MODE_POPOVER_MIN_WIDTH),
      content: (
        <>
          <div
            aria-label="Bid calendar action"
            className="mb-4 grid grid-cols-2 rounded-lg bg-[#eef0f6] p-1"
            role="tablist"
          >
            {BID_CALENDAR_DATE_MODES.map(([mode, label]) => (
              <button
                key={mode}
                aria-selected={dateMode === mode}
                className={cn(
                  "h-8 cursor-pointer rounded-md text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#706cd5]",
                  dateMode === mode
                    ? "bg-white text-[#5f5ccc] shadow-sm"
                    : "text-[#6f7485] hover:text-[#4d4f5c]",
                )}
                role="tab"
                type="button"
                onClick={() => handleDateModeChange(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          {baseCalendarActionPopover.content}
        </>
      ),
      onCancel: () => {
        setPendingDateIntent(null);
        baseCalendarActionPopover.onCancel();
      },
    };
  }, [
    baseCalendarActionPopover,
    dateMode,
    handleDateModeChange,
    pendingDateIntent,
    showDateModeTabs,
  ]);

  return {
    calendarActionPopover,
    clearPendingDateIntent,
    handleRequestBidDateAction,
    handleRequestDaysOffDateAction,
    handleRequestDaysOffWeekdayAction,
    handleRequestPairingDateAction,
  };
};
