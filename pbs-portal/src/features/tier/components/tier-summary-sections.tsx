import { useState, type KeyboardEvent, type ReactNode } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { Popover, PopoverContent, PopoverTrigger } from "@rois/ui";
import { TierBidTypeBadge } from "@/features/tier/components/tier-bid-type-badge";
import type { TierSummaryItem } from "@/features/tier/types";

export const SummaryItemRow = ({
  item,
  onDelete,
  onOpenDetail,
  onPreview,
  reserveActionsSpace = false,
  summary,
}: {
  item: TierSummaryItem;
  onDelete?: (item: TierSummaryItem) => Promise<void>;
  onOpenDetail: (item: TierSummaryItem) => void;
  onPreview?: (item: TierSummaryItem) => void;
  reserveActionsSpace?: boolean;
  summary?: ReactNode;
}) => {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const showActions = reserveActionsSpace || Boolean(onPreview) || Boolean(onDelete);

  const openItem = () => {
    if (!isDeleting) {
      onOpenDetail(item);
    }
  };

  const handleOpenKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget
      && (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      openItem();
    }
  };

  const deleteItem = async () => {
    if (!onDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await onDelete(item);
      setIsDeleteOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Unable to delete this bid. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="flex min-w-0 items-stretch border-t border-[#eef1f6] transition-colors hover:bg-[#fbfcff]"
      data-testid="tier-summary-row"
    >
      <div
        aria-label={`Open detail for ${item.displayTier ? `${item.displayTier} ` : ""}${item.readableText}`}
        aria-disabled={isDeleting}
        className="grid min-w-0 flex-1 cursor-pointer grid-cols-[108px_minmax(0,1fr)_150px] gap-4 px-[10px] py-3 text-left text-sm leading-[20px] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#706cd5] disabled:cursor-not-allowed disabled:opacity-60"
        role="button"
        tabIndex={isDeleting ? -1 : 0}
        onClick={openItem}
        onKeyDown={handleOpenKeyDown}
      >
        <div>
          <TierBidTypeBadge bidType={item.bidType} />
        </div>
        <div className="min-w-0" data-testid="tier-summary-readable-text">
          {summary ?? (
            <p className="break-words font-medium text-[#4d4f5c]">{item.readableText}</p>
          )}
          {item.conditions.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm leading-[18px] text-[#6f7485]">
              {item.conditions.map((condition) => (
                <li key={condition.id} className="break-words pl-3">
                  {condition.text}
                </li>
              ))}
            </ul>
          ) : null}
          {item.warningCode ? (
            <p className="mt-2 text-sm leading-[18px] text-[#9a6a1d]">
              Review-only item.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap content-start gap-1 justify-self-start">
          {item.tiers.map((tier) => (
            <span
              key={`${item.id}-${tier}`}
              className="inline-flex h-[24px] min-w-[34px] items-center justify-center rounded-lg border border-[#dfe3ec] bg-white px-2 text-xs font-semibold leading-4 text-[#6f7485]"
            >
              {tier}
            </span>
          ))}
        </div>
      </div>

      {showActions ? (
        <div
          className="flex w-[150px] shrink-0 items-start justify-end gap-3 px-[10px] py-3"
          data-testid="tier-summary-actions"
        >
          {onPreview ? (
            <button
              aria-label={`Preview ${item.readableText}`}
              className="h-[28px] cursor-pointer rounded-lg border border-[#c9c7f5] bg-white px-3 text-xs font-semibold text-[#5d59bd] hover:bg-[#f0f0ff] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDeleting}
              type="button"
              onClick={() => onPreview(item)}
            >
              PREVIEW
            </button>
          ) : null}

          {onDelete ? (
            <Popover
              open={isDeleteOpen}
              onOpenChange={(open) => {
                if (!isDeleting) {
                  setDeleteError(null);
                  setIsDeleteOpen(open);
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  aria-label={`Delete ${item.readableText}`}
                  className="inline-flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-lg border border-[#f0c4c4] bg-[#fff4f4] text-[#a33d3d] hover:bg-[#ffeded] focus:outline-none focus:ring-2 focus:ring-[#c75c5c] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isDeleting}
                  type="button"
                >
                  <TrashIcon className="h-4 w-4 stroke-[1.8]" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="z-[70] w-[312px] rounded-2xl border border-[#f1dcb9] bg-white p-3 text-[#40424f] shadow-[0_14px_36px_rgba(45,49,66,0.16)]"
                side="top"
                sideOffset={8}
              >
                <p className="text-sm font-semibold leading-[18px] text-[#7b5a1f]">
                  Delete this bid from the current draft?
                </p>
                {deleteError ? (
                  <p className="mt-2 text-sm font-medium leading-[18px] text-[#a33d3d]" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isDeleting}
                    type="button"
                    onClick={() => setIsDeleteOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="h-[30px] cursor-pointer rounded-lg border border-[#c75c5c] bg-[#c75c5c] px-3 text-xs font-semibold text-white hover:bg-[#b64f4f] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isDeleting}
                    type="button"
                    onClick={() => void deleteItem()}
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
