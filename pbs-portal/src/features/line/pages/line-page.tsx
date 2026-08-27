import { useCallback, useMemo } from "react";
import { pbsLineAaPropertyCodes, pbsLineF8PropertyCodes, pbsLineLegacyPropertyCodes } from "../../../../../packages/contracts/pbs-line-bids.js";
import { buildBidPropertySummary } from "@/features/bid/bid-property-summary";
import { BidPropertySummaryView } from "@/features/bid/components/bid-property-summary-view";
import { ReserveBidDialog } from "@/features/reserve/components/reserve-bid-dialog";
import { ReservePreferenceDialog } from "@/features/reserve/components/reserve-short-call-type-dialog";
import { reservePageDataQueryKey } from "@/features/reserve/hooks/use-reserve-page-data";
import {
  buildReservePreferenceProperty,
  getReservePreferenceProperties,
} from "@/features/reserve/reserve-preference-property";
import { RuleBidRightPanel } from "@/features/rule-bids/components/rule-bid-right-panel";
import type { RuleBidRightPanelPresentation } from "@/features/rule-bids/components/rule-bid-right-panel";
import { RuleBidRightPanelLoading } from "@/features/rule-bids/components/rule-bid-right-panel-loading";
import {
  patchRuleBidPageConfiguredFavorite,
  patchRuleBidPageDraftMeta,
  patchRuleBidPageExistingProperties,
  patchRuleBidPageUnfavoriteByKey,
  type RuleBidDraftMetaPatch,
} from "@/features/rule-bids/rule-bid-page-cache";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import { LineBidDialog } from "@/features/line/components/line-bid-dialog";
import {
  getMixedLineAdditionalProperties,
  isMixedLineBidProperty,
  MIXED_LINE_SHORT_CALL_PROPERTY_CODE,
  withMixedLineBidDisplayName,
  withMixedLineAdditionalProperties,
} from "@/features/line/mixed-line-bid";
import { linePageDataQueryKey, useLinePageData } from "@/features/line/hooks/use-line-page-data";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import { buildRuleBidExistingPropertyFromAvailable } from "@/features/rule-bids/utils";
import { PanelMessageState } from "@/shared/components/panel";
import { queryClient } from "@/shared/query/query-client";
import { lineService } from "@/shared/services/line-service";
import { reserveService } from "@/shared/services/reserve-service";
import { runCurrentBidMutation } from "@/features/bid/current-bid-draft-meta";

const CONFIGURABLE_LINE_PROPERTY_CODES = new Set<number>([
  pbsLineLegacyPropertyCodes.forgetLine,
  pbsLineLegacyPropertyCodes.minBaseLayover,
  pbsLineLegacyPropertyCodes.commuterPattern,
  pbsLineLegacyPropertyCodes.reserveFlyingDatePattern,
  pbsLineF8PropertyCodes.creditWindowPreference,
  pbsLineAaPropertyCodes.reserve,
  MIXED_LINE_SHORT_CALL_PROPERTY_CODE,
]);

const shouldConfigureLineProperty = (property: Pick<RuleBidAvailableProperty, "propertyCode">) =>
  CONFIGURABLE_LINE_PROPERTY_CODES.has(property.propertyCode);

const shouldShowLineAvailableFavoriteDeleteAction = (
  property: RuleBidAvailableProperty,
  activeTab: "all" | "favorited",
) => property.sourceContext !== "reserve" && activeTab === "favorited" && Boolean(property.favoriteKey);

const isReservePreferenceContextProperty = (
  property: Pick<RuleBidAvailableProperty, "sourceContext"> | Pick<RuleBidExistingProperty, "sourceContext">,
) => property.sourceContext === "reserve";

const buildLineAvailablePropertyFromExisting = (
  property: RuleBidExistingProperty,
): RuleBidAvailableProperty => ({
  ...property,
  favorited: false,
});

const buildLineExistingPropertyFromDialogDraft = (
  sourceProperty: RuleBidExistingProperty,
  draft: RuleBidAvailableProperty,
): RuleBidExistingProperty => {
  const buildExistingProperty = (
    draftProperty: RuleBidAvailableProperty,
    fallbackId: string,
    preserveFallbackId: boolean,
  ): RuleBidExistingProperty => ({
    ...sourceProperty,
    id: preserveFallbackId ? fallbackId : draftProperty.id || fallbackId,
    propertyCode: draftProperty.propertyCode,
    name: draftProperty.name,
    action: draftProperty.action ?? null,
    bid: draftProperty.bid,
    tiers: draftProperty.tiers,
    categoryLabel: draftProperty.categoryLabel ?? sourceProperty.categoryLabel,
    categorySortOrder: draftProperty.categorySortOrder ?? sourceProperty.categorySortOrder,
    sourceContext: draftProperty.sourceContext ?? sourceProperty.sourceContext,
  });
  const additionalProperties = getMixedLineAdditionalProperties(draft)
    .map((additionalProperty) => buildExistingProperty(additionalProperty, additionalProperty.id, false));

  return withMixedLineAdditionalProperties(
    buildExistingProperty(draft, sourceProperty.id, true),
    additionalProperties,
  );
};

const buildSavedLineExistingProperty = (
  property: RuleBidAvailableProperty,
  propertyGroupKey: string,
): RuleBidExistingProperty => withMixedLineBidDisplayName({
  ...buildRuleBidExistingPropertyFromAvailable(property, propertyGroupKey),
  categoryLabel: property.categoryLabel,
  categorySortOrder: property.categorySortOrder,
  sourceContext: property.sourceContext,
});

const renderLineExistingBidSummary = (property: RuleBidExistingProperty) => {
  if (!shouldConfigureLineProperty(property)) {
    return null;
  }

  return (
    <BidPropertySummaryView
      ariaLabel={`${property.name} bid summary`}
      summary={buildBidPropertySummary("line", property)}
    />
  );
};

type LinePageProps = {
  presentation?: RuleBidRightPanelPresentation;
  reserveData?: RuleBidPageData;
};

export const LinePage = ({ presentation, reserveData }: LinePageProps = {}) => {
  const { data, isLoading } = useLinePageData();
  const rosterRightPanelData = useMemo(() => {
    if (!data) {
      return null;
    }

    if (!reserveData) {
      return data.rightPanel;
    }

    return {
      ...data.rightPanel,
      existingProperties: [
        ...data.rightPanel.existingProperties,
        ...getReservePreferenceProperties(reserveData.rightPanel.existingProperties),
      ],
      availableProperties: [
        ...data.rightPanel.availableProperties,
        ...getReservePreferenceProperties(reserveData.rightPanel.availableProperties),
      ],
    };
  }, [data, reserveData]);
  const reservePeriodCode = reserveData?.rightPanel.draftMeta.periodCode
    ?? data?.rightPanel.draftMeta.periodCode
    ?? "";
  const reservePeriodStartDate = reserveData?.rightPanel.draftMeta.currentPeriod?.rpStartLocal
    ?? data?.rightPanel.draftMeta.currentPeriod?.rpStartLocal
    ?? "";
  const reservePeriodEndDate = reserveData?.rightPanel.draftMeta.currentPeriod?.rpEndLocal
    ?? data?.rightPanel.draftMeta.currentPeriod?.rpEndLocal
    ?? "";

  const handleSave = useCallback(async (...args: Parameters<typeof lineService.saveCurrentDraft>) => {
    const [existingProperties, draftMeta] = args;
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => lineService.saveCurrentDraft(existingProperties, latestMeta),
    );
    const draftMetaPatch: RuleBidDraftMetaPatch = {
      draftKey: response.draft.draftKey,
      bidId: response.draft.bidId,
      periodId: response.draft.periodId,
      draftVersion: response.draft.draftVersion,
      periodCode: response.draft.periodCode,
    };

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageDraftMeta(currentData, draftMetaPatch)
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return draftMetaPatch;
  }, []);

  const handleAddReserveProperty = useCallback(async (
    property: RuleBidAvailableProperty,
  ) => {
    if (!reserveData) {
      throw new Error("Reserve Preference is unavailable.");
    }

    const response = await runCurrentBidMutation(
      reserveData.rightPanel.draftMeta,
      (latestMeta) => reserveService.addCurrentDraftProperty(property, latestMeta),
    );

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
  }, [reserveData]);

  const handleAddProperty = useCallback(async (
    property: Parameters<typeof lineService.addCurrentDraftProperty>[0],
    draftMeta: Parameters<typeof lineService.addCurrentDraftProperty>[1],
  ) => {
    if (isReservePreferenceContextProperty(property)) {
      return handleAddReserveProperty(property);
    }

    const propertiesToAdd = [property, ...getMixedLineAdditionalProperties(property)];
    const savedProperties: RuleBidExistingProperty[] = [];
    let primaryResponse: Awaited<ReturnType<typeof lineService.addCurrentDraftProperty>> | null = null;
    let latestResponse: Awaited<ReturnType<typeof lineService.addCurrentDraftProperty>> | null = null;

    for (const propertyToAdd of propertiesToAdd) {
      const response = await runCurrentBidMutation(
        draftMeta,
        (latestMeta) => lineService.addCurrentDraftProperty(propertyToAdd, latestMeta),
      );

      if (!primaryResponse) {
        primaryResponse = response;
      }

      latestResponse = response;
      savedProperties.push(buildSavedLineExistingProperty(propertyToAdd, response.propertyGroupKey));
    }

    if (!primaryResponse || !latestResponse) {
      throw new Error("Line property is unavailable.");
    }

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, latestResponse),
          [
            ...currentData.rightPanel.existingProperties,
            ...savedProperties,
          ],
        )
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return primaryResponse;
  }, [handleAddReserveProperty]);

  const handleDeleteProperty = useCallback(async (
    propertyGroupKey: string,
    draftMeta: Parameters<typeof lineService.removeCurrentDraftProperty>[1],
  ) => {
    if (reserveData?.rightPanel.existingProperties.some((property) => property.id === propertyGroupKey)) {
      const response = await runCurrentBidMutation(
        reserveData.rightPanel.draftMeta,
        (latestMeta) => reserveService.removeCurrentDraftProperty(propertyGroupKey, latestMeta),
      );

      queryClient.setQueryData(reservePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
        ? patchRuleBidPageExistingProperties(
            patchRuleBidPageDraftMeta(currentData, response),
            currentData.rightPanel.existingProperties.filter((property) => property.id !== propertyGroupKey),
          )
        : currentData);
      await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
      return response;
    }

    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => lineService.removeCurrentDraftProperty(propertyGroupKey, latestMeta),
    );

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          currentData.rightPanel.existingProperties.filter((property) => property.id !== propertyGroupKey),
        )
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return response;
  }, [reserveData]);

  const handleUpdateProperty = useCallback(async (
    propertyGroupKey: string,
    property: RuleBidExistingProperty,
    draftMeta: Parameters<typeof lineService.patchCurrentDraftProperty>[2],
  ) => {
    if (isReservePreferenceContextProperty(property)) {
      if (!reserveData) {
        throw new Error("Reserve Preference is unavailable.");
      }

      const response = await runCurrentBidMutation(
        reserveData.rightPanel.draftMeta,
        (latestMeta) => reserveService.patchCurrentDraftProperty(propertyGroupKey, property, latestMeta),
      );

      queryClient.setQueryData(reservePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
        ? patchRuleBidPageExistingProperties(
            patchRuleBidPageDraftMeta(currentData, response),
            currentData.rightPanel.existingProperties.map((existingProperty) =>
              existingProperty.id === propertyGroupKey ? property : existingProperty),
          )
        : currentData);
      await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
      return response;
    }

    const additionalProperties = getMixedLineAdditionalProperties(property)
      .map(buildLineAvailablePropertyFromExisting);
    const sourceProperty = queryClient.getQueryData<RuleBidPageData>(linePageDataQueryKey)
      ?.rightPanel.existingProperties.find((existingProperty) => existingProperty.id === propertyGroupKey);
    const replacesReserveModeWithShortCall = property.propertyCode === MIXED_LINE_SHORT_CALL_PROPERTY_CODE
      && sourceProperty?.propertyCode !== MIXED_LINE_SHORT_CALL_PROPERTY_CODE;

    if (replacesReserveModeWithShortCall) {
      const removeResponse = await runCurrentBidMutation(
        draftMeta,
        (latestMeta) => lineService.removeCurrentDraftProperty(propertyGroupKey, latestMeta),
      );
      const propertiesToAdd = [buildLineAvailablePropertyFromExisting(property), ...additionalProperties];
      const savedProperties: RuleBidExistingProperty[] = [];
      let latestResponse: Awaited<ReturnType<typeof lineService.addCurrentDraftProperty>> | null = null;

      for (const propertyToAdd of propertiesToAdd) {
        const response = await runCurrentBidMutation(
          { ...draftMeta, ...removeResponse },
          (latestMeta) => lineService.addCurrentDraftProperty(propertyToAdd, latestMeta),
        );
        latestResponse = response;
        savedProperties.push(buildSavedLineExistingProperty(propertyToAdd, response.propertyGroupKey));
      }

      if (!latestResponse) {
        throw new Error("Line property is unavailable.");
      }

      queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
        ? patchRuleBidPageExistingProperties(
            patchRuleBidPageDraftMeta(currentData, latestResponse),
            [
              ...currentData.rightPanel.existingProperties.filter((existingProperty) =>
                existingProperty.id !== propertyGroupKey),
              ...savedProperties,
            ],
          )
        : currentData);
      await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
      return latestResponse;
    }

    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => lineService.patchCurrentDraftProperty(propertyGroupKey, property, latestMeta),
    );
    const savedAdditionalProperties: RuleBidExistingProperty[] = [];
    let latestResponse: Awaited<ReturnType<typeof lineService.patchCurrentDraftProperty>>
      | Awaited<ReturnType<typeof lineService.addCurrentDraftProperty>> = response;

    for (const additionalProperty of additionalProperties) {
      const additionalResponse: Awaited<ReturnType<typeof lineService.addCurrentDraftProperty>> =
        await runCurrentBidMutation(
        { ...draftMeta, ...latestResponse },
        (latestMeta) => lineService.addCurrentDraftProperty(additionalProperty, latestMeta),
      );
      latestResponse = additionalResponse;
      savedAdditionalProperties.push(buildSavedLineExistingProperty(additionalProperty, additionalResponse.propertyGroupKey));
    }

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, latestResponse),
          [
            ...currentData.rightPanel.existingProperties.map((existingProperty) =>
              existingProperty.id === propertyGroupKey ? withMixedLineBidDisplayName(property) : existingProperty),
            ...savedAdditionalProperties,
          ],
        )
      : currentData);
    await queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });
    return response;
  }, [reserveData]);

  const handleUnfavoriteProperty = useCallback(async (
    favoriteKey: string,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => lineService.unfavoriteProperty(favoriteKey, latestMeta),
    );

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageUnfavoriteByKey(patchRuleBidPageDraftMeta(currentData, response), favoriteKey)
      : currentData);
    return response;
  }, []);

  const handleSaveFavoriteProperty = useCallback(async (
    property: RuleBidAvailableProperty,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => lineService.saveConfiguredFavoriteProperty(property, latestMeta),
    );

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageConfiguredFavorite(
          patchRuleBidPageDraftMeta(currentData, response),
          response,
        )
      : currentData);
    return response;
  }, []);

  const handleUpdateFavoriteProperty = useCallback(async (
    favoriteKey: string,
    property: RuleBidAvailableProperty,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => lineService.patchFavoriteProperty(favoriteKey, property, latestMeta),
    );

    queryClient.setQueryData(linePageDataQueryKey, (currentData: RuleBidPageData | undefined) => {
      if (!currentData) {
        return currentData;
      }

      const patched = patchRuleBidPageConfiguredFavorite(
        patchRuleBidPageDraftMeta(currentData, response),
        response,
      );
      return {
        ...patched,
        rightPanel: {
          ...patched.rightPanel,
          availableProperties: patched.rightPanel.availableProperties.map((item) =>
            item.favoriteKey === favoriteKey
              ? { ...item, tiers: property.tiers.map((tier) => ({ ...tier })) }
              : item),
        },
      };
    });
    return response;
  }, []);

  if (isLoading) {
    return (
      <RuleBidRightPanelLoading
        addButtonLabel="ADD LINE PROPERTIES"
        statusLabel="Loading current line draft..."
        testId="line-page-loading"
        title="EXISTING LINE PROPERTIES"
      />
    );
  }

  if (!data || !rosterRightPanelData) {
    return (
      <PanelMessageState
        message="Unable to load the current line draft."
        testId="line-page-error"
        title="EXISTING LINE PROPERTIES"
      />
    );
  }

  return (
    <RuleBidRightPanel
      data={rosterRightPanelData}
      existingBidEditMode="dialog"
      presentation={presentation}
      mergeSamePropertyTiersOnAdd
      onAddProperty={handleAddProperty}
      onDeleteProperty={handleDeleteProperty}
      onSave={handleSave}
      onSaveFavoriteProperty={handleSaveFavoriteProperty}
      onUpdateFavoriteProperty={handleUpdateFavoriteProperty}
      onUpdateProperty={handleUpdateProperty}
      onUnfavoriteProperty={handleUnfavoriteProperty}
      renderAvailablePropertyAddDialog={(props) => (
        isReservePreferenceContextProperty(props.property) ? (
          <ReservePreferenceDialog
            initialDateScope={null}
            isOpen={props.isOpen}
            isPending={props.isPending}
            periodCode={reservePeriodCode}
            periodEndDate={reservePeriodEndDate}
            periodStartDate={reservePeriodStartDate}
            property={props.property}
            onCancel={props.onCancel}
            onConfirm={(callType, selectedTiers, dateScope) => {
              props.onConfirm(buildReservePreferenceProperty(props.property, callType, selectedTiers, dateScope));
            }}
          />
        ) : (
          <LineBidDialog
            {...props}
            favoriteEditMode={props.isFavoriteEdit}
            favoriteLabel={props.isFavoriteEdit ? "UPDATE FAVORITE" : undefined}
            periodCode={data.rightPanel.draftMeta.periodCode}
            periodEndDate={data.rightPanel.draftMeta.currentPeriod?.rpEndLocal ?? ""}
            periodStartDate={data.rightPanel.draftMeta.currentPeriod?.rpStartLocal ?? ""}
            startWithNoActiveTiers={!props.isFavoriteEdit}
          />
        )
      )}
      renderExistingBidSummary={renderLineExistingBidSummary}
      renderExistingPropertyEditDialog={({ property, onCancel, onConfirm, onRemove, ...dialogProps }) => (
        isReservePreferenceContextProperty(property) ? (
          <ReserveBidDialog
            {...dialogProps}
            confirmLabel="UPDATE BID"
            periodCode={reservePeriodCode}
            periodEndDate={reservePeriodEndDate}
            periodStartDate={reservePeriodStartDate}
            property={property}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        ) : (
          <LineBidDialog
            {...dialogProps}
            confirmLabel="UPDATE BID"
            confirmPendingLabel="UPDATING..."
            periodCode={data.rightPanel.draftMeta.periodCode}
            periodEndDate={data.rightPanel.draftMeta.currentPeriod?.rpEndLocal ?? ""}
            periodStartDate={data.rightPanel.draftMeta.currentPeriod?.rpStartLocal ?? ""}
            property={buildLineAvailablePropertyFromExisting(property)}
            onCancel={onCancel}
            onConfirm={(draft) => onConfirm(buildLineExistingPropertyFromDialogDraft(property, draft))}
            onRemove={isMixedLineBidProperty(property) ? onRemove : undefined}
          />
        )
      )}
      shouldConfigureAvailableProperty={(property) =>
        isReservePreferenceContextProperty(property) || shouldConfigureLineProperty(property)}
      shouldShowExistingEditAction={(property) =>
        isReservePreferenceContextProperty(property) || shouldConfigureLineProperty(property)}
      shouldShowAvailableFavoriteDeleteAction={shouldShowLineAvailableFavoriteDeleteAction}
    />
  );
};
