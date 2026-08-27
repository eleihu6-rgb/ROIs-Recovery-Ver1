import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { message } from "@rois/ui";
import type { PbsPairingOccurrence } from "../../../../../packages/contracts/pbs-search-pairings.js";
import { PairingCalendarBidPopoverContent } from "@/features/dashboard/components/pairing-calendar-bid-popover-content";
import {
  LINEHOLDER_TIER_KEYS,
  buildPairingDayOffBlockedTiers,
} from "@/features/dashboard/dashboard-calendar-state";
import { invalidatePairingCalendarMutationQueries } from "@/features/dashboard/calendar-query-invalidations";
import {
  EMPTY_PAIRING_OCCURRENCES,
  type PairingCalendarPageDataState,
  type PairingCalendarPeriodReference,
  type PendingPairingCalendarAction,
  toggleStringSelection,
} from "@/features/dashboard/hooks/pairing-calendar-action-model";
import { runCurrentBidMutation } from "@/features/bid/current-bid-draft-meta";
import {
  PAIRING_NUMBER_PROPERTY_CODE,
  buildPairingPreferenceBid,
} from "@/features/pairing/pairing-number-occurrences";
import {
  buildSavedPairingExistingPropertiesAfterAdd,
  cloneExistingPropertyFromAvailable,
  createPairingTierOptions,
} from "@/features/pairing/pairing-property-transform";
import {
  patchPairingPageDraftMeta,
  patchPairingPageExistingProperties,
} from "@/features/pairing/pairing-page-cache";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { queryClient } from "@/shared/query/query-client";
import { pairingService } from "@/shared/services/pairing-service";
import type { PairingPoolCountsRefreshInput } from "@/features/pairing/pairing-pool-counts-refresh-store";
import type { ScheduleCalendarActionAnchor, ScheduleCalendarActionPopover } from "@/shared/components/schedule/schedule-event-calendar";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingOccurrenceBidItem,
  PairingPageData,
} from "@/features/pairing/types";

const PAIRING_CALENDAR_ADD_ERROR_MESSAGE = "Unable to add pairing bid.";
const PAIRING_CALENDAR_ADD_SUCCESS_MESSAGE = "Pairing bid added.";

type UsePairingCalendarDateAddActionOptions = {
  canEditCurrentBid: boolean;
  dayOffTiersByDate: Map<string, Set<string>>;
  enabled: boolean;
  pairingCalendarPeriod: PairingCalendarPeriodReference;
  pairingPageQuery: PairingCalendarPageDataState;
  pendingPairingCalendarAction: PendingPairingCalendarAction | null;
  readOnlyMessage: string;
  requestPairingPoolCountsRefresh: (input: PairingPoolCountsRefreshInput) => void;
  setPendingPairingCalendarAction: Dispatch<SetStateAction<PendingPairingCalendarAction | null>>;
  onActionOpen: () => void;
  onSelectedPairingEventChange: (event: null) => void;
};

type UsePairingCalendarDateAddActionResult = {
  actionPopover: ScheduleCalendarActionPopover | null;
  clearAction: () => void;
  hasOpenAction: boolean;
  requestDateAction: (isoDate: string, anchor: ScheduleCalendarActionAnchor) => void;
  resetActionState: () => void;
};

const buildPairingCalendarAwardProperty = (
  occurrences: PairingOccurrenceBidItem[],
  tiers: string[],
): PairingAvailableProperty => ({
  id: `calendar-pairing-${occurrences.map((occurrence) => `${occurrence.pairingNumber}-${occurrence.originDate}`).join("-")}`,
  propertyCode: PAIRING_NUMBER_PROPERTY_CODE,
  name: "Pairing Preference",
  favorited: false,
  action: "award",
  quantifier: null,
  bid: buildPairingPreferenceBid({
    pairingIds: occurrences.map((occurrence) => occurrence.pairingId),
    pairingLabels: occurrences.map((occurrence) => occurrence.pairingNumber),
  }),
  tiers: createPairingTierOptions(tiers),
  actions: [],
  pairingNumber: "",
  pairingType: "",
  effectiveDateRange: {
    from: occurrences[0]?.originDate ?? "",
    to: occurrences.at(-1)?.originDate ?? "",
  },
});

const syncPairingCalendarAddInQueryCache = (
  property: PairingAvailableProperty,
  result: Awaited<ReturnType<typeof pairingService.addCurrentDraftProperty>>,
): PairingExistingProperty[] | null => {
  let savedExistingProperties: PairingExistingProperty[] | null = null;

  queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) => {
    if (!currentData) {
      return currentData;
    }

    const pendingProperty = cloneExistingPropertyFromAvailable(
      property,
      currentData.rightPanel.existingProperties.length,
    );
    const nextExistingProperties = buildSavedPairingExistingPropertiesAfterAdd(
      [
        ...currentData.rightPanel.existingProperties,
        pendingProperty,
      ],
      pendingProperty.id,
      result.propertyGroupKey ?? pendingProperty.id,
    );

    savedExistingProperties = nextExistingProperties;

    return patchPairingPageDraftMeta(
      patchPairingPageExistingProperties(currentData, nextExistingProperties),
      result,
    );
  });

  return savedExistingProperties;
};

const extractSelectedPairingOccurrences = (
  occurrences: PbsPairingOccurrence[],
  selectedOccurrenceIds: string[],
): PairingOccurrenceBidItem[] => {
  const selectedOccurrenceIdSet = new Set(selectedOccurrenceIds);

  return occurrences
    .filter((occurrence) => selectedOccurrenceIdSet.has(occurrence.occurrenceId))
    .map((occurrence) => ({
      pairingNumber: occurrence.pairingNumber.trim().toUpperCase(),
      originDate: occurrence.originDate,
      pairingId: occurrence.pairingId,
      occurrenceId: occurrence.occurrenceId,
    }))
    .filter((occurrence) => occurrence.pairingNumber.length > 0 && occurrence.originDate.length > 0)
    .sort((left, right) =>
      `${left.pairingNumber}|${left.originDate}`.localeCompare(`${right.pairingNumber}|${right.originDate}`));
};

export const usePairingCalendarDateAddAction = ({
  canEditCurrentBid,
  dayOffTiersByDate,
  enabled,
  pairingCalendarPeriod,
  pairingPageQuery,
  pendingPairingCalendarAction,
  readOnlyMessage,
  requestPairingPoolCountsRefresh,
  setPendingPairingCalendarAction,
  onActionOpen,
  onSelectedPairingEventChange,
}: UsePairingCalendarDateAddActionOptions): UsePairingCalendarDateAddActionResult => {
  const [isPairingCalendarSavePending, setIsPairingCalendarSavePending] = useState(false);
  const [pairingCalendarSaveError, setPairingCalendarSaveError] = useState<string | null>(null);

  const pairingOccurrenceDateQuery = useQuery({
    queryKey: [
      "pairing",
      "calendar-date-occurrences",
      pendingPairingCalendarAction?.isoDate ?? "",
      pairingCalendarPeriod?.rosterPeriodId ?? "missing-period",
    ],
    queryFn: () => pairingService.searchPairingOccurrencesByDate(
      pendingPairingCalendarAction!.isoDate,
      pairingCalendarPeriod!,
    ),
    enabled: Boolean(
      enabled
      && pendingPairingCalendarAction
      && pairingCalendarPeriod,
    ),
    ...workbenchQueryDefaults,
  });
  const pairingDateOccurrences = pairingOccurrenceDateQuery.data?.occurrences ?? EMPTY_PAIRING_OCCURRENCES;
  const pendingPairingDayOffBlockedTiers = useMemo(
    () => pendingPairingCalendarAction
      ? buildPairingDayOffBlockedTiers(
        pairingDateOccurrences,
        pendingPairingCalendarAction.selectedOccurrenceIds,
        dayOffTiersByDate,
      )
      : new Set<string>(),
    [dayOffTiersByDate, pairingDateOccurrences, pendingPairingCalendarAction],
  );
  const pendingPairingBlockedMessage = pendingPairingDayOffBlockedTiers.size > 0
    ? `${pendingPairingDayOffBlockedTiers.size} ${pendingPairingDayOffBlockedTiers.size === 1 ? "tier" : "tiers"} blocked by days off.`
    : null;

  const clearAction = useCallback(() => {
    setPendingPairingCalendarAction(null);
  }, [setPendingPairingCalendarAction]);

  const resetActionState = useCallback(() => {
    setPendingPairingCalendarAction(null);
    setIsPairingCalendarSavePending(false);
    setPairingCalendarSaveError(null);
  }, [setPendingPairingCalendarAction]);

  useEffect(() => {
    if (pendingPairingDayOffBlockedTiers.size === 0) {
      return;
    }

    setPendingPairingCalendarAction((currentAction) => {
      if (!currentAction) {
        return currentAction;
      }

      const selectedTiers = currentAction.selectedTiers.filter((tier) =>
        !pendingPairingDayOffBlockedTiers.has(tier));

      if (selectedTiers.length === currentAction.selectedTiers.length) {
        return currentAction;
      }

      return {
        ...currentAction,
        selectedTiers,
      };
    });
  }, [pendingPairingDayOffBlockedTiers, setPendingPairingCalendarAction]);

  const requestDateAction = useCallback((isoDate: string, anchor: ScheduleCalendarActionAnchor) => {
    if (!canEditCurrentBid) {
      message.warning(readOnlyMessage);
      return;
    }

    onActionOpen();
    onSelectedPairingEventChange(null);
    setPairingCalendarSaveError(null);
    setPendingPairingCalendarAction({
      isoDate,
      selectedOccurrenceIds: [],
      selectedTiers: [],
      anchor,
    });
  }, [
    canEditCurrentBid,
    onActionOpen,
    onSelectedPairingEventChange,
    readOnlyMessage,
    setPendingPairingCalendarAction,
  ]);

  const handlePendingPairingOccurrenceToggle = useCallback((occurrenceId: string) => {
    setPendingPairingCalendarAction((currentAction) =>
      currentAction
        ? {
          ...currentAction,
          selectedOccurrenceIds: toggleStringSelection(currentAction.selectedOccurrenceIds, occurrenceId),
        }
        : currentAction);
  }, [setPendingPairingCalendarAction]);

  const handlePendingPairingTierToggle = useCallback((tier: string) => {
    if (pendingPairingDayOffBlockedTiers.has(tier)) {
      return;
    }

    setPendingPairingCalendarAction((currentAction) =>
      currentAction
        ? {
          ...currentAction,
          selectedTiers: toggleStringSelection(currentAction.selectedTiers, tier),
        }
        : currentAction);
  }, [pendingPairingDayOffBlockedTiers, setPendingPairingCalendarAction]);

  const handleClearPendingPairingTiers = useCallback(() => {
    setPendingPairingCalendarAction((currentAction) =>
      currentAction ? { ...currentAction, selectedTiers: [] } : currentAction);
  }, [setPendingPairingCalendarAction]);

  const handleConfirmPairingCalendarAction = useCallback(async () => {
    if (!canEditCurrentBid) {
      message.warning(readOnlyMessage);
      return;
    }

    if (!pendingPairingCalendarAction || !pairingPageQuery.data?.rightPanel.draftMeta) {
      return;
    }

    const selectedPairingOccurrences = extractSelectedPairingOccurrences(
      pairingDateOccurrences,
      pendingPairingCalendarAction.selectedOccurrenceIds,
    );
    const selectedTiers = pendingPairingCalendarAction.selectedTiers.filter((tier) =>
      !pendingPairingDayOffBlockedTiers.has(tier));

    if (selectedPairingOccurrences.length === 0 || selectedTiers.length === 0) {
      return;
    }

    setIsPairingCalendarSavePending(true);
    setPairingCalendarSaveError(null);

    try {
      const pairingProperty = buildPairingCalendarAwardProperty(
        selectedPairingOccurrences,
        selectedTiers,
      );
      const result = await runCurrentBidMutation(
        pairingPageQuery.data.rightPanel.draftMeta,
        (latestMeta) => pairingService.addCurrentDraftProperty(pairingProperty, latestMeta),
      );
      const savedExistingProperties = syncPairingCalendarAddInQueryCache(pairingProperty, result);

      invalidatePairingCalendarMutationQueries();
      if (savedExistingProperties) {
        requestPairingPoolCountsRefresh({
          existingProperties: savedExistingProperties,
          period: pairingCalendarPeriod,
        });
      }
      setPendingPairingCalendarAction(null);
      message.success(PAIRING_CALENDAR_ADD_SUCCESS_MESSAGE);
    } catch {
      setPairingCalendarSaveError(PAIRING_CALENDAR_ADD_ERROR_MESSAGE);
      message.error(PAIRING_CALENDAR_ADD_ERROR_MESSAGE);
      invalidatePairingCalendarMutationQueries();
    } finally {
      setIsPairingCalendarSavePending(false);
    }
  }, [
    canEditCurrentBid,
    pairingCalendarPeriod,
    pairingDateOccurrences,
    pairingPageQuery.data,
    pendingPairingCalendarAction,
    pendingPairingDayOffBlockedTiers,
    readOnlyMessage,
    requestPairingPoolCountsRefresh,
    setPendingPairingCalendarAction,
  ]);

  const isPairingCalendarAddDisabled = !pendingPairingCalendarAction
    || !canEditCurrentBid
    || isPairingCalendarSavePending
    || pairingOccurrenceDateQuery.isFetching
    || pairingOccurrenceDateQuery.isError
    || pairingPageQuery.isFetching
    || !pairingPageQuery.data?.rightPanel.draftMeta
    || pendingPairingCalendarAction.selectedOccurrenceIds.length === 0
    || pendingPairingCalendarAction.selectedTiers.length === 0
    || pendingPairingCalendarAction.selectedTiers.every((tier) =>
      pendingPairingDayOffBlockedTiers.has(tier));

  const actionPopover = useMemo<ScheduleCalendarActionPopover | null>(() => pendingPairingCalendarAction ? {
    anchor: pendingPairingCalendarAction.anchor,
    tierLabel: "PAIRING BID",
    description: pendingPairingCalendarAction.isoDate,
    width: 380,
    content: (
      <PairingCalendarBidPopoverContent
        isError={pairingOccurrenceDateQuery.isError}
        isLoading={pairingOccurrenceDateQuery.isFetching}
        disabled={isPairingCalendarSavePending || !canEditCurrentBid}
        occurrences={pairingDateOccurrences}
        blockedMessage={pendingPairingBlockedMessage}
        blockedTiers={pendingPairingDayOffBlockedTiers}
        saveError={pairingCalendarSaveError}
        selectedOccurrenceIds={pendingPairingCalendarAction.selectedOccurrenceIds}
        selectedTiers={pendingPairingCalendarAction.selectedTiers}
        tiers={LINEHOLDER_TIER_KEYS}
        onClearTiers={handleClearPendingPairingTiers}
        onOccurrenceToggle={handlePendingPairingOccurrenceToggle}
        onTierToggle={handlePendingPairingTierToggle}
      />
    ),
    confirmLabel: "ADD BID",
    confirmDisabled: isPairingCalendarAddDisabled,
    confirmPending: isPairingCalendarSavePending,
    confirmPendingLabel: "ADDING...",
    cancelDisabled: isPairingCalendarSavePending,
    onConfirm: handleConfirmPairingCalendarAction,
    onCancel: clearAction,
  } : null, [
    canEditCurrentBid,
    clearAction,
    handleClearPendingPairingTiers,
    handleConfirmPairingCalendarAction,
    handlePendingPairingOccurrenceToggle,
    handlePendingPairingTierToggle,
    isPairingCalendarAddDisabled,
    isPairingCalendarSavePending,
    pairingCalendarSaveError,
    pairingDateOccurrences,
    pairingOccurrenceDateQuery.isError,
    pairingOccurrenceDateQuery.isFetching,
    pendingPairingBlockedMessage,
    pendingPairingCalendarAction,
    pendingPairingDayOffBlockedTiers,
  ]);

  return {
    actionPopover,
    clearAction,
    hasOpenAction: pendingPairingCalendarAction !== null,
    requestDateAction,
    resetActionState,
  };
};
