import { useCallback } from "react";
import { BidPropertySummaryView } from "@/features/bid/components/bid-property-summary-view";
import { buildBidPropertySummary } from "@/features/bid/bid-property-summary";
import { DaysOffBidDialog } from "@/features/days-off/components/days-off-bid-dialog";
import { RuleBidRightPanel } from "@/features/rule-bids/components/rule-bid-right-panel";
import type { RuleBidRightPanelPresentation } from "@/features/rule-bids/components/rule-bid-right-panel";
import { RuleBidRightPanelLoading } from "@/features/rule-bids/components/rule-bid-right-panel-loading";
import { daysOffPageDataQueryKey, useDaysOffPageData } from "@/features/days-off/hooks/use-days-off-page-data";
import {
  getDaysOffInformationalMessages,
  validateDaysOffExistingProperties,
} from "@/features/days-off/days-off-validation";
import { biddingCalendarQueryKey } from "@/features/dashboard/hooks/use-bidding-calendar";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import { PanelMessageState } from "@/shared/components/panel";
import { queryClient } from "@/shared/query/query-client";
import { daysOffService } from "@/shared/services/days-off-service";
import { runCurrentBidMutation } from "@/features/bid/current-bid-draft-meta";
import type {
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import {
  patchRuleBidPageConfiguredFavorite,
  patchRuleBidPageDraftMeta,
  patchRuleBidPageExistingProperties,
  patchRuleBidPageUnfavoriteByKey,
} from "@/features/rule-bids/rule-bid-page-cache";
import {
  buildRuleBidExistingPropertyFromAvailable,
  removeRuleBidExistingPropertyById,
} from "@/features/rule-bids/utils";
import type { PbsPreferOffConfig } from "../../../../../packages/contracts/pbs-prefer-off.js";

type DaysOffPageProps = {
  presentation?: RuleBidRightPanelPresentation;
};

const renderDaysOffExistingBidSummary = (
  property: RuleBidExistingProperty,
  preferOffConfig?: PbsPreferOffConfig,
) => {
  const isCurrentSummaryShape = (
    (property.propertyCode === 201 && property.bid.type === "tag-list")
    || (property.propertyCode === 204 && property.bid.type === "stepper-date-range")
  );

  return isCurrentSummaryShape ? (
    <BidPropertySummaryView
      ariaLabel={`${property.name} bid summary`}
      summary={buildBidPropertySummary("days-off", property, preferOffConfig)}
    />
  ) : null;
};

export const DaysOffPage = ({ presentation }: DaysOffPageProps = {}) => {
  const { data, isLoading } = useDaysOffPageData();

  const handleAddProperty = useCallback(async (
    property: Parameters<typeof daysOffService.addCurrentDraftProperty>[0],
    draftMeta: Parameters<typeof daysOffService.addCurrentDraftProperty>[1],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => daysOffService.addCurrentDraftProperty(property, latestMeta),
    );

    queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          [
            ...currentData.rightPanel.existingProperties,
            buildRuleBidExistingPropertyFromAvailable(property, response.propertyGroupKey),
          ],
        )
      : currentData);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: biddingCalendarQueryKey }),
      queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey }),
    ]);
    return response;
  }, []);

  const handleDeleteProperty = useCallback(async (
    propertyGroupKey: string,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => daysOffService.removeCurrentDraftProperty(propertyGroupKey, latestMeta),
    );

    queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          removeRuleBidExistingPropertyById(currentData.rightPanel.existingProperties, propertyGroupKey),
        )
      : currentData);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: biddingCalendarQueryKey }),
      queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey }),
    ]);
    return response;
  }, []);

  const handleUpdateProperty = useCallback(async (
    propertyGroupKey: string,
    property: Parameters<typeof daysOffService.patchCurrentDraftProperty>[1],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => daysOffService.patchCurrentDraftProperty(propertyGroupKey, property, latestMeta),
    );

    queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageExistingProperties(
          patchRuleBidPageDraftMeta(currentData, response),
          currentData.rightPanel.existingProperties.map((item) =>
            item.id === propertyGroupKey ? property : item),
        )
      : currentData);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: biddingCalendarQueryKey }),
      queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey }),
    ]);
    return response;
  }, []);

  const handleSaveFavoriteProperty = useCallback(async (
    property: Parameters<typeof daysOffService.favoriteProperty>[0],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => daysOffService.favoriteProperty(property, latestMeta),
    );

    queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageConfiguredFavorite(
          patchRuleBidPageDraftMeta(currentData, response),
          response,
        )
      : currentData);
    return response;
  }, []);

  const handleDeleteFavoriteProperty = useCallback(async (
    favoriteKey: string,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => daysOffService.unfavoriteProperty(favoriteKey, latestMeta),
    );

    queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => currentData
      ? patchRuleBidPageUnfavoriteByKey(patchRuleBidPageDraftMeta(currentData, response), favoriteKey)
      : currentData);
    return response;
  }, []);

  const handleUpdateFavoriteProperty = useCallback(async (
    favoriteKey: string,
    property: Parameters<typeof daysOffService.patchFavoriteProperty>[1],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => {
    const response = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => daysOffService.patchFavoriteProperty(favoriteKey, property, latestMeta),
    );

    queryClient.setQueryData(daysOffPageDataQueryKey, (currentData: RuleBidPageData | undefined) => {
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
        addButtonLabel="ADD DAYS OFF PROPERTIES"
        statusLabel="Loading current days off draft..."
        testId="days-off-page-loading"
        title="EXISTING DAYS OFF PROPERTIES"
      />
    );
  }

  if (!data) {
    return (
      <PanelMessageState
        message="Unable to load the current days off draft."
        testId="days-off-page-error"
        title="EXISTING DAYS OFF PROPERTIES"
      />
    );
  }

  return (
    <RuleBidRightPanel
      data={data.rightPanel}
      existingBidEditMode="dialog"
      presentation={presentation}
      getInformationalMessages={getDaysOffInformationalMessages}
      onUnfavoriteProperty={handleDeleteFavoriteProperty}
      renderAvailablePropertyAddDialog={(dialogProps) => (
        <DaysOffBidDialog
          {...dialogProps}
          favoriteEditMode={dialogProps.isFavoriteEdit}
          favoriteLabel={dialogProps.isFavoriteEdit ? "UPDATE FAVORITE" : undefined}
          periodCode={data.rightPanel.draftMeta.periodCode}
          periodEndDate={data.rightPanel.draftMeta.currentPeriod?.rpEndLocal ?? ""}
          periodStartDate={data.rightPanel.draftMeta.currentPeriod?.rpStartLocal ?? ""}
          preferOffConfig={data.preferOffConfig}
        />
      )}
      renderExistingPropertyEditDialog={(dialogProps) => (
        <DaysOffBidDialog
          {...dialogProps}
          confirmLabel="UPDATE BID"
          periodCode={data.rightPanel.draftMeta.periodCode}
          periodEndDate={data.rightPanel.draftMeta.currentPeriod?.rpEndLocal ?? ""}
          periodStartDate={data.rightPanel.draftMeta.currentPeriod?.rpStartLocal ?? ""}
          preferOffConfig={data.preferOffConfig}
        />
      )}
      renderExistingBidSummary={(property) =>
        renderDaysOffExistingBidSummary(property, data.preferOffConfig)}
      validateExistingProperties={validateDaysOffExistingProperties}
      onAddProperty={handleAddProperty}
      onDeleteProperty={handleDeleteProperty}
      onSaveFavoriteProperty={handleSaveFavoriteProperty}
      onUpdateFavoriteProperty={handleUpdateFavoriteProperty}
      onUpdateProperty={handleUpdateProperty}
    />
  );
};
