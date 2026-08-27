import {
  PencilSquareIcon,
  PlusCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Popover, PopoverContent, PopoverTrigger } from "@rois/ui";
import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import { TierToggleGroup } from "@/shared/components/tiers";
import { TierBidTypeBadge } from "@/features/tier/components/tier-bid-type-badge";
import type { TierBidType } from "@/features/tier/types";
import { PairingBidControl } from "@/features/pairing/components/pairing-bid-control";
import { formatPairingBidValue } from "@/features/pairing/pairing-bid-summary";
import type { PairingBidValue } from "@/features/pairing/types";
import { FavoritePropertyCard } from "@/shared/components/preferences/favorite-property-card";
import { useI18n } from "@/shared/i18n";
import type {
  RuleBidAvailableProperty,
  RuleBidExistingProperty,
} from "@/features/rule-bids/types";
import { isPairingBidValue } from "@/features/rule-bids/types";

export type RuleBidPropertyTableLayout = {
  columnGap: number;
  existingGridTemplateColumns?: string;
  fieldWidth: string;
  gridTemplateColumns: string;
  tierWidth: string;
};

export type RuleBidModifierPatch = Pick<RuleBidExistingProperty, "allOrNothing" | "minimumN">;

type RuleBidPropertyTableHeaderProps = {
  layout: RuleBidPropertyTableLayout;
  showTiers?: boolean;
};

type RuleBidModifierControlsProps = {
  allOrNothing?: boolean;
  minimumN?: number | null;
  name: string;
  onChange: (patch: RuleBidModifierPatch) => void;
};

type RuleBidExistingPropertyRowProps = {
  existingBidEditMode: "inline" | "dialog";
  displayVariant?: "card" | "bid-list";
  isDraftStructureMutationPending: boolean;
  isEditing: boolean;
  layout: RuleBidPropertyTableLayout;
  property: RuleBidExistingProperty;
  renderBidSummary?: (property: RuleBidExistingProperty) => ReactNode;
  shouldReplacePropertyNameWithSummary?: (property: RuleBidExistingProperty) => boolean;
  showModifiers: boolean;
  showEditAction?: boolean;
  onBidChange: (propertyId: string, bid: PairingBidValue) => void;
  onDelete: (propertyId: string) => void;
  onEditToggle: (propertyId: string) => void;
  onTierToggle: (propertyId: string, tierKey: string) => void;
  onModifierChange: (propertyId: string, patch: RuleBidModifierPatch) => void;
};

type RuleBidAvailablePropertyRowProps = {
  isDraftStructureMutationPending: boolean;
  isFavoriteDeleteConfirming?: boolean;
  isFavoriteMutationPending: boolean;
  layout: RuleBidPropertyTableLayout;
  property: RuleBidAvailableProperty;
  showFavoriteDeleteAction?: boolean;
  onAdd: (propertyId: string) => void;
  onEditFavorite?: (propertyId: string) => void;
  onTierToggle: (propertyId: string, tierKey: string) => void;
  onFavoriteDeleteCancel?: () => void;
  onFavoriteDeleteConfirm?: (propertyId: string) => void;
  onFavoriteDeleteRequest?: (propertyId: string) => void;
};

type RuleBidPropertyEditorProps = {
  description?: string;
  layout: RuleBidPropertyTableLayout;
  property: RuleBidAvailableProperty | RuleBidExistingProperty;
  onBidChange: (propertyId: string, bid: PairingBidValue) => void;
  onModifierChange: (propertyId: string, patch: RuleBidModifierPatch) => void;
};

const clampMinimumN = (value: number) => Math.min(31, Math.max(1, value));

const getRuleBidTableGridStyle = (layout: RuleBidPropertyTableLayout): CSSProperties => ({
  columnGap: `${layout.columnGap}px`,
  gridTemplateColumns: layout.gridTemplateColumns,
});

const getRuleBidExistingGridStyle = (layout: RuleBidPropertyTableLayout): CSSProperties => ({
  columnGap: `${layout.columnGap}px`,
  gridTemplateColumns: layout.existingGridTemplateColumns ?? layout.gridTemplateColumns,
});

const formatRuleBidValue = (bid: RuleBidAvailableProperty["bid"]) => {
  if (bid.type === "minimum-base-layover") {
    return `At least ${bid.minimumDuration}`;
  }

  return formatPairingBidValue(bid);
};

const getActiveTierLabels = (tiers: RuleBidAvailableProperty["tiers"]) =>
  tiers.filter((tier) => tier.active).map((tier) => tier.label);

const getModifierLabels = (property: Pick<RuleBidAvailableProperty, "minimumN">) => [
  property.minimumN ? `Min ${property.minimumN}` : null,
].filter((label): label is string => label !== null);

const getRuleBidType = (
  categoryLabel: RuleBidExistingProperty["categoryLabel"],
): TierBidType => {
  if (categoryLabel === "Days Off") {
    return "DaysOff";
  }

  if (categoryLabel === "Pairing") {
    return "Pairing";
  }

  if (categoryLabel === "Roster") {
    return "Line";
  }

  if (categoryLabel === "Reserve") {
    return "Reserve";
  }

  return "Unsupported";
};

const RuleBidSummaryChip = ({ label }: { label: string }) => (
  <span className="inline-flex min-h-[24px] items-center rounded-lg border border-[#d8dde8] bg-[#f8f9fc] px-2 text-xs font-bold leading-4 text-[#6f7485]">
    {label}
  </span>
);

const TopUsedBadge = () => (
  <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#dcdaf8] bg-[#f7f6ff] px-2.5 text-2xs font-bold uppercase tracking-[0.04em] text-[#6764cf]">
    TOP USED
  </span>
);

export const RuleBidPropertyTableHeader = ({ layout, showTiers = true }: RuleBidPropertyTableHeaderProps) => (
  <div
    className="grid items-center px-4 pb-3 text-sm font-bold leading-[18px] text-[#40424f]"
    style={getRuleBidExistingGridStyle(layout)}
  >
    <span>PROPERTY</span>
    <span>BID</span>
    {showTiers ? (
      <>
        <span className="justify-self-start whitespace-nowrap text-left">TIERS</span>
        <span className="justify-self-end whitespace-nowrap text-right">ACTIONS</span>
      </>
    ) : null}
  </div>
);

export const RuleBidExistingPropertyRow = ({
  existingBidEditMode,
  displayVariant = "card",
  isDraftStructureMutationPending,
  isEditing,
  layout,
  property,
  renderBidSummary,
  shouldReplacePropertyNameWithSummary,
  showModifiers,
  showEditAction = true,
  onBidChange,
  onDelete,
  onEditToggle,
  onTierToggle,
  onModifierChange,
}: RuleBidExistingPropertyRowProps) => {
  const usesEditAction = showModifiers || (existingBidEditMode === "dialog" && showEditAction);
  const shouldUseReadonlySummary = usesEditAction
    || existingBidEditMode === "dialog"
    || !isPairingBidValue(property.bid);
  const bidSummary = renderBidSummary?.(property) ?? formatRuleBidValue(property.bid);
  const replacesPropertyName = shouldReplacePropertyNameWithSummary?.(property) ?? false;

  if (displayVariant === "bid-list") {
    const activeTierLabels = getActiveTierLabels(property.tiers);

    return (
      <div
        className="grid min-w-0 grid-cols-[108px_minmax(0,1fr)_150px_96px] items-start gap-4 border-t border-[#eef1f6] px-3 py-3 text-sm leading-5 transition-colors hover:bg-[#fbfcff]"
        data-testid="rule-bid-existing-row"
      >
        <div>
          <TierBidTypeBadge bidType={getRuleBidType(property.categoryLabel)} />
        </div>
        <div className="min-w-0">
          {replacesPropertyName ? bidSummary : (
            <>
              <p className="break-words font-semibold text-[#4d4f5c]">{property.name}</p>
              <div
                aria-label={`Bid for existing ${property.name}`}
                className="mt-1 break-words text-xs font-medium text-[#6f7485]"
              >
                {bidSummary}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap content-start gap-1">
          {activeTierLabels.map((tier) => (
            <span
              key={`${property.id}-${tier}`}
              className="inline-flex h-6 min-w-[34px] items-center justify-center rounded-lg border border-[#dfe3ec] bg-white px-2 text-xs font-semibold text-[#6f7485]"
            >
              {tier}
            </span>
          ))}
        </div>
        <div className="flex items-start justify-end gap-3">
          {usesEditAction ? (
            <button
              aria-label={`Edit existing property ${property.name}`}
              className="h-7 cursor-pointer rounded-lg border border-[#c9c7f5] bg-white px-3 text-xs font-semibold text-[#5d59bd] hover:bg-[#f0f0ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#706cd5] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isDraftStructureMutationPending}
              type="button"
              onClick={() => onEditToggle(property.id)}
            >
              EDIT
            </button>
          ) : null}
          <button
            aria-label={`Delete existing property ${property.name}`}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[#f0c4c4] bg-[#fff4f4] p-0 text-[#a33d3d] hover:bg-[#ffeded] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c75c5c] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isDraftStructureMutationPending}
            type="button"
            onClick={() => onDelete(property.id)}
          >
            <TrashIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[10px]" data-testid="rule-bid-existing-row">
      <div
        className="grid items-start rounded-2xl border border-[#e1e6ef] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(68,76,96,0.045)] transition hover:border-[#cfd7eb] hover:shadow-[0_12px_30px_rgba(68,76,96,0.07)]"
        style={getRuleBidExistingGridStyle(layout)}
      >
        <div className="min-w-0 pt-1">
          <div
            className="whitespace-normal break-words text-sm font-bold leading-5 text-[#40424f]"
            title={property.name}
          >
            {property.name}
          </div>
        </div>

        {shouldUseReadonlySummary ? (
          <div
            aria-label={`Bid for existing ${property.name}`}
            className="min-h-[34px] whitespace-normal break-words rounded-xl bg-[#f5f7fb] px-3 py-2 text-sm font-semibold leading-5 text-[#596174] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
            title={typeof bidSummary === "string" ? bidSummary : undefined}
          >
            {bidSummary}
          </div>
        ) : isPairingBidValue(property.bid) ? (
          <PairingBidControl
            ariaLabel={`Bid for existing ${property.name}`}
            bid={property.bid}
            readOnly={usesEditAction || isDraftStructureMutationPending}
            onChange={(bid) => onBidChange(property.id, bid)}
          />
        ) : (
          <div
            aria-label={`Bid for existing ${property.name}`}
            className="min-h-[34px] whitespace-normal break-words rounded-xl bg-[#f5f7fb] px-3 py-2 text-sm font-semibold leading-5 text-[#596174] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          >
            {bidSummary}
          </div>
        )}

        <div className="justify-self-start pt-px">
          <TierToggleGroup
            getAriaLabel={(option) => `Toggle existing ${option.label} for ${property.name}`}
            options={property.tiers}
            readonly={isDraftStructureMutationPending}
            width={layout.tierWidth}
            onToggle={(tierKey) => onTierToggle(property.id, tierKey)}
          />
        </div>

        <div className="flex justify-end gap-3 pt-[7px]">
          {usesEditAction ? (
            <button
              aria-label={
                isEditing
                  ? `Finish editing existing property ${property.name}`
                  : `Edit existing property ${property.name}`
              }
              className="inline-flex h-4 w-4 cursor-pointer items-center justify-center bg-transparent p-0 text-[#4d4f5c] transition hover:text-[#706cd5] focus-visible:text-[#706cd5] focus-visible:outline-none"
              type="button"
              onClick={() => onEditToggle(property.id)}
            >
              <PencilSquareIcon className="h-4 w-4 stroke-[1.8]" />
            </button>
          ) : null}
          <button
            aria-label={`Delete existing property ${property.name}`}
            className="inline-flex h-4 w-4 cursor-pointer items-center justify-center bg-transparent p-0 text-[#4d4f5c] transition hover:text-[#d05b5b] focus-visible:text-[#d05b5b] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isDraftStructureMutationPending}
            type="button"
            onClick={() => onDelete(property.id)}
          >
            <TrashIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      </div>

      {showModifiers && isEditing ? (
        <RuleBidPropertyEditor
          layout={layout}
          property={property}
          onBidChange={onBidChange}
          onModifierChange={onModifierChange}
        />
      ) : null}
    </div>
  );
};

export const RuleBidAvailablePropertyRow = ({
  isDraftStructureMutationPending,
  isFavoriteDeleteConfirming = false,
  isFavoriteMutationPending,
  layout,
  property,
  showFavoriteDeleteAction = false,
  onAdd,
  onEditFavorite,
  onTierToggle,
  onFavoriteDeleteCancel,
  onFavoriteDeleteConfirm,
  onFavoriteDeleteRequest,
}: RuleBidAvailablePropertyRowProps) => {
  const { t } = useI18n();
  const favoriteI18nValues = { propertyName: property.name };
  const activeTierLabels = getActiveTierLabels(property.tiers);
  const modifierLabels = getModifierLabels(property);

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
            {showFavoriteDeleteAction && property.favoriteKey && onFavoriteDeleteRequest ? (
              <Popover
                open={isFavoriteDeleteConfirming}
                onOpenChange={(open) => {
                  if (isFavoriteMutationPending) {
                    return;
                  }

                  if (open) {
                    onFavoriteDeleteRequest(property.id);
                    return;
                  }

                  onFavoriteDeleteCancel?.();
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    aria-label={t("ruleBid.favorite.removeAction", favoriteI18nValues)}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent p-0 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={isFavoriteMutationPending}
                    type="button"
                  >
                    <TrashIcon className="h-4 w-4 stroke-[1.8]" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="z-[70] w-[244px] rounded-2xl border border-[#f1dcb9] bg-white p-3 text-[#40424f] shadow-[0_14px_36px_rgba(45,49,66,0.16)]"
                  side="top"
                  sideOffset={8}
                >
                  <p className="text-sm font-semibold leading-[18px] text-[#7b5a1f]">
                    {t("ruleBid.favorite.removeConfirmation")}
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      aria-label={t("ruleBid.favorite.cancelRemoveAction", favoriteI18nValues)}
                      className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isFavoriteMutationPending}
                      type="button"
                      onClick={onFavoriteDeleteCancel}
                    >
                      {t("ruleBid.favorite.cancelRemove")}
                    </button>
                    <button
                      aria-label={t("ruleBid.favorite.confirmRemoveAction", favoriteI18nValues)}
                      className="h-[30px] cursor-pointer rounded-lg border border-[#c75c5c] bg-[#c75c5c] px-3 text-xs font-semibold text-white hover:bg-[#b64f4f] focus:outline-none focus:ring-2 focus:ring-[#c75c5c] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isFavoriteMutationPending}
                      type="button"
                      onClick={() => onFavoriteDeleteConfirm?.(property.id)}
                    >
                      {isFavoriteMutationPending ? t("ruleBid.favorite.removing") : t("ruleBid.favorite.confirmRemove")}
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </>
        )}
        addAction={(
          <button
            aria-label={`Add ${property.name}`}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-transparent p-0 text-muted-foreground transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isDraftStructureMutationPending || activeTierLabels.length === 0}
            type="button"
            onClick={() => onAdd(property.id)}
          >
            <PlusCircleIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        )}
        modifiers={modifierLabels.length > 0 ? (
          <>
            {modifierLabels.map((label) => <RuleBidSummaryChip key={label} label={label} />)}
          </>
        ) : undefined}
        name={property.name}
        summary={formatRuleBidValue(property.bid)}
        summaryAriaLabel={`Favorite bid for ${property.name}`}
        testId="rule-bid-available-row"
        tierControl={(
          <TierToggleGroup
            getAriaLabel={(option) => `Select ${option.label} for favorite ${property.name}`}
            options={property.tiers}
            readonly={isDraftStructureMutationPending}
            width={layout.tierWidth}
            onToggle={(tierKey) => onTierToggle(property.id, tierKey)}
          />
        )}
      />
    );
  }

  return (
    <div
      className="group flex min-h-[56px] items-center justify-between gap-4 rounded-2xl border border-[#e1e6ef] bg-white px-4 py-3 transition hover:border-[#cfd7eb] hover:bg-[#fbfcff] hover:shadow-[0_8px_22px_rgba(68,76,96,0.06)]"
      data-testid="rule-bid-available-row"
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
        aria-label={`Add ${property.name}`}
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[#d8dde8] bg-[#fbfcff] p-0 text-[#4d4f5c] transition group-hover:border-[#cbc8f6] group-hover:text-[#706cd5] hover:bg-[#f3f2ff] focus-visible:text-[#706cd5] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
        disabled={isDraftStructureMutationPending}
        type="button"
        onClick={() => onAdd(property.id)}
      >
        <PlusCircleIcon className="h-4 w-4 stroke-[1.8]" />
      </button>
    </div>
  );
};

export const RuleBidAvailablePropertiesEmptyState = ({ activeTab }: { activeTab: "all" | "favorited" }) => (
  <div className="rounded-3xl border border-dashed border-[#d8dde6] px-4 py-8 text-center text-sm text-[#8d93a5]">
    {activeTab === "favorited"
      ? "No saved favorite setups match the current filters."
      : "No properties match the current filters."}
  </div>
);

const RuleBidPropertyEditor = ({
  description,
  layout,
  property,
  onBidChange,
  onModifierChange,
}: RuleBidPropertyEditorProps) => (
  <div
    className="grid items-start"
    style={getRuleBidTableGridStyle(layout)}
  >
    <div />
    <div
      className="rounded-3xl border border-[#e4e8f1] bg-[#fbfcff] px-4 py-4"
      style={{ gridColumn: "2 / 5" }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#8d93a5]">
        EDIT BID
      </p>
      {description ? (
        <p className="mt-1 text-sm leading-[18px] text-[#6f7485]">
          {description}
        </p>
      ) : null}
      <div className="mt-3">
        {isPairingBidValue(property.bid) ? (
          <PairingBidControl
            ariaLabel={`Edit bid for ${"favorited" in property ? "available" : "existing"} ${property.name}`}
            bid={property.bid}
            onChange={(bid) => onBidChange(property.id, bid)}
          />
        ) : (
          <div className="min-h-[34px] whitespace-normal break-words rounded-xl bg-[#f5f7fb] px-3 py-2 text-sm font-semibold leading-5 text-[#596174]">
            {formatRuleBidValue(property.bid)}
          </div>
        )}
      </div>
      <div className="mt-3">
        <RuleBidModifierControls
          allOrNothing={property.allOrNothing}
          minimumN={property.minimumN}
          name={property.name}
          onChange={(patch) => onModifierChange(property.id, patch)}
        />
      </div>
    </div>
  </div>
);

const RuleBidModifierControls = ({
  allOrNothing = false,
  minimumN = null,
  name,
  onChange,
}: RuleBidModifierControlsProps) => (
  <div className="flex min-w-0 flex-wrap items-center gap-2">
    <label className="inline-flex h-[30px] cursor-pointer items-center gap-1 rounded-xl border border-[#cfd6e4] bg-white px-2 text-xs font-medium text-[#6f7485]">
      <input
        aria-label={`All or Nothing for ${name}`}
        checked={allOrNothing}
        className="h-3.5 w-3.5 cursor-pointer accent-[#706cd5]"
        type="checkbox"
        onChange={(event) => onChange({ allOrNothing: event.target.checked })}
      />
      AON
    </label>

    <label className="inline-flex h-[30px] items-center gap-1 rounded-xl border border-[#cfd6e4] bg-white px-2 text-xs font-medium text-[#6f7485]">
      Min
      <input
        aria-label={`Minimum N for ${name}`}
        className="h-6 w-[42px] border-0 bg-transparent p-0 text-center text-xs font-semibold text-[#6f7485] outline-none"
        min={1}
        max={31}
        type="number"
        value={minimumN ?? ""}
        onChange={(event) => {
          if (event.target.value === "") {
            onChange({ minimumN: null });
            return;
          }

          const parsed = Number(event.target.value);

          if (!Number.isSafeInteger(parsed)) {
            return;
          }

          onChange({ minimumN: clampMinimumN(parsed) });
        }}
      />
    </label>
  </div>
);
