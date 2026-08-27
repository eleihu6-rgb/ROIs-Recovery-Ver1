import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { message } from "@rois/ui";
import { useLocation, useNavigate } from "react-router-dom";
import { PairingSearchPanel } from "@/features/pairing/components/pairing-search-panel";
import { PairingPropertyConfigDialog } from "@/features/pairing/components/pairing-property-config-dialog";
import {
  PAIRING_NUMBER_PROPERTY_CODE,
  buildPairingIdListBid,
  buildSinglePairingTierOptions,
} from "@/features/pairing/pairing-number-occurrences";
import { pairingSearchPageData } from "@/features/pairing/mock";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import { invalidatePairingCalendarQueries } from "@/features/pairing/pairing-query-invalidations";
import { arePairingSearchCriteriaItemsEqual } from "@/features/pairing/pairing-property-equality";
import {
  patchPairingPageConfiguredFavoriteByKey,
  patchPairingPageDraftMeta,
  patchPairingPageExistingProperties,
  type PairingDraftMetaPatch,
} from "@/features/pairing/pairing-page-cache";
import {
  cloneExistingProperties,
  buildSavedPairingExistingPropertiesAfterAdd,
  removePairingExistingPropertyById,
} from "@/features/pairing/pairing-property-transform";
import {
  buildPairingAvailablePropertyFromSearchCriteria,
  buildPairingExistingPropertyFromSearchCriteria,
  buildPairingSearchCriteriaItemFromDialogDraft,
  buildPairingSearchCriteriaItemFromPreviewProperty,
  getPairingCurrentRulesTierLabels,
  resolvePairingCurrentRulesTier,
} from "@/features/pairing/pairing-search-criteria";
import {
  type PairingSearchPreviewResponse,
} from "@/features/pairing/pairing-search-page-data";
import {
  buildPairingSearchPreviewPageState,
  buildPairingSearchPreviewQueryEnabled,
} from "@/features/pairing/search-pairings-page-logic";
import { resolvePairingSearchPeriod } from "@/features/pairing/pairing-search-period";
import {
  buildPairingRuleExpressionTiers,
} from "@/features/pairing/pairing-rule-logic";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingPageData,
  PairingSearchCriteriaItem,
  PairingSearchLocationState,
  PairingSearchResult,
  PairingSearchResultFilters,
} from "@/features/pairing/types";
import { queryClient } from "@/shared/query/query-client";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import { pairingService } from "@/shared/services/pairing-service";
import { useI18n } from "@/shared/i18n";
import {
  resolveLatestCurrentBidDraftMeta,
  runCurrentBidMutation,
} from "@/features/bid/current-bid-draft-meta";

const DEFAULT_SEARCH_PAGE_SIZE = pairingSearchPageData.pagination.defaultPageSize;
const ALL_PAIRING_PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
const SEARCH_PREVIEW_DEBOUNCE_MS = 300;
const RESULT_FILTER_DEBOUNCE_MS = 300;
const PAIRING_PREVIEW_ERROR_MESSAGE = "Unable to refresh pairing results. Adjust the filters or try again.";
const ALL_PAIRING_TIER_OPTIONS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];
const ISO_DATE_FILTER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type AddedAllPairingCriteriaItem = PairingSearchCriteriaItem & {
  propertyGroupKey: string;
};

const useDebouncedValue = <TValue,>(
  value: TValue,
  delayMs: number,
): TValue => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
};

const resolvePairingActiveDateRange = (activeDates: string[]) => {
  const sortedDates = activeDates
    .map((date) => date.trim())
    .filter((date) => date.length > 0)
    .sort();

  return {
    from: sortedDates[0] ?? "",
    to: sortedDates[sortedDates.length - 1] ?? "",
  };
};

const normalizeAllPairingResultFiltersForQuery = (
  filters: PairingSearchResultFilters,
): PairingSearchResultFilters => {
  const normalizedFilters: PairingSearchResultFilters = { ...filters };

  for (const key of ["pairingNumbers", "airports"] as const) {
    const values = [...new Set(
      (normalizedFilters[key] ?? [])
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0),
    )];

    if (values.length === 0) {
      delete normalizedFilters[key];
    } else {
      normalizedFilters[key] = values;
    }
  }

  for (const key of ["originDateFrom", "originDateTo"] as const) {
    const value = normalizedFilters[key]?.trim() ?? "";

    if (value.length === 0 || !ISO_DATE_FILTER_PATTERN.test(value)) {
      delete normalizedFilters[key];
    } else {
      normalizedFilters[key] = value;
    }
  }

  return normalizedFilters;
};

const buildAllPairingNumberCriteria = (
  result: PairingSearchResult,
  tier: string,
  template?: PairingAvailableProperty,
): PairingSearchCriteriaItem => ({
  id: `all-pairing-${result.pairingId}`,
  propertyId: template?.propertyId,
  propertyCode: PAIRING_NUMBER_PROPERTY_CODE,
  name: template?.name ?? "Pairing Number",
  action: "award",
  quantifier: null,
  bid: buildPairingIdListBid([result.pairingId], [result.pairingNumber]),
  tiers: buildSinglePairingTierOptions(tier),
  favorited: template?.favorited ?? false,
  pairingNumber: result.pairingNumber,
  pairingType: template?.pairingType ?? "",
  effectiveDateRange: resolvePairingActiveDateRange(result.activeDates),
});

export const SearchPairingsPage = () => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as PairingSearchLocationState | null;
  const previewProperty = locationState?.previewProperty ?? null;
  const previewSource = locationState?.previewSource ?? (previewProperty ? { type: "catalog" as const } : undefined);
  const isCurrentRulesPreview = locationState?.previewMode === "current-rules";
  const isAllPairingsPreview = locationState?.previewMode === "all-pairings";
  const isSinglePropertyPreview = !isCurrentRulesPreview && !isAllPairingsPreview && previewProperty !== null;
  const initialCurrentRulesProperties = isCurrentRulesPreview
    ? cloneExistingProperties(locationState?.existingProperties ?? [])
    : [];
  const initialCurrentRulesTiers = getPairingCurrentRulesTierLabels(initialCurrentRulesProperties);
  const [criteriaItems, setCriteriaItems] = useState<PairingSearchCriteriaItem[]>(() =>
    previewProperty ? [buildPairingSearchCriteriaItemFromPreviewProperty(previewProperty)] : [],
  );
  const [currentRulesProperties, setCurrentRulesProperties] = useState<PairingExistingProperty[]>(
    () => initialCurrentRulesProperties,
  );
  const [currentRulesTier, setCurrentRulesTier] = useState(() =>
    resolvePairingCurrentRulesTier(initialCurrentRulesTiers, locationState?.initialTier),
  );
  const [editingCriteriaItemId, setEditingCriteriaItemId] = useState<string | null>(null);
  const [isCriteriaUpdatePending, setIsCriteriaUpdatePending] = useState(false);
  const [isAllPairingAddPending, setIsAllPairingAddPending] = useState(false);
  const [selectedAllPairingResult, setSelectedAllPairingResult] = useState<PairingSearchResult | null>(null);
  const [selectedAllPairingTier, setSelectedAllPairingTier] = useState("T1");
  const [addedAllPairingCriteriaItems, setAddedAllPairingCriteriaItems] = useState<AddedAllPairingCriteriaItem[]>([]);
  const [allPairingResultFilters, setAllPairingResultFilters] = useState<PairingSearchResultFilters>({});
  const [removingAllPairingCriteriaItemId, setRemovingAllPairingCriteriaItemId] = useState<string | null>(null);
  const [lastPreviewResponse, setLastPreviewResponse] = useState<PairingSearchPreviewResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [allPairingPageSize, setAllPairingPageSize] = useState(DEFAULT_SEARCH_PAGE_SIZE);
  const [hasSearchShellRendered, setHasSearchShellRendered] = useState(
    () => !isCurrentRulesPreview && !isAllPairingsPreview && !previewProperty,
  );
  const debouncedCriteriaItems = useDebouncedValue(criteriaItems, SEARCH_PREVIEW_DEBOUNCE_MS);
  const debouncedAllPairingResultFilters = useDebouncedValue(allPairingResultFilters, RESULT_FILTER_DEBOUNCE_MS);
  const queryAllPairingResultFilters = useMemo(
    () => normalizeAllPairingResultFiltersForQuery(debouncedAllPairingResultFilters),
    [debouncedAllPairingResultFilters],
  );
  const hasPreview = !isCurrentRulesPreview && criteriaItems.length > 0;
  const isCriteriaPreviewDebouncing = hasPreview
    && !arePairingSearchCriteriaItemsEqual(criteriaItems, debouncedCriteriaItems);
  const currentRulesExpressionTiers = useMemo(
    () => buildPairingRuleExpressionTiers(currentRulesProperties),
    [currentRulesProperties],
  );
  const currentRulesTierLabels = useMemo(
    () => currentRulesExpressionTiers.map((tier) => tier.tier),
    [currentRulesExpressionTiers],
  );
  const currentRulesExpressionTier = useMemo(
    () => currentRulesExpressionTiers.find((tier) => tier.tier === currentRulesTier) ?? null,
    [currentRulesExpressionTiers, currentRulesTier],
  );
  const cachedPairingPageData = queryClient.getQueryData<PairingPageData>(pairingPageDataQueryKey) ?? null;
  const editingCriteriaItem = useMemo(
    () => criteriaItems.find((item) => item.id === editingCriteriaItemId) ?? null,
    [criteriaItems, editingCriteriaItemId],
  );
  const editingCriteriaDialogProperty = useMemo(
    () => editingCriteriaItem ? buildPairingAvailablePropertyFromSearchCriteria(editingCriteriaItem) : null,
    [editingCriteriaItem],
  );

  const pairingPageQuery = useQuery({
    queryKey: pairingPageDataQueryKey,
    queryFn: () => pairingService.getPageData(),
    ...workbenchQueryDefaults,
  });
  const previewPeriodCode = (
    locationState?.draftMeta?.periodCode
    ?? cachedPairingPageData?.rightPanel.draftMeta.periodCode
    ?? pairingPageQuery.data?.rightPanel.draftMeta.periodCode
    ?? ""
  ).trim();
  const previewCurrentPeriod = locationState?.draftMeta?.currentPeriod
    ?? cachedPairingPageData?.rightPanel.draftMeta.currentPeriod
    ?? pairingPageQuery.data?.rightPanel.draftMeta.currentPeriod;
  const previewPeriod = resolvePairingSearchPeriod(previewCurrentPeriod, previewPeriodCode);
  const previewRosterPeriodId = previewPeriod?.rosterPeriodId ?? null;
  const canEditCurrentDraft = previewCurrentPeriod?.canEditBid === true;
  const currentDraftReadOnlyMessage = previewCurrentPeriod?.readOnlyReason
    ?? `Bidding is not open for ${previewPeriodCode || "this period"}.`;
  const isExistingPreviewReadOnly = previewSource?.type === "existing" && !canEditCurrentDraft;
  const isAllPairingsPreviewReadOnly = isAllPairingsPreview && !canEditCurrentDraft;
  const showCurrentDraftReadOnlyMessage = () => {
    message.error(currentDraftReadOnlyMessage);
  };

  useEffect(() => {
    const nextCriteriaItems = !isCurrentRulesPreview && previewProperty
      ? [buildPairingSearchCriteriaItemFromPreviewProperty(previewProperty)]
      : [];
    const nextCurrentRulesProperties = isCurrentRulesPreview
      ? cloneExistingProperties(locationState?.existingProperties ?? [])
      : [];
    const nextCurrentRulesTiers = getPairingCurrentRulesTierLabels(nextCurrentRulesProperties);

    setCurrentPage(1);
    setAllPairingPageSize(DEFAULT_SEARCH_PAGE_SIZE);
    setLastPreviewResponse(null);
    setCriteriaItems((current) =>
      arePairingSearchCriteriaItemsEqual(current, nextCriteriaItems) ? current : nextCriteriaItems,
    );
    setCurrentRulesProperties(nextCurrentRulesProperties);
    setCurrentRulesTier(resolvePairingCurrentRulesTier(nextCurrentRulesTiers, locationState?.initialTier));
    setEditingCriteriaItemId(null);
    setSelectedAllPairingResult(null);
    setSelectedAllPairingTier("T1");
    setAddedAllPairingCriteriaItems([]);
    setAllPairingResultFilters({});
    setHasSearchShellRendered(!isCurrentRulesPreview && !isAllPairingsPreview && !previewProperty);
  }, [isAllPairingsPreview, isCurrentRulesPreview, locationState?.existingProperties, locationState?.initialTier, previewProperty]);

  const previewQueryEnabled = previewPeriod !== null && buildPairingSearchPreviewQueryEnabled({
    criteriaItems,
    currentRulesTier,
    debouncedCriteriaItems,
    isAllPairingsPreview,
    isCriteriaPreviewDebouncing,
    isCurrentRulesPreview,
    previewPeriodCode,
  });

  const previewQueryKey = [
    "pairing",
    "search-preview",
    isAllPairingsPreview
      ? "all-pairings"
      : isCurrentRulesPreview
        ? "current-rules"
        : isSinglePropertyPreview
          ? "single-property"
          : "criteria",
    isAllPairingsPreview ? queryAllPairingResultFilters : isCurrentRulesPreview ? currentRulesTier : debouncedCriteriaItems,
    isAllPairingsPreview ? null : isCurrentRulesPreview ? currentRulesProperties : null,
    previewRosterPeriodId,
    previewPeriodCode,
    currentPage,
    isAllPairingsPreview ? allPairingPageSize : DEFAULT_SEARCH_PAGE_SIZE,
  ] as const;
  const previewQuery = useQuery({
    queryKey: previewQueryKey,
    queryFn: () => {
      if (isAllPairingsPreview) {
        if (!previewPeriod) {
          throw new Error("A roster period is required for pairing search.");
        }
        return pairingService.previewAllPairings(
          currentPage,
          allPairingPageSize,
          previewPeriod,
          queryAllPairingResultFilters,
        );
      }

      if (isCurrentRulesPreview) {
        if (!previewPeriod) {
          throw new Error("A roster period is required for pairing search.");
        }
        return pairingService.previewCurrentRules(
          currentRulesTier,
          currentRulesProperties,
          currentPage,
          DEFAULT_SEARCH_PAGE_SIZE,
          previewPeriod,
        );
      }

      if (isSinglePropertyPreview && debouncedCriteriaItems[0]) {
        if (!previewPeriod) {
          throw new Error("A roster period is required for pairing search.");
        }
        const property = debouncedCriteriaItems[0];
        return pairingService.previewSingleProperty(
          {
            propertyId: property.propertyId,
            propertyCode: property.propertyCode,
            name: property.name,
            action: property.action,
            quantifier: property.quantifier,
            bid: property.bid,
          },
          currentPage,
          DEFAULT_SEARCH_PAGE_SIZE,
          previewPeriod,
        );
      }

      if (!previewPeriod) {
        throw new Error("A roster period is required for pairing search.");
      }
      return pairingService.previewCriteria(
        debouncedCriteriaItems,
        currentPage,
        DEFAULT_SEARCH_PAGE_SIZE,
        previewPeriod,
      );
    },
    enabled: previewQueryEnabled,
    ...workbenchQueryDefaults,
    refetchOnMount: "always",
    staleTime: 0,
  });
  const currentPreviewResponse = queryClient.getQueryData<PairingSearchPreviewResponse>(previewQueryKey);

  useEffect(() => {
    if (!currentPreviewResponse) {
      return;
    }

    setLastPreviewResponse(currentPreviewResponse);
    if (!isCurrentRulesPreview && !isAllPairingsPreview) {
      setHasSearchShellRendered(true);
    }
  }, [currentPreviewResponse, isAllPairingsPreview, isCurrentRulesPreview]);

  const getCurrentPairingPageData = () =>
    queryClient.getQueryData<PairingPageData>(pairingPageDataQueryKey) ?? pairingPageQuery.data ?? null;
  const getCurrentDraftMeta = () => {
    const draftMeta = getCurrentPairingPageData()?.rightPanel.draftMeta ?? locationState?.draftMeta;
    return draftMeta ? resolveLatestCurrentBidDraftMeta(draftMeta) : undefined;
  };

  const updatePreviewCriteriaItems = (
    updateItems: (current: PairingSearchCriteriaItem[]) => PairingSearchCriteriaItem[],
  ) => {
    setCurrentPage(1);
    setLastPreviewResponse(null);
    setCriteriaItems(updateItems);
  };

  const syncDraftIdentityInQueryCache = (details: PairingDraftMetaPatch) => {
    queryClient.setQueryData(pairingPageDataQueryKey, (cachedData: PairingPageData | undefined) => {
      const currentData = cachedData ?? getCurrentPairingPageData();

      if (!currentData) {
        return cachedData;
      }

      return patchPairingPageDraftMeta(currentData, details);
    });
  };

  const applyCriteriaDialogDraft = (
    originalItem: PairingSearchCriteriaItem,
    draft: PairingAvailableProperty,
  ) => {
    const nextCriteriaItem = buildPairingSearchCriteriaItemFromDialogDraft(originalItem, draft);

    updatePreviewCriteriaItems((current) =>
      current.map((item) =>
        item.id === originalItem.id
        ? nextCriteriaItem
        : item,
      ),
    );
    setEditingCriteriaItemId(null);

    return nextCriteriaItem;
  };

  const updateExistingPreviewSource = async (
    originalItem: PairingSearchCriteriaItem,
    draft: PairingAvailableProperty,
    propertyGroupKey: string,
  ) => {
    if (!canEditCurrentDraft) {
      showCurrentDraftReadOnlyMessage();
      return;
    }

    const currentData = getCurrentPairingPageData();
    const draftMeta = getCurrentDraftMeta();

    if (!draftMeta) {
      message.error(t("pairing.message.updatePropertyError"));
      return;
    }

    const nextCriteriaItem = buildPairingSearchCriteriaItemFromDialogDraft(originalItem, draft);
    const template = currentData?.rightPanel.availableProperties.find((property) =>
      property.propertyCode === nextCriteriaItem.propertyCode);
    const nextExistingProperty = {
      ...buildPairingExistingPropertyFromSearchCriteria(nextCriteriaItem, 0, template),
      id: propertyGroupKey,
    };
    const result = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => pairingService.patchCurrentDraftProperty(
        propertyGroupKey,
        nextExistingProperty,
        latestMeta,
      ),
    );

    syncDraftIdentityInQueryCache(result);
    queryClient.setQueryData(pairingPageDataQueryKey, (cachedData: PairingPageData | undefined) => {
      const baseData = cachedData ?? currentData;

      if (!baseData) {
        return cachedData;
      }

      const nextExistingProperties = baseData.rightPanel.existingProperties.map((property) =>
        property.id === propertyGroupKey ? nextExistingProperty : property);

      return patchPairingPageExistingProperties(
        patchPairingPageDraftMeta(baseData, result),
        nextExistingProperties,
      );
    });
    invalidatePairingCalendarQueries();
    applyCriteriaDialogDraft(originalItem, draft);
    message.success(t("pairing.message.updatePropertySuccess"));
  };

  const updateFavoritePreviewSource = async (
    originalItem: PairingSearchCriteriaItem,
    draft: PairingAvailableProperty,
    favoriteKey: string,
  ) => {
    const normalizedFavoriteKey = favoriteKey.trim();

    if (normalizedFavoriteKey.length === 0) {
      message.error(t("pairing.message.updateFavoriteMissingKey"));
      return;
    }

    const currentData = getCurrentPairingPageData();
    const draftMeta = getCurrentDraftMeta();

    if (!draftMeta) {
      message.error(t("pairing.message.updateFavoriteError"));
      return;
    }

    const result = await runCurrentBidMutation(
      draftMeta,
      (latestMeta) => pairingService.patchFavoriteProperty(normalizedFavoriteKey, draft, latestMeta),
    );
    const nextFavoriteProperty: PairingAvailableProperty = {
      ...draft,
      id: `favorite-${result.favoriteKey}`,
      source: "favorite",
      favoriteKey: result.favoriteKey,
      propertyId: result.propertyId,
      propertyCode: result.propertyCode,
      name: result.name,
      action: result.action ?? null,
      quantifier: result.quantifier ?? null,
      bid: result.bid,
      tiers: draft.tiers,
      favorited: true,
    };

    syncDraftIdentityInQueryCache(result);
    queryClient.setQueryData(pairingPageDataQueryKey, (cachedData: PairingPageData | undefined) => {
      const baseData = cachedData ?? currentData;

      if (!baseData) {
        return cachedData;
      }

      return patchPairingPageConfiguredFavoriteByKey(
        patchPairingPageDraftMeta(baseData, result),
        nextFavoriteProperty,
      );
    });
    applyCriteriaDialogDraft(originalItem, nextFavoriteProperty);
    message.success(t("pairing.message.updateFavoriteSuccess"));
  };

  const handleCriteriaDialogConfirm = (draft: PairingAvailableProperty) => {
    const originalItem = editingCriteriaItem;

    if (!originalItem) {
      return;
    }

    if (isExistingPreviewReadOnly) {
      showCurrentDraftReadOnlyMessage();
      return;
    }

    setIsCriteriaUpdatePending(true);
    void (async () => {
      try {
        if (previewSource?.type === "existing") {
          await updateExistingPreviewSource(originalItem, draft, previewSource.propertyGroupKey);
          return;
        }

        if (previewSource?.type === "favorite") {
          await updateFavoritePreviewSource(originalItem, draft, previewSource.favoriteKey);
          return;
        }

        applyCriteriaDialogDraft(originalItem, draft);
      } catch {
        message.error(
          previewSource?.type === "favorite"
            ? t("pairing.message.updateFavoriteError")
            : t("pairing.message.updatePropertyError"),
        );
      } finally {
        setIsCriteriaUpdatePending(false);
      }
    })();
  };

  const handleAllPairingSelect = (result: PairingSearchResult) => {
    if (isAllPairingsPreviewReadOnly) {
      showCurrentDraftReadOnlyMessage();
      return;
    }

    setSelectedAllPairingResult(result);
    setSelectedAllPairingTier("T1");
  };

  const handleAllPairingResultFiltersChange = (filters: PairingSearchResultFilters) => {
    setCurrentPage(1);
    setAllPairingResultFilters(filters);
  };

  const handleAllPairingAddConfirm = () => {
    const selectedResult = selectedAllPairingResult;

    if (!selectedResult) {
      return;
    }

    if (isAllPairingsPreviewReadOnly) {
      showCurrentDraftReadOnlyMessage();
      return;
    }

    setIsAllPairingAddPending(true);
    void (async () => {
      try {
        const currentData = getCurrentPairingPageData();
        const draftMeta = getCurrentDraftMeta();

        if (!draftMeta) {
          message.error(t("pairing.message.addPropertyError"));
          return;
        }

        const template = currentData?.rightPanel.availableProperties.find((property) =>
          property.propertyCode === PAIRING_NUMBER_PROPERTY_CODE);
        const criteria = buildAllPairingNumberCriteria(selectedResult, selectedAllPairingTier, template);
        const pendingExistingProperty = buildPairingExistingPropertyFromSearchCriteria(
          criteria,
          currentData?.rightPanel.existingProperties.length ?? 0,
          template,
        );
        const result = await runCurrentBidMutation(
          draftMeta,
          (latestMeta) => pairingService.addCurrentDraftProperty(criteria, latestMeta),
        );

        syncDraftIdentityInQueryCache(result);
        queryClient.setQueryData(pairingPageDataQueryKey, (cachedData: PairingPageData | undefined) => {
          const baseData = cachedData ?? currentData;

          if (!baseData) {
            return cachedData;
          }

          const pendingProperties = [
            ...baseData.rightPanel.existingProperties,
            pendingExistingProperty,
          ];

          return patchPairingPageExistingProperties(
            patchPairingPageDraftMeta(baseData, result),
            buildSavedPairingExistingPropertiesAfterAdd(
              pendingProperties,
              pendingExistingProperty.id,
              result.propertyGroupKey,
            ),
          );
        });
        invalidatePairingCalendarQueries();
        setAddedAllPairingCriteriaItems((current) => [
          ...current,
          {
            ...criteria,
            id: `all-pairing-added-${result.propertyGroupKey}-${current.length + 1}`,
            propertyGroupKey: result.propertyGroupKey,
          },
        ]);
        setSelectedAllPairingResult(null);
        message.success(t("pairing.message.addPropertySuccess"));
      } catch {
        message.error(t("pairing.message.addPropertyError"));
      } finally {
        setIsAllPairingAddPending(false);
      }
    })();
  };

  const handleAllPairingCriteriaRemove = (itemId: string) => {
    const selectedItem = addedAllPairingCriteriaItems.find((item) => item.id === itemId);

    if (!selectedItem) {
      return;
    }

    if (isAllPairingsPreviewReadOnly) {
      showCurrentDraftReadOnlyMessage();
      return;
    }

    setRemovingAllPairingCriteriaItemId(itemId);
    void (async () => {
      try {
        const currentData = getCurrentPairingPageData();
        const draftMeta = getCurrentDraftMeta();

        if (!draftMeta) {
          message.error(t("pairing.message.deletePropertyError"));
          return;
        }

        const result = await runCurrentBidMutation(
          draftMeta,
          (latestMeta) => pairingService.removeCurrentDraftProperty(
            selectedItem.propertyGroupKey,
            latestMeta,
          ),
        );

        syncDraftIdentityInQueryCache(result);
        queryClient.setQueryData(pairingPageDataQueryKey, (cachedData: PairingPageData | undefined) => {
          const baseData = cachedData ?? currentData;

          if (!baseData) {
            return cachedData;
          }

          return patchPairingPageExistingProperties(
            patchPairingPageDraftMeta(baseData, result),
            removePairingExistingPropertyById(baseData.rightPanel.existingProperties, selectedItem.propertyGroupKey),
          );
        });
        invalidatePairingCalendarQueries();
        setAddedAllPairingCriteriaItems((current) => current.filter((item) => item.id !== itemId));
        message.success(t("pairing.message.deletePropertySuccess"));
      } catch {
        message.error(t("pairing.message.deletePropertyError"));
      } finally {
        setRemovingAllPairingCriteriaItemId(null);
      }
    })();
  };

  const {
    hasSearchPreview,
    pageData,
    shouldShowLocalResultsRefresh,
  } = useMemo(() => buildPairingSearchPreviewPageState({
    criteriaItems,
    currentPage,
    hasCriteriaPreview: hasPreview,
    hasSearchShellRendered,
    isAllPairingsPreview,
    isCriteriaPreviewDebouncing,
    isCurrentRulesPreview,
    isPreviewError: previewQuery.isError,
    isPreviewFetching: previewQuery.isFetching,
    lastPreviewResponse,
    previewResponse: currentPreviewResponse,
  }), [
    criteriaItems,
    currentPage,
    hasPreview,
    hasSearchShellRendered,
    isAllPairingsPreview,
    isCriteriaPreviewDebouncing,
    isCurrentRulesPreview,
    lastPreviewResponse,
    currentPreviewResponse,
    previewQuery.isError,
    previewQuery.isFetching,
  ]);

  if (hasSearchPreview && !pageData && (previewQuery.isLoading || pairingPageQuery.isLoading)) {
    return (
      <div
        aria-label="Loading pairing search preview..."
        className="flex h-full items-center justify-center rounded-xl bg-white/80 text-sm font-medium text-[#6f7485]"
        role="status"
      >
        Loading pairing search preview...
      </div>
    );
  }

  const previewQueryErrorMessage = PAIRING_PREVIEW_ERROR_MESSAGE;

  if (hasSearchPreview && !pageData && previewQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl bg-white px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-[#282c3b]">Search Pairings Preview Unavailable</p>
          <p className="mt-2 text-sm leading-6 text-[#6f7485]">{PAIRING_PREVIEW_ERROR_MESSAGE}</p>
        </div>
      </div>
    );
  }

  if (!pageData) {
    return null;
  }

  const panelPageData = isAllPairingsPreview && addedAllPairingCriteriaItems.length > 0
    ? {
        ...pageData,
        criteriaItems: addedAllPairingCriteriaItems,
      }
    : pageData;

  return (
    <>
      <PairingSearchPanel
        currentPage={currentPage}
        allPairingsPreview={isAllPairingsPreview}
        bidTierDialog={
          selectedAllPairingResult && !isAllPairingsPreviewReadOnly
            ? {
                confirmLabel: "ADD PAIRING",
                isOpen: true,
                isPending: isAllPairingAddPending,
                selectedTier: selectedAllPairingTier,
                tiers: ALL_PAIRING_TIER_OPTIONS,
                onCancel: () => setSelectedAllPairingResult(null),
                onConfirm: handleAllPairingAddConfirm,
                onSelectTier: setSelectedAllPairingTier,
              }
            : undefined
        }
        criteriaActionsDisabled={
          pairingPageQuery.isLoading
          || isCriteriaUpdatePending
          || removingAllPairingCriteriaItemId !== null
          || isExistingPreviewReadOnly
          || (addedAllPairingCriteriaItems.length > 0 && isAllPairingsPreviewReadOnly)
        }
        isResultsRefreshing={
          shouldShowLocalResultsRefresh
          && (isCriteriaPreviewDebouncing || previewQuery.isFetching)
        }
        currentRulesPreview={
          isCurrentRulesPreview
            ? {
                activeTier: currentRulesTier,
                emptyLabel: `${t("pairing.searchRules.emptyInTier")} ${currentRulesTier}.`,
                expressionTier: currentRulesExpressionTier,
                tiers: currentRulesTierLabels,
                onTierChange: (tier) => {
                  setCurrentRulesTier(tier);
                  setCurrentPage(1);
                },
              }
            : undefined
        }
        data={panelPageData}
        onAddMoreCriteria={undefined}
        onBack={() => navigate("/bid", { state: { availableTab: "pairing" } })}
        onBidTheseProperties={undefined}
        onCriteriaEditToggle={
          hasPreview
            ? (itemId) => {
                if (isExistingPreviewReadOnly) {
                  showCurrentDraftReadOnlyMessage();
                  return;
                }

                setEditingCriteriaItemId(itemId);
              }
            : undefined
        }
        onCriteriaFavoriteToggle={undefined}
        onCriteriaRemove={
          isAllPairingsPreview && addedAllPairingCriteriaItems.length > 0
            ? handleAllPairingCriteriaRemove
            : undefined
        }
        onPageChange={setCurrentPage}
        onPageSizeChange={
          isAllPairingsPreview
            ? (pageSize) => {
                setCurrentPage(1);
                setAllPairingPageSize(pageSize);
              }
            : undefined
        }
        onResultFiltersChange={
          isAllPairingsPreview ? handleAllPairingResultFiltersChange : undefined
        }
        period={previewPeriod}
        periodCode={previewPeriodCode}
        periodEndDate={previewCurrentPeriod?.rpEndLocal ?? ""}
        periodStartDate={previewCurrentPeriod?.rpStartLocal ?? ""}
        pageSize={isAllPairingsPreview ? allPairingPageSize : undefined}
        pageSizeOptions={isAllPairingsPreview ? ALL_PAIRING_PAGE_SIZE_OPTIONS : undefined}
        resultAction={
          isAllPairingsPreview && !isAllPairingsPreviewReadOnly
            ? {
                isPending: isAllPairingAddPending,
                label: "ADD PAIRING",
                onSelect: handleAllPairingSelect,
              }
            : undefined
        }
        resultFilters={isAllPairingsPreview ? allPairingResultFilters : undefined}
        resultsRefreshError={
          shouldShowLocalResultsRefresh
          && previewQuery.isError
          && !previewQuery.isFetching
            ? previewQueryErrorMessage
            : null
        }
        onResultsRetry={() => {
          void previewQuery.refetch();
        }}
        showSearchActions={false}
      />
      {editingCriteriaDialogProperty ? (
        <PairingPropertyConfigDialog
          confirmSavesFavorite={editingCriteriaItem?.favoriteKey != null}
          confirmLabel={t("pairing.dialog.updateBid")}
          confirmPendingLabel={t("pairing.dialog.updatingBid")}
          isOpen
          isPending={isCriteriaUpdatePending}
          pairingNumberPeriodCode={previewPeriodCode}
          pairingSearchPeriod={previewPeriod}
          periodEndDate={previewCurrentPeriod?.rpEndLocal ?? ""}
          periodStartDate={previewCurrentPeriod?.rpStartLocal ?? ""}
          property={editingCriteriaDialogProperty}
          requireTierSelection={editingCriteriaItem?.favoriteKey == null}
          onCancel={() => setEditingCriteriaItemId(null)}
          onConfirm={handleCriteriaDialogConfirm}
        />
      ) : null}
    </>
  );
};
