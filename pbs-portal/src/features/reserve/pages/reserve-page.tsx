import { useCallback, useMemo, useRef, useState } from "react";
import { message } from "@rois/ui";
import type { ReserveDateScope } from "@/features/pairing/types";
import { ReserveBidDialog } from "@/features/reserve/components/reserve-bid-dialog";
import { ReserveCoverageCalendar } from "@/features/reserve/components/reserve-coverage-calendar";
import { ReservePreferenceDialog } from "@/features/reserve/components/reserve-short-call-type-dialog";
import {
  buildReserveDateScopeKey,
  buildReservePreferenceProperty,
  getReservePreferenceProperties,
  normalizeReservePreferenceBid,
  RESERVE_PREFERENCE_PROPERTY_CODE,
} from "@/features/reserve/reserve-preference-property";
import {
  reservePageDataQueryKey,
  useReserveCoverage,
  useReservePageData,
} from "@/features/reserve/hooks/use-reserve-page-data";
import {
  patchRuleBidPageDraftMeta,
  patchRuleBidPageExistingProperties,
  type RuleBidDraftMetaPatch,
} from "@/features/rule-bids/rule-bid-page-cache";
import { RuleBidRightPanel } from "@/features/rule-bids/components/rule-bid-right-panel";
import { RuleBidRightPanelLoading } from "@/features/rule-bids/components/rule-bid-right-panel-loading";
import type { RuleBidExistingProperty, RuleBidPageData } from "@/features/rule-bids/types";
import {
  buildRuleBidExistingPropertyFromAvailable,
  getRuleBidSaveErrorMessage,
} from "@/features/rule-bids/utils";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import { PanelMessageState } from "@/shared/components/panel";
import { queryClient } from "@/shared/query/query-client";
import { reserveService } from "@/shared/services/reserve-service";

export const ReservePage = () => {
  const { data, isLoading } = useReservePageData();
  const { data: coverage, isLoading: isCoverageLoading } = useReserveCoverage();
  const [initialReservePreferenceDateScope, setInitialReservePreferenceDateScope] = useState<ReserveDateScope | null>(null);
  const [isReservePreferenceDialogOpen, setIsReservePreferenceDialogOpen] = useState(false);
  const [isReservePreferencePending, setIsReservePreferencePending] = useState(false);
  const pendingReservePreferenceKeysRef = useRef(new Set<string>());

  const visiblePageData = useMemo<RuleBidPageData | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return {
      rightPanel: {
        ...data.rightPanel,
        existingProperties: getReservePreferenceProperties(data.rightPanel.existingProperties),
        availableProperties: getReservePreferenceProperties(data.rightPanel.availableProperties),
      },
    };
  }, [data]);
  const isPeriodReadOnly = data?.rightPanel.draftMeta.currentPeriod?.canEditBid !== true;
  const readOnlyMessage = data?.rightPanel.draftMeta.currentPeriod?.readOnlyReason
    ?? `Bidding is not open for ${data?.rightPanel.draftMeta.periodCode ?? "this period"}.`;

  const patchDraftMeta = useCallback((patch: RuleBidDraftMetaPatch) => {
    queryClient.setQueryData(reservePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageDraftMeta(currentData, patch)
      : currentData);
  }, []);

  const handleSave = useCallback(async (
    visibleExistingProperties: RuleBidExistingProperty[],
    draftMeta: Parameters<typeof reserveService.saveCurrentDraft>[1],
  ) => {
    const response = await reserveService.saveCurrentDraft(
      visibleExistingProperties,
      draftMeta,
    );
    const draftMetaPatch: RuleBidDraftMetaPatch = {
      draftKey: response.draft.draftKey,
      bidId: response.draft.bidId,
      periodId: response.draft.periodId,
      draftVersion: response.draft.draftVersion,
      periodCode: response.draft.periodCode,
    };

    patchDraftMeta(draftMetaPatch);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return draftMetaPatch;
  }, [patchDraftMeta]);

  const handleAddProperty = useCallback(async (
    property: Parameters<typeof reserveService.addCurrentDraftProperty>[0],
    draftMeta: Parameters<typeof reserveService.addCurrentDraftProperty>[1],
  ) => {
    const response = await reserveService.addCurrentDraftProperty(property, draftMeta);

    queryClient.setQueryData(reservePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          [
            ...currentData.rightPanel.existingProperties,
            buildRuleBidExistingPropertyFromAvailable(property, response.propertyGroupKey),
          ],
        )
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return response;
  }, []);

  const handleDeleteProperty = useCallback(async (
    propertyGroupKey: string,
    draftMeta: Parameters<typeof reserveService.removeCurrentDraftProperty>[1],
  ) => {
    const response = await reserveService.removeCurrentDraftProperty(propertyGroupKey, draftMeta);

    queryClient.setQueryData(reservePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          currentData.rightPanel.existingProperties.filter((property) => property.id !== propertyGroupKey),
        )
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return response;
  }, []);

  const handleUpdateProperty = useCallback(async (
    propertyGroupKey: string,
    property: RuleBidExistingProperty,
    draftMeta: Parameters<typeof reserveService.patchCurrentDraftProperty>[2],
  ) => {
    const response = await reserveService.patchCurrentDraftProperty(propertyGroupKey, property, draftMeta);

    queryClient.setQueryData(reservePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          currentData.rightPanel.existingProperties.map((existingProperty) =>
            existingProperty.id === propertyGroupKey ? property : existingProperty),
        )
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return response;
  }, []);

  const closeReservePreferenceDialog = useCallback(() => {
    if (isReservePreferencePending) {
      return;
    }

    setIsReservePreferenceDialogOpen(false);
    setInitialReservePreferenceDateScope(null);
  }, [isReservePreferencePending]);

  const openReservePreferenceDialog = useCallback((dateScope: ReserveDateScope | null = null) => {
    if (isReservePreferencePending) {
      return;
    }

    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    setInitialReservePreferenceDateScope(dateScope);
    setIsReservePreferenceDialogOpen(true);
  }, [isPeriodReadOnly, isReservePreferencePending, readOnlyMessage]);

  const handleSelectCoverageDate = useCallback<Parameters<typeof ReserveCoverageCalendar>[0]["onSelectDate"]>((date) => {
    openReservePreferenceDialog({ mode: "specific_dates", dates: [date] });
  }, [openReservePreferenceDialog]);

  const handleConfirmReservePreference = useCallback(async (
    callType: string,
    selectedTiers: string[],
    dateScope: ReserveDateScope,
  ) => {
    if (!data || selectedTiers.length === 0) {
      return;
    }

    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    const newTiers = selectedTiers.filter((tier) =>
      !data.rightPanel.existingProperties.some((property) => {
        const normalizedBid = property.propertyCode === RESERVE_PREFERENCE_PROPERTY_CODE
          ? normalizeReservePreferenceBid(property.bid)
          : null;

        return normalizedBid
          && normalizedBid.callType === callType
          && buildReserveDateScopeKey(normalizedBid.dateScope) === buildReserveDateScopeKey(dateScope)
          && property.tiers.some((propertyTier) => propertyTier.label === tier && propertyTier.active);
      }));

    if (newTiers.length === 0) {
      message.warning("Reserve Preference is already added to selected Tx.");
      return;
    }

    const template = data.rightPanel.availableProperties.find((property) =>
      property.propertyCode === RESERVE_PREFERENCE_PROPERTY_CODE);

    if (!template) {
      message.error("Reserve Preference is unavailable.");
      return;
    }

    const reservePreferenceKey = `${callType}:${buildReserveDateScopeKey(dateScope)}:${newTiers.join(",")}`;

    if (pendingReservePreferenceKeysRef.current.has(reservePreferenceKey)) {
      return;
    }

    pendingReservePreferenceKeysRef.current.add(reservePreferenceKey);
    setIsReservePreferencePending(true);

    try {
      await handleAddProperty(
        buildReservePreferenceProperty(template, callType, newTiers, dateScope),
        data.rightPanel.draftMeta,
      );
      setIsReservePreferenceDialogOpen(false);
      setInitialReservePreferenceDateScope(null);
      message.success(`Reserve Preference added to ${newTiers.join(", ")}.`);
    } catch (error) {
      message.error(getRuleBidSaveErrorMessage(error));
    } finally {
      pendingReservePreferenceKeysRef.current.delete(reservePreferenceKey);
      setIsReservePreferencePending(false);
    }
  }, [data, handleAddProperty, isPeriodReadOnly, readOnlyMessage]);

  const reservePreferenceTemplate = visiblePageData?.rightPanel.availableProperties.find((property) =>
    property.propertyCode === RESERVE_PREFERENCE_PROPERTY_CODE) ?? null;

  if (isLoading || isCoverageLoading) {
    return (
      <RuleBidRightPanelLoading
        addButtonLabel="ADD RESERVE PREFERENCE"
        hideAvailablePropertiesSection
        statusLabel="Loading current reserve draft..."
        testId="reserve-page-loading"
        title="EXISTING RESERVE PROPERTIES"
      />
    );
  }

  if (!data || !visiblePageData || !coverage) {
    return (
      <PanelMessageState
        message="Unable to load the current reserve draft."
        testId="reserve-page-error"
        title="EXISTING RESERVE PROPERTIES"
      />
    );
  }

  return (
    <RuleBidRightPanel
      data={visiblePageData.rightPanel}
      existingBidEditMode="dialog"
      hideAvailablePropertiesSection
      renderExistingPropertyEditDialog={(dialogProps) => (
        <ReserveBidDialog
          {...dialogProps}
          confirmLabel="UPDATE BID"
          periodCode={data.rightPanel.draftMeta.periodCode}
          periodEndDate={coverage.rpEndLocal}
          periodStartDate={coverage.rpStartLocal}
        />
      )}
      renderTopContent={() => (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8d93a5]">
              RESERVE PREFERENCE
            </span>
            {reservePreferenceTemplate ? (
              <button
                className="h-9 cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-bold text-[#6866cc] shadow-none transition hover:border-[#6866cc] hover:bg-[#f7f7ff] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isReservePreferencePending || isPeriodReadOnly}
                type="button"
                onClick={() => openReservePreferenceDialog()}
              >
                ADD RESERVE PREFERENCE
              </button>
            ) : null}
          </div>
          {coverage.warnings.length > 0 ? (
            <p className="m-0 mt-3 text-xs font-medium text-[#b7791f]" role="status">
              {coverage.warnings.join(" ")}
            </p>
          ) : null}
          <div className="mt-4">
            <ReserveCoverageCalendar
              actionPopover={null}
              actionLabel="Reserve Preference"
              description="Click a date to configure Reserve Preference for that specific date."
              days={coverage.days}
              onSelectDate={handleSelectCoverageDate}
            />
          </div>
          {reservePreferenceTemplate ? (
            <ReservePreferenceDialog
              initialDateScope={initialReservePreferenceDateScope}
              isOpen={isReservePreferenceDialogOpen}
              isPending={isReservePreferencePending}
              periodCode={data.rightPanel.draftMeta.periodCode}
              periodEndDate={coverage.rpEndLocal}
              periodStartDate={coverage.rpStartLocal}
              property={reservePreferenceTemplate}
              onCancel={closeReservePreferenceDialog}
              onConfirm={handleConfirmReservePreference}
            />
          ) : null}
        </>
      )}
      onAddProperty={handleAddProperty}
      onDeleteProperty={handleDeleteProperty}
      onSave={handleSave}
      onUpdateProperty={handleUpdateProperty}
    />
  );
};
