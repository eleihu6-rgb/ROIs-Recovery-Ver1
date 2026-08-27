import { message } from "@rois/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PanelStripHeader } from "@/shared/components/panel";
import { useI18n } from "@/shared/i18n";
import type { PairingBidValue } from "@/features/pairing/types";
import {
  RuleBidAddShortcut,
  RuleBidAvailablePropertiesSection,
  RuleBidExistingPropertiesSection,
} from "@/features/rule-bids/components/rule-bid-right-panel-sections";
import {
  type RuleBidModifierPatch,
} from "@/features/rule-bids/components/rule-bid-property-table";
import { FavoriteMissingRecoveryAlert } from "@/features/rule-bids/components/favorite-missing-recovery-alert";
import type {
  RuleBidAvailableProperty,
  RuleBidConfiguredFavoriteProperty,
  RuleBidExistingProperty,
  RuleBidPageData,
  RuleBidRightPanelData,
} from "@/features/rule-bids/types";
import {
  applyRuleBidAvailablePropertyUnfavoriteByKey,
  applyRuleBidConfiguredFavorite,
} from "@/features/rule-bids/rule-bid-page-cache";
import {
  getRuleBidRightPanelAvailableTableLayout,
  getRuleBidRightPanelTableLayout,
} from "@/features/rule-bids/rule-bid-right-panel-layout";
import {
  areRuleBidExistingPropertiesEqual,
  buildRuleBidAvailablePropertiesPage,
  buildRuleBidAvailableCategoryFilters,
  buildRuleBidHydrationKey,
  buildRuleBidPaginationItems,
  buildRuleBidExistingPropertyFromAvailable,
  buildRuleBidSavedExistingPropertiesAfterAdd,
  buildRuleBidViewResetKey,
  clampRuleBidPage,
  cloneRuleBidAvailableProperties,
  cloneRuleBidExistingProperties,
  filterRuleBidAvailableProperties,
  findRuleBidExistingPropertyTierMerge,
  getRuleBidSaveErrorMessage,
  hasDuplicateRuleBidExistingProperty,
  removeRuleBidExistingPropertyById,
  RULE_BID_ALL_CATEGORY_KEY,
  updateRuleBidExistingPropertyBid,
  updateRuleBidExistingPropertyTier,
  updateRuleBidExistingPropertyModifiers,
  type RuleBidAvailablePropertyTab,
} from "@/features/rule-bids/utils";
import {
  isRuleBidDraftConflictError,
  isRuleBidMissingFavoriteError,
} from "@/features/rule-bids/rule-bid-errors";
import { daysOffPageDataQueryKey } from "@/features/days-off/hooks/use-days-off-page-data";
import { linePageDataQueryKey } from "@/features/line/hooks/use-line-page-data";
import { queryClient } from "@/shared/query/query-client";
import { cn } from "@/shared/lib/cn";

export type RuleBidRightPanelPresentation = {
  availableOnly?: boolean;
  availableTab?: RuleBidAvailablePropertyTab;
  requestedExistingPropertyId?: string | null;
  searchKeyword?: string;
  onRequestedExistingPropertyHandled?: () => void;
};

type RuleBidDraftMutationResult = Partial<RuleBidRightPanelData["draftMeta"]> & {
  onCommitted?: () => void;
};

type RuleBidRightPanelProps = {
  data: RuleBidRightPanelData;
  presentation?: RuleBidRightPanelPresentation;
  availableCategoryFilterVariant?: "chips" | "bid-tabs";
  existingBidEditMode?: "inline" | "dialog";
  existingListVariant?: "card" | "bid-list";
  hideAvailablePropertiesSection?: boolean;
  showAddShortcut?: boolean;
  showFavoritePropertiesTab?: boolean;
  viewportBound?: boolean;
  mergeSamePropertyTiersOnAdd?: boolean;
  existingEmptyMessage?: string;
  filterExistingProperties?: (
    properties: RuleBidExistingProperty[],
  ) => RuleBidExistingProperty[];
  shouldShowAvailableFavoriteDeleteAction?: (
    property: RuleBidAvailableProperty,
    activeTab: RuleBidAvailablePropertyTab,
  ) => boolean;
  shouldShowExistingEditAction?: (property: RuleBidExistingProperty) => boolean;
  renderExistingBidSummary?: (property: RuleBidExistingProperty) => ReactNode;
  renderExistingToolbar?: () => ReactNode;
  shouldReplaceExistingPropertyNameWithSummary?: (
    property: RuleBidExistingProperty,
  ) => boolean;
  renderTopContent?: () => ReactNode;
  renderExistingPropertyEditDialog?: (props: {
    isOpen: boolean;
    isPending: boolean;
    property: RuleBidExistingProperty;
    onCancel: () => void;
    onConfirm: (property: RuleBidExistingProperty) => void;
    onRemove: () => void;
  }) => ReactNode;
  renderAvailablePropertyAddDialog?: (props: {
    isFavoriteEdit?: boolean;
    isOpen: boolean;
    isPending: boolean;
    isFavoritePending?: boolean;
    property: RuleBidAvailableProperty;
    onCancel: () => void;
    onConfirm: (property: RuleBidAvailableProperty) => void;
    onSaveFavorite?: (property: RuleBidAvailableProperty) => void;
  }) => ReactNode;
  shouldConfigureAvailableProperty?: (
    property: RuleBidAvailableProperty,
    action: "add" | "favorite",
  ) => boolean;
  validateExistingProperties?: (existingProperties: RuleBidExistingProperty[]) => string[];
  getInformationalMessages?: (existingProperties: RuleBidExistingProperty[]) => string[];
  onSave?: (
    existingProperties: RuleBidExistingProperty[],
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => Promise<RuleBidDraftMutationResult | void>;
  onAddProperty?: (
    property: RuleBidAvailableProperty,
    draftMeta: RuleBidRightPanelData["draftMeta"],
    nextProperty: RuleBidExistingProperty,
  ) => Promise<RuleBidDraftMutationResult & { propertyGroupKey: string; rowSeq: number }>;
  onDeleteProperty?: (
    propertyGroupKey: string,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => Promise<RuleBidDraftMutationResult | void>;
  onUpdateProperty?: (
    propertyGroupKey: string,
    property: RuleBidExistingProperty,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => Promise<RuleBidDraftMutationResult | void>;
  onUnfavoriteProperty?: (
    favoriteKey: string,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => Promise<Partial<RuleBidRightPanelData["draftMeta"]> | void>;
  onSaveFavoriteProperty?: (
    property: RuleBidAvailableProperty,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => Promise<Partial<RuleBidRightPanelData["draftMeta"]> & RuleBidConfiguredFavoriteProperty>;
  onUpdateFavoriteProperty?: (
    favoriteKey: string,
    property: RuleBidAvailableProperty,
    draftMeta: RuleBidRightPanelData["draftMeta"],
  ) => Promise<Partial<RuleBidRightPanelData["draftMeta"]> & RuleBidConfiguredFavoriteProperty>;
  onReloadDraft?: () => void;
};

const getViewportWidth = () => window.innerWidth;
const DEFAULT_ACTIVE_TAB = "favorited" as const;
const AVAILABLE_PROPERTIES_PAGE_SIZE = 10;

type DraftMutationToken = {
  generation: number;
  viewResetKey: string;
};

export const RuleBidRightPanel = ({
  data,
  presentation,
  availableCategoryFilterVariant = "chips",
  existingBidEditMode = "inline",
  existingListVariant = "card",
  hideAvailablePropertiesSection = false,
  showAddShortcut = true,
  showFavoritePropertiesTab = true,
  viewportBound = false,
  mergeSamePropertyTiersOnAdd = false,
  existingEmptyMessage,
  filterExistingProperties,
  shouldShowAvailableFavoriteDeleteAction,
  shouldShowExistingEditAction,
  renderExistingBidSummary,
  renderExistingToolbar,
  shouldReplaceExistingPropertyNameWithSummary,
  renderTopContent,
  renderExistingPropertyEditDialog,
  renderAvailablePropertyAddDialog,
  shouldConfigureAvailableProperty,
  validateExistingProperties,
  getInformationalMessages,
  onSave,
  onAddProperty,
  onDeleteProperty,
  onUpdateProperty,
  onUnfavoriteProperty,
  onSaveFavoriteProperty,
  onUpdateFavoriteProperty,
  onReloadDraft,
}: RuleBidRightPanelProps) => {
  const { t } = useI18n();
  const [existingProperties, setExistingProperties] = useState<RuleBidExistingProperty[]>(() =>
    cloneRuleBidExistingProperties(data.existingProperties),
  );
  const [availableProperties, setAvailableProperties] = useState<RuleBidAvailableProperty[]>(() =>
    cloneRuleBidAvailableProperties(data.availableProperties),
  );
  const [activeTab, setActiveTab] = useState<RuleBidAvailablePropertyTab>(
    showFavoritePropertiesTab ? DEFAULT_ACTIVE_TAB : "all",
  );
  const [activeCategoryKey, setActiveCategoryKey] = useState(RULE_BID_ALL_CATEGORY_KEY);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [showDraftConflictRecovery, setShowDraftConflictRecovery] = useState(false);
  const [missingFavoriteKey, setMissingFavoriteKey] = useState<string | null>(null);
  const [editingExistingPropertyId, setEditingExistingPropertyId] = useState<string | null>(null);
  const [configuringExistingPropertyId, setConfiguringExistingPropertyId] = useState<string | null>(null);
  const [configuringExistingPropertyDraft, setConfiguringExistingPropertyDraft] =
    useState<RuleBidExistingProperty | null>(null);
  const [configuringAvailablePropertyId, setConfiguringAvailablePropertyId] = useState<string | null>(null);
  const [configuringFavoritePropertyId, setConfiguringFavoritePropertyId] = useState<string | null>(null);
  const [confirmingFavoriteDeleteId, setConfirmingFavoriteDeleteId] = useState<string | null>(null);
  const [isFavoriteMutationPending, setIsFavoriteMutationPending] = useState(false);
  const [pendingDraftMutationKey, setPendingDraftMutationKey] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => getViewportWidth());
  const hasHydratedRef = useRef(false);
  const lastSavedExistingPropertiesRef = useRef(cloneRuleBidExistingProperties(data.existingProperties));
  const lastHydrationKeyRef = useRef("");
  const lastViewResetKeyRef = useRef("");
  const pendingDraftMutationKeyRef = useRef<string | null>(null);
  const draftMutationGenerationRef = useRef(0);
  const handledRequestedExistingPropertyIdRef = useRef<string | null>(null);
  const hydrationKey = useMemo(() => buildRuleBidHydrationKey(data), [data]);
  const viewResetKey = useMemo(() => buildRuleBidViewResetKey(data), [data]);
  const currentViewResetKeyRef = useRef(viewResetKey);
  currentViewResetKeyRef.current = viewResetKey;
  const showModifiers = data.showModifiers === true;
  const isPeriodReadOnly = data.draftMeta.currentPeriod?.canEditBid !== true;
  const readOnlyMessage = data.draftMeta.currentPeriod?.readOnlyReason
    ?? `Bidding is not open for ${data.draftMeta.periodCode}.`;
  const validationErrors = useMemo(
    () => validateExistingProperties?.(existingProperties) ?? [],
    [existingProperties, validateExistingProperties],
  );
  const informationalMessages = useMemo(
    () => getInformationalMessages?.(existingProperties) ?? [],
    [existingProperties, getInformationalMessages],
  );
  const visibleExistingProperties = useMemo(
    () => filterExistingProperties?.(existingProperties) ?? existingProperties,
    [existingProperties, filterExistingProperties],
  );
  const isDraftStructureMutationPending = pendingDraftMutationKey !== null;
  const draftActionDisabled = isDraftStructureMutationPending || isPeriodReadOnly;

  const handleDraftMutationError = (error: unknown, fallbackMessage?: string) => {
    if (isRuleBidDraftConflictError(error)) {
      setSaveErrorMessage(null);
      setShowDraftConflictRecovery(true);
      return;
    }

    message.error(fallbackMessage ?? getRuleBidSaveErrorMessage(error));
  };

  const reloadDraft = () => {
    setShowDraftConflictRecovery(false);

    if (onReloadDraft) {
      onReloadDraft();
      return;
    }

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: daysOffPageDataQueryKey }),
      queryClient.invalidateQueries({ queryKey: linePageDataQueryKey }),
    ]);
  };

  const showReadOnlyMessage = useCallback(() => {
    message.warning(readOnlyMessage);
  }, [readOnlyMessage]);

  const updatePendingDraftMutationKey = useCallback((key: string | null) => {
    pendingDraftMutationKeyRef.current = key;
    setPendingDraftMutationKey(key);
  }, []);

  const beginDraftMutation = useCallback((key: string): DraftMutationToken => {
    draftMutationGenerationRef.current += 1;
    const token = {
      generation: draftMutationGenerationRef.current,
      viewResetKey: currentViewResetKeyRef.current,
    };

    updatePendingDraftMutationKey(key);
    return token;
  }, [updatePendingDraftMutationKey]);

  const isCurrentDraftMutation = useCallback((token: DraftMutationToken) =>
    token.generation === draftMutationGenerationRef.current
    && token.viewResetKey === currentViewResetKeyRef.current, []);

  const finishDraftMutation = useCallback((token: DraftMutationToken) => {
    if (isCurrentDraftMutation(token)) {
      updatePendingDraftMutationKey(null);
    }
  }, [isCurrentDraftMutation, updatePendingDraftMutationKey]);

  useEffect(() => {
    if (lastHydrationKeyRef.current === hydrationKey) {
      return;
    }

    const shouldResetViewState = lastViewResetKeyRef.current !== viewResetKey;

    if (pendingDraftMutationKeyRef.current !== null && !shouldResetViewState) {
      return;
    }

    if (shouldResetViewState && pendingDraftMutationKeyRef.current !== null) {
      draftMutationGenerationRef.current += 1;
    }

    lastHydrationKeyRef.current = hydrationKey;
    lastViewResetKeyRef.current = viewResetKey;
    const nextExistingProperties = cloneRuleBidExistingProperties(data.existingProperties);

    setExistingProperties(nextExistingProperties);
    setAvailableProperties(cloneRuleBidAvailableProperties(data.availableProperties));
    setSaveErrorMessage(null);

    if (shouldResetViewState) {
      setActiveTab(showFavoritePropertiesTab ? DEFAULT_ACTIVE_TAB : "all");
      setActiveCategoryKey(RULE_BID_ALL_CATEGORY_KEY);
      setSearchKeyword("");
      setCurrentPage(1);
      setEditingExistingPropertyId(null);
      setConfiguringExistingPropertyId(null);
      setConfiguringExistingPropertyDraft(null);
      setConfiguringAvailablePropertyId(null);
      setIsFavoriteMutationPending(false);
      updatePendingDraftMutationKey(null);
    }

    hasHydratedRef.current = false;
    lastSavedExistingPropertiesRef.current = cloneRuleBidExistingProperties(nextExistingProperties);
  }, [
    data,
    hydrationKey,
    pendingDraftMutationKey,
    showFavoritePropertiesTab,
    updatePendingDraftMutationKey,
    viewResetKey,
  ]);

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

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    if (onUpdateProperty) {
      return;
    }

    if (!onSave) {
      return;
    }

    if (isPeriodReadOnly) {
      return;
    }

    if (areRuleBidExistingPropertiesEqual(existingProperties, lastSavedExistingPropertiesRef.current)) {
      return;
    }

    setSaveErrorMessage(null);

    if (validationErrors.length > 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const snapshot = cloneRuleBidExistingProperties(existingProperties);

      void onSave(snapshot, data.draftMeta)
        .then(() => {
          lastSavedExistingPropertiesRef.current = cloneRuleBidExistingProperties(snapshot);
          setSaveErrorMessage(null);
        })
        .catch((error: unknown) => {
          setSaveErrorMessage(getRuleBidSaveErrorMessage(error));
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [data.draftMeta, existingProperties, isPeriodReadOnly, onSave, onUpdateProperty, validationErrors]);

  const tableLayout = useMemo(
    () => getRuleBidRightPanelTableLayout(viewportWidth),
    [viewportWidth],
  );
  const availableTableLayout = useMemo(
    () => getRuleBidRightPanelAvailableTableLayout(viewportWidth, false),
    [viewportWidth],
  );

  const effectiveActiveTab = presentation?.availableTab ?? activeTab;
  const effectiveSearchKeyword = presentation?.searchKeyword ?? searchKeyword;
  const availableCategoryFilters = useMemo(
    () => buildRuleBidAvailableCategoryFilters(availableProperties, effectiveActiveTab),
    [availableProperties, effectiveActiveTab],
  );
  const effectiveCategoryKey = availableCategoryFilters.some((filter) => filter.key === activeCategoryKey)
    ? activeCategoryKey
    : RULE_BID_ALL_CATEGORY_KEY;
  const visibleAvailableProperties = useMemo(() => {
    return filterRuleBidAvailableProperties(
      availableProperties,
      effectiveActiveTab,
      effectiveSearchKeyword,
      effectiveCategoryKey,
    );
  }, [availableProperties, effectiveActiveTab, effectiveCategoryKey, effectiveSearchKeyword]);
  const availablePropertiesPage = useMemo(
    () => buildRuleBidAvailablePropertiesPage(
      visibleAvailableProperties,
      currentPage,
      AVAILABLE_PROPERTIES_PAGE_SIZE,
    ),
    [currentPage, visibleAvailableProperties],
  );
  const totalAvailableItems = availablePropertiesPage.totalItems;
  const totalPages = availablePropertiesPage.totalPages;
  const paginationItems = useMemo(
    () => buildRuleBidPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const pagedAvailableProperties = availablePropertiesPage.items;
  const renderedAvailableProperties = presentation?.availableOnly
    ? visibleAvailableProperties
    : pagedAvailableProperties;

  useEffect(() => {
    if (currentPage <= totalPages) {
      return;
    }

    setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const goToPage = (nextPage: number) => {
    const normalizedPage = clampRuleBidPage(nextPage, totalPages);
    setCurrentPage(normalizedPage);
  };

  const handleAvailableTabChange = (tab: RuleBidAvailablePropertyTab) => {
    setActiveTab(tab);
    setConfirmingFavoriteDeleteId(null);
    setCurrentPage(1);
  };

  const handleAvailableCategoryChange = (categoryKey: string) => {
    setActiveCategoryKey(categoryKey);
    setConfirmingFavoriteDeleteId(null);
    setCurrentPage(1);
  };

  const handleAvailableSearchKeywordChange = (value: string) => {
    setSearchKeyword(value);
    setCurrentPage(1);
  };

  const persistExistingPropertyUpdate = (
    propertyId: string,
  nextProperty: RuleBidExistingProperty,
  nextExistingProperties: RuleBidExistingProperty[],
  onSuccess?: () => void,
  ) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    const sourceProperty = existingProperties.find((property) => property.id === propertyId);
    const isCrossContextUpdate = Boolean(
      sourceProperty?.sourceContext
      && nextProperty.sourceContext
      && sourceProperty.sourceContext !== nextProperty.sourceContext,
    );

    if (!isCrossContextUpdate && hasDuplicateRuleBidExistingProperty(
      nextExistingProperties.filter((property) => property.id !== propertyId),
      nextProperty,
    )) {
      setSaveErrorMessage(null);
      message.warning("This property already exists.");
      return;
    }

    if (!onUpdateProperty) {
      setExistingProperties(nextExistingProperties);
      onSuccess?.();
      return;
    }

    if (pendingDraftMutationKeyRef.current !== null) {
      return;
    }

    const nextValidationErrors = isCrossContextUpdate
      ? []
      : validateExistingProperties?.(nextExistingProperties) ?? [];

    if (nextValidationErrors.length > 0) {
      setSaveErrorMessage(null);
      message.error(nextValidationErrors.join(" "));
      return;
    }

    const rollbackSnapshot = cloneRuleBidExistingProperties(lastSavedExistingPropertiesRef.current);
    const savedSnapshot = cloneRuleBidExistingProperties(nextExistingProperties);
    const mutationToken = beginDraftMutation(`update-${propertyId}`);

    if (configuringExistingPropertyId === propertyId) {
      setConfiguringExistingPropertyDraft(
        cloneRuleBidExistingProperties([nextProperty])[0] ?? null,
      );
    }
    setExistingProperties(savedSnapshot);
    void onUpdateProperty(propertyId, nextProperty, data.draftMeta)
      .then((result) => {
        if (!isCurrentDraftMutation(mutationToken)) {
          return;
        }

        lastSavedExistingPropertiesRef.current = cloneRuleBidExistingProperties(savedSnapshot);
        setSaveErrorMessage(null);
        onSuccess?.();
        result?.onCommitted?.();
        message.success("Property updated.");
      })
      .catch((error: unknown) => {
        if (!isCurrentDraftMutation(mutationToken)) {
          return;
        }

        setExistingProperties(rollbackSnapshot);
        handleDraftMutationError(error);
      })
      .finally(() => {
        finishDraftMutation(mutationToken);
      });
  };

  const updateExistingProperty = (
    propertyId: string,
    nextProperty: RuleBidExistingProperty,
    onSuccess?: () => void,
  ) => {
    const nextExistingProperties = existingProperties.map((property) =>
      property.id === propertyId ? nextProperty : property);

    persistExistingPropertyUpdate(propertyId, nextProperty, nextExistingProperties, onSuccess);
  };

  const handleExistingBidChange = (propertyId: string, bid: PairingBidValue) => {
    const nextExistingProperties = updateRuleBidExistingPropertyBid(existingProperties, propertyId, bid);
    const nextProperty = nextExistingProperties.find((property) => property.id === propertyId);

    if (!nextProperty) {
      return;
    }

    persistExistingPropertyUpdate(propertyId, nextProperty, nextExistingProperties);
  };

  const handleExistingTierToggle = (propertyId: string, tierKey: string) => {
    const nextExistingProperties = updateRuleBidExistingPropertyTier(existingProperties, propertyId, tierKey);
    const nextProperty = nextExistingProperties.find((property) => property.id === propertyId);

    if (!nextProperty) {
      return;
    }

    persistExistingPropertyUpdate(propertyId, nextProperty, nextExistingProperties);
  };

  const handleExistingModifierChange = (propertyId: string, patch: RuleBidModifierPatch) => {
    const nextExistingProperties = updateRuleBidExistingPropertyModifiers(existingProperties, propertyId, patch);
    const nextProperty = nextExistingProperties.find((property) => property.id === propertyId);

    if (!nextProperty) {
      return;
    }

    persistExistingPropertyUpdate(propertyId, nextProperty, nextExistingProperties);
  };

  const closeConfiguringExistingProperty = () => {
    setConfiguringExistingPropertyId(null);
    setConfiguringExistingPropertyDraft(null);
  };

  const toggleExistingPropertyEditor = (propertyId: string) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    if (renderExistingPropertyEditDialog) {
      if (configuringExistingPropertyId === propertyId) {
        closeConfiguringExistingProperty();
      } else {
        setConfiguringExistingPropertyDraft(null);
        setConfiguringExistingPropertyId(propertyId);
      }
      return;
    }

    setEditingExistingPropertyId((current) => (current === propertyId ? null : propertyId));
  };
  const requestedExistingPropertyId = presentation?.requestedExistingPropertyId;
  const onRequestedExistingPropertyHandled = presentation?.onRequestedExistingPropertyHandled;

  useEffect(() => {
    const requestedPropertyId = requestedExistingPropertyId;

    if (!requestedPropertyId) {
      handledRequestedExistingPropertyIdRef.current = null;
      return;
    }

    const requestedPropertyHandleKey = `${requestedPropertyId}:${isPeriodReadOnly ? "readonly" : "editable"}`;

    if (handledRequestedExistingPropertyIdRef.current === requestedPropertyHandleKey) {
      return;
    }

    if (!existingProperties.some((property) => property.id === requestedPropertyId)) {
      return;
    }

    handledRequestedExistingPropertyIdRef.current = requestedPropertyHandleKey;

    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      onRequestedExistingPropertyHandled?.();
      return;
    }

    setConfiguringExistingPropertyDraft(null);
    setConfiguringExistingPropertyId(requestedPropertyId);
    onRequestedExistingPropertyHandled?.();
  }, [
    existingProperties,
    isPeriodReadOnly,
    onRequestedExistingPropertyHandled,
    requestedExistingPropertyId,
    showReadOnlyMessage,
  ]);

  const handleExistingDelete = (propertyId: string) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    if (onDeleteProperty) {
      if (pendingDraftMutationKeyRef.current !== null) {
        return;
      }

      const nextExistingProperties = removeRuleBidExistingPropertyById(existingProperties, propertyId);

      const mutationToken = beginDraftMutation(`delete-${propertyId}`);
      void onDeleteProperty(propertyId, data.draftMeta)
        .then((result) => {
          if (!isCurrentDraftMutation(mutationToken)) {
            return;
          }

          const savedSnapshot = cloneRuleBidExistingProperties(nextExistingProperties);
          lastSavedExistingPropertiesRef.current = cloneRuleBidExistingProperties(savedSnapshot);
          setExistingProperties(savedSnapshot);
          result?.onCommitted?.();
          message.success("Property removed.");
        })
        .catch((error: unknown) => {
          if (!isCurrentDraftMutation(mutationToken)) {
            return;
          }

          handleDraftMutationError(error, "Unable to remove this property.");
        })
        .finally(() => {
          finishDraftMutation(mutationToken);
        });
      return;
    }

    setExistingProperties((current) => removeRuleBidExistingPropertyById(current, propertyId));
  };

  const addAvailableProperty = (property: RuleBidAvailableProperty) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    if (property.source === "favorite" && !property.tiers.some((tier) => tier.active)) {
      message.warning("Select at least one Tx before adding this favorite.");
      return;
    }

    const nextProperty = {
      ...buildRuleBidExistingPropertyFromAvailable(
        property,
        `existing-${property.propertyCode}-${existingProperties.length + 1}`,
      ),
      categoryLabel: property.categoryLabel,
      categorySortOrder: property.categorySortOrder,
      sourceContext: property.sourceContext,
    };
    const mergeResult = mergeSamePropertyTiersOnAdd
      ? findRuleBidExistingPropertyTierMerge(existingProperties, nextProperty)
      : null;
    const nextExistingProperties = mergeResult
      ? existingProperties.map((existingProperty) =>
          existingProperty.id === mergeResult.targetProperty.id
            ? mergeResult.mergedProperty
            : existingProperty)
      : [...existingProperties, nextProperty];
    const nextValidationErrors = validateExistingProperties?.(nextExistingProperties) ?? [];

    if (nextValidationErrors.length > 0) {
      setSaveErrorMessage(null);
      message.error(nextValidationErrors.join(" "));
      return;
    }

    if (onAddProperty) {
      if (pendingDraftMutationKeyRef.current !== null) {
        return;
      }

      if (mergeResult) {
        if (!mergeResult.hasNewActiveTier) {
          setSaveErrorMessage(null);
          message.warning("This property already exists.");
          return;
        }

        if (!onUpdateProperty) {
          setExistingProperties(nextExistingProperties);
          return;
        }

        const savedSnapshot = cloneRuleBidExistingProperties(nextExistingProperties);
        const mutationToken = beginDraftMutation(`merge-${mergeResult.targetProperty.id}`);

        void onUpdateProperty(mergeResult.targetProperty.id, mergeResult.mergedProperty, data.draftMeta)
          .then((result) => {
            if (!isCurrentDraftMutation(mutationToken)) {
              return;
            }

            lastSavedExistingPropertiesRef.current = cloneRuleBidExistingProperties(savedSnapshot);
            setExistingProperties(savedSnapshot);
            setConfiguringAvailablePropertyId(null);
            result?.onCommitted?.();
            message.success("Property updated.");
          })
          .catch((error: unknown) => {
            if (!isCurrentDraftMutation(mutationToken)) {
              return;
            }

            handleDraftMutationError(error);
          })
          .finally(() => {
            finishDraftMutation(mutationToken);
          });
        return;
      }

      if (hasDuplicateRuleBidExistingProperty(existingProperties, nextProperty)) {
        setSaveErrorMessage(null);
        message.warning("This property already exists.");
        return;
      }

      const mutationToken = beginDraftMutation(`add-${property.id}`);
      void onAddProperty(property, data.draftMeta, nextProperty)
        .then((result) => {
          if (!isCurrentDraftMutation(mutationToken)) {
            return;
          }

          const savedSnapshot = buildRuleBidSavedExistingPropertiesAfterAdd(
            existingProperties,
            nextProperty,
            result.propertyGroupKey,
          );

          lastSavedExistingPropertiesRef.current = cloneRuleBidExistingProperties(savedSnapshot);
          setExistingProperties(savedSnapshot);
          setConfiguringAvailablePropertyId(null);
          if (property.source === "favorite") {
            setAvailableProperties((current) => current.map((item) =>
              item.id === property.id
                ? { ...item, tiers: item.tiers.map((tier) => ({ ...tier, active: false })) }
                : item));
          }
          result.onCommitted?.();
          message.success("Property added.");
        })
        .catch((error: unknown) => {
          if (!isCurrentDraftMutation(mutationToken)) {
            return;
          }

          handleDraftMutationError(error);
        })
        .finally(() => {
          finishDraftMutation(mutationToken);
        });
      return;
    }

    setExistingProperties(nextExistingProperties);
    setConfiguringAvailablePropertyId(null);
  };

  const saveConfiguredFavorite = (property: RuleBidAvailableProperty) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    if (!onSaveFavoriteProperty || isFavoriteMutationPending) {
      return;
    }

    setIsFavoriteMutationPending(true);
    void onSaveFavoriteProperty(property, data.draftMeta)
      .then((favorite) => {
        setAvailableProperties((current) => applyRuleBidConfiguredFavorite(current, favorite));
        setConfiguringAvailablePropertyId(null);
        setActiveTab("favorited");
        setSearchKeyword("");
        setCurrentPage(1);
        message.success(t("ruleBid.message.saveFavoriteSuccess"));
      })
      .catch((error: unknown) => {
        handleDraftMutationError(error);
      })
      .finally(() => {
        setIsFavoriteMutationPending(false);
      });
  };

  const deleteConfiguredFavorite = (propertyId: string) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    if (!onUnfavoriteProperty || isFavoriteMutationPending) {
      return;
    }

    const property = availableProperties.find((item) => item.id === propertyId);

    if (!property || !property.favoriteKey) {
      message.error(t("ruleBid.message.removeFavoriteError"));
      return;
    }

    setIsFavoriteMutationPending(true);
    void onUnfavoriteProperty(property.favoriteKey, data.draftMeta)
      .then(() => {
        setAvailableProperties((current) => applyRuleBidAvailablePropertyUnfavoriteByKey(current, property.favoriteKey!));
        setConfirmingFavoriteDeleteId(null);
        message.success(t("ruleBid.message.removeFavoriteSuccess"));
      })
      .catch((error: unknown) => {
        handleDraftMutationError(error, t("ruleBid.message.removeFavoriteError"));
      })
      .finally(() => {
        setIsFavoriteMutationPending(false);
      });
  };

  const updateConfiguredFavorite = (property: RuleBidAvailableProperty) => {
    const original = availableProperties.find((item) => item.id === configuringFavoritePropertyId);

    if (!original?.favoriteKey || !onUpdateFavoriteProperty || isFavoriteMutationPending) {
      return;
    }

    setIsFavoriteMutationPending(true);
    void onUpdateFavoriteProperty(original.favoriteKey, property, data.draftMeta)
      .then((favorite) => {
        setAvailableProperties((current) => current.map((item) =>
          item.favoriteKey === original.favoriteKey
            ? {
                ...item,
                ...favorite,
                id: item.id,
                source: "favorite",
                favorited: true,
                tiers: item.tiers,
              }
            : item));
        setConfiguringFavoritePropertyId(null);
        message.success("Favorite updated.");
      })
      .catch((error: unknown) => {
        if (isRuleBidMissingFavoriteError(error)) {
          setConfiguringFavoritePropertyId(null);
          setMissingFavoriteKey(original.favoriteKey!);
          return;
        }

        handleDraftMutationError(error, "Unable to update the favorite.");
      })
      .finally(() => {
        setIsFavoriteMutationPending(false);
      });
  };

  const handleAddProperty = (propertyId: string) => {
    if (isPeriodReadOnly) {
      showReadOnlyMessage();
      return;
    }

    const property = availableProperties.find((item) => item.id === propertyId);

    if (!property) {
      return;
    }

    if (
      renderAvailablePropertyAddDialog
      && property.source !== "favorite"
      && (shouldConfigureAvailableProperty?.(property, "add") ?? true)
    ) {
      setConfiguringAvailablePropertyId(propertyId);
      return;
    }

    addAvailableProperty(property);
  };

  const handleFavoriteTierToggle = (propertyId: string, tierKey: string) => {
    setAvailableProperties((current) => current.map((property) =>
      property.id === propertyId && property.source === "favorite"
        ? {
          ...property,
          tiers: property.tiers.map((tier) =>
            tier.key === tierKey ? { ...tier, active: !tier.active } : tier),
        }
        : property));
  };

  const configuringAvailableProperty = configuringAvailablePropertyId
    ? availableProperties.find((property) => property.id === configuringAvailablePropertyId) ?? null
    : null;
  const configuringExistingProperty = configuringExistingPropertyId
    ? configuringExistingPropertyDraft?.id === configuringExistingPropertyId
      ? configuringExistingPropertyDraft
      : existingProperties.find((property) => property.id === configuringExistingPropertyId) ?? null
    : null;
  const availableSection = (
    <RuleBidAvailablePropertiesSection
      actionDisabled={draftActionDisabled}
      activeCategoryKey={effectiveCategoryKey}
      activeTab={effectiveActiveTab}
      allPropertiesLabel={data.allPropertiesLabel}
      categoryFilterVariant={availableCategoryFilterVariant}
      categoryFilters={availableCategoryFilters}
      confirmingFavoriteDeleteId={confirmingFavoriteDeleteId}
      currentPage={currentPage}
      favoritedPropertiesLabel={data.favoritedPropertiesLabel}
      hideChrome={presentation?.availableOnly}
      hidePagination={presentation?.availableOnly}
      viewportBound={viewportBound}
      isFavoriteMutationPending={isFavoriteMutationPending}
      layout={availableTableLayout}
      pageSize={AVAILABLE_PROPERTIES_PAGE_SIZE}
      pagedProperties={renderedAvailableProperties}
      paginationItems={paginationItems}
      searchKeyword={effectiveSearchKeyword}
      searchPlaceholder={data.searchPlaceholder}
      sectionTitle={data.addSectionTitle}
      showFavoritePropertiesTab={showFavoritePropertiesTab}
      shouldShowAvailableFavoriteDeleteAction={shouldShowAvailableFavoriteDeleteAction}
      totalItems={totalAvailableItems}
      totalPages={totalPages}
      onAdd={handleAddProperty}
      onEditFavorite={onUpdateFavoriteProperty ? setConfiguringFavoritePropertyId : undefined}
      onTierToggle={handleFavoriteTierToggle}
      onCategoryChange={handleAvailableCategoryChange}
      onFavoriteDeleteCancel={() => setConfirmingFavoriteDeleteId(null)}
      onFavoriteDeleteConfirm={deleteConfiguredFavorite}
      onFavoriteDeleteRequest={setConfirmingFavoriteDeleteId}
      onPageChange={goToPage}
      onSearchKeywordChange={handleAvailableSearchKeywordChange}
      onTabChange={handleAvailableTabChange}
    />
  );
  const availableDialogs = (
    <>
      {renderAvailablePropertyAddDialog && configuringAvailableProperty ? renderAvailablePropertyAddDialog({
        isOpen: true,
        isFavoritePending: isFavoriteMutationPending,
        isPending: isDraftStructureMutationPending,
        property: configuringAvailableProperty,
        onCancel: () => setConfiguringAvailablePropertyId(null),
        onConfirm: addAvailableProperty,
        onSaveFavorite: onSaveFavoriteProperty ? saveConfiguredFavorite : undefined,
      }) : null}
      {renderAvailablePropertyAddDialog && configuringFavoritePropertyId ? (() => {
        const property = availableProperties.find((item) => item.id === configuringFavoritePropertyId);

        return property ? renderAvailablePropertyAddDialog({
          isFavoriteEdit: true,
          isOpen: true,
          isFavoritePending: isFavoriteMutationPending,
          isPending: isDraftStructureMutationPending,
          property,
          onCancel: () => setConfiguringFavoritePropertyId(null),
          onConfirm: updateConfiguredFavorite,
          onSaveFavorite: updateConfiguredFavorite,
        }) : null;
      })() : null}
    </>
  );
  const existingDialogs = renderExistingPropertyEditDialog && configuringExistingProperty
    ? renderExistingPropertyEditDialog({
        isOpen: true,
        isPending: isDraftStructureMutationPending,
        property: configuringExistingProperty,
        onCancel: closeConfiguringExistingProperty,
        onConfirm: (property) => updateExistingProperty(
          configuringExistingProperty.id,
          property,
          closeConfiguringExistingProperty,
        ),
        onRemove: () => handleExistingDelete(configuringExistingProperty.id),
      })
    : null;
  const favoriteMissingRecovery = missingFavoriteKey ? (
    <FavoriteMissingRecoveryAlert
      onClose={() => setMissingFavoriteKey(null)}
      onReload={() => {
        const favoriteKey = missingFavoriteKey;
        setAvailableProperties((current) =>
          applyRuleBidAvailablePropertyUnfavoriteByKey(current, favoriteKey));
        [daysOffPageDataQueryKey, linePageDataQueryKey].forEach((queryKey) => {
          queryClient.setQueryData(queryKey, (currentData: RuleBidPageData | undefined) =>
            currentData
              ? {
                  ...currentData,
                  rightPanel: {
                    ...currentData.rightPanel,
                    availableProperties: applyRuleBidAvailablePropertyUnfavoriteByKey(
                      currentData.rightPanel.availableProperties,
                      favoriteKey,
                    ),
                  },
                }
              : currentData);
        });
        setMissingFavoriteKey(null);
        reloadDraft();
      }}
    />
  ) : null;

  if (presentation?.availableOnly) {
    return (
      <>
        {favoriteMissingRecovery}
        {availableSection}
        {availableDialogs}
        {existingDialogs}
      </>
    );
  }

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-3xl bg-white px-6 pb-5 pt-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]",
        viewportBound ? "h-full min-h-0" : "min-h-full",
      )}
      data-uiid="rule-bid-right-panel"
    >
      {renderTopContent ? (
        <div className="mb-5 shrink-0">
          {renderTopContent()}
        </div>
      ) : null}

      <PanelStripHeader title={data.existingTitle} />

      {hideAvailablePropertiesSection || !showAddShortcut ? null : (
        <RuleBidAddShortcut
          addButtonLabel={data.addButtonLabel}
          disabled={isPeriodReadOnly}
          onClick={() => {
            setActiveTab("all");
            setActiveCategoryKey(RULE_BID_ALL_CATEGORY_KEY);
          }}
        />
      )}

      <RuleBidExistingPropertiesSection
        editingExistingPropertyId={editingExistingPropertyId}
        existingBidEditMode={existingBidEditMode}
        existingEmptyMessage={existingEmptyMessage}
        existingListVariant={existingListVariant}
        existingProperties={visibleExistingProperties}
        existingToolbar={renderExistingToolbar?.()}
        hideAvailablePropertiesSection={hideAvailablePropertiesSection}
        informationalMessages={informationalMessages}
        isDraftStructureMutationPending={draftActionDisabled}
        layout={tableLayout}
        renderBidSummary={renderExistingBidSummary}
        shouldReplacePropertyNameWithSummary={shouldReplaceExistingPropertyNameWithSummary}
        saveErrorMessage={saveErrorMessage}
        showDraftConflictRecovery={showDraftConflictRecovery}
        shouldShowExistingEditAction={shouldShowExistingEditAction}
        showModifiers={showModifiers}
        validationErrors={validationErrors}
        viewportBound={viewportBound}
        onReloadDraft={reloadDraft}
        onBidChange={handleExistingBidChange}
        onDelete={handleExistingDelete}
        onEditToggle={toggleExistingPropertyEditor}
        onModifierChange={handleExistingModifierChange}
        onTierToggle={handleExistingTierToggle}
      />

      {favoriteMissingRecovery}

      {hideAvailablePropertiesSection ? null : (
        availableSection
      )}

      {hideAvailablePropertiesSection ? null : availableDialogs}

      {existingDialogs}
    </section>
  );
};
