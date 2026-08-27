import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import { biddingCalendarQueryKey } from "@/features/dashboard/hooks/use-bidding-calendar";
import { linePageDataQueryKey } from "@/features/line/hooks/use-line-page-data";
import {
  patchPairingPageDraftMeta,
  patchPairingPageExistingProperties,
} from "@/features/pairing/pairing-page-cache";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import type { PairingExistingProperty, PairingPageData } from "@/features/pairing/types";
import { reservePageDataQueryKey } from "@/features/reserve/hooks/use-reserve-page-data";
import {
  patchRuleBidPageDraftMeta,
  patchRuleBidPageExistingProperties,
} from "@/features/rule-bids/rule-bid-page-cache";
import type { RuleBidExistingProperty, RuleBidPageData } from "@/features/rule-bids/types";
import { tierPageDataQueryKey } from "@/features/tier/hooks/use-tier-page-data";
import type { TierSummaryItem } from "@/features/tier/types";
import { queryClient } from "@/shared/query/query-client";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { daysOffService } from "@/shared/services/days-off-service";
import { lineService } from "@/shared/services/line-service";
import { pairingService } from "@/shared/services/pairing-service";
import { reserveService } from "@/shared/services/reserve-service";
import { runCurrentBidMutation } from "@/features/bid/current-bid-draft-meta";

export const TIER_EDIT_LABELS = Array.from({ length: 7 }, (_, index) => `T${index + 1}`);

const TIER_EDIT_LABEL_SET = new Set(TIER_EDIT_LABELS);
const SOURCE_NOT_FOUND_MESSAGE = "Unable to locate the source bid. Refresh the page and try again.";

type EditableTierProperty = PairingExistingProperty | RuleBidExistingProperty;

type TierPropertyMutationResult = {
  module: NonNullable<TierSummaryItem["editableSource"]>["module"];
  propertyGroupKey: string;
};

const fetchPairingPageData = () =>
  queryClient.fetchQuery({
    queryKey: pairingPageDataQueryKey,
    queryFn: () => pairingService.getPageData(),
    retry: workbenchQueryDefaults.retry,
    staleTime: workbenchQueryDefaults.staleTime,
  });

const fetchDaysOffPageData = () =>
  queryClient.fetchQuery({
    queryKey: daysOffPageDataQueryKey,
    queryFn: () => daysOffService.getPageData(),
    retry: workbenchQueryDefaults.retry,
    staleTime: workbenchQueryDefaults.staleTime,
  });

const fetchLinePageData = () =>
  queryClient.fetchQuery({
    queryKey: linePageDataQueryKey,
    queryFn: () => lineService.getPageData(),
    retry: workbenchQueryDefaults.retry,
    staleTime: workbenchQueryDefaults.staleTime,
  });

const fetchReservePageData = () =>
  queryClient.fetchQuery({
    queryKey: reservePageDataQueryKey,
    queryFn: () => reserveService.getPageData(),
    retry: workbenchQueryDefaults.retry,
    staleTime: workbenchQueryDefaults.staleTime,
  });

const normalizeEditableTierLabels = (tiers: string[]) =>
  TIER_EDIT_LABELS.filter((tier) => tiers.includes(tier));

const requireEditableSource = (item: TierSummaryItem) => {
  if (!item.isEditable || !item.editableSource) {
    throw new Error("This bid is review-only and cannot be edited from Tier.");
  }

  return item.editableSource;
};

const requireSourceProperty = <Property extends EditableTierProperty>(
  properties: Property[],
  propertyGroupKey: string,
) => {
  const property = properties.find((candidate) => candidate.id === propertyGroupKey);

  if (!property) {
    throw new Error(SOURCE_NOT_FOUND_MESSAGE);
  }

  return property;
};

const patchPropertyTiers = <Property extends EditableTierProperty>(
  property: Property,
  tiers: string[],
): Property => {
  const activeLabels = new Set(normalizeEditableTierLabels(tiers));
  const existingTiersByLabel = new Map(property.tiers.map((tier) => [tier.label, tier]));

  if (activeLabels.size === 0) {
    throw new Error("Select at least one Tx before saving.");
  }

  return {
    ...property,
    tiers: [
      ...TIER_EDIT_LABELS.map((label) => ({
        ...(existingTiersByLabel.get(label) ?? { key: label.toLowerCase(), label }),
        active: activeLabels.has(label),
      })),
      ...property.tiers
        .filter((tier) => !TIER_EDIT_LABEL_SET.has(tier.label))
        .map((tier) => ({ ...tier, active: false })),
    ],
  };
};

const invalidateTierSummary = () =>
  queryClient.invalidateQueries({ queryKey: tierPageDataQueryKey });

const invalidateCalendarQueries = async () => {
  await queryClient.invalidateQueries({ queryKey: biddingCalendarQueryKey });
};

const patchPairingPropertyTiers = async (
  propertyGroupKey: string,
  tiers: string[],
): Promise<TierPropertyMutationResult> => {
  const data = await fetchPairingPageData();
  const property = requireSourceProperty(data.rightPanel.existingProperties, propertyGroupKey);
  const nextProperty = patchPropertyTiers(property, tiers);
  const response = await runCurrentBidMutation(
    data.rightPanel.draftMeta,
    (latestMeta) => pairingService.patchCurrentDraftProperty(propertyGroupKey, nextProperty, latestMeta),
  );

  queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) => currentData
    ? patchPairingPageExistingProperties(
        patchPairingPageDraftMeta(currentData, response),
        currentData.rightPanel.existingProperties.map((existingProperty) =>
          existingProperty.id === propertyGroupKey ? nextProperty : existingProperty),
      )
    : currentData);
  await invalidateTierSummary();

  return { module: "Pairing", propertyGroupKey };
};

const deletePairingProperty = async (
  propertyGroupKey: string,
): Promise<TierPropertyMutationResult> => {
  const data = await fetchPairingPageData();
  requireSourceProperty(data.rightPanel.existingProperties, propertyGroupKey);
  const response = await runCurrentBidMutation(
    data.rightPanel.draftMeta,
    (latestMeta) => pairingService.removeCurrentDraftProperty(propertyGroupKey, latestMeta),
  );

  queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) => currentData
    ? patchPairingPageExistingProperties(
        patchPairingPageDraftMeta(currentData, response),
        currentData.rightPanel.existingProperties.filter((existingProperty) =>
          existingProperty.id !== propertyGroupKey),
      )
    : currentData);
  await invalidateTierSummary();

  return { module: "Pairing", propertyGroupKey };
};

const patchRuleBidPropertyTiers = async (
  module: "DaysOff" | "Line" | "Reserve",
  propertyGroupKey: string,
  tiers: string[],
): Promise<TierPropertyMutationResult> => {
  const data = module === "DaysOff"
    ? await fetchDaysOffPageData()
    : module === "Line"
      ? await fetchLinePageData()
      : await fetchReservePageData();
  const property = requireSourceProperty(data.rightPanel.existingProperties, propertyGroupKey);
  const nextProperty = patchPropertyTiers(property, tiers);
  const response = await runCurrentBidMutation(
    data.rightPanel.draftMeta,
    (latestMeta) => module === "DaysOff"
      ? daysOffService.patchCurrentDraftProperty(propertyGroupKey, nextProperty, latestMeta)
      : module === "Line"
        ? lineService.patchCurrentDraftProperty(propertyGroupKey, nextProperty, latestMeta)
        : reserveService.patchCurrentDraftProperty(propertyGroupKey, nextProperty, latestMeta),
  );
  const queryKey = module === "DaysOff"
    ? daysOffPageDataQueryKey
    : module === "Line"
      ? linePageDataQueryKey
      : reservePageDataQueryKey;

  queryClient.setQueryData(queryKey, (currentData: RuleBidPageData | undefined) => currentData
    ? patchRuleBidPageExistingProperties(
        patchRuleBidPageDraftMeta(currentData, response),
        currentData.rightPanel.existingProperties.map((existingProperty) =>
          existingProperty.id === propertyGroupKey ? nextProperty : existingProperty),
      )
    : currentData);
  await Promise.all([
    invalidateTierSummary(),
    ...(module === "DaysOff" ? [invalidateCalendarQueries()] : []),
  ]);

  return { module, propertyGroupKey };
};

const deleteRuleBidProperty = async (
  module: "DaysOff" | "Line" | "Reserve",
  propertyGroupKey: string,
): Promise<TierPropertyMutationResult> => {
  const data = module === "DaysOff"
    ? await fetchDaysOffPageData()
    : module === "Line"
      ? await fetchLinePageData()
      : await fetchReservePageData();
  requireSourceProperty(data.rightPanel.existingProperties, propertyGroupKey);
  const response = await runCurrentBidMutation(
    data.rightPanel.draftMeta,
    (latestMeta) => module === "DaysOff"
      ? daysOffService.removeCurrentDraftProperty(propertyGroupKey, latestMeta)
      : module === "Line"
        ? lineService.removeCurrentDraftProperty(propertyGroupKey, latestMeta)
        : reserveService.removeCurrentDraftProperty(propertyGroupKey, latestMeta),
  );
  const queryKey = module === "DaysOff"
    ? daysOffPageDataQueryKey
    : module === "Line"
      ? linePageDataQueryKey
      : reservePageDataQueryKey;

  queryClient.setQueryData(queryKey, (currentData: RuleBidPageData | undefined) => currentData
    ? patchRuleBidPageExistingProperties(
        patchRuleBidPageDraftMeta(currentData, response),
        currentData.rightPanel.existingProperties.filter((existingProperty) =>
          existingProperty.id !== propertyGroupKey),
      )
    : currentData);
  await Promise.all([
    invalidateTierSummary(),
    ...(module === "DaysOff" ? [invalidateCalendarQueries()] : []),
  ]);

  return { module, propertyGroupKey };
};

export const patchTierSummaryItemTiers = (
  item: TierSummaryItem,
  tiers: string[],
): Promise<TierPropertyMutationResult> => {
  const source = requireEditableSource(item);

  if (source.module === "Pairing") {
    return patchPairingPropertyTiers(source.propertyGroupKey, tiers);
  }

  if (source.module === "DaysOff" || source.module === "Line" || source.module === "Reserve") {
    return patchRuleBidPropertyTiers(source.module, source.propertyGroupKey, tiers);
  }

  throw new Error(SOURCE_NOT_FOUND_MESSAGE);
};

export const deleteTierSummaryItem = (
  item: TierSummaryItem,
): Promise<TierPropertyMutationResult> => {
  const source = requireEditableSource(item);

  if (source.module === "Pairing") {
    return deletePairingProperty(source.propertyGroupKey);
  }

  if (source.module === "DaysOff" || source.module === "Line" || source.module === "Reserve") {
    return deleteRuleBidProperty(source.module, source.propertyGroupKey);
  }

  throw new Error(SOURCE_NOT_FOUND_MESSAGE);
};

export const getTierEditingErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to save this Tier change. Please refresh and try again.";
};
