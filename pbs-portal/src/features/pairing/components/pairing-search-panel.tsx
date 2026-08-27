import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelStripHeader } from "@/shared/components/panel/panel-strip-header";
import { PairingSearchCriteriaRow } from "@/features/pairing/components/pairing-search-criteria-row";
import { PairingRuleConditionSummary } from "@/features/pairing/components/pairing-rule-condition-summary";
import type { PairingRuleExpressionTier } from "@/features/pairing/pairing-rule-logic";
import {
  buildPairingPaginationItems,
  buildPairingTotalPages,
  clampPairingPage,
} from "@/features/pairing/pairing-property-list";
import { PairingDetailCard } from "@/features/pairing/components/pairing-detail-card";
import {
  PairingResultFilterMultiSelect,
} from "@/features/pairing/components/pairing-result-filter-multi-select";
import type {
  PairingAvailableProperty,
  PairingSearchCriteriaItem,
  PairingSearchPageData,
  PairingSearchResult,
  PairingSearchResultFilters,
} from "@/features/pairing/types";
import styles from "@/features/pairing/components/pairing-search-panel.module.css";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { PbsDatePicker } from "@/shared/components/preferences";
import { cn } from "@/shared/lib/cn";
import { workbenchQueryDefaults } from "@/shared/query/workbench-query-defaults";
import {
  pairingService,
  type PairingSearchPeriodReference,
} from "@/shared/services/pairing-service";

type PairingSearchPanelProps = {
  data: PairingSearchPageData;
  currentPage?: number;
  period?: PairingSearchPeriodReference | null;
  periodEndDate?: string;
  periodCode?: string;
  periodStartDate?: string;
  allPairingsPreview?: boolean;
  criteriaActionsDisabled?: boolean;
  currentRulesPreview?: {
    activeTier: string;
    emptyLabel: string;
    expressionTier: PairingRuleExpressionTier | null;
    tiers: string[];
    onTierChange: (tier: string) => void;
  };
  favoriteMutationPropertyCode?: number | null;
  isCriteriaAddPending?: boolean;
  isBidThesePropertiesPending?: boolean;
  isFavoriteMutationPending?: boolean;
  isResultsRefreshing?: boolean;
  onCriteriaAdd?: (item: PairingSearchCriteriaItem) => void;
  onCriteriaEditToggle?: (itemId: string) => void;
  onCriteriaFavoriteToggle?: (item: PairingSearchCriteriaItem) => void;
  onCriteriaRemove?: (itemId: string) => void;
  onAddMoreCriteria?: () => void;
  onBack?: () => void;
  onBidTheseProperties?: () => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onResultFiltersChange?: (filters: PairingSearchResultFilters) => void;
  onResultsRetry?: () => void;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  resultFilters?: PairingSearchResultFilters;
  resultsRefreshError?: string | null;
  resultAction?: {
    isPending?: boolean;
    label: string;
    onSelect: (result: PairingSearchResult) => void;
  };
  showSearchActions?: boolean;
  criteriaPicker?: {
    isOpen: boolean;
    activeTab: "all" | "favorites";
    properties: PairingAvailableProperty[];
    query: string;
    onAdd: (property: PairingAvailableProperty) => void;
    onClose: () => void;
    onQueryChange: (query: string) => void;
    onTabChange: (tab: "all" | "favorites") => void;
  };
  bidTierDialog?: {
    confirmLabel?: string;
    isOpen: boolean;
    isPending: boolean;
    tiers: string[];
    selectedTier: string;
    onCancel: () => void;
    onConfirm: () => void;
    onSelectTier: (tier: string) => void;
  };
};

const PairingSearchRuleExpression = ({
  activeTier,
  emptyLabel,
  expressionTier,
  tiers,
  onTierChange,
}: NonNullable<PairingSearchPanelProps["currentRulesPreview"]>) => (
  <div className={styles.rulePreview} data-testid="pairing-search-current-rules-preview">
    <div className={styles.ruleTierTabs} aria-label="Pairing search rule tiers" role="tablist">
      {tiers.map((tier) => (
        <button
          key={tier}
          aria-selected={tier === activeTier ? "true" : "false"}
          className={cn(styles.ruleTierTab, tier === activeTier ? styles.ruleTierTabActive : "")}
          role="tab"
          type="button"
          onClick={() => onTierChange(tier)}
        >
          {tier}
        </button>
      ))}
    </div>

    {expressionTier ? (
      <div className={styles.ruleExpressionRow}>
        <div className={styles.ruleTierBadge}>{expressionTier.tier}</div>
        <div className={styles.ruleClauses}>
          {expressionTier.clauses.map((clause, clauseIndex) => (
            <div key={clause.key} className={styles.ruleClause}>
              {clauseIndex > 0 ? <span className={styles.ruleAnd}>AND</span> : null}
              {clause.conditions.map((condition, conditionIndex) => (
                <div key={condition.key} className={styles.ruleConditionGroup}>
                  {conditionIndex > 0 ? <span className={styles.ruleOr}>OR</span> : null}
                  <PairingRuleConditionSummary condition={condition} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className={styles.ruleEmpty}>{emptyLabel}</div>
    )}
  </div>
);

type PairingSearchCriteriaPickerProps = NonNullable<PairingSearchPanelProps["criteriaPicker"]>;

const PairingSearchCriteriaPicker = ({
  activeTab,
  isOpen,
  onAdd,
  onClose,
  onQueryChange,
  onTabChange,
  properties,
  query,
}: PairingSearchCriteriaPickerProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.criteriaPicker} data-testid="pairing-search-criteria-picker">
      <div className={styles.criteriaPickerHeader}>
        <label className={styles.visuallyHidden} htmlFor="pairing-search-criteria-query">
          Search more pairing properties
        </label>
        <input
          id="pairing-search-criteria-query"
          className={styles.criteriaPickerSearch}
          placeholder="Search Properties"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button className={styles.criteriaPickerClose} type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.criteriaPickerTabs} role="tablist" aria-label="Pairing search criteria groups">
        <button
          aria-selected={activeTab === "all" ? "true" : "false"}
          className={cn(styles.criteriaPickerTab, activeTab === "all" ? styles.criteriaPickerTabActive : "")}
          role="tab"
          type="button"
          onClick={() => onTabChange("all")}
        >
          ALL PROPERTIES
        </button>
        <button
          aria-selected={activeTab === "favorites" ? "true" : "false"}
          className={cn(styles.criteriaPickerTab, activeTab === "favorites" ? styles.criteriaPickerTabActive : "")}
          role="tab"
          type="button"
          onClick={() => onTabChange("favorites")}
        >
          FAVORITED PROPERTIES
        </button>
      </div>

      <div className={styles.criteriaPickerList}>
        {properties.length > 0 ? properties.map((property) => (
          <button
            key={`${property.id}-${property.propertyCode}`}
            aria-label={`Add ${property.name} search criterion`}
            className={styles.criteriaPickerItem}
            type="button"
            onClick={() => onAdd(property)}
          >
            <span>{property.name}</span>
            <PlusCircleIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        )) : (
          <div className={styles.criteriaPickerEmpty}>No matching properties.</div>
        )}
      </div>
    </div>
  );
};

type BidTierDialogProps = NonNullable<PairingSearchPanelProps["bidTierDialog"]>;

const BidTierDialog = ({
  confirmLabel = "BID THESE PROPERTIES",
  isOpen,
  isPending,
  tiers,
  onCancel,
  onConfirm,
  onSelectTier,
  selectedTier,
}: BidTierDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <PbsDialogFrame
      ariaLabel="Choose pairing bid tier"
      bodyClassName="p-0"
      closeDisabled={isPending}
      footerClassName={styles.tierDialogActions}
      panelClassName="w-[min(420px,calc(100vw-32px))] rounded-lg p-[18px]"
      header={(
        <div className={styles.tierDialogHeader}>
          <p className={styles.tierDialogTitle}>Choose Tier</p>
          <button aria-label="Close tier chooser" className={styles.tierDialogIconButton} type="button" onClick={onCancel}>
            <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      )}
      footer={(
        <>
          <button className={styles.tierDialogSecondary} disabled={isPending} type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.tierDialogPrimary} disabled={isPending} type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      )}
      onClose={onCancel}
    >
        <div className={styles.tierDialogOptions}>
          {tiers.map((tier) => (
            <button
              key={tier}
              aria-pressed={tier === selectedTier ? "true" : "false"}
              className={cn(styles.tierDialogTier, tier === selectedTier ? styles.tierDialogTierActive : "")}
              type="button"
              onClick={() => onSelectTier(tier)}
            >
              {tier}
            </button>
          ))}
        </div>
    </PbsDialogFrame>
  );
};

type PairingResultFiltersBarProps = {
  filters: PairingSearchResultFilters;
  period: PairingSearchPeriodReference;
  periodCode: string;
  periodEndDate: string;
  periodStartDate: string;
  onChange: (filters: PairingSearchResultFilters) => void;
};

const hasPairingResultFilters = (filters: PairingSearchResultFilters) =>
  Object.values(filters).some((value) => Array.isArray(value)
    ? value.length > 0
    : typeof value === "string" && value.trim().length > 0);

const PairingResultFiltersBar = ({
  filters,
  period,
  periodCode,
  periodEndDate,
  periodStartDate,
  onChange,
}: PairingResultFiltersBarProps) => {
  const updateTimeFilter = (key: "timeFrom" | "timeTo", value: string) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };
  const airportOptionsQuery = useQuery({
    queryKey: ["pairing", "search-result-filter-airports", period.rosterPeriodId],
    queryFn: () => pairingService.getAirportOptions(period),
    ...workbenchQueryDefaults,
  });
  const airportOptions = airportOptionsQuery.data?.filterAirports ?? [];
  const hasFilters = hasPairingResultFilters(filters);

  return (
    <div className={styles.resultFilters} aria-label="Pairing search result filters">
      <PairingResultFilterMultiSelect
        ariaLabel="Filter results by pairing number"
        emptyLabel="No matching Pairing Numbers"
        errorLabel="Unable to load Pairing Numbers"
        label="Pairing Number"
        loadingLabel="Loading Pairing Numbers..."
        placeholder="Search Pairing Number"
        queryKey={["pairing", "search-result-filter-pairing-numbers", period.rosterPeriodId]}
        selectedValues={filters.pairingNumbers ?? []}
        testId="pairing-number-filter"
        loadOptionPage={async (query, cursor, signal) => pairingService
          .getPairingNumberFilterOptions(period, query, cursor, 30, signal)}
        onChange={(pairingNumbers) => onChange({ ...filters, pairingNumbers })}
      />
      <div className={styles.resultFilterField}>
        <span data-testid="pairing-origin-date-range-filter-label">Date Range</span>
        <div className={styles.resultFilterDateRange} data-testid="pairing-origin-date-range-filter-control">
          <PbsDatePicker
            calendarLabel="Pairing result origin date range calendar"
            clearLabel="Clear pairing result origin date range"
            mode="range"
            openLabel="Open date range picker for pairing results"
            periodCode={periodCode}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            rangeFrom={filters.originDateFrom ?? ""}
            rangeTo={filters.originDateTo ?? ""}
            onRangeChange={(originDateFrom, originDateTo) => onChange({
              ...filters,
              originDateFrom,
              originDateTo,
            })}
          />
        </div>
      </div>
      <PairingResultFilterMultiSelect
        ariaLabel="Filter results by airport"
        emptyLabel="No matching Airports"
        errorLabel="Unable to load Airports"
        hasError={airportOptionsQuery.isError}
        isLoading={airportOptionsQuery.isLoading || airportOptionsQuery.isFetching}
        label="Airport"
        loadingLabel="Loading Airports..."
        options={airportOptions.map((airport) => ({ value: airport, label: airport }))}
        placeholder="Search Airport"
        queryKey={["pairing", "search-result-filter-airport-options", periodCode]}
        selectedValues={filters.airports ?? []}
        testId="airport-filter"
        onChange={(airports) => onChange({ ...filters, airports })}
      />
      <label className={styles.resultFilterField}>
        <span data-testid="time-from-filter-label">Time From</span>
        <input
          aria-label="Filter results from report time"
          className={styles.resultFilterInput}
          data-testid="time-from-filter-control"
          type="time"
          value={filters.timeFrom ?? ""}
          onChange={(event) => updateTimeFilter("timeFrom", event.target.value)}
        />
      </label>
      <label className={styles.resultFilterField}>
        <span data-testid="time-to-filter-label">Time To</span>
        <input
          aria-label="Filter results to report time"
          className={styles.resultFilterInput}
          data-testid="time-to-filter-control"
          type="time"
          value={filters.timeTo ?? ""}
          onChange={(event) => updateTimeFilter("timeTo", event.target.value)}
        />
      </label>
      <button
        className={styles.resultFiltersClear}
        data-testid="clear-filters-control"
        disabled={!hasFilters}
        type="button"
        onClick={() => onChange({})}
      >
        Clear
      </button>
    </div>
  );
};

export const PairingSearchPanel = ({
  allPairingsPreview = false,
  bidTierDialog,
  criteriaActionsDisabled = false,
  criteriaPicker,
  currentPage: controlledCurrentPage,
  currentRulesPreview,
  data,
  favoriteMutationPropertyCode,
  isBidThesePropertiesPending = false,
  isCriteriaAddPending = false,
  isFavoriteMutationPending = false,
  isResultsRefreshing = false,
  onAddMoreCriteria,
  onBack,
  onBidTheseProperties,
  onCriteriaAdd,
  onCriteriaEditToggle,
  onCriteriaFavoriteToggle,
  onCriteriaRemove,
  onPageChange,
  onPageSizeChange,
  onResultFiltersChange,
  onResultsRetry,
  pageSize: controlledPageSize,
  pageSizeOptions = [],
  period,
  periodEndDate = "",
  periodCode,
  periodStartDate = "",
  resultAction,
  resultFilters,
  resultsRefreshError,
  showSearchActions = true,
}: PairingSearchPanelProps) => {
  const currentPage = controlledCurrentPage ?? data.pagination.currentPage ?? 1;
  const [pageInput, setPageInput] = useState(String(currentPage));
  const resultsViewportRef = useRef<HTMLDivElement>(null);
  const pageSize = controlledPageSize ?? data.pagination.defaultPageSize;

  const totalPages = buildPairingTotalPages(data.pagination.totalItems, pageSize);
  const paginationItems = useMemo(
    () => buildPairingPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const showCriteriaTiers = allPairingsPreview && data.criteriaItems.length > 0;

  const resetResultsScroll = () => {
    if (resultsViewportRef.current) {
      resultsViewportRef.current.scrollTop = 0;
    }
  };

  const goToPage = (nextPage: number) => {
    if (isResultsRefreshing) {
      return;
    }

    const normalizedPage = clampPairingPage(nextPage, totalPages);
    if (normalizedPage === currentPage) {
      return;
    }

    resetResultsScroll();
    onPageChange?.(normalizedPage);
  };

  return (
    <section className={styles.root} data-testid="pairing-search-panel" data-uiid="pairing-search-panel">
      <div className={styles.shell}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{data.title}</h1>
          {onBack ? (
            <button aria-label="Back to pairing workbench" className={styles.backButton} type="button" onClick={onBack}>
              <ArrowLeftIcon className="h-4 w-4 stroke-[2]" />
              <span>Back</span>
            </button>
          ) : null}
        </header>

        <div className={styles.sectionHeader}>
          <PanelStripHeader title={data.criteriaTitle} />
          {!currentRulesPreview && showSearchActions ? (
            <div className={styles.criteriaHeaderActions} data-testid="pairing-search-criteria-actions">
              <button
                className={styles.criteriaHeaderAction}
                disabled={criteriaActionsDisabled || isBidThesePropertiesPending || data.criteriaItems.length === 0}
                type="button"
                onClick={onBidTheseProperties}
              >
                {data.bidThesePropertiesLabel}
              </button>
              <button
                aria-pressed={criteriaPicker?.isOpen ? "true" : "false"}
                className={cn(
                  styles.criteriaHeaderAction,
                  criteriaPicker?.isOpen ? styles.criteriaHeaderActionActive : "",
                )}
                type="button"
                onClick={onAddMoreCriteria}
              >
                {data.addMoreCriteriaLabel}
              </button>
            </div>
          ) : null}
        </div>

        {currentRulesPreview ? (
          <PairingSearchRuleExpression {...currentRulesPreview} />
        ) : (
          <>
            <div className={styles.criteriaRows}>
              {data.criteriaItems.length > 0 ? (
                data.criteriaItems.map((item) => (
                  <PairingSearchCriteriaRow
                    key={item.id}
                    actionsDisabled={criteriaActionsDisabled}
                    isAddPending={isCriteriaAddPending}
                    isFavoritePending={isFavoriteMutationPending && favoriteMutationPropertyCode === item.propertyCode}
                    item={item}
                    onAdd={onCriteriaAdd}
                    onEditToggle={onCriteriaEditToggle}
                    onFavoriteToggle={onCriteriaFavoriteToggle}
                    onRemove={onCriteriaRemove}
                    showTiers={showCriteriaTiers}
                  />
                ))
              ) : (
                <div className={styles.criteriaEmpty}>
                  {allPairingsPreview
                    ? "Showing all pairings available for this bid period."
                    : "No search criteria selected."}
                </div>
              )}
            </div>

            {criteriaPicker ? <PairingSearchCriteriaPicker {...criteriaPicker} /> : null}
          </>
        )}

        <div className={styles.resultsHeaderRow}>
          <PanelStripHeader title={data.resultsTitle} />
        </div>

        {allPairingsPreview && resultFilters && onResultFiltersChange && period ? (
          <PairingResultFiltersBar
            filters={resultFilters}
            period={period}
            periodCode={periodCode ?? ""}
            periodEndDate={periodEndDate}
            periodStartDate={periodStartDate}
            onChange={onResultFiltersChange}
          />
        ) : null}

        <div className={styles.resultsActionRow}>
          <span className={styles.resultSummary}>
            {isResultsRefreshing
              ? "Loading pairing results..."
              : resultsRefreshError
                ? "Pairing results unavailable."
                : data.resultSummaryText}
          </span>
        </div>

        <div
          ref={resultsViewportRef}
          aria-busy={isResultsRefreshing ? "true" : "false"}
          className={styles.resultsViewport}
          data-testid="pairing-search-results-list"
        >
          {isResultsRefreshing || resultsRefreshError ? (
            <div
              aria-label={isResultsRefreshing ? "Refreshing pairing search results" : undefined}
              className={cn(styles.resultsRefreshNotice, resultsRefreshError ? styles.resultsRefreshNoticeError : "")}
              role={isResultsRefreshing ? "status" : "alert"}
            >
              {isResultsRefreshing ? (
                <>
                  <span className={styles.resultsRefreshSpinner} />
                  <span>Refreshing results...</span>
                </>
              ) : (
                <>
                  <span>{resultsRefreshError}</span>
                  {onResultsRetry ? (
                    <button className={styles.resultsRetryButton} type="button" onClick={onResultsRetry}>
                      Retry
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          {isResultsRefreshing ? (
            <div
              aria-hidden="true"
              className={styles.resultsLoadingSkeleton}
              data-testid="pairing-search-results-loading"
            >
              <div className={styles.resultsLoadingCard}>
                <div
                  className={styles.resultsLoadingHeader}
                  data-testid="pairing-search-skeleton-header"
                >
                  <span className={cn(styles.resultsLoadingBlock, styles.resultsLoadingBadge)} />
                  <span className={cn(styles.resultsLoadingBlock, styles.resultsLoadingAction)} />
                </div>
                <div
                  className={styles.resultsLoadingSummary}
                  data-testid="pairing-search-skeleton-summary"
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <span key={index} className={styles.resultsLoadingSummaryField}>
                      <span className={cn(styles.resultsLoadingBlock, styles.resultsLoadingLabel)} />
                      <span className={cn(styles.resultsLoadingBlock, styles.resultsLoadingValue)} />
                    </span>
                  ))}
                </div>
                <div className={styles.resultsLoadingContent}>
                  <div
                    className={styles.resultsLoadingDetail}
                    data-testid="pairing-search-skeleton-detail"
                  >
                    <div className={styles.resultsLoadingTableHeader}>
                      {Array.from({ length: 7 }, (_, index) => (
                        <span key={index} className={cn(styles.resultsLoadingBlock, styles.resultsLoadingTableCell)} />
                      ))}
                    </div>
                    {Array.from({ length: 4 }, (_, rowIndex) => (
                      <div key={rowIndex} className={styles.resultsLoadingTableRow}>
                        {Array.from({ length: 7 }, (_, cellIndex) => (
                          <span key={cellIndex} className={cn(styles.resultsLoadingBlock, styles.resultsLoadingTableCell)} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div
                    className={styles.resultsLoadingCalendar}
                    data-testid="pairing-search-skeleton-calendar"
                  >
                    <div className={styles.resultsLoadingWeekdays}>
                      {Array.from({ length: 7 }, (_, index) => (
                        <span key={index} className={cn(styles.resultsLoadingBlock, styles.resultsLoadingWeekday)} />
                      ))}
                    </div>
                    <div className={styles.resultsLoadingCalendarGrid}>
                      {Array.from({ length: 35 }, (_, index) => (
                        <span key={index} className={cn(styles.resultsLoadingBlock, styles.resultsLoadingDay)} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : resultsRefreshError ? null : (
            <div className={styles.resultsList}>
              {data.results.length > 0 ? (
                data.results.map((result) => (
                  <PairingDetailCard
                    key={result.id}
                    actionDisabled={resultAction?.isPending}
                    actionLabel={resultAction?.label}
                    periodEndDate={periodEndDate}
                    periodStartDate={periodStartDate}
                    result={result}
                    onAction={resultAction?.onSelect}
                  />
                ))
              ) : (
                <div className={styles.resultsEmpty}>
                  {allPairingsPreview ? "No pairings match the current filters." : "No pairings match the current search."}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer} data-testid="pairing-search-footer">
          <div className={styles.footerInner}>
            <span className={styles.footerText}>
              {isResultsRefreshing
                ? "Loading..."
                : resultsRefreshError
                  ? "Unavailable"
                  : `Total ${data.pagination.totalItems} items`}
            </span>
            <button
              aria-label="Go to previous pairing search page"
              className={styles.pageButton}
              disabled={isResultsRefreshing || currentPage === 1}
              type="button"
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeftIcon className="h-4 w-4 stroke-[2]" />
            </button>
            {paginationItems.map((item) =>
              typeof item === "number" ? (
                <button
                  key={item}
                  aria-label={`Go to pairing search page ${item}`}
                  className={cn(styles.pageButton, item === currentPage ? styles.pageButtonActive : "")}
                  disabled={isResultsRefreshing}
                  type="button"
                  onClick={() => goToPage(item)}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className={styles.footerEllipsis}>
                  …
                </span>
              ),
            )}
            <button
              aria-label="Go to next pairing search page"
              className={styles.pageButton}
              disabled={isResultsRefreshing || currentPage === totalPages}
              type="button"
              onClick={() => goToPage(currentPage + 1)}
            >
              <ChevronRightIcon className="h-4 w-4 stroke-[2]" />
            </button>
            {onPageSizeChange && pageSizeOptions.length > 0 ? (
              <select
                aria-label="Pairings per page"
                className={cn(styles.pageButton, styles.pageButtonWide, styles.pageSizeSelect)}
                disabled={isResultsRefreshing}
                value={pageSize}
                onChange={(event) => {
                  resetResultsScroll();
                  onPageSizeChange(Number(event.target.value));
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {`${option}/Page`}
                  </option>
                ))}
              </select>
            ) : (
              <span className={cn(styles.pageButton, styles.pageButtonWide, styles.pageSizeLabel)}>
                {`${pageSize}/Page`}
              </span>
            )}
            <span className={styles.footerText}>Go to</span>
            <label className={styles.visuallyHidden} htmlFor="pairing-search-page-input">
              Go to pairing search page
            </label>
            <input
              id="pairing-search-page-input"
              className={styles.pageInput}
              disabled={isResultsRefreshing}
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && pageInput) {
                  goToPage(Number(pageInput));
                }
              }}
            />
            <span className={styles.footerText}>Page</span>
          </div>
        </div>
      </div>
      {bidTierDialog ? <BidTierDialog {...bidTierDialog} /> : null}
    </section>
  );
};
