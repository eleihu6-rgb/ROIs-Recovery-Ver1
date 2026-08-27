import {
  HeartIcon as HeartOutlineIcon,
  PencilSquareIcon,
  PlusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { useMemo } from "react";
import {
  TIER_TOGGLE_COLUMN_WIDTHS,
  TierToggleGroup,
} from "@/shared/components/tiers";
import { PairingBidSummaryView } from "@/features/pairing/components/pairing-bid-summary-view";
import { buildPairingExistingPropertyFromSearchCriteria } from "@/features/pairing/pairing-search-criteria";
import type {
  PairingSearchCriteriaItem,
} from "@/features/pairing/types";
import styles from "@/features/pairing/components/pairing-search-panel.module.css";
import { cn } from "@/shared/lib/cn";

type PairingSearchCriteriaRowProps = {
  actionsDisabled?: boolean;
  isAddPending?: boolean;
  isFavoritePending?: boolean;
  item: PairingSearchCriteriaItem;
  onAdd?: (item: PairingSearchCriteriaItem) => void;
  onEditToggle?: (itemId: string) => void;
  onFavoriteToggle?: (item: PairingSearchCriteriaItem) => void;
  onTierToggle?: (itemId: string, tierKey: string) => void;
  onRemove?: (itemId: string) => void;
  showTiers?: boolean;
};

export const PairingSearchCriteriaRow = ({
  actionsDisabled = false,
  isAddPending = false,
  isFavoritePending = false,
  item,
  onAdd,
  onEditToggle,
  onFavoriteToggle,
  onTierToggle,
  onRemove,
  showTiers = false,
}: PairingSearchCriteriaRowProps) => {
  const hasActions = Boolean(onAdd || onFavoriteToggle || onEditToggle || onRemove);
  const summaryProperty = useMemo(
    () => buildPairingExistingPropertyFromSearchCriteria(item, 0),
    [item],
  );

  return (
    <div className={styles.criteriaRowGroup}>
      <article className={styles.criteriaRow} aria-label={`Search criteria ${item.name}`}>
        <div className={styles.criteriaCardHeader}>
          <div className={styles.criteriaName} title={item.name}>
            {item.name}
          </div>

          <div
            aria-label={`Actions for search criteria ${item.name}`}
            className={styles.criteriaActions}
            data-testid={`pairing-search-criteria-actions-${item.id}`}
          >
            {hasActions ? (
              <>
                {onAdd ? (
                  <button
                    aria-label={`Add search criteria ${item.name}`}
                    className={styles.criteriaActionButton}
                    disabled={actionsDisabled || isAddPending}
                    type="button"
                    onClick={() => onAdd(item)}
                  >
                    <PlusCircleIcon className="h-4 w-4 stroke-[1.8]" />
                  </button>
                ) : null}
                {onFavoriteToggle ? (
                  <button
                    aria-label={item.favorited ? `Unfavorite search criteria ${item.name}` : `Favorite search criteria ${item.name}`}
                    aria-pressed={item.favorited ? "true" : "false"}
                    className={cn(
                      styles.criteriaActionButton,
                      item.favorited ? styles.criteriaActionButtonFavorite : "",
                    )}
                    disabled={actionsDisabled || isFavoritePending}
                    type="button"
                    onClick={() => onFavoriteToggle(item)}
                  >
                    {item.favorited ? (
                      <HeartSolidIcon className="h-4 w-4" />
                    ) : (
                      <HeartOutlineIcon className="h-4 w-4 stroke-[1.8]" />
                    )}
                  </button>
                ) : null}
                {onEditToggle ? (
                  <button
                    aria-label={`Edit search criteria ${item.name}`}
                    className={styles.criteriaActionButton}
                    disabled={actionsDisabled}
                    type="button"
                    onClick={() => onEditToggle(item.id)}
                  >
                    <PencilSquareIcon className="h-4 w-4 stroke-[1.8]" />
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    aria-label={`Remove search criteria ${item.name}`}
                    className={styles.criteriaActionButton}
                    disabled={actionsDisabled}
                    type="button"
                    onClick={() => onRemove(item.id)}
                  >
                    <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className={styles.criteriaBid}>
          <PairingBidSummaryView
            ariaLabel={`Bid for search criteria ${item.name}`}
            property={summaryProperty}
            variant="criteria"
          />
        </div>

        {showTiers ? (
          <div className={styles.criteriaTiers}>
            <TierToggleGroup
              getAriaLabel={(option) => `Toggle search criteria ${option.label} for ${item.name}`}
              options={item.tiers}
              readonly={actionsDisabled || !onTierToggle}
              width={TIER_TOGGLE_COLUMN_WIDTHS.medium}
              onToggle={(tierKey) => onTierToggle?.(item.id, tierKey)}
            />
          </div>
        ) : null}
      </article>
    </div>
  );
};
