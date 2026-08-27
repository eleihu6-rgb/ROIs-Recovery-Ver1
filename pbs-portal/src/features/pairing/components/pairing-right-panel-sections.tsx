import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { PanelStripHeader } from "@/shared/components/panel";
import { AvailablePropertiesPaginationFooter } from "@/shared/components/pagination/available-properties-pagination-footer";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";
import { PairingRuleExpressionView } from "@/features/pairing/components/pairing-rule-expression-view";
import {
  AvailablePairingPropertyRow,
  ExistingPairingPropertyRow,
  PairingAvailablePropertiesEmptyState,
  PairingPropertyTableHeader,
  type PairingPropertyPoolCountDisplay,
  type PairingPropertyTableLayout,
} from "@/features/pairing/components/pairing-property-table";
import type { PairingPoolCountsState, PairingPoolCountsSummaryDisplay } from "@/features/pairing/pairing-pool-counts";
import type { PairingRuleExpressionTier } from "@/features/pairing/pairing-rule-logic";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingPropertyAction,
} from "@/features/pairing/types";

type PairingExistingViewMode = "properties" | "rules";
type PairingAvailableTab = "all" | "favorited";
type AvailablePropertiesPaginationItems = Parameters<
  typeof AvailablePropertiesPaginationFooter
>[0]["paginationItems"];

type PairingPoolCountsToolbarProps = {
  additionalActions?: ReactNode;
  isSearchDisabled: boolean;
  pairingPoolCountsStatus: PairingPoolCountsState["status"];
  searchLabel: string;
  summary: PairingPoolCountsSummaryDisplay;
  toggleViewLabel: string;
  onRefresh: () => void;
  onSearch: () => void;
  onToggleView: () => void;
};

export const PairingPoolCountsToolbar = ({
  additionalActions,
  isSearchDisabled,
  pairingPoolCountsStatus,
  searchLabel,
  summary,
  toggleViewLabel,
  onRefresh,
  onSearch,
  onToggleView,
}: PairingPoolCountsToolbarProps) => (
  <div className="mt-[14px] flex items-center justify-between gap-4">
    <div
      className={cn(
        "flex h-[30px] min-w-0 flex-1 items-center overflow-hidden rounded-xl border px-2 text-xs font-semibold leading-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
        summary.state === "stale"
          ? "border-[#edc767] bg-[#fff8df] text-[#705616]"
          : summary.state === "error"
            ? "border-[#efb7b7] bg-[#fff2f2] text-[#9b3a3a]"
            : summary.state === "loading"
              ? "border-[#cdd3f6] bg-[#f4f6ff] text-[#4f56a8]"
              : summary.isEmptyResult
                ? "border-[#edc767] bg-[#fff8df] text-[#705616]"
                : "border-[#d8ddf3] bg-[#f7f8ff] text-[#3e4379]",
      )}
      data-testid="pairing-pool-counts-summary"
    >
      <span
        className="inline-flex h-[24px] min-w-[44px] items-center justify-center rounded-lg bg-[#706cd5] px-2 text-sm font-bold leading-4 text-white shadow-[0_4px_10px_rgba(112,108,213,0.22)]"
        data-testid="pairing-pool-counts-tier"
      >
        {summary.tier}
      </span>
      <span
        className="ml-3 inline-flex h-[24px] min-w-[86px] items-center justify-center rounded-lg bg-white/85 px-2 text-sm font-bold text-[#353a69] tabular-nums"
        data-testid="pairing-pool-counts-rules"
      >
        {summary.rulesLabel}
      </span>
      <span
        className="ml-2 min-w-0 truncate pr-1 text-sm font-bold tabular-nums"
        data-testid="pairing-pool-counts-pairings"
      >
        {summary.resultLabel}
      </span>
    </div>

    <div className="flex shrink-0 justify-end gap-3">
      <Button
        className={cn(
          "h-[30px] cursor-pointer rounded-lg border px-[14px] text-xs font-semibold shadow-none disabled:cursor-default disabled:opacity-60",
          pairingPoolCountsStatus === "stale"
            ? "border-[#e3b94f] bg-[#fff7dd] text-[#705616] hover:bg-[#fff0bf]"
            : "border-[#d8dde6] bg-white text-[#6f7485] hover:bg-[#f8f9fb]",
        )}
        disabled={pairingPoolCountsStatus === "loading"}
        type="button"
        variant="ghost"
        onClick={onRefresh}
      >
        {pairingPoolCountsStatus === "loading" ? "REFRESHING" : "REFRESH"}
      </Button>
      <Button
        className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-[14px] text-xs font-semibold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
        type="button"
        variant="ghost"
        onClick={onToggleView}
      >
        {toggleViewLabel}
      </Button>
      {additionalActions}
      <Button
        className="h-[30px] cursor-pointer rounded-lg bg-[#706cd5] px-[14px] text-xs font-semibold text-white shadow-none hover:bg-[#615ec1]"
        disabled={isSearchDisabled}
        type="button"
        onClick={onSearch}
      >
        {searchLabel}
      </Button>
    </div>
  </div>
);

type PairingExistingPropertiesSectionProps = {
  emptyRulesLabel: string;
  existingProperties: PairingExistingProperty[];
  isDraftStructureMutationPending: boolean;
  isPoolRowCountLoading: boolean;
  layout: PairingPropertyTableLayout;
  poolCountRowsByPropertyKey: Map<string, PairingPropertyPoolCountDisplay>;
  ruleExpressionTiers: PairingRuleExpressionTier[];
  viewMode: PairingExistingViewMode;
  onDelete: (propertyId: string) => void;
  onEdit: (propertyId: string) => void;
  onPreview: (propertyId: string) => void;
  onTierToggle: (propertyId: string, tierKey: string) => void;
};

export const PairingExistingPropertiesSection = ({
  emptyRulesLabel,
  existingProperties,
  isDraftStructureMutationPending,
  isPoolRowCountLoading,
  layout,
  poolCountRowsByPropertyKey,
  ruleExpressionTiers,
  viewMode,
  onDelete,
  onEdit,
  onPreview,
  onTierToggle,
}: PairingExistingPropertiesSectionProps) => (
  <div className="mt-[18px]">
    {viewMode === "rules" ? (
      <PairingRuleExpressionView emptyLabel={emptyRulesLabel} tiers={ruleExpressionTiers} />
    ) : (
      <>
        <PairingPropertyTableHeader layout={layout} showCount />

        <div className="mt-[12px] flex flex-col gap-[10px]">
          {existingProperties.map((property, index) => (
            <ExistingPairingPropertyRow
              key={property.id}
              index={index}
              isDraftStructureMutationPending={isDraftStructureMutationPending}
              isPoolCountLoading={isPoolRowCountLoading}
              layout={layout}
              poolCount={poolCountRowsByPropertyKey.get(property.id) ?? null}
              property={property}
              onDelete={onDelete}
              onEdit={onEdit}
              onPreview={onPreview}
              onTierToggle={onTierToggle}
            />
          ))}
        </div>
      </>
    )}
  </div>
);

type PairingAvailablePropertiesSectionProps = {
  actionDisabled: boolean;
  activeTab: PairingAvailableTab;
  allPairingsLabel: string;
  allPropertiesLabel: string;
  confirmingFavoriteDeleteId: string | null;
  currentPage: number;
  favoritedPropertiesLabel: string;
  isFavoriteMutationPending: boolean;
  layout: PairingPropertyTableLayout;
  pageSize: number;
  pagedProperties: PairingAvailableProperty[];
  paginationItems: AvailablePropertiesPaginationItems;
  searchKeyword: string;
  searchPlaceholder: string;
  sectionTitle: string;
  totalItems: number;
  totalPages: number;
  onAction: (action: PairingPropertyAction, property: PairingAvailableProperty) => void;
  onEditFavorite: (propertyId: string) => void;
  onAllPairings: () => void;
  onFavoriteDeleteCancel: () => void;
  onFavoriteDeleteConfirm: (propertyId: string) => void;
  onFavoriteDeleteRequest: (propertyId: string) => void;
  onFavoriteTierToggle: (propertyId: string, tierKey: string) => void;
  onPageChange: (page: number) => void;
  onSearchKeywordChange: (value: string) => void;
  onTabChange: (tab: PairingAvailableTab) => void;
  hideChrome?: boolean;
  hidePagination?: boolean;
};

export const PairingAvailablePropertiesSection = ({
  actionDisabled,
  activeTab,
  allPairingsLabel,
  allPropertiesLabel,
  confirmingFavoriteDeleteId,
  currentPage,
  favoritedPropertiesLabel,
  isFavoriteMutationPending,
  layout,
  pageSize,
  pagedProperties,
  paginationItems,
  searchKeyword,
  searchPlaceholder,
  sectionTitle,
  totalItems,
  totalPages,
  onAction,
  onEditFavorite,
  onAllPairings,
  onFavoriteDeleteCancel,
  onFavoriteDeleteConfirm,
  onFavoriteDeleteRequest,
  onFavoriteTierToggle,
  onPageChange,
  onSearchKeywordChange,
  onTabChange,
  hideChrome = false,
  hidePagination = false,
}: PairingAvailablePropertiesSectionProps) => (
  <div
    className={cn(
      "flex flex-1 flex-col",
      hideChrome ? "min-h-0" : "mt-[24px] min-h-[520px]",
    )}
    data-testid="pairing-add-properties-workspace"
  >
    {hideChrome ? null : <PanelStripHeader title={sectionTitle} />}

    {hideChrome ? null : <div className="mt-[12px] flex items-center gap-[38px]">
      <button
        aria-pressed={activeTab === "favorited" ? "true" : "false"}
        className={cn(
          "relative cursor-pointer border-0 bg-transparent pb-[14px] text-sm font-medium leading-[18px] text-[#6f7485]",
          activeTab === "favorited"
            ? "font-bold text-[#6467d1] after:absolute after:bottom-0 after:left-[-12px] after:right-[-12px] after:h-[3px] after:rounded-full after:bg-[#6467d1] after:content-['']"
            : "",
        )}
        type="button"
        onClick={() => onTabChange("favorited")}
      >
        {favoritedPropertiesLabel}
      </button>
      <button
        aria-pressed={activeTab === "all" ? "true" : "false"}
        className={cn(
          "relative cursor-pointer border-0 bg-transparent pb-[14px] text-sm font-medium leading-[18px] text-[#6f7485]",
          activeTab === "all"
            ? "font-bold text-[#6467d1] after:absolute after:bottom-0 after:left-[-12px] after:right-[-12px] after:h-[3px] after:rounded-full after:bg-[#6467d1] after:content-['']"
            : "",
        )}
        type="button"
        onClick={() => onTabChange("all")}
      >
        {allPropertiesLabel}
      </button>
    </div>}
    {hideChrome ? null : <div className="mt-px h-px bg-[#dfe3eb]" />}

    {hideChrome ? null : <div className="mt-[14px] flex items-center justify-between gap-3">
      <Button
        className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-[14px] text-xs font-semibold text-[#6f7485] shadow-none hover:bg-[#f8f9fb]"
        disabled={actionDisabled}
        type="button"
        variant="ghost"
        onClick={onAllPairings}
      >
        {allPairingsLabel}
      </Button>
      <div className="relative w-[270px]" data-testid="pairing-search-shell">
        <Input
          className="h-[30px] rounded-lg border-[#cfd6e4] bg-white pr-9 text-sm text-[#6f7485] shadow-none placeholder:text-[#c5c9d3] focus-visible:ring-0"
          placeholder={searchPlaceholder}
          value={searchKeyword}
          onChange={(event) => onSearchKeywordChange(event.target.value)}
        />
        <MagnifyingGlassIcon className="pointer-events-none absolute right-[10px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7f8392]" />
      </div>
    </div>}

    <div className={cn(hideChrome ? "" : "mt-[18px] pb-[24px]")}>
      <div className="pb-[14px] text-sm font-bold leading-[18px] text-[#40424f]">
        PROPERTY
      </div>

      <div className="mt-[12px] flex flex-col gap-[10px]">
        {pagedProperties.map((property) => (
          <AvailablePairingPropertyRow
            key={property.id}
            isDraftStructureMutationPending={actionDisabled}
            isFavoriteDeleteConfirming={confirmingFavoriteDeleteId === property.id}
            isFavoriteMutationPending={isFavoriteMutationPending || actionDisabled}
            layout={layout}
            property={property}
            onAction={onAction}
            onEditFavorite={onEditFavorite}
            onFavoriteDeleteCancel={onFavoriteDeleteCancel}
            onFavoriteDeleteConfirm={onFavoriteDeleteConfirm}
            onFavoriteDeleteRequest={onFavoriteDeleteRequest}
            onFavoriteTierToggle={onFavoriteTierToggle}
          />
        ))}
        {pagedProperties.length === 0 ? (
          <PairingAvailablePropertiesEmptyState activeTab={activeTab} />
        ) : null}
      </div>
    </div>

    {hidePagination ? null : (
      <AvailablePropertiesPaginationFooter
        currentPage={currentPage}
        pageSize={pageSize}
        paginationItems={paginationItems}
        testId="pairing-add-properties-footer"
        totalItems={totalItems}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    )}
  </div>
);
