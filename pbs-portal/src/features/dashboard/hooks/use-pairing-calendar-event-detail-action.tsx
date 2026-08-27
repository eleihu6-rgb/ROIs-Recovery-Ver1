import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { message } from "@rois/ui";
import { LINEHOLDER_TIER_KEYS } from "@/features/dashboard/dashboard-calendar-state";
import { invalidatePairingCalendarMutationQueries } from "@/features/dashboard/calendar-query-invalidations";
import {
  buildPairingDetailRows,
  buildPairingDetailTargets,
  formatPairingNumbersForLabel,
  loadPairingDetailResults,
  readCalendarEventMetadata,
  splitDelimitedMetadata,
} from "@/features/dashboard/pairing-calendar-detail";
import {
  EMPTY_PAIRING_DETAIL_RESULTS,
  type PairingCalendarEventDialog,
  type PairingCalendarPageDataState,
  type PairingCalendarPeriodReference,
  type PendingPairingCalendarAction,
  toggleStringSelection,
} from "@/features/dashboard/hooks/pairing-calendar-action-model";
import { runCurrentBidMutation } from "@/features/bid/current-bid-draft-meta";
import { createPairingTierOptions } from "@/features/pairing/pairing-property-transform";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { pairingService } from "@/shared/services/pairing-service";
import type { ScheduleCalendarEvent } from "@/shared/components/schedule/types";

const PAIRING_CALENDAR_SAVE_ERROR_MESSAGE = "Unable to save pairing bid.";
const PAIRING_CALENDAR_SAVE_SUCCESS_MESSAGE = "Pairing bid updated.";
const PAIRING_CALENDAR_NOT_FOUND_MESSAGE = "Unable to find this pairing bid in the current draft.";
const PAIRING_CALENDAR_DRAFT_LOAD_ERROR_MESSAGE = "Unable to load pairing bid tiers.";
const PAIRING_CALENDAR_SELECT_EDIT_TARGET_MESSAGE = "Select one pairing bid to edit Tx.";
const PAIRING_CALENDAR_DETAIL_ERROR_MESSAGE = "Unable to load pairing details.";

type UsePairingCalendarEventDetailActionOptions = {
  canEditCurrentBid: boolean;
  enabled: boolean;
  pairingCalendarPeriod: PairingCalendarPeriodReference;
  pairingPageQuery: PairingCalendarPageDataState;
  readOnlyMessage: string;
  selectedPairingEvent: ScheduleCalendarEvent | null;
  setPendingPairingCalendarAction: Dispatch<SetStateAction<PendingPairingCalendarAction | null>>;
  setSelectedPairingEvent: Dispatch<SetStateAction<ScheduleCalendarEvent | null>>;
  onEventOpen: () => void;
};

type UsePairingCalendarEventDetailActionResult = {
  selectedEventDialog: PairingCalendarEventDialog | null;
  clearSelectedEvent: () => void;
  handleCalendarEventSelect: (event: ScheduleCalendarEvent) => void;
  resetSelectedEventState: () => void;
};

export const usePairingCalendarEventDetailAction = ({
  canEditCurrentBid,
  enabled,
  pairingCalendarPeriod,
  pairingPageQuery,
  readOnlyMessage,
  selectedPairingEvent,
  setPendingPairingCalendarAction,
  setSelectedPairingEvent,
  onEventOpen,
}: UsePairingCalendarEventDetailActionOptions): UsePairingCalendarEventDetailActionResult => {
  const [selectedPairingEventEditRowKey, setSelectedPairingEventEditRowKey] = useState<string | null>(null);
  const [selectedPairingEventTiers, setSelectedPairingEventTiers] = useState<string[]>([]);
  const [isPairingEventSavePending, setIsPairingEventSavePending] = useState(false);
  const [pairingEventSaveError, setPairingEventSaveError] = useState<string | null>(null);
  const [selectedPairingEventRefetchedPropertyKey, setSelectedPairingEventRefetchedPropertyKey] = useState<string | null>(null);

  const selectedPairingDetailTargets = useMemo(
    () => selectedPairingEvent ? buildPairingDetailTargets(selectedPairingEvent) : [],
    [selectedPairingEvent],
  );
  const selectedPairingDetailTargetKey = useMemo(
    () => selectedPairingDetailTargets
      .map((target) => `${target.pairingNumber}:${target.originDate ?? "all"}`)
      .join("|"),
    [selectedPairingDetailTargets],
  );
  const pairingDetailQuery = useQuery({
    queryKey: [
      "pairing",
      "calendar-bid-detail-results",
      pairingCalendarPeriod?.rosterPeriodId ?? "missing-period",
      selectedPairingDetailTargetKey,
    ],
    queryFn: () => loadPairingDetailResults(
      selectedPairingDetailTargets,
      pairingCalendarPeriod!,
    ),
    enabled: Boolean(
      selectedPairingEvent
      && pairingCalendarPeriod
      && selectedPairingDetailTargets.length > 0,
    ),
    ...workbenchQueryDefaults,
  });
  const pairingDetailResults = pairingDetailQuery.data ?? EMPTY_PAIRING_DETAIL_RESULTS;

  const clearSelectedEvent = useCallback(() => {
    setSelectedPairingEvent(null);
    setSelectedPairingEventEditRowKey(null);
    setSelectedPairingEventTiers([]);
    setPairingEventSaveError(null);
    setSelectedPairingEventRefetchedPropertyKey(null);
  }, [setSelectedPairingEvent]);

  const resetSelectedEventState = useCallback(() => {
    setSelectedPairingEvent(null);
    setSelectedPairingEventEditRowKey(null);
    setSelectedPairingEventTiers([]);
    setIsPairingEventSavePending(false);
    setPairingEventSaveError(null);
    setSelectedPairingEventRefetchedPropertyKey(null);
  }, [setSelectedPairingEvent]);

  const handleSelectedPairingEventTierToggle = useCallback((tier: string) => {
    setSelectedPairingEventTiers((currentTiers) => toggleStringSelection(currentTiers, tier));
  }, []);

  const handleClearSelectedPairingEventTiers = useCallback(() => {
    setSelectedPairingEventTiers([]);
  }, []);

  const handleSelectedPairingEventDetailRowSelect = useCallback((rowKey: string) => {
    setSelectedPairingEventEditRowKey(rowKey);
    setSelectedPairingEventTiers([]);
    setPairingEventSaveError(null);
  }, []);

  const handleCalendarEventSelect = useCallback((event: ScheduleCalendarEvent) => {
    if (event.sourceEvent?.type !== "pairing_bid") {
      return;
    }

    onEventOpen();
    setPendingPairingCalendarAction(null);
    setPairingEventSaveError(null);
    setSelectedPairingEventEditRowKey(null);
    setSelectedPairingEventTiers([]);
    setSelectedPairingEventRefetchedPropertyKey(null);
    setSelectedPairingEvent(event);
  }, [onEventOpen, setPendingPairingCalendarAction, setSelectedPairingEvent]);

  const selectedPairingEventPropertyKeys = selectedPairingEvent
    ? splitDelimitedMetadata(readCalendarEventMetadata(selectedPairingEvent, "propertyGroupKeys"))
        .concat(splitDelimitedMetadata(readCalendarEventMetadata(selectedPairingEvent, "propertyGroupKey")))
        .filter((propertyGroupKey, index, propertyGroupKeys) => propertyGroupKeys.indexOf(propertyGroupKey) === index)
    : [];
  const selectedPairingEventHasMultipleProperties = selectedPairingEventPropertyKeys.length > 1;
  const selectedPairingDetailRows = selectedPairingEvent ? buildPairingDetailRows(selectedPairingEvent) : [];
  const selectedPairingEventEditRow = selectedPairingDetailRows.find((row) =>
    row.rowKey === selectedPairingEventEditRowKey) ?? null;
  const selectedPairingEventPropertyKey = selectedPairingEventPropertyKeys.length === 1
    ? selectedPairingEventPropertyKeys[0]!
    : selectedPairingEventEditRow?.propertyGroupKey ?? null;
  const selectedPairingEventProperty = selectedPairingEventPropertyKey
    ? pairingPageQuery.data?.rightPanel.existingProperties.find((property) => property.id === selectedPairingEventPropertyKey)
    : undefined;
  const selectedPairingNumber = selectedPairingEvent
    ? formatPairingNumbersForLabel(selectedPairingEvent)
    : "";
  const selectedPairingEventCanSave = Boolean(
    enabled
    && canEditCurrentBid
    && selectedPairingEvent
    && selectedPairingEventPropertyKey
    && selectedPairingEventProperty
    && pairingPageQuery.data?.rightPanel.draftMeta
    && !isPairingEventSavePending,
  );

  useEffect(() => {
    if (!selectedPairingEventProperty) {
      return;
    }

    setSelectedPairingEventTiers(
      selectedPairingEventProperty.tiers
        .filter((tier) => tier.active)
        .map((tier) => tier.label),
    );
  }, [selectedPairingEventProperty]);

  useEffect(() => {
    if (
      !enabled
      || !selectedPairingEvent
      || !selectedPairingEventPropertyKey
      || selectedPairingEventProperty
      || pairingPageQuery.isFetching
      || pairingPageQuery.isError
      || selectedPairingEventRefetchedPropertyKey === selectedPairingEventPropertyKey
    ) {
      return;
    }

    setSelectedPairingEventRefetchedPropertyKey(selectedPairingEventPropertyKey);
    void pairingPageQuery.refetch();
  }, [
    enabled,
    pairingPageQuery,
    selectedPairingEvent,
    selectedPairingEventProperty,
    selectedPairingEventPropertyKey,
    selectedPairingEventRefetchedPropertyKey,
  ]);

  const handleSaveSelectedPairingEventTiers = useCallback(async () => {
    if (!canEditCurrentBid) {
      message.warning(readOnlyMessage);
      return;
    }

    if (!enabled) {
      return;
    }

    if (
      !selectedPairingEventPropertyKey
      || !selectedPairingEventProperty
      || !pairingPageQuery.data?.rightPanel.draftMeta
    ) {
      setPairingEventSaveError(PAIRING_CALENDAR_NOT_FOUND_MESSAGE);
      return;
    }

    setIsPairingEventSavePending(true);
    setPairingEventSaveError(null);

    try {
      await runCurrentBidMutation(
        pairingPageQuery.data.rightPanel.draftMeta,
        (latestMeta) => pairingService.patchCurrentDraftProperty(
          selectedPairingEventPropertyKey,
          {
            ...selectedPairingEventProperty,
            tiers: createPairingTierOptions(selectedPairingEventTiers),
          },
          latestMeta,
        ),
      );

      invalidatePairingCalendarMutationQueries();
      setSelectedPairingEvent(null);
      setSelectedPairingEventTiers([]);
      message.success(PAIRING_CALENDAR_SAVE_SUCCESS_MESSAGE);
    } catch {
      setPairingEventSaveError(PAIRING_CALENDAR_SAVE_ERROR_MESSAGE);
      message.error(PAIRING_CALENDAR_SAVE_ERROR_MESSAGE);
    } finally {
      setIsPairingEventSavePending(false);
    }
  }, [
    canEditCurrentBid,
    enabled,
    pairingPageQuery.data,
    readOnlyMessage,
    selectedPairingEventProperty,
    selectedPairingEventPropertyKey,
    selectedPairingEventTiers,
    setSelectedPairingEvent,
  ]);

  const selectedPairingEventDetailError = selectedPairingEvent
    ? enabled
      ? pairingEventSaveError
        ?? (pairingPageQuery.isError
          ? PAIRING_CALENDAR_DRAFT_LOAD_ERROR_MESSAGE
          : null)
        ?? (selectedPairingEventHasMultipleProperties
          && !selectedPairingEventEditRow
          ? PAIRING_CALENDAR_SELECT_EDIT_TARGET_MESSAGE
          : null)
        ?? (!pairingPageQuery.isFetching
          && selectedPairingEventRefetchedPropertyKey === selectedPairingEventPropertyKey
          && !selectedPairingEventProperty
          ? PAIRING_CALENDAR_NOT_FOUND_MESSAGE
          : null)
      : null
    : null;

  const selectedEventDialog = selectedPairingEvent ? {
    event: selectedPairingEvent,
    props: {
      canSave: selectedPairingEventCanSave,
      canEditTiers: enabled && canEditCurrentBid,
      detailError: pairingDetailQuery.isError ? PAIRING_CALENDAR_DETAIL_ERROR_MESSAGE : null,
      detailRows: selectedPairingDetailRows,
      detailResults: pairingDetailResults,
      error: selectedPairingEventDetailError,
      isDetailLoading: pairingDetailQuery.isFetching && !pairingDetailQuery.data,
      isLoading: enabled && pairingPageQuery.isFetching && !selectedPairingEventProperty,
      isPending: isPairingEventSavePending,
      isTierEditingDisabled:
        !enabled
        || !canEditCurrentBid
        || pairingPageQuery.isError
        || (selectedPairingEventHasMultipleProperties && !selectedPairingEventEditRow)
        || (pairingPageQuery.isFetching && !selectedPairingEventProperty),
      pairingNumber: selectedPairingNumber,
      selectedDetailRowKey: selectedPairingEventEditRowKey,
      selectedTiers: selectedPairingEventTiers,
      showEditSelector: enabled && selectedPairingEventHasMultipleProperties,
      tiers: LINEHOLDER_TIER_KEYS,
      onClearTiers: handleClearSelectedPairingEventTiers,
      onClose: clearSelectedEvent,
      onDetailRowSelect: handleSelectedPairingEventDetailRowSelect,
      onSave: handleSaveSelectedPairingEventTiers,
      onTierToggle: handleSelectedPairingEventTierToggle,
    },
  } : null;

  return {
    selectedEventDialog,
    clearSelectedEvent,
    handleCalendarEventSelect,
    resetSelectedEventState,
  };
};
