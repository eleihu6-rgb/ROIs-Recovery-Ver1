import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { PanelStripHeader } from "@/shared/components/panel";
import { AvailablePropertiesPaginationFooter } from "@/shared/components/pagination/available-properties-pagination-footer";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/cn";
import type { PairingBidValue } from "@/features/pairing/types";
import {
  RuleBidAvailablePropertiesEmptyState,
  RuleBidAvailablePropertyRow,
  RuleBidExistingPropertyRow,
  RuleBidPropertyTableHeader,
  type RuleBidModifierPatch,
  type RuleBidPropertyTableLayout,
} from "@/features/rule-bids/components/rule-bid-property-table";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
} from "@/features/rule-bids/types";
import type {
  RuleBidAvailableCategoryFilter,
  RuleBidAvailablePropertyTab,
} from "@/features/rule-bids/utils";
import { DraftConflictRecoveryAlert } from "@/features/rule-bids/components/draft-conflict-recovery-alert";

type AvailablePropertiesPaginationItems = Parameters<
  typeof AvailablePropertiesPaginationFooter
>[0]["paginationItems"];

type RuleBidMessagesProps = {
  informationalMessages: string[];
  saveErrorMessage: string | null;
  showDraftConflictRecovery: boolean;
  validationErrors: string[];
  onReloadDraft: () => void;
};

export const RuleBidMessages = ({
  informationalMessages,
  saveErrorMessage,
  showDraftConflictRecovery,
  validationErrors,
  onReloadDraft,
}: RuleBidMessagesProps) => (
  <>
    {showDraftConflictRecovery ? (
      <DraftConflictRecoveryAlert onReload={onReloadDraft} />
    ) : null}

    {validationErrors.length > 0 || saveErrorMessage ? (
      <div
        aria-live="polite"
        className="mb-4 rounded-2xl border border-[#f2c6c6] bg-[#fff7f7] px-3 py-2 text-xs font-medium leading-5 text-[#a24747]"
        role="alert"
      >
        {saveErrorMessage ? <p>{saveErrorMessage}</p> : null}
        {validationErrors.length > 0 ? (
          <ul className="list-disc pl-4">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null}

    {informationalMessages.length > 0 ? (
      <div
        aria-live="polite"
        className="mb-4 rounded-2xl border border-[#c7d9f4] bg-[#f6f9ff] px-3 py-2 text-xs font-medium leading-5 text-[#526982]"
      >
        <ul className="list-disc pl-4">
          {informationalMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    ) : null}
  </>
);

type RuleBidExistingPropertiesSectionProps = {
  existingBidEditMode: "inline" | "dialog";
  existingEmptyMessage?: string;
  existingListVariant?: "card" | "bid-list";
  existingProperties: RuleBidExistingProperty[];
  existingToolbar?: ReactNode;
  hideAvailablePropertiesSection: boolean;
  informationalMessages: string[];
  isDraftStructureMutationPending: boolean;
  layout: RuleBidPropertyTableLayout;
  renderBidSummary?: (property: RuleBidExistingProperty) => ReactNode;
  shouldReplacePropertyNameWithSummary?: (property: RuleBidExistingProperty) => boolean;
  saveErrorMessage: string | null;
  showDraftConflictRecovery: boolean;
  showModifiers: boolean;
  validationErrors: string[];
  onReloadDraft: () => void;
  editingExistingPropertyId: string | null;
  shouldShowExistingEditAction?: (property: RuleBidExistingProperty) => boolean;
  viewportBound?: boolean;
  onBidChange: (propertyId: string, bid: PairingBidValue) => void;
  onDelete: (propertyId: string) => void;
  onEditToggle: (propertyId: string) => void;
  onModifierChange: (propertyId: string, patch: RuleBidModifierPatch) => void;
  onTierToggle: (propertyId: string, tierKey: string) => void;
};

export const RuleBidExistingPropertiesSection = ({
  existingBidEditMode,
  existingEmptyMessage = "No saved properties yet. Add one from the list below to start building this draft.",
  existingListVariant = "card",
  existingProperties,
  existingToolbar,
  hideAvailablePropertiesSection,
  informationalMessages,
  isDraftStructureMutationPending,
  layout,
  renderBidSummary,
  shouldReplacePropertyNameWithSummary,
  saveErrorMessage,
  showDraftConflictRecovery,
  showModifiers,
  validationErrors,
  onReloadDraft,
  editingExistingPropertyId,
  shouldShowExistingEditAction,
  viewportBound = false,
  onBidChange,
  onDelete,
  onEditToggle,
  onModifierChange,
  onTierToggle,
}: RuleBidExistingPropertiesSectionProps) => (
  <div className={cn(
    "mt-[20px]",
    hideAvailablePropertiesSection ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "",
    viewportBound ? "flex max-h-[40%] min-h-0 shrink-0 flex-col overflow-hidden" : "",
  )}>
    <RuleBidMessages
      informationalMessages={informationalMessages}
      saveErrorMessage={saveErrorMessage}
      showDraftConflictRecovery={showDraftConflictRecovery}
      validationErrors={validationErrors}
      onReloadDraft={onReloadDraft}
    />

    {existingToolbar ? (
      <div className="mb-3 shrink-0">
        {existingToolbar}
      </div>
    ) : null}

    {existingListVariant === "card" ? <RuleBidPropertyTableHeader layout={layout} /> : null}

    {existingProperties.length === 0 ? (
      <p className="pb-4 text-sm leading-[20px] text-[#6f7485]">
        {existingEmptyMessage}
      </p>
    ) : (
      <div className={cn(
        "flex flex-col",
        existingListVariant === "bid-list"
          ? "overflow-hidden rounded-xl border border-[#e4e8f1]"
          : "gap-[10px]",
        hideAvailablePropertiesSection || viewportBound
          ? "min-h-0 overflow-y-auto pb-1 pr-1"
          : "",
      )}
      data-testid="rule-bid-existing-rows-scroll">
        {existingProperties.map((item) => (
          <RuleBidExistingPropertyRow
            key={item.id}
            displayVariant={existingListVariant}
            existingBidEditMode={existingBidEditMode}
            isDraftStructureMutationPending={isDraftStructureMutationPending}
            isEditing={editingExistingPropertyId === item.id}
            layout={layout}
            property={item}
            renderBidSummary={renderBidSummary}
            shouldReplacePropertyNameWithSummary={shouldReplacePropertyNameWithSummary}
            showEditAction={shouldShowExistingEditAction?.(item) ?? true}
            showModifiers={showModifiers}
            onBidChange={onBidChange}
            onDelete={onDelete}
            onEditToggle={onEditToggle}
            onTierToggle={onTierToggle}
            onModifierChange={onModifierChange}
          />
        ))}
      </div>
    )}
  </div>
);

type RuleBidAvailablePropertiesSectionProps = {
  actionDisabled: boolean;
  activeCategoryKey: string;
  activeTab: RuleBidAvailablePropertyTab;
  allPropertiesLabel: string;
  categoryFilters: RuleBidAvailableCategoryFilter[];
  confirmingFavoriteDeleteId: string | null;
  currentPage: number;
  favoritedPropertiesLabel: string;
  isFavoriteMutationPending: boolean;
  layout: RuleBidPropertyTableLayout;
  pageSize: number;
  pagedProperties: RuleBidAvailableProperty[];
  paginationItems: AvailablePropertiesPaginationItems;
  searchKeyword: string;
  searchPlaceholder: string;
  sectionTitle: string;
  showFavoritePropertiesTab: boolean;
  totalItems: number;
  totalPages: number;
  shouldShowAvailableFavoriteDeleteAction?: (
    property: RuleBidAvailableProperty,
    activeTab: RuleBidAvailablePropertyTab,
  ) => boolean;
  onAdd: (propertyId: string) => void;
  onEditFavorite?: (propertyId: string) => void;
  onTierToggle: (propertyId: string, tierKey: string) => void;
  onCategoryChange: (categoryKey: string) => void;
  onFavoriteDeleteCancel: () => void;
  onFavoriteDeleteConfirm: (propertyId: string) => void;
  onFavoriteDeleteRequest: (propertyId: string) => void;
  onPageChange: (page: number) => void;
  onSearchKeywordChange: (value: string) => void;
  onTabChange: (tab: RuleBidAvailablePropertyTab) => void;
  hideChrome?: boolean;
  hidePagination?: boolean;
  viewportBound?: boolean;
  categoryFilterVariant?: "chips" | "bid-tabs";
};

type RuleBidCategoryFilterBarProps = {
  activeCategoryKey: string;
  allPropertiesLabel: string;
  displayVariant: "chips" | "bid-tabs";
  filters: RuleBidAvailableCategoryFilter[];
  onCategoryChange: (categoryKey: string) => void;
};

const RuleBidCategoryFilterBar = ({
  activeCategoryKey,
  allPropertiesLabel,
  displayVariant,
  filters,
  onCategoryChange,
}: RuleBidCategoryFilterBarProps) => (
  <div
    aria-label="Property categories"
    className={cn(
      "flex min-w-0 flex-wrap items-center",
      displayVariant === "bid-tabs" ? "gap-8 border-b border-[#dfe3eb]" : "gap-2",
    )}
    role={displayVariant === "bid-tabs" ? "tablist" : "group"}
  >
    {filters.map((filter) => {
      const isActive = filter.key === activeCategoryKey;
      const label = displayVariant === "bid-tabs"
        ? (filter.key === "all" ? allPropertiesLabel : filter.label).toUpperCase()
        : `${filter.label} ${filter.count}`;

      return (
        <button
          key={filter.key}
          aria-pressed={displayVariant === "chips" ? isActive : undefined}
          aria-selected={displayVariant === "bid-tabs" ? isActive : undefined}
          className={cn(
            displayVariant === "bid-tabs"
              ? "relative cursor-pointer border-0 bg-transparent pb-3 text-sm font-medium leading-[18px] text-[#6f7485] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff] focus-visible:ring-offset-1"
              : "h-8 cursor-pointer rounded-full border px-3 text-xs font-bold leading-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8f93ff] focus-visible:ring-offset-1",
            displayVariant === "bid-tabs" && isActive
              ? "font-bold text-[#6467d1] after:absolute after:bottom-0 after:left-[-10px] after:right-[-10px] after:h-[3px] after:rounded-full after:bg-[#6467d1] after:content-['']"
              : "",
            displayVariant === "chips" && isActive
              ? "border-[#6866cc] bg-[#f3f2ff] text-[#5f5ccc] shadow-[0_6px_14px_rgba(104,102,204,0.12)]"
              : "",
            displayVariant === "chips" && !isActive
              ? "border-[#d8dde6] bg-white text-[#6f7485] hover:border-[#cbc8f6] hover:bg-[#fbfbff] hover:text-[#5f5ccc]"
              : "",
          )}
          role={displayVariant === "bid-tabs" ? "tab" : undefined}
          type="button"
          onClick={() => onCategoryChange(filter.key)}
        >
          {label}
        </button>
      );
    })}
  </div>
);

export const RuleBidAvailablePropertiesSection = ({
  actionDisabled,
  activeCategoryKey,
  activeTab,
  allPropertiesLabel,
  categoryFilters,
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
  showFavoritePropertiesTab,
  totalItems,
  totalPages,
  shouldShowAvailableFavoriteDeleteAction,
  onAdd,
  onEditFavorite,
  onTierToggle,
  onCategoryChange,
  onFavoriteDeleteCancel,
  onFavoriteDeleteConfirm,
  onFavoriteDeleteRequest,
  onPageChange,
  onSearchKeywordChange,
  onTabChange,
  hideChrome = false,
  hidePagination = false,
  viewportBound = false,
  categoryFilterVariant = "chips",
}: RuleBidAvailablePropertiesSectionProps) => (
  <div
    className={cn(
      "flex flex-1 flex-col",
      hideChrome
        ? "min-h-0"
        : viewportBound
          ? "mt-[22px] min-h-0 overflow-hidden"
          : "mt-[22px] min-h-[420px] overflow-hidden",
    )}
    data-testid="rule-bid-add-properties-workspace"
  >
    {hideChrome ? null : <PanelStripHeader title={sectionTitle} />}

    {hideChrome || !showFavoritePropertiesTab ? null : <div className="mt-[12px] flex items-center gap-[38px]">
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
    {hideChrome || !showFavoritePropertiesTab ? null : <div className="mt-px h-px bg-[#dfe3eb]" />}

    {hideChrome ? null : <div className={cn(
      "mt-[14px] flex gap-3",
      categoryFilterVariant === "bid-tabs"
        ? "flex-col items-stretch"
        : "flex-wrap items-center",
      categoryFilters.length > 0 && categoryFilterVariant !== "bid-tabs"
        ? "justify-between"
        : "justify-end",
    )}>
      {categoryFilters.length > 0 ? (
        <RuleBidCategoryFilterBar
          activeCategoryKey={activeCategoryKey}
          allPropertiesLabel={allPropertiesLabel}
          displayVariant={categoryFilterVariant}
          filters={categoryFilters}
          onCategoryChange={onCategoryChange}
        />
      ) : null}
      <div
        className={cn(
          "relative w-[270px]",
          categoryFilterVariant === "bid-tabs" ? "ml-auto" : "",
        )}
        data-testid="rule-bid-search-shell"
      >
        <Input
          className="h-[30px] rounded-lg border-[#cfd6e4] bg-white pr-9 text-sm text-[#6f7485] shadow-none placeholder:text-[#c5c9d3] focus-visible:ring-0"
          placeholder={searchPlaceholder}
          value={searchKeyword}
          onChange={(event) => onSearchKeywordChange(event.target.value)}
        />
        <MagnifyingGlassIcon className="pointer-events-none absolute right-[10px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7f8392]" />
      </div>
    </div>}

    <div className={cn(
      "min-h-0 flex-1 pr-1",
      hideChrome ? "" : "mt-[18px] overflow-y-auto pb-[24px]",
    )}
    data-testid="rule-bid-available-rows-scroll">
      <div className="pb-[14px] text-sm font-bold leading-[18px] text-[#40424f]">
        PROPERTY
      </div>

      <div className="flex flex-col gap-[10px]">
        {pagedProperties.map((item, index) => {
          const previousItem = pagedProperties[index - 1];
          const showCategoryHeader = categoryFilterVariant !== "bid-tabs"
            && item.categoryLabel
            && item.categoryLabel !== previousItem?.categoryLabel;

          return (
            <div key={item.id} className="contents">
              {showCategoryHeader ? (
                <div className="pt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#8d93a5]">
                  {item.categoryLabel}
                </div>
              ) : null}
              <RuleBidAvailablePropertyRow
                isDraftStructureMutationPending={actionDisabled}
                isFavoriteDeleteConfirming={confirmingFavoriteDeleteId === item.id}
                isFavoriteMutationPending={isFavoriteMutationPending || actionDisabled}
                layout={layout}
                property={item}
                showFavoriteDeleteAction={
                  shouldShowAvailableFavoriteDeleteAction?.(item, activeTab)
                  ?? (item.source === "favorite")
                }
                onAdd={onAdd}
                onEditFavorite={onEditFavorite}
                onTierToggle={onTierToggle}
                onFavoriteDeleteCancel={onFavoriteDeleteCancel}
                onFavoriteDeleteConfirm={onFavoriteDeleteConfirm}
                onFavoriteDeleteRequest={onFavoriteDeleteRequest}
              />
            </div>
          );
        })}
        {pagedProperties.length === 0 ? (
          <RuleBidAvailablePropertiesEmptyState activeTab={activeTab} />
        ) : null}
      </div>
    </div>

    {hidePagination ? null : viewportBound ? (
      <div className="shrink-0">
        <AvailablePropertiesPaginationFooter
          currentPage={currentPage}
          pageSize={pageSize}
          paginationItems={paginationItems}
          testId="rule-bid-add-properties-footer"
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    ) : (
      <AvailablePropertiesPaginationFooter
        currentPage={currentPage}
        pageSize={pageSize}
        paginationItems={paginationItems}
        testId="rule-bid-add-properties-footer"
        totalItems={totalItems}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    )}
  </div>
);

type RuleBidAddShortcutProps = {
  addButtonLabel: string;
  disabled?: boolean;
  onClick: () => void;
};

export const RuleBidAddShortcut = ({
  addButtonLabel,
  disabled = false,
  onClick,
}: RuleBidAddShortcutProps) => (
  <div className="mt-[14px] flex justify-end">
    <Button
      className="h-[28px] min-w-[182px] rounded-lg border border-[#d5dbe5] bg-white px-[14px] text-xs font-medium leading-4 text-[#7f8392] shadow-none hover:bg-[#f8f9fb]"
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
    >
      {addButtonLabel}
    </Button>
  </div>
);
