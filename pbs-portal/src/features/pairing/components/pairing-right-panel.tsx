import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { message } from "@rois/ui";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { PanelStripHeader } from "@/shared/components/panel";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { PairingPropertyConfigDialog } from "@/features/pairing/components/pairing-property-config-dialog";
import { PairingRuleExpressionView } from "@/features/pairing/components/pairing-rule-expression-view";
import {
  PairingAvailablePropertiesSection,
  PairingExistingPropertiesSection,
  PairingPoolCountsToolbar,
} from "@/features/pairing/components/pairing-right-panel-sections";
import {
  patchPairingPageAvailableProperties,
  patchPairingPageDraftMeta,
  patchPairingPageConfiguredFavorite,
  patchPairingPageConfiguredFavoriteByKey,
  patchPairingPageExistingProperties,
  patchPairingPageUnfavoriteByKey,
  type PairingDraftMetaPatch,
} from "@/features/pairing/pairing-page-cache";
import {
  buildPairingRuleExpressionTiers,
  findPairingPropertyRuleConflict,
  formatPairingRuleConflictMessage,
} from "@/features/pairing/pairing-rule-logic";
import { arePairingTierOptionsEqual } from "@/features/pairing/pairing-property-equality";
import {
  buildPairingAvailablePropertiesPage,
  buildPairingPaginationItems,
  clampPairingPage,
  filterPairingAvailableProperties,
} from "@/features/pairing/pairing-property-list";
import {
  buildPairingPoolCountRowsByPropertyKey,
  buildPairingPoolCountsSummary,
  createInitialPairingPoolCountsState,
  normalizePairingPoolCountsTierLabel,
  resolvePairingPoolCountsTier,
  type PairingPoolCountsState,
} from "@/features/pairing/pairing-pool-counts";
import {
  getPairingRightPanelAvailableTableLayout,
  getPairingRightPanelTableLayout,
} from "@/features/pairing/pairing-right-panel-layout";
import {
  buildPairingRightPanelHydrationKey,
  buildPairingAvailablePropertyFromExisting,
  buildPairingSearchPreviewProperty,
  buildSavedPairingExistingPropertiesAfterAdd,
  cloneAvailableProperties,
  cloneExistingProperties,
  cloneExistingPropertyFromAvailable,
  getActivePairingTierLabels,
  removePairingExistingPropertyById,
  replacePairingExistingPropertyById,
  togglePairingTierOptions,
} from "@/features/pairing/pairing-property-transform";
import { PAIRING_NUMBER_PROPERTY_CODE } from "@/features/pairing/pairing-number-occurrences";
import { pairingPageDataQueryKey } from "@/features/pairing/hooks/use-pairing-page-data";
import { invalidatePairingCalendarQueries } from "@/features/pairing/pairing-query-invalidations";
import {
  usePairingPoolCountsRefreshStore,
  type PairingPoolCountsRefreshInput,
} from "@/features/pairing/pairing-pool-counts-refresh-store";
import { resolvePairingSearchPeriod } from "@/features/pairing/pairing-search-period";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingPropertyAction,
  PairingPageData,
  PairingRightPanelData,
  PairingSearchLocationState,
} from "@/features/pairing/types";
import { queryClient } from "@/shared/query/query-client";
import { pairingService } from "@/shared/services/pairing-service";
import { useI18n } from "@/shared/i18n";
import { useBiddingCalendarStore } from "@/shared/store/use-bidding-calendar-store";
import {
  resolveLatestCurrentBidDraftMeta,
  runCurrentBidMutation,
} from "@/features/bid/current-bid-draft-meta";
import {
  isRuleBidDraftConflictError,
  isRuleBidMissingFavoriteError,
} from "@/features/rule-bids/rule-bid-errors";
import { DraftConflictRecoveryAlert } from "@/features/rule-bids/components/draft-conflict-recovery-alert";
import { FavoriteMissingRecoveryAlert } from "@/features/rule-bids/components/favorite-missing-recovery-alert";

export type PairingRightPanelPresentation = {
  toolbarActions?: ReactNode;
  availableOnly?: boolean;
  availableTab?: "all" | "favorited";
  requestedExistingPropertyId?: string | null;
  searchKeyword?: string;
  toolbarOnly?: boolean;
  onRequestedExistingPropertyHandled?: () => void;
};

type PairingRightPanelProps = {
  data: PairingRightPanelData;
  presentation?: PairingRightPanelPresentation;
};

type PersistExistingPropertiesMutation = (
  snapshot: PairingExistingProperty[],
) => Promise<PairingExistingProperty[] | void>;

type PairingExistingViewMode = "properties" | "rules";
type PairingCountEffectOnSuccess = "preserve" | "refresh" | "refresh-preserve-rows" | "stale";
type PairingPropertyDialogState = {
  property: PairingAvailableProperty;
};
type PairingExistingPropertyDialogState = {
  property: PairingExistingProperty;
};
const AVAILABLE_PROPERTIES_PAGE_SIZE = 10;

const getViewportWidth = () => window.innerWidth;

const buildPairingExistingPropertyFromDialogDraft = (
  source: PairingExistingProperty,
  draft: PairingAvailableProperty,
): PairingExistingProperty => ({
  ...source,
  action: draft.action,
  quantifier: draft.quantifier,
  bid: structuredClone(draft.bid),
  tiers: draft.tiers.map((tier) => ({ ...tier })),
  pairingNumber: draft.pairingNumber,
  pairingType: draft.pairingType,
  effectiveDateRange: { ...draft.effectiveDateRange },
});

const buildPairingAvailablePropertyForAddDialog = (
  property: PairingAvailableProperty,
): PairingAvailableProperty => ({
  ...property,
  tiers: property.propertyCode === PAIRING_NUMBER_PROPERTY_CODE
    ? property.tiers.map((tier) => ({ ...tier }))
    : property.tiers.map((tier) => ({ ...tier, active: false })),
});

type PersistExistingPropertiesFeedback = {
  countEffectOnSuccess?: PairingCountEffectOnSuccess;
  onError?: (error: unknown) => void;
  onSuccess?: () => void;
};

export const PairingRightPanel = ({ data, presentation }: PairingRightPanelProps) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const activeTierLabel = useBiddingCalendarStore((state) => state.activeTierLabel);
  const externalPoolCountsRefreshRequest = usePairingPoolCountsRefreshStore((state) => state.request);
  const [existingProperties, setExistingProperties] = useState(() => cloneExistingProperties(data.existingProperties));
  const currentPoolCountsTier = resolvePairingPoolCountsTier(activeTierLabel);
  const [availableProperties, setAvailableProperties] = useState(() => cloneAvailableProperties(data.availableProperties));
  const [showDraftConflictRecovery, setShowDraftConflictRecovery] = useState(false);
  const [missingFavoriteKey, setMissingFavoriteKey] = useState<string | null>(null);
  const [existingViewMode, setExistingViewMode] = useState<PairingExistingViewMode>("properties");
  const [activeTab, setActiveTab] = useState<"all" | "favorited">("favorited");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [pairingPropertyDialog, setPairingPropertyDialog] = useState<PairingPropertyDialogState | null>(null);
  const [pairingFavoriteDialog, setPairingFavoriteDialog] = useState<PairingPropertyDialogState | null>(null);
  const [pairingExistingPropertyDialog, setPairingExistingPropertyDialog] =
    useState<PairingExistingPropertyDialogState | null>(null);
  const [confirmingFavoriteDeleteId, setConfirmingFavoriteDeleteId] = useState<string | null>(null);
  const [isFavoriteMutationPending, setIsFavoriteMutationPending] = useState(false);
  const [pendingDraftMutationKey, setPendingDraftMutationKey] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => getViewportWidth());
  const [currentPage, setCurrentPage] = useState(1);
  const [pairingPoolCounts, setPairingPoolCounts] = useState<PairingPoolCountsState>(() =>
    createInitialPairingPoolCountsState(currentPoolCountsTier),
  );
  const pairingSearchPeriod = useMemo(
    () => resolvePairingSearchPeriod(data.draftMeta.currentPeriod, data.draftMeta.periodCode),
    [data.draftMeta.currentPeriod, data.draftMeta.periodCode],
  );
  const lastSavedExistingPropertiesRef = useRef(cloneExistingProperties(data.existingProperties));
  const lastHydrationKeyRef = useRef("");
  const latestPoolCountsInputRef = useRef<PairingPoolCountsRefreshInput>({
    existingProperties: cloneExistingProperties(data.existingProperties),
    period: pairingSearchPeriod,
  });
  const activeTierLabelRef = useRef(activeTierLabel);
  const poolCountsRequestSeqRef = useRef(0);
  const handledExternalPoolCountsRefreshSequenceRef = useRef(externalPoolCountsRefreshRequest?.sequence ?? 0);
  const handledRequestedExistingPropertyIdRef = useRef<string | null>(null);
  const hasObservedInitialPoolCountsTierRef = useRef(false);
  const deferredSearchKeyword = useDeferredValue(searchKeyword);
  const availablePropertyFilter = data.initialSearchForm;
  const getCurrentDraftMeta = () => resolveLatestCurrentBidDraftMeta(data.draftMeta);
  const hydrationKey = useMemo(
    () => buildPairingRightPanelHydrationKey(data.draftMeta, data.existingProperties, availablePropertyFilter),
    [data.draftMeta, data.existingProperties, availablePropertyFilter],
  );
  useEffect(() => {
    activeTierLabelRef.current = activeTierLabel;
  }, [activeTierLabel]);

  useEffect(() => {
    if (lastHydrationKeyRef.current === hydrationKey) {
      return;
    }

    lastHydrationKeyRef.current = hydrationKey;
    const nextExistingProperties = cloneExistingProperties(data.existingProperties);

    setExistingProperties(nextExistingProperties);
    setAvailableProperties(cloneAvailableProperties(data.availableProperties));
    setExistingViewMode("properties");
    setActiveTab("favorited");
    setSearchKeyword("");
    setPairingPropertyDialog(null);
    setPairingExistingPropertyDialog(null);
    setConfirmingFavoriteDeleteId(null);
    setIsFavoriteMutationPending(false);
    setPendingDraftMutationKey(null);
    setCurrentPage(1);
    setPairingPoolCounts(createInitialPairingPoolCountsState(
      resolvePairingPoolCountsTier(activeTierLabelRef.current),
    ));
    lastSavedExistingPropertiesRef.current = cloneExistingProperties(nextExistingProperties);
  }, [data, hydrationKey]);

  useEffect(() => {
    latestPoolCountsInputRef.current = {
      existingProperties: cloneExistingProperties(existingProperties),
      period: pairingSearchPeriod,
    };
  }, [existingProperties, pairingSearchPeriod]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(getViewportWidth());
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const tableLayout = useMemo(
    () => getPairingRightPanelTableLayout(viewportWidth),
    [viewportWidth],
  );

  const isDraftStructureMutationPending = pendingDraftMutationKey !== null;
  const availableTableLayout = useMemo(
    () => getPairingRightPanelAvailableTableLayout(viewportWidth, false),
    [viewportWidth],
  );

  const effectiveActiveTab = presentation?.availableTab ?? activeTab;
  const effectiveSearchKeyword = presentation?.searchKeyword ?? deferredSearchKeyword;
  const visibleAvailableProperties = useMemo(() => {
    return filterPairingAvailableProperties(
      availableProperties,
      effectiveActiveTab,
      effectiveSearchKeyword,
      availablePropertyFilter,
    );
  }, [availableProperties, availablePropertyFilter, effectiveActiveTab, effectiveSearchKeyword]);

  const ruleExpressionTiers = useMemo(
    () => buildPairingRuleExpressionTiers(existingProperties),
    [existingProperties],
  );

  const availablePropertiesPage = useMemo(
    () => buildPairingAvailablePropertiesPage(
      visibleAvailableProperties,
      currentPage,
      AVAILABLE_PROPERTIES_PAGE_SIZE,
    ),
    [currentPage, visibleAvailableProperties],
  );
  const totalAvailableItems = availablePropertiesPage.totalItems;
  const totalPages = availablePropertiesPage.totalPages;
  const paginationItems = useMemo(() => buildPairingPaginationItems(currentPage, totalPages), [currentPage, totalPages]);
  const pagedAvailableProperties = availablePropertiesPage.items;
  const renderedAvailableProperties = presentation?.availableOnly
    ? visibleAvailableProperties
    : pagedAvailableProperties;
  const pairingPoolCountRowsByPropertyKey = useMemo(
    () => buildPairingPoolCountRowsByPropertyKey(pairingPoolCounts.response),
    [pairingPoolCounts.response],
  );
  const isPairingPoolRowCountLoading =
    pairingPoolCounts.status === "loading" && pairingPoolCounts.response === null;
  const isPeriodReadOnly = data.draftMeta.currentPeriod?.canEditBid !== true;
  const readOnlyMessage = data.draftMeta.currentPeriod?.readOnlyReason
    ?? `Bidding is not open for ${data.draftMeta.periodCode}.`;
  const draftActionDisabled = isDraftStructureMutationPending || isPeriodReadOnly;
  const pairingPoolCountsSummary = useMemo(
    () => buildPairingPoolCountsSummary(pairingPoolCounts, currentPoolCountsTier),
    [currentPoolCountsTier, pairingPoolCounts],
  );

  useEffect(() => {
    if (currentPage <= totalPages) {
      return;
    }

    setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const markPairingPoolCountsStale = () => {
    poolCountsRequestSeqRef.current += 1;
    setPairingPoolCounts({
      tier: resolvePairingPoolCountsTier(activeTierLabelRef.current),
      status: "stale",
      response: null,
    });
  };

  const refreshPairingPoolCounts = useCallback(async (
    tier: string,
    input: PairingPoolCountsRefreshInput = latestPoolCountsInputRef.current,
    options: { preserveCurrentResponse?: boolean } = {},
  ) => {
    const requestSeq = poolCountsRequestSeqRef.current + 1;
    poolCountsRequestSeqRef.current = requestSeq;
    setPairingPoolCounts((current) => ({
      tier,
      status: "loading",
      response: options.preserveCurrentResponse && current.tier === tier ? current.response : null,
    }));

    try {
      const { existingProperties: latestExistingProperties, period } = input;
      if (!period) {
        throw new Error("A roster period is required to calculate pairing counts.");
      }
      const response = await pairingService.countCurrentRules(tier, latestExistingProperties, period);

      if (poolCountsRequestSeqRef.current !== requestSeq) {
        return;
      }

      setPairingPoolCounts({
        tier: response.tier,
        status: "success",
        response,
      });
    } catch {
      if (poolCountsRequestSeqRef.current !== requestSeq) {
        return;
      }

      setPairingPoolCounts({
        tier,
        status: "error",
        response: null,
        errorMessage: "Unable to calculate pairing counts.",
      });
      message.error("Unable to calculate pairing counts.");
    }
  }, []);

  useEffect(() => {
    if (!hasObservedInitialPoolCountsTierRef.current) {
      hasObservedInitialPoolCountsTierRef.current = true;
      setPairingPoolCounts((current) =>
        current.tier === currentPoolCountsTier
          ? current
          : createInitialPairingPoolCountsState(currentPoolCountsTier),
      );
      return;
    }

    void refreshPairingPoolCounts(currentPoolCountsTier);
  }, [currentPoolCountsTier, refreshPairingPoolCounts]);

  useEffect(() => {
    if (!externalPoolCountsRefreshRequest) {
      return;
    }

    if (handledExternalPoolCountsRefreshSequenceRef.current >= externalPoolCountsRefreshRequest.sequence) {
      return;
    }

    handledExternalPoolCountsRefreshSequenceRef.current = externalPoolCountsRefreshRequest.sequence;
    const refreshInput = {
      existingProperties: cloneExistingProperties(externalPoolCountsRefreshRequest.existingProperties),
      period: externalPoolCountsRefreshRequest.period,
    };

    latestPoolCountsInputRef.current = refreshInput;
    void refreshPairingPoolCounts(
      resolvePairingPoolCountsTier(activeTierLabelRef.current),
      refreshInput,
    );
  }, [externalPoolCountsRefreshRequest, refreshPairingPoolCounts]);

  const syncExistingPropertiesInQueryCache = (nextExistingProperties: PairingExistingProperty[]) => {
    queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) => {
      if (!currentData) {
        return currentData;
      }

      return patchPairingPageExistingProperties(
        currentData,
        cloneExistingProperties(nextExistingProperties),
      );
    });
  };

  const syncDraftIdentityInQueryCache = (
    details: PairingDraftMetaPatch,
  ) => {
    queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) => {
      if (!currentData) {
        return currentData;
      }

      return patchPairingPageDraftMeta(currentData, details);
    });
  };

  const persistExistingPropertiesImmediately = (
    nextExistingProperties: PairingExistingProperty[],
    mutationKey: string,
    persistMutation: PersistExistingPropertiesMutation,
    feedback: PersistExistingPropertiesFeedback = {},
  ) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    if (pendingDraftMutationKey !== null) {
      return;
    }

    const snapshot = cloneExistingProperties(nextExistingProperties);

    setPendingDraftMutationKey(mutationKey);
    void persistMutation(snapshot)
      .then((savedProperties) => {
        const savedSnapshot = cloneExistingProperties(savedProperties ?? snapshot);

        lastSavedExistingPropertiesRef.current = cloneExistingProperties(savedSnapshot);
        lastHydrationKeyRef.current = buildPairingRightPanelHydrationKey(
          getCurrentDraftMeta(),
          savedSnapshot,
          availablePropertyFilter,
        );
        setExistingProperties(cloneExistingProperties(savedSnapshot));
        latestPoolCountsInputRef.current = {
          existingProperties: cloneExistingProperties(savedSnapshot),
          period: pairingSearchPeriod,
        };
        syncExistingPropertiesInQueryCache(savedSnapshot);
        invalidatePairingCalendarQueries();
        const countEffectOnSuccess = feedback.countEffectOnSuccess ?? "stale";
        const activePoolCountsTier = resolvePairingPoolCountsTier(activeTierLabelRef.current);

        if (countEffectOnSuccess === "refresh") {
          void refreshPairingPoolCounts(activePoolCountsTier);
        } else if (countEffectOnSuccess === "refresh-preserve-rows") {
          void refreshPairingPoolCounts(activePoolCountsTier, latestPoolCountsInputRef.current, {
            preserveCurrentResponse: true,
          });
        } else if (countEffectOnSuccess === "stale") {
          markPairingPoolCountsStale();
        }
        feedback.onSuccess?.();
      })
      .catch((error: unknown) => {
        if (isRuleBidDraftConflictError(error)) {
          setShowDraftConflictRecovery(true);
        } else {
          feedback.onError?.(error);
        }
      })
      .finally(() => {
        setPendingDraftMutationKey(null);
      });
  };

  const showPairingRuleConflict = (
    conflict: NonNullable<ReturnType<typeof findPairingPropertyRuleConflict>>,
  ) => {
    message.error(formatPairingRuleConflictMessage(conflict, t));
  };

  const handleExistingTierToggle = (propertyId: string, tierKey: string) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    if (pendingDraftMutationKey !== null) {
      return;
    }

    const property = existingProperties.find((item) => item.id === propertyId);

    if (!property) {
      return;
    }

    const nextTiers = togglePairingTierOptions(property.tiers, tierKey);

    if (arePairingTierOptionsEqual(nextTiers, property.tiers)) {
      return;
    }

    const toggledTier = normalizePairingPoolCountsTierLabel(
      property.tiers.find((tier) => tier.key === tierKey)?.label ?? tierKey,
    );
    const activePoolCountsTier = resolvePairingPoolCountsTier(activeTierLabelRef.current);
    const nextProperty = {
      ...property,
      tiers: nextTiers,
    };
    const conflict = findPairingPropertyRuleConflict(
      removePairingExistingPropertyById(existingProperties, propertyId),
      nextProperty,
    );

    if (conflict) {
      showPairingRuleConflict(conflict);
      return;
    }

    const nextExistingProperties = replacePairingExistingPropertyById(existingProperties, nextProperty);

    persistExistingPropertiesImmediately(
      nextExistingProperties,
      `tier-${propertyId}`,
      async (snapshot) => {
        const result = await runCurrentBidMutation(
          getCurrentDraftMeta(),
          (latestMeta) => pairingService.patchCurrentDraftProperty(propertyId, nextProperty, latestMeta),
        );
        syncDraftIdentityInQueryCache(result);

        return result.deleted
          ? removePairingExistingPropertyById(snapshot, propertyId)
          : undefined;
      },
      {
        countEffectOnSuccess: toggledTier === activePoolCountsTier ? "refresh-preserve-rows" : "preserve",
        onError: () => message.error(t("pairing.message.updatePropertyError")),
        onSuccess: () => message.success(t("pairing.message.updatePropertySuccess")),
      },
    );
  };

  const handleExistingEditRequest = (propertyId: string) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    const property = existingProperties.find((item) => item.id === propertyId);

    if (!property) {
      return;
    }

    setPairingExistingPropertyDialog({ property });
  };
  const requestedExistingPropertyId = presentation?.requestedExistingPropertyId;
  const onRequestedExistingPropertyHandled = presentation?.onRequestedExistingPropertyHandled;

  useEffect(() => {
    const requestedPropertyId = requestedExistingPropertyId;

    if (!requestedPropertyId) {
      handledRequestedExistingPropertyIdRef.current = null;
      return;
    }

    if (handledRequestedExistingPropertyIdRef.current === requestedPropertyId) {
      return;
    }

    if (isPeriodReadOnly) {
      handledRequestedExistingPropertyIdRef.current = requestedPropertyId;
      message.warning(readOnlyMessage);
      onRequestedExistingPropertyHandled?.();
      return;
    }

    const property = existingProperties.find((item) => item.id === requestedPropertyId);

    if (!property) {
      return;
    }

    handledRequestedExistingPropertyIdRef.current = requestedPropertyId;
    setPairingExistingPropertyDialog({ property });
    onRequestedExistingPropertyHandled?.();
  }, [
    existingProperties,
    isPeriodReadOnly,
    onRequestedExistingPropertyHandled,
    readOnlyMessage,
    requestedExistingPropertyId,
  ]);

  const handleExistingPreview = (propertyId: string) => {
    const property = existingProperties.find((item) => item.id === propertyId);

    if (!property) {
      return;
    }

    const searchState: PairingSearchLocationState = {
      previewProperty: buildPairingSearchPreviewProperty(buildPairingAvailablePropertyFromExisting(property)),
      previewSource: {
        type: "existing",
        propertyGroupKey: property.id,
      },
      draftMeta: { ...getCurrentDraftMeta() },
    };

    navigate("/bid/pairing/search", { state: searchState });
  };

  const handleExistingEditConfirm = (draft: PairingAvailableProperty) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    const sourceProperty = pairingExistingPropertyDialog?.property;

    if (!sourceProperty) {
      return;
    }

    const nextProperty = buildPairingExistingPropertyFromDialogDraft(sourceProperty, draft);
    const conflict = findPairingPropertyRuleConflict(
      removePairingExistingPropertyById(existingProperties, sourceProperty.id),
      nextProperty,
    );

    if (conflict) {
      showPairingRuleConflict(conflict);
      return;
    }

    const nextExistingProperties = replacePairingExistingPropertyById(existingProperties, nextProperty);

    persistExistingPropertiesImmediately(
      nextExistingProperties,
      `edit-${sourceProperty.id}`,
      async (snapshot) => {
        const result = await runCurrentBidMutation(
          getCurrentDraftMeta(),
          (latestMeta) => pairingService.patchCurrentDraftProperty(sourceProperty.id, nextProperty, latestMeta),
        );
        syncDraftIdentityInQueryCache(result);

        return result.deleted
          ? removePairingExistingPropertyById(snapshot, sourceProperty.id)
          : undefined;
      },
      {
        onError: () => message.error(t("pairing.message.updatePropertyError")),
        onSuccess: () => {
          setPairingExistingPropertyDialog(null);
          message.success(t("pairing.message.updatePropertySuccess"));
        },
      },
    );
  };

  const handlePropertyDialogAdd = (property: PairingAvailableProperty) => {
    persistAvailablePropertyAdd(property, () => setPairingPropertyDialog(null));
  };

  const handlePropertyDialogSaveFavorite = (property: PairingAvailableProperty) => {
    void saveConfiguredFavoriteImmediately(property);
  };

  const saveConfiguredFavoriteImmediately = async (property: PairingAvailableProperty) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    if (isFavoriteMutationPending) {
      return;
    }

    setIsFavoriteMutationPending(true);

    try {
      const favorite = await runCurrentBidMutation(
        getCurrentDraftMeta(),
        (latestMeta) => pairingService.saveConfiguredFavoriteProperty(property, latestMeta),
      );
      syncDraftIdentityInQueryCache(favorite);
      const nextFavoriteProperty = {
        ...property,
        source: "favorite" as const,
        favoriteKey: favorite.favoriteKey,
        propertyId: favorite.propertyId,
        favorited: true,
        tiers: property.tiers.map((tier) => ({ ...tier, active: false })),
      };

      setAvailableProperties((current) => [
        ...current.filter((item) => item.favoriteKey !== favorite.favoriteKey),
        nextFavoriteProperty,
      ]);
      queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) =>
        currentData ? patchPairingPageConfiguredFavorite(currentData, nextFavoriteProperty) : currentData,
      );
      setPairingPropertyDialog(null);
      message.success(t("pairing.message.saveFavoriteSuccess"));
    } catch (error: unknown) {
      if (isRuleBidDraftConflictError(error)) {
        setShowDraftConflictRecovery(true);
      } else {
        message.error(t("pairing.message.saveFavoriteError"));
      }
    } finally {
      setIsFavoriteMutationPending(false);
    }
  };

  const handleExistingDelete = (propertyId: string) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    const propertyIndex = existingProperties.findIndex((property) => property.id === propertyId);

    if (propertyIndex < 0) {
      return;
    }

    const nextExistingProperties = removePairingExistingPropertyById(existingProperties, propertyId);

    persistExistingPropertiesImmediately(
      nextExistingProperties,
      `delete-${propertyId}`,
      async () => {
        const result = await runCurrentBidMutation(
          getCurrentDraftMeta(),
          (latestMeta) => pairingService.removeCurrentDraftProperty(propertyId, latestMeta),
        );
        syncDraftIdentityInQueryCache(result);
      },
      {
        countEffectOnSuccess: "refresh",
        onError: () => message.error(t("pairing.message.deletePropertyError")),
        onSuccess: () => message.success(t("pairing.message.deletePropertySuccess")),
      },
    );
  };

  const persistAvailablePropertyAdd = (
    property: PairingAvailableProperty,
    onSuccess?: () => void,
  ) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    const nextProperty = cloneExistingPropertyFromAvailable(property, existingProperties.length);
    const conflict = findPairingPropertyRuleConflict(existingProperties, nextProperty);

    if (conflict) {
      showPairingRuleConflict(conflict);
      return;
    }

    const nextExistingProperties = [...existingProperties, nextProperty];

    persistExistingPropertiesImmediately(
      nextExistingProperties,
      `add-${property.id}`,
      async (snapshot) => {
        const result = await runCurrentBidMutation(
          getCurrentDraftMeta(),
          (latestMeta) => pairingService.addCurrentDraftProperty(property, latestMeta),
        );
        syncDraftIdentityInQueryCache(result);

        return buildSavedPairingExistingPropertiesAfterAdd(
          snapshot,
          nextProperty.id,
          result.propertyGroupKey,
        );
      },
      {
        countEffectOnSuccess: "refresh",
        onError: () => message.error(t("pairing.message.addPropertyError")),
        onSuccess: () => {
          if (property.source === "favorite") {
            setAvailableProperties((current) => current.map((item) =>
              item.id === property.id
                ? { ...item, tiers: item.tiers.map((tier) => ({ ...tier, active: false })) }
                : item));
          }
          onSuccess?.();
          message.success(t("pairing.message.addPropertySuccess"));
        },
      },
    );
  };

  const handleAvailableAction = (action: PairingPropertyAction, property: PairingAvailableProperty) => {
    if (action === "preview") {
      const searchState: PairingSearchLocationState = {
        previewProperty: buildPairingSearchPreviewProperty(property),
        previewSource: property.source === "favorite"
          ? {
              type: "favorite",
              favoriteKey: property.favoriteKey ?? "",
            }
          : {
              type: "catalog",
            },
        draftMeta: { ...getCurrentDraftMeta() },
      };

      navigate("/bid/pairing/search", { state: searchState });
      return;
    }

    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    if (property.source === "favorite") {
      if (!property.tiers.some((tier) => tier.active)) {
        message.warning("Select at least one Tx before adding this favorite.");
        return;
      }

      persistAvailablePropertyAdd(property);
      return;
    }

    setPairingPropertyDialog({ property: buildPairingAvailablePropertyForAddDialog(property) });
  };

  const handleFavoriteTierToggle = (propertyId: string, tierKey: string) => {
    const nextAvailableProperties = availableProperties.map((property) =>
      property.id === propertyId && property.source === "favorite"
        ? {
          ...property,
          tiers: property.tiers.map((tier) =>
            tier.key === tierKey ? { ...tier, active: !tier.active } : tier),
        }
        : property);

    setAvailableProperties(nextAvailableProperties);
    queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) =>
      currentData
        ? patchPairingPageAvailableProperties(currentData, nextAvailableProperties)
        : currentData);
  };

  const handleFavoriteDeleteRequest = (propertyId: string) => {
    setConfirmingFavoriteDeleteId(propertyId);
  };

  const handleFavoriteEditRequest = (propertyId: string) => {
    const property = availableProperties.find((item) => item.id === propertyId && item.source === "favorite");

    if (!property?.favoriteKey || isFavoriteMutationPending) {
      return;
    }

    setPairingFavoriteDialog({ property });
  };

  const handleFavoriteEditConfirm = (draft: PairingAvailableProperty) => {
    const original = pairingFavoriteDialog?.property;

    if (!original?.favoriteKey || isFavoriteMutationPending) {
      return;
    }

    setIsFavoriteMutationPending(true);
    void runCurrentBidMutation(
      getCurrentDraftMeta(),
      (latestMeta) => pairingService.patchFavoriteProperty(original.favoriteKey!, draft, latestMeta),
    )
      .then((response) => {
        syncDraftIdentityInQueryCache(response);
        const updatedFavorite: PairingAvailableProperty = {
          ...original,
          ...draft,
          favoriteKey: original.favoriteKey,
          propertyId: original.propertyId,
          propertyCode: original.propertyCode,
          source: "favorite",
          favorited: true,
          tiers: original.tiers,
        };

        setAvailableProperties((current) => current.map((item) =>
          item.favoriteKey === original.favoriteKey ? updatedFavorite : item));
        queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) =>
          currentData
            ? patchPairingPageConfiguredFavoriteByKey(
                patchPairingPageDraftMeta(currentData, response),
                updatedFavorite,
              )
            : currentData);
        setPairingFavoriteDialog(null);
        message.success("Favorite updated.");
      })
      .catch((error: unknown) => {
        if (isRuleBidMissingFavoriteError(error)) {
          setPairingFavoriteDialog(null);
          setMissingFavoriteKey(original.favoriteKey!);
        } else if (isRuleBidDraftConflictError(error)) {
          setShowDraftConflictRecovery(true);
        } else {
          message.error("Unable to update the favorite.");
        }
      })
      .finally(() => {
        setIsFavoriteMutationPending(false);
      });
  };

  const handleFavoriteDeleteCancel = () => {
    setConfirmingFavoriteDeleteId(null);
  };

  const handleFavoriteDeleteConfirm = (propertyId: string) => {
    if (isPeriodReadOnly) {
      message.warning(readOnlyMessage);
      return;
    }

    const property = availableProperties.find((item) => item.id === propertyId);

    if (!property?.favoriteKey) {
      message.error(t("pairing.message.removeFavoriteError"));
      return;
    }

    if (isFavoriteMutationPending) {
      return;
    }

    setIsFavoriteMutationPending(true);
    void runCurrentBidMutation(
      getCurrentDraftMeta(),
      (latestMeta) => pairingService.unfavoriteProperty(property.favoriteKey!, latestMeta),
    )
      .then((result) => {
        syncDraftIdentityInQueryCache(result);
        const nextAvailableProperties = availableProperties.filter((item) =>
          item.favoriteKey !== property.favoriteKey);

        setAvailableProperties(nextAvailableProperties);
        queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) =>
          currentData
            ? patchPairingPageUnfavoriteByKey(
                patchPairingPageDraftMeta(currentData, result),
                property.favoriteKey!,
              )
            : currentData,
        );
        setConfirmingFavoriteDeleteId(null);
        message.success(t("pairing.message.removeFavoriteSuccess"));
      })
      .catch((error: unknown) => {
        if (isRuleBidDraftConflictError(error)) {
          setShowDraftConflictRecovery(true);
        } else {
          message.error(t("pairing.message.removeFavoriteError"));
        }
      })
      .finally(() => {
        setIsFavoriteMutationPending(false);
      });
  };

  const goToPage = (nextPage: number) => {
    const normalizedPage = clampPairingPage(nextPage, totalPages);
    setCurrentPage(normalizedPage);
  };

  const handleAvailableTabChange = (tab: "all" | "favorited") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleAvailableSearchKeywordChange = (value: string) => {
    setSearchKeyword(value);
    setCurrentPage(1);
  };

  const handleSearchCurrentRules = () => {
    const activeTierLabels = getActivePairingTierLabels(existingProperties);

    if (activeTierLabels.length === 0) {
      message.error(t("pairing.message.searchRulesEmpty"));
      return;
    }

    const initialTier = activeTierLabels.includes(activeTierLabel)
      ? activeTierLabel
      : activeTierLabels[0];
    const searchState: PairingSearchLocationState = {
      previewMode: "current-rules",
      initialTier,
      existingProperties: cloneExistingProperties(existingProperties),
      draftMeta: { ...getCurrentDraftMeta() },
    };

    navigate("/bid/pairing/search", { state: searchState });
  };

  const handleAllPairingsSearch = () => {
    const searchState: PairingSearchLocationState = {
      previewMode: "all-pairings",
      draftMeta: { ...getCurrentDraftMeta() },
    };

    navigate("/bid/pairing/search", { state: searchState });
  };

  const availableSection = (
    <PairingAvailablePropertiesSection
      actionDisabled={draftActionDisabled}
      activeTab={effectiveActiveTab}
      allPairingsLabel="ALL PAIRINGS"
      allPropertiesLabel={data.allPropertiesLabel}
      confirmingFavoriteDeleteId={confirmingFavoriteDeleteId}
      currentPage={currentPage}
      favoritedPropertiesLabel={data.favoritedPropertiesLabel}
      hideChrome={presentation?.availableOnly}
      hidePagination={presentation?.availableOnly}
      isFavoriteMutationPending={isFavoriteMutationPending || isPeriodReadOnly}
      layout={availableTableLayout}
      pageSize={AVAILABLE_PROPERTIES_PAGE_SIZE}
      pagedProperties={renderedAvailableProperties}
      paginationItems={paginationItems}
      searchKeyword={presentation?.searchKeyword ?? searchKeyword}
      searchPlaceholder={data.searchPlaceholder}
      sectionTitle={data.addSectionTitle}
      totalItems={totalAvailableItems}
      totalPages={totalPages}
      onAction={handleAvailableAction}
      onEditFavorite={handleFavoriteEditRequest}
      onAllPairings={handleAllPairingsSearch}
      onFavoriteDeleteCancel={handleFavoriteDeleteCancel}
      onFavoriteDeleteConfirm={handleFavoriteDeleteConfirm}
      onFavoriteDeleteRequest={handleFavoriteDeleteRequest}
      onFavoriteTierToggle={handleFavoriteTierToggle}
      onPageChange={goToPage}
      onSearchKeywordChange={handleAvailableSearchKeywordChange}
      onTabChange={handleAvailableTabChange}
    />
  );
  const propertyDialogs = (
    <>
      {pairingPropertyDialog ? (
        <PairingPropertyConfigDialog
          favoriteLabel={t("pairing.dialog.saveFavorite")}
          isFavoritePending={isFavoriteMutationPending}
          isOpen
          isPending={isDraftStructureMutationPending}
          pairingNumberPeriodCode={data.draftMeta.periodCode}
          pairingSearchPeriod={pairingSearchPeriod}
          periodEndDate={data.draftMeta.currentPeriod?.rpEndLocal ?? ""}
          periodStartDate={data.draftMeta.currentPeriod?.rpStartLocal ?? ""}
          property={pairingPropertyDialog.property}
          confirmPendingLabel={t("pairing.dialog.addingBid")}
          requireExplicitSelections
          onCancel={() => setPairingPropertyDialog(null)}
          onConfirm={handlePropertyDialogAdd}
          onSaveFavorite={handlePropertyDialogSaveFavorite}
        />
      ) : null}
      {pairingExistingPropertyDialog ? (
        <PairingPropertyConfigDialog
          confirmLabel={t("pairing.dialog.updateBid")}
          confirmPendingLabel={t("pairing.dialog.updatingBid")}
          isOpen
          isPending={isDraftStructureMutationPending}
          pairingNumberPeriodCode={data.draftMeta.periodCode}
          pairingSearchPeriod={pairingSearchPeriod}
          periodEndDate={data.draftMeta.currentPeriod?.rpEndLocal ?? ""}
          periodStartDate={data.draftMeta.currentPeriod?.rpStartLocal ?? ""}
          property={buildPairingAvailablePropertyFromExisting(pairingExistingPropertyDialog.property)}
          onCancel={() => setPairingExistingPropertyDialog(null)}
          onConfirm={handleExistingEditConfirm}
        />
      ) : null}
      {pairingFavoriteDialog ? (
        <PairingPropertyConfigDialog
          confirmSavesFavorite
          confirmLabel="UPDATE FAVORITE"
          confirmPendingLabel="UPDATING..."
          hideTiers
          isOpen
          isPending={isFavoriteMutationPending}
          pairingNumberPeriodCode={data.draftMeta.periodCode}
          pairingSearchPeriod={pairingSearchPeriod}
          periodEndDate={data.draftMeta.currentPeriod?.rpEndLocal ?? ""}
          periodStartDate={data.draftMeta.currentPeriod?.rpStartLocal ?? ""}
          property={pairingFavoriteDialog.property}
          requireTierSelection={false}
          onCancel={() => setPairingFavoriteDialog(null)}
          onConfirm={handleFavoriteEditConfirm}
        />
      ) : null}
    </>
  );
  const pairingToolbar = (
    <PairingPoolCountsToolbar
      additionalActions={presentation?.toolbarActions}
      isSearchDisabled={isDraftStructureMutationPending}
      pairingPoolCountsStatus={pairingPoolCounts.status}
      searchLabel={data.searchButtonLabel}
      summary={pairingPoolCountsSummary}
      toggleViewLabel={t("pairing.rules.viewRules")}
      onRefresh={() => {
        void refreshPairingPoolCounts(currentPoolCountsTier);
      }}
      onSearch={handleSearchCurrentRules}
      onToggleView={() => setExistingViewMode("rules")}
    />
  );
  const rulesDialog = existingViewMode === "rules" ? (
    <PbsDialogFrame
      ariaLabel={t("pairing.rules.viewRules")}
      bodyClassName="mt-5 max-h-[min(65vh,620px)] overflow-y-auto"
      panelClassName="w-[min(860px,calc(100vw-32px))]"
      portalToBody
      header={(
        <div className="flex items-center gap-4">
          <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">
            {t("pairing.rules.viewRules")}
          </p>
          <button
            aria-label="Close pairing rules"
            className="ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[#6f7485] hover:bg-[#f0f1f5] hover:text-[#4d4f5c]"
            type="button"
            onClick={() => setExistingViewMode("properties")}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      onClose={() => setExistingViewMode("properties")}
    >
      <PairingRuleExpressionView
        emptyLabel={t("pairing.rules.empty")}
        tiers={ruleExpressionTiers}
      />
    </PbsDialogFrame>
  ) : null;
  const favoriteMissingRecovery = missingFavoriteKey ? (
    <FavoriteMissingRecoveryAlert
      onClose={() => setMissingFavoriteKey(null)}
      onReload={() => {
        const favoriteKey = missingFavoriteKey;
        setAvailableProperties((current) =>
          current.filter((property) => property.favoriteKey !== favoriteKey));
        queryClient.setQueryData(pairingPageDataQueryKey, (currentData: PairingPageData | undefined) =>
          currentData
            ? patchPairingPageUnfavoriteByKey(currentData, favoriteKey)
            : currentData);
        setMissingFavoriteKey(null);
        void queryClient.invalidateQueries({ queryKey: pairingPageDataQueryKey });
      }}
    />
  ) : null;

  if (presentation?.availableOnly) {
    return (
      <>
        {favoriteMissingRecovery}
        {availableSection}
        {propertyDialogs}
      </>
    );
  }

  if (presentation?.toolbarOnly) {
    return (
      <>
        {pairingToolbar}
        {rulesDialog}
      </>
    );
  }

  return (
    <section
      className="flex min-h-full flex-col overflow-hidden rounded-3xl bg-white px-6 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
      data-uiid="pairing-right-panel"
    >
      <PanelStripHeader title={data.existingTitle} />

      {pairingToolbar}

      {showDraftConflictRecovery ? (
        <DraftConflictRecoveryAlert
          onReload={() => {
            setShowDraftConflictRecovery(false);
            void queryClient.invalidateQueries({ queryKey: pairingPageDataQueryKey });
          }}
        />
      ) : null}

      {favoriteMissingRecovery}

      <PairingExistingPropertiesSection
        emptyRulesLabel={t("pairing.rules.empty")}
        existingProperties={existingProperties}
        isDraftStructureMutationPending={draftActionDisabled}
        isPoolRowCountLoading={isPairingPoolRowCountLoading}
        layout={tableLayout}
        poolCountRowsByPropertyKey={pairingPoolCountRowsByPropertyKey}
        ruleExpressionTiers={ruleExpressionTiers}
        viewMode="properties"
        onDelete={handleExistingDelete}
        onEdit={handleExistingEditRequest}
        onPreview={handleExistingPreview}
        onTierToggle={handleExistingTierToggle}
      />

      {availableSection}
      {propertyDialogs}
      {rulesDialog}
    </section>
  );
};
