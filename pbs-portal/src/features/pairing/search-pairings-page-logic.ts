import {
  PAIRING_NUMBER_PROPERTY_CODE,
  buildPairingIdListBid,
  buildPairingOccurrenceListBid,
  buildSinglePairingTierOptions,
  extractPairingNumbersFromBid,
  type PairingOccurrenceMode,
} from "@/features/pairing/pairing-number-occurrences";
import type { PbsPairingOccurrence } from "../../../../packages/contracts/pbs-search-pairings";
import { buildPairingSearchTierOptionsForLabel } from "@/features/pairing/pairing-search-criteria";
import {
  buildEmptyPairingSearchPageData,
  buildPairingSearchPageDataWithEmptyResults,
  mapPairingSearchPreviewResponseToPageData,
  type PairingSearchPreviewResponse,
} from "@/features/pairing/pairing-search-page-data";
import type {
  PairingSearchCriteriaItem,
  PairingSearchPageData,
} from "@/features/pairing/types";

export type PairingOccurrenceDialogState = {
  mode: PairingOccurrenceMode;
  pairingNumbers: string[];
  selectedOccurrenceId: string | null;
  selectedPairingNumber: string;
  selectedTier: string;
};

export type PairingOccurrenceDialogIntent =
  | { type: "none" }
  | { type: "missing-pairing-number" }
  | { type: "open-dialog"; state: PairingOccurrenceDialogState };

export type PairingSearchPreviewPageState = {
  hasSearchPreview: boolean;
  pageData: PairingSearchPageData | null;
  shouldShowLocalResultsRefresh: boolean;
};

type PairingSearchPreviewQueryEnabledInput = {
  criteriaItems: PairingSearchCriteriaItem[];
  currentRulesTier: string;
  debouncedCriteriaItems: PairingSearchCriteriaItem[];
  isAllPairingsPreview: boolean;
  isCriteriaPreviewDebouncing: boolean;
  isCurrentRulesPreview: boolean;
  previewPeriodCode: string;
};

type PairingSearchPreviewPageStateInput = {
  criteriaItems: PairingSearchCriteriaItem[];
  currentPage: number;
  hasCriteriaPreview: boolean;
  hasSearchShellRendered: boolean;
  isAllPairingsPreview: boolean;
  isCriteriaPreviewDebouncing: boolean;
  isCurrentRulesPreview: boolean;
  isPreviewError: boolean;
  isPreviewFetching: boolean;
  lastPreviewResponse: PairingSearchPreviewResponse | null;
  previewResponse: PairingSearchPreviewResponse | null | undefined;
};

export const buildPairingSearchPreviewQueryEnabled = ({
  criteriaItems,
  currentRulesTier,
  debouncedCriteriaItems,
  isAllPairingsPreview,
  isCriteriaPreviewDebouncing,
  isCurrentRulesPreview,
  previewPeriodCode,
}: PairingSearchPreviewQueryEnabledInput): boolean => {
  if (isAllPairingsPreview) {
    return previewPeriodCode.length > 0;
  }

  if (isCurrentRulesPreview) {
    return currentRulesTier !== "" && previewPeriodCode.length > 0;
  }

  return criteriaItems.length > 0
    && debouncedCriteriaItems.length > 0
    && !isCriteriaPreviewDebouncing
    && previewPeriodCode.length > 0;
};

export const getUniquePairingNumbersFromSearchCriteria = (
  criteriaItems: PairingSearchCriteriaItem[],
): string[] => {
  const pairingNumbers = criteriaItems
    .filter((item) => item.propertyCode === PAIRING_NUMBER_PROPERTY_CODE)
    .flatMap((item) => extractPairingNumbersFromBid(item.bid));

  return Array.from(new Set(pairingNumbers));
};

export const buildPairingOccurrenceDialogIntent = (
  criteriaItems: PairingSearchCriteriaItem[],
  selectedBidTier: string,
): PairingOccurrenceDialogIntent => {
  const hasPairingNumberCriteria = criteriaItems.some(
    (item) => item.propertyCode === PAIRING_NUMBER_PROPERTY_CODE,
  );

  if (!hasPairingNumberCriteria) {
    return { type: "none" };
  }

  const pairingNumbers = getUniquePairingNumbersFromSearchCriteria(criteriaItems);

  if (pairingNumbers.length === 0) {
    return { type: "missing-pairing-number" };
  }

  return {
    type: "open-dialog",
    state: {
      pairingNumbers,
      selectedPairingNumber: pairingNumbers[0],
      mode: "entire_month",
      selectedOccurrenceId: null,
      selectedTier: selectedBidTier,
    },
  };
};

export const buildPairingSearchCriteriaCandidatesForTier = (
  criteriaItems: PairingSearchCriteriaItem[],
  selectedTier: string,
): PairingSearchCriteriaItem[] =>
  criteriaItems.map((item) => ({
    ...item,
    tiers: buildPairingSearchTierOptionsForLabel(selectedTier),
  }));

export const buildPairingOccurrenceCandidates = (
  criteriaItems: PairingSearchCriteriaItem[],
  state: PairingOccurrenceDialogState,
  selectedOccurrence: PbsPairingOccurrence | null,
): PairingSearchCriteriaItem[] => {
  let addedPairingNumber = false;

  return criteriaItems.flatMap<PairingSearchCriteriaItem>((item) => {
    if (item.propertyCode !== PAIRING_NUMBER_PROPERTY_CODE) {
      return [{
        ...item,
        tiers: buildPairingSearchTierOptionsForLabel(state.selectedTier),
      }];
    }

    if (addedPairingNumber) {
      return [];
    }

    addedPairingNumber = true;
    const selectedPairingIndex = item.bid.type === "pairing-id-list"
      ? item.bid.pairingIds.findIndex((pairingId) => pairingId === state.selectedPairingNumber)
      : -1;
    const selectedPairingLabel = item.bid.type === "pairing-id-list" && selectedPairingIndex >= 0
      ? item.bid.pairingLabels?.[selectedPairingIndex]
      : undefined;

    return [{
      ...item,
      pairingNumber: selectedPairingLabel ?? selectedOccurrence?.pairingNumber ?? state.selectedPairingNumber,
      bid: selectedOccurrence
        ? buildPairingOccurrenceListBid(item.bid, [{
          pairingNumber: selectedOccurrence.pairingNumber,
          originDate: selectedOccurrence.originDate,
          pairingId: selectedOccurrence.pairingId,
          occurrenceId: selectedOccurrence.occurrenceId,
        }])
        : buildPairingIdListBid(
          [state.selectedPairingNumber],
          selectedPairingLabel ? [selectedPairingLabel] : undefined,
        ),
      tiers: buildSinglePairingTierOptions(state.selectedTier),
    }];
  });
};

export const buildPairingSearchPreviewPageState = ({
  criteriaItems,
  currentPage,
  hasCriteriaPreview,
  hasSearchShellRendered,
  isAllPairingsPreview,
  isCriteriaPreviewDebouncing,
  isCurrentRulesPreview,
  isPreviewError,
  isPreviewFetching,
  lastPreviewResponse,
  previewResponse,
}: PairingSearchPreviewPageStateInput): PairingSearchPreviewPageState => {
  const hasSearchPreview = hasCriteriaPreview || isCurrentRulesPreview || isAllPairingsPreview;
  const isAllPairingsAwaitingCurrentResponse =
    isAllPairingsPreview
    && !previewResponse
    && (isPreviewFetching || isPreviewError);
  const shouldShowLocalResultsRefresh =
    !isCurrentRulesPreview
    && (
      isAllPairingsAwaitingCurrentResponse
      || (
        hasCriteriaPreview
        && hasSearchShellRendered
        && (
          isCriteriaPreviewDebouncing
          || (!previewResponse && (isPreviewFetching || isPreviewError))
        )
      )
    );
  const effectivePreviewResponse = isCriteriaPreviewDebouncing
    ? null
    : previewResponse ?? (shouldShowLocalResultsRefresh ? null : lastPreviewResponse);

  if (!hasSearchPreview) {
    return {
      hasSearchPreview,
      shouldShowLocalResultsRefresh,
      pageData: buildEmptyPairingSearchPageData(),
    };
  }

  if (shouldShowLocalResultsRefresh) {
    const lastPageData = isAllPairingsPreview && lastPreviewResponse
      ? mapPairingSearchPreviewResponseToPageData(lastPreviewResponse, criteriaItems)
      : null;
    const emptyPageData = lastPageData
      ? {
          ...lastPageData,
          pagination: {
            ...lastPageData.pagination,
            currentPage,
          },
          results: [],
        }
      : buildPairingSearchPageDataWithEmptyResults(criteriaItems, currentPage);

    return {
      hasSearchPreview,
      shouldShowLocalResultsRefresh,
      pageData: emptyPageData,
    };
  }

  if (!effectivePreviewResponse) {
    return {
      hasSearchPreview,
      shouldShowLocalResultsRefresh,
      pageData: null,
    };
  }

  return {
    hasSearchPreview,
    shouldShowLocalResultsRefresh,
    pageData: isCurrentRulesPreview
      ? mapPairingSearchPreviewResponseToPageData(effectivePreviewResponse)
      : mapPairingSearchPreviewResponseToPageData(effectivePreviewResponse, criteriaItems),
  };
};
