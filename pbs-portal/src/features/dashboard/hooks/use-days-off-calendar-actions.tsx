import { useCallback, useMemo, useState } from "react";
import { message } from "@rois/ui";
import {
  LINEHOLDER_TIER_KEYS,
  calendarDraftHasDate,
  canSaveCalendarAction,
  countBlockedDayOffAdditions,
  countBlockedDayOffTargets,
  findTiersContainingDates,
  formatBlockedDayOffMessage,
  isPairingBlockedForDayOff,
  isPendingCalendarTierDisabled,
  sortTierKeys,
  type CalendarDayOffAction,
  type CalendarDraftResponse,
} from "@/features/dashboard/dashboard-calendar-state";
import {
  invalidateDaysOffCalendarMutationQueries,
  invalidateDaysOffCalendarRecoveryQueries,
} from "@/features/dashboard/calendar-query-invalidations";
import type { DashboardScheduleData } from "@/features/dashboard/types";
import {
  patchDaysOffPageDataWithCalendarProperties,
  saveDaysOffCalendarAction,
} from "@/features/days-off/days-off-calendar-mutation";
import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import type { RuleBidPageData } from "@/features/rule-bids/types";
import { queryClient } from "@/shared/query/query-client";
import type {
  ScheduleCalendarActionAnchor,
  ScheduleCalendarActionPopover,
} from "@/shared/components/schedule/schedule-event-calendar";
import { TierSelectionTitle } from "@/shared/components/tiers";

type PendingCalendarAction = CalendarDayOffAction & {
  description: string;
  anchor: ScheduleCalendarActionAnchor;
};

type UseDaysOffCalendarActionsOptions = {
  activeDraftTierLabel: string;
  blockedPairingTiersByDate: Map<string, Set<string>>;
  editableCalendarDraft: CalendarDraftResponse | null;
  daysOffPageData: RuleBidPageData | undefined;
  scheduleData: DashboardScheduleData;
  onActionOpen?: () => void;
  onDraftSaved: (draft: CalendarDraftResponse) => void;
};

type UseDaysOffCalendarActionsResult = {
  actionPopover: ScheduleCalendarActionPopover | null;
  clearCalendarAction: () => void;
  isCalendarSavePending: boolean;
  requestDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  requestWeekdayAction: (weekdayIndex: number, weekdayLabel: string, anchor: ScheduleCalendarActionAnchor) => void;
  resetCalendarActionState: () => void;
};

const WEEKDAY_FULL_LABELS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAYS_OFF_CALENDAR_SAVE_ERROR_MESSAGE = "Unable to save days off calendar bid.";

export const useDaysOffCalendarActions = ({
  activeDraftTierLabel,
  blockedPairingTiersByDate,
  editableCalendarDraft,
  daysOffPageData,
  scheduleData,
  onActionOpen,
  onDraftSaved,
}: UseDaysOffCalendarActionsOptions): UseDaysOffCalendarActionsResult => {
  const [pendingCalendarAction, setPendingCalendarAction] = useState<PendingCalendarAction | null>(null);
  const [isCalendarSavePending, setIsCalendarSavePending] = useState(false);

  const clearCalendarAction = useCallback(() => {
    setPendingCalendarAction(null);
  }, []);

  const resetCalendarActionState = useCallback(() => {
    setPendingCalendarAction(null);
    setIsCalendarSavePending(false);
  }, []);

  const openCalendarAction = useCallback((
    type: PendingCalendarAction["type"],
    isoDates: string[],
    description: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => {
    const existingTiers = findTiersContainingDates(editableCalendarDraft, isoDates);
    const selectedTiers = existingTiers.filter((tier) =>
      isoDates.some((date) =>
        calendarDraftHasDate(editableCalendarDraft, tier, date)
        || !isPairingBlockedForDayOff(blockedPairingTiersByDate, date, tier)));

    onActionOpen?.();
    setPendingCalendarAction({
      type,
      description,
      isoDates,
      selectedTiers,
      anchor,
    });
  }, [blockedPairingTiersByDate, editableCalendarDraft, onActionOpen]);

  const handlePendingTierToggle = useCallback((tier: string) => {
    setPendingCalendarAction((currentAction) => {
      if (!currentAction) {
        return currentAction;
      }

      if (isPendingCalendarTierDisabled(
        currentAction,
        tier,
        editableCalendarDraft,
        blockedPairingTiersByDate,
      )) {
        return currentAction;
      }

      const selectedTierSet = new Set(currentAction.selectedTiers);

      if (selectedTierSet.has(tier)) {
        selectedTierSet.delete(tier);
      } else {
        selectedTierSet.add(tier);
      }

      return {
        ...currentAction,
        selectedTiers: sortTierKeys(Array.from(selectedTierSet)),
      };
    });
  }, [blockedPairingTiersByDate, editableCalendarDraft]);

  const handleClearPendingTiers = useCallback(() => {
    setPendingCalendarAction((currentAction) =>
      currentAction ? { ...currentAction, selectedTiers: [] } : currentAction);
  }, []);

  const requestDateAction = useCallback((isoDate: string, anchor: ScheduleCalendarActionAnchor) => {
    openCalendarAction("date", [isoDate], isoDate, anchor);
  }, [openCalendarAction]);

  const requestWeekdayAction = useCallback((
    weekdayIndex: number,
    weekdayLabel: string,
    anchor: ScheduleCalendarActionAnchor,
  ) => {
    const isoDates = scheduleData.calendarCells
      .filter((cell, index) => index % 7 === weekdayIndex && cell.isoDate && !cell.muted)
      .map((cell) => cell.isoDate)
      .filter((isoDate): isoDate is string => typeof isoDate === "string");

    openCalendarAction(
      "weekday",
      isoDates,
      `All ${WEEKDAY_FULL_LABELS[weekdayIndex] ?? weekdayLabel} dates in ${scheduleData.monthLabel}`,
      anchor,
    );
  }, [openCalendarAction, scheduleData.calendarCells, scheduleData.monthLabel]);

  const pendingCalendarBlockedCount = pendingCalendarAction
    ? pendingCalendarAction.type === "weekday"
      ? countBlockedDayOffAdditions(
        pendingCalendarAction,
        editableCalendarDraft,
        blockedPairingTiersByDate,
      )
      : Math.max(
        countBlockedDayOffAdditions(
          pendingCalendarAction,
          editableCalendarDraft,
          blockedPairingTiersByDate,
        ),
        countBlockedDayOffTargets(
          pendingCalendarAction,
          editableCalendarDraft,
          blockedPairingTiersByDate,
        ),
      )
    : 0;
  const pendingCalendarBlockedMessage = pendingCalendarBlockedCount > 0
    ? formatBlockedDayOffMessage(pendingCalendarBlockedCount)
    : null;
  const isCalendarActionConfirmDisabled = isCalendarSavePending
    || !pendingCalendarAction
    || pendingCalendarAction.isoDates.length === 0
    || !editableCalendarDraft
    || !canSaveCalendarAction(
      pendingCalendarAction,
      editableCalendarDraft,
      blockedPairingTiersByDate,
    );

  const handleConfirmCalendarAction = useCallback(async () => {
    if (!pendingCalendarAction || !editableCalendarDraft || !daysOffPageData || isCalendarSavePending) {
      return;
    }

    const blockedCount = countBlockedDayOffAdditions(
      pendingCalendarAction,
      editableCalendarDraft,
      blockedPairingTiersByDate,
    );

    if (!canSaveCalendarAction(pendingCalendarAction, editableCalendarDraft, blockedPairingTiersByDate)) {
      const errorMessage = blockedCount > 0
        ? formatBlockedDayOffMessage(blockedCount)
        : DAYS_OFF_CALENDAR_SAVE_ERROR_MESSAGE;
      message.error(errorMessage);
      return;
    }

    setIsCalendarSavePending(true);

    try {
      const result = await saveDaysOffCalendarAction({
        currentDraft: editableCalendarDraft,
        action: pendingCalendarAction,
        blockedTiersByDate: blockedPairingTiersByDate,
        pageData: daysOffPageData,
      });

      onDraftSaved(structuredClone(result.patchedDraft));
      queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
        ? patchDaysOffPageDataWithCalendarProperties(
            currentData,
            result.draftMeta,
            result.savedTargetProperties,
          )
        : currentData);
      invalidateDaysOffCalendarMutationQueries();
      if (blockedCount > 0) {
        message.warning(formatBlockedDayOffMessage(blockedCount));
      }
      setPendingCalendarAction(null);
    } catch {
      message.error(DAYS_OFF_CALENDAR_SAVE_ERROR_MESSAGE);
      invalidateDaysOffCalendarRecoveryQueries();
    } finally {
      setIsCalendarSavePending(false);
    }
  }, [
    blockedPairingTiersByDate,
    daysOffPageData,
    editableCalendarDraft,
    isCalendarSavePending,
    onDraftSaved,
    pendingCalendarAction,
  ]);

  const actionPopover = useMemo<ScheduleCalendarActionPopover | null>(() => pendingCalendarAction ? {
    anchor: pendingCalendarAction.anchor,
    tierLabel: activeDraftTierLabel,
    description: pendingCalendarAction.description,
    content: (
      <fieldset aria-label="Day off bid tiers">
        <TierSelectionTitle as="legend" />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {LINEHOLDER_TIER_KEYS.map((tier) => {
            const disabled = isCalendarSavePending || isPendingCalendarTierDisabled(
              pendingCalendarAction,
              tier,
              editableCalendarDraft,
              blockedPairingTiersByDate,
            );

            return (
              <label
                key={tier}
                className={[
                  "flex h-[28px] items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold",
                  disabled
                    ? "cursor-not-allowed border-[#edf0f4] bg-[#f8f9fb] text-[#a8adba]"
                    : "cursor-pointer border-[#e1e5ec] text-[#40424f]",
                ].join(" ")}
              >
                <input
                  checked={pendingCalendarAction.selectedTiers.includes(tier)}
                  className="h-3.5 w-3.5 accent-[#706cd5] disabled:cursor-not-allowed"
                  disabled={disabled}
                  type="checkbox"
                  onChange={() => handlePendingTierToggle(tier)}
                />
                {tier}
              </label>
            );
          })}
          <button
            className="h-[28px] cursor-pointer rounded-lg border border-dashed border-[#c8ced8] px-2 text-xs font-semibold text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isCalendarSavePending}
            type="button"
            onClick={handleClearPendingTiers}
          >
            Clear
          </button>
        </div>
        {pendingCalendarBlockedMessage ? (
          <p className="mt-2 rounded-lg border border-[#ffe1a8] bg-[#fff8e6] px-2 py-1.5 text-xs font-semibold text-[#9a5b00]">
            {pendingCalendarBlockedMessage}
          </p>
        ) : null}
      </fieldset>
    ),
    confirmLabel: "SAVE BID",
    confirmDisabled: isCalendarActionConfirmDisabled,
    confirmPending: isCalendarSavePending,
    confirmPendingLabel: "SAVING...",
    cancelDisabled: isCalendarSavePending,
    onConfirm: handleConfirmCalendarAction,
    onCancel: clearCalendarAction,
  } : null, [
    activeDraftTierLabel,
    blockedPairingTiersByDate,
    clearCalendarAction,
    editableCalendarDraft,
    handleClearPendingTiers,
    handleConfirmCalendarAction,
    handlePendingTierToggle,
    isCalendarActionConfirmDisabled,
    isCalendarSavePending,
    pendingCalendarAction,
    pendingCalendarBlockedMessage,
  ]);

  return {
    actionPopover,
    clearCalendarAction,
    isCalendarSavePending,
    requestDateAction,
    requestWeekdayAction,
    resetCalendarActionState,
  };
};
