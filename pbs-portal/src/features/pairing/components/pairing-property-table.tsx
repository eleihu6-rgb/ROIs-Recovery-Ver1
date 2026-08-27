import {
  EyeIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { type CSSProperties, useEffect, useRef } from "react";
import { TierToggleGroup } from "@/shared/components/tiers";
import {
  formatPairingBidSummaryPrefix,
  formatPairingBidValue,
} from "@/features/pairing/pairing-bid-summary";
import { PairingBidSummaryView } from "@/features/pairing/components/pairing-bid-summary-view";
import { useI18n } from "@/shared/i18n";
import {
  EFFICIENT_FLYING_PROPERTY_CODE,
  useEfficientFlyingConfig,
} from "@/features/pairing/efficient-flying-config";
import { FavoritePropertyCard } from "@/shared/components/preferences/favorite-property-card";
import { LoadingBlock } from "@/shared/components/ui/loading-block";
import type {
  PairingAvailableProperty,
  PairingExistingProperty,
  PairingPropertyAction,
} from "@/features/pairing/types";

export type PairingPropertyTableLayout = {
  countGridTemplateColumns?: string;
  columnGap: number;
  existingCountGridTemplateColumns?: string;
  fieldWidth: string;
  gridTemplateColumns: string;
  tierWidth: string;
};

type PairingPropertyTableHeaderProps = {
  layout: PairingPropertyTableLayout;
  showCount?: boolean;
  showTiers?: boolean;
};

type ExistingPairingPropertyRowProps = {
  index: number;
  isDraftStructureMutationPending: boolean;
  isPoolCountLoading?: boolean;
  layout: PairingPropertyTableLayout;
  poolCount?: PairingPropertyPoolCountDisplay | null;
  property: PairingExistingProperty;
  onDelete: (propertyId: string) => void;
  onEdit: (propertyId: string) => void;
  onPreview: (propertyId: string) => void;
  onTierToggle: (propertyId: string, tierKey: string) => void;
};

type AvailablePairingPropertyRowProps = {
  isDraftStructureMutationPending: boolean;
  isFavoriteDeleteConfirming?: boolean;
  isFavoriteMutationPending: boolean;
  layout: PairingPropertyTableLayout;
  property: PairingAvailableProperty;
  onAction: (action: PairingPropertyAction, property: PairingAvailableProperty) => void;
  onEditFavorite?: (propertyId: string) => void;
  onFavoriteDeleteCancel?: () => void;
  onFavoriteDeleteConfirm?: (propertyId: string) => void;
  onFavoriteDeleteRequest?: (propertyId: string) => void;
  onFavoriteTierToggle?: (propertyId: string, tierKey: string) => void;
};

export type PairingPropertyPoolCountDisplay = {
  pairingIdCount: number;
  totalItems: number;
};

const getPropertyTableGridStyle = (
  layout: PairingPropertyTableLayout,
  showCount = false,
): CSSProperties => ({
  columnGap: `${layout.columnGap}px`,
  gridTemplateColumns: showCount
    ? layout.existingCountGridTemplateColumns ?? layout.countGridTemplateColumns ?? layout.gridTemplateColumns
    : layout.gridTemplateColumns,
});

const PAIRING_POOL_COUNT_UNIT = "pairings";

const getActiveTierLabels = (tiers: PairingAvailableProperty["tiers"]) =>
  tiers.filter((tier) => tier.active).map((tier) => tier.label);

const TopUsedBadge = () => (
  <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#dcdaf8] bg-[#f7f6ff] px-2.5 text-2xs font-bold uppercase tracking-[0.04em] text-[#6764cf]">
    TOP USED
  </span>
);

const formatSavedPairingBidSummary = (
  property: PairingAvailableProperty,
  efficientFlyingPercentile?: number,
) => {
  const summaryPrefix = property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE
    ? null
    : formatPairingBidSummaryPrefix(property);
  const bidSummary = formatPairingBidValue(property.bid, efficientFlyingPercentile);

  return summaryPrefix ? `${summaryPrefix} · ${bidSummary}` : bidSummary;
};

const FavoritePairingBidSummary = ({
  property,
}: {
  property: PairingAvailableProperty;
}) => {
  const efficientFlyingConfigQuery = useEfficientFlyingConfig(
    property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE,
  );

  return formatSavedPairingBidSummary(
    property,
    efficientFlyingConfigQuery.data?.percentile,
  );
};

export const PairingPropertyTableHeader = ({
  layout,
  showCount = false,
  showTiers = true,
}: PairingPropertyTableHeaderProps) => (
  <div
    className="grid items-center px-4 pb-3 text-sm font-bold leading-[18px] text-[#40424f]"
    style={getPropertyTableGridStyle(layout, showCount)}
  >
    <span>PROPERTY</span>
    <span>BID</span>
    {showTiers ? (
      <span className="justify-self-start whitespace-nowrap text-left">TIERS</span>
    ) : null}
    {showCount ? (
      <span className="justify-self-start whitespace-nowrap text-left">COUNT</span>
    ) : null}
    {showCount ? (
      <span className="justify-self-end whitespace-nowrap text-right">ACTIONS</span>
    ) : null}
  </div>
);

export const ExistingPairingPropertyRow = ({
  index,
  isDraftStructureMutationPending,
  isPoolCountLoading = false,
  layout,
  poolCount,
  property,
  onDelete,
  onEdit,
  onPreview,
  onTierToggle,
}: ExistingPairingPropertyRowProps) => (
  <div>
    <div
      className="grid items-start rounded-2xl border border-[#e1e6ef] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(68,76,96,0.045)] transition hover:border-[#cfd7eb] hover:shadow-[0_12px_30px_rgba(68,76,96,0.07)]"
      data-testid={`pairing-property-row-${property.id}`}
      style={getPropertyTableGridStyle(layout, true)}
    >
      <div className="min-w-0 pt-1">
        <div
          className="whitespace-normal break-words text-sm font-bold leading-5 text-[#40424f]"
          title={property.name}
        >
          {property.name}
        </div>
      </div>

      <PairingBidSummaryView ariaLabel={`Bid for existing ${property.name}`} property={property} />

      <div className="justify-self-start pt-px">
        <TierToggleGroup
          getAriaLabel={(option) => `Toggle existing ${option.label} for ${property.name}`}
          options={property.tiers}
          readonly={isDraftStructureMutationPending}
          width={layout.tierWidth}
          onToggle={(tierKey) => onTierToggle(property.id, tierKey)}
        />
      </div>

      <div className="justify-self-start pt-px">
        {isPoolCountLoading ? (
          <div aria-hidden="true" data-testid={`pairing-pool-count-skeleton-${property.id}`}>
            <LoadingBlock className="h-[30px] min-w-[120px] rounded-xl" />
          </div>
        ) : poolCount ? (
          <div
            className="inline-flex h-[30px] min-w-[120px] items-center justify-between rounded-xl border border-[#c8d1f6] bg-[#f5f6ff] px-3 text-xs font-bold leading-4 text-[#4f56a8] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
            data-testid={`pairing-pool-count-${property.id}`}
          >
            <span className="inline-block min-w-[46px] text-left tabular-nums">{poolCount.pairingIdCount}</span>
            <span className="sr-only"> </span>
            <span className="inline-block min-w-[48px] text-right">{PAIRING_POOL_COUNT_UNIT}</span>
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="h-[30px] min-w-[120px]"
          />
        )}
      </div>

      <div className="flex min-w-[84px] shrink-0 justify-end gap-3 pt-[7px]" data-testid={`pairing-property-actions-${property.id}`}>
        <button
          aria-label={`Edit existing pairing property ${property.name} ${index + 1}`}
          className="inline-flex h-4 w-4 cursor-pointer items-center justify-center bg-transparent p-0 text-[#4d4f5c] transition hover:text-[#706cd5] focus-visible:text-[#706cd5] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
          disabled={isDraftStructureMutationPending}
          type="button"
          onClick={() => onEdit(property.id)}
        >
          <PencilSquareIcon className="h-4 w-4 stroke-[1.8]" />
        </button>
        <button
          aria-label={`Preview existing pairing property ${property.name} ${index + 1}`}
          className="inline-flex h-4 w-4 cursor-pointer items-center justify-center bg-transparent p-0 text-[#4d4f5c] transition hover:text-[#706cd5] focus-visible:text-[#706cd5] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
          disabled={isDraftStructureMutationPending}
          type="button"
          onClick={() => onPreview(property.id)}
        >
          <EyeIcon className="h-4 w-4 stroke-[1.8]" />
        </button>
        <button
          aria-label={`Delete existing pairing property ${property.name} ${index + 1}`}
          className="inline-flex h-4 w-4 cursor-pointer items-center justify-center bg-transparent p-0 text-[#4d4f5c] transition hover:text-[#d05b5b] focus-visible:text-[#d05b5b] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
          disabled={isDraftStructureMutationPending}
          type="button"
          onClick={() => onDelete(property.id)}
        >
          <TrashIcon className="h-4 w-4 stroke-[1.8]" />
        </button>
      </div>
    </div>
  </div>
);

export const AvailablePairingPropertyRow = ({
  isDraftStructureMutationPending,
  isFavoriteDeleteConfirming = false,
  isFavoriteMutationPending,
  layout,
  property,
  onAction,
  onEditFavorite,
  onFavoriteDeleteCancel,
  onFavoriteDeleteConfirm,
  onFavoriteDeleteRequest,
  onFavoriteTierToggle,
}: AvailablePairingPropertyRowProps) => {
  const { t } = useI18n();
  const activeTierLabels = getActiveTierLabels(property.tiers);
  const deleteFavoriteButtonRef = useRef<HTMLButtonElement>(null);
  const cancelFavoriteDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const wasFavoriteDeleteConfirmingRef = useRef(false);

  useEffect(() => {
    if (isFavoriteDeleteConfirming) {
      cancelFavoriteDeleteButtonRef.current?.focus();
    } else if (wasFavoriteDeleteConfirmingRef.current) {
      deleteFavoriteButtonRef.current?.focus();
    }

    wasFavoriteDeleteConfirmingRef.current = isFavoriteDeleteConfirming;
  }, [isFavoriteDeleteConfirming]);

  if (property.source === "favorite") {
    return (
      <FavoritePropertyCard
        actions={(
          <>
            {onEditFavorite ? (
              <button
                aria-label={`Edit favorite ${property.name}`}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent p-0 text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                disabled={isFavoriteMutationPending}
                type="button"
                onClick={() => onEditFavorite(property.id)}
              >
                <PencilSquareIcon className="h-4 w-4 stroke-[1.8]" />
              </button>
            ) : null}
            <button
              aria-label={t("pairing.table.previewAction", { propertyName: property.name })}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent p-0 text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="button"
              onClick={() => onAction("preview", property)}
            >
              <EyeIcon className="h-4 w-4 stroke-[1.8]" />
            </button>
            {onFavoriteDeleteRequest ? (
              <button
                aria-label={t("pairing.table.deleteFavoriteAction", { propertyName: property.name })}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent p-0 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-45"
                disabled={isFavoriteMutationPending}
                ref={deleteFavoriteButtonRef}
                type="button"
                onClick={() => onFavoriteDeleteRequest(property.id)}
              >
                <TrashIcon className="h-4 w-4 stroke-[1.8]" />
              </button>
            ) : null}
          </>
        )}
        addAction={(
          <button
            aria-label={t("pairing.table.addAction", { propertyName: property.name })}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent p-0 text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isDraftStructureMutationPending || activeTierLabels.length === 0}
            type="button"
            onClick={() => onAction("add", property)}
          >
            <PlusCircleIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        )}
        expandedContent={onFavoriteDeleteRequest && isFavoriteDeleteConfirming ? (
          <div className="mt-3 flex justify-end">
            <div className="w-[260px] rounded-2xl border border-[#dfe4ee] bg-white px-3 py-3 shadow-[0_12px_30px_rgba(68,76,96,0.14)]">
              <p className="m-0 text-sm font-semibold text-[#282c3b]">{t("ruleBid.favorite.removeConfirmation")}</p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="h-8 rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-bold text-[#6f7485]"
                  ref={cancelFavoriteDeleteButtonRef}
                  type="button"
                  onClick={onFavoriteDeleteCancel}
                >
                  {t("ruleBid.favorite.cancelRemove")}
                </button>
                <button
                  className="h-8 rounded-lg bg-[#d05b5b] px-3 text-xs font-bold text-white"
                  disabled={isFavoriteMutationPending}
                  type="button"
                  onClick={() => onFavoriteDeleteConfirm?.(property.id)}
                >
                  {isFavoriteMutationPending ? t("ruleBid.favorite.removing") : t("ruleBid.favorite.confirmRemove")}
                </button>
              </div>
            </div>
          </div>
        ) : undefined}
        name={property.name}
        summary={<FavoritePairingBidSummary property={property} />}
        summaryAriaLabel={`Favorite bid for ${property.name}`}
        testId="pairing-available-property-row"
        tierControl={(
          <TierToggleGroup
            getAriaLabel={(option) => `Select ${option.label} for favorite ${property.name}`}
            options={property.tiers}
            readonly={isDraftStructureMutationPending}
            width={layout.tierWidth}
            onToggle={(tierKey) => onFavoriteTierToggle?.(property.id, tierKey)}
          />
        )}
      />
    );
  }

  return (
    <div
      className="group flex min-h-[56px] items-center justify-between gap-4 rounded-2xl border border-[#e1e6ef] bg-white px-4 py-3 transition hover:border-[#cfd7eb] hover:bg-[#fbfcff] hover:shadow-[0_8px_22px_rgba(68,76,96,0.06)]"
      data-testid="pairing-available-property-row"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="min-w-0"
          style={{ width: layout.fieldWidth }}
          title={property.name}
        >
          <p className="m-0 truncate text-sm font-semibold leading-5 text-[#40424f]">{property.name}</p>
        </div>
        {property.recommendedSortOrder !== undefined ? <TopUsedBadge /> : null}
      </div>

      <button
        aria-label={t("pairing.table.addAction", { propertyName: property.name })}
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#d8dde8] bg-[#fbfcff] p-0 text-[#4d4f5c] transition group-hover:border-[#cbc8f6] group-hover:text-[#706cd5] hover:bg-[#f3f2ff] focus-visible:text-[#706cd5] focus-visible:outline-none disabled:cursor-default disabled:opacity-45"
        disabled={isDraftStructureMutationPending}
        type="button"
        onClick={() => onAction("add", property)}
      >
        <PlusCircleIcon className="h-4 w-4 stroke-[1.8]" />
      </button>
    </div>
  );
};

export const PairingAvailablePropertiesEmptyState = ({ activeTab }: { activeTab: "all" | "favorited" }) => {
  const { t } = useI18n();

  return (
    <div className="rounded-3xl border border-dashed border-[#d8dde6] px-4 py-8 text-center text-sm text-[#8d93a5]">
      {activeTab === "favorited" ? "No saved favorite setups match the current filters." : t("pairing.table.emptyProperties")}
    </div>
  );
};
