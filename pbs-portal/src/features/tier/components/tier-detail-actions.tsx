import { Popover, PopoverContent, PopoverTrigger } from "@rois/ui";
import { TIER_EDIT_LABELS } from "@/features/tier/tier-editing-actions";
import type { TierSummaryItem } from "@/features/tier/types";
import type { TierDetailMutationState } from "@/features/tier/components/tier-detail-dialog";

const TierEditPopoverButton = ({
  isEditingTiers,
  mutationState,
  selectedTiers,
  onCancel,
  onOpen,
  onSave,
  onToggleTier,
}: {
  isEditingTiers: boolean;
  mutationState: TierDetailMutationState;
  selectedTiers: string[];
  onCancel: () => void;
  onOpen: () => void;
  onSave: () => void;
  onToggleTier: (tier: string) => void;
}) => {
  const hasSelection = selectedTiers.length > 0;
  const isSaving = mutationState.status === "saving";
  const isPending = mutationState.status === "saving" || mutationState.status === "deleting";
  const handleEditOpenChange = (open: boolean) => {
    if (isSaving) {
      return;
    }

    if (open) {
      onOpen();
      return;
    }

    onCancel();
  };

  return (
    <Popover open={isEditingTiers} onOpenChange={handleEditOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="h-[32px] cursor-pointer rounded-lg border border-[#c9c7f5] bg-[#f7f7ff] px-4 text-xs font-semibold text-[#5d59bd] hover:bg-[#f0f0ff] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="button"
        >
          Edit Tx
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[70] w-[340px] rounded-2xl border border-[#d8def0] bg-white p-3 text-[#40424f] shadow-[0_14px_36px_rgba(45,49,66,0.16)]"
        side="top"
        sideOffset={8}
      >
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
            Edit Tx
          </h4>
          {!hasSelection ? (
            <span className="text-xs font-semibold text-[#a33d3d]">Select at least one Tx</span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIER_EDIT_LABELS.map((tier) => {
            const selected = selectedTiers.includes(tier);

            return (
              <button
                key={tier}
                aria-pressed={selected}
                className={`h-[30px] min-w-[44px] cursor-pointer rounded-lg border px-3 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-[#706cd5] bg-[#f0f0ff] text-[#4d4f9f]" : "border-[#dfe3ec] bg-white text-[#6f7485] hover:bg-[#f8f9fb]"}`}
                disabled={isPending}
                type="button"
                onClick={() => onToggleTier(tier)}
              >
                {tier}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="h-[30px] cursor-pointer rounded-lg border border-[#706cd5] bg-[#706cd5] px-3 text-xs font-semibold text-white hover:bg-[#625ec4] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !hasSelection}
            type="button"
            onClick={onSave}
          >
            {isSaving ? "Saving..." : "Save Tx"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const DeleteBidPopconfirmButton = ({
  buttonLabel,
  confirmLabel,
  confirmationText,
  isConfirmingDelete,
  mutationState,
  onCancelDelete,
  onDelete,
  onShowDeleteConfirm,
  pendingLabel,
}: {
  buttonLabel: string;
  confirmLabel: string;
  confirmationText: string;
  isConfirmingDelete: boolean;
  mutationState: TierDetailMutationState;
  onCancelDelete: () => void;
  onDelete: () => void;
  onShowDeleteConfirm: () => void;
  pendingLabel: string;
}) => {
  const isPending = mutationState.status === "saving" || mutationState.status === "deleting";
  const isDeleting = mutationState.status === "deleting";
  const handleDeleteConfirmOpenChange = (open: boolean) => {
    if (isDeleting) {
      return;
    }

    if (open) {
      onShowDeleteConfirm();
      return;
    }

    onCancelDelete();
  };

  return (
    <Popover open={isConfirmingDelete} onOpenChange={handleDeleteConfirmOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="h-[32px] cursor-pointer rounded-lg border border-[#f0c4c4] bg-[#fff4f4] px-4 text-xs font-semibold text-[#a33d3d] hover:bg-[#ffeded] focus:outline-none focus:ring-2 focus:ring-[#c75c5c] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="button"
        >
          {buttonLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="z-[70] w-[312px] rounded-2xl border border-[#f1dcb9] bg-white p-3 text-[#40424f] shadow-[0_14px_36px_rgba(45,49,66,0.16)]"
        side="top"
        sideOffset={8}
      >
        <p className="text-sm font-semibold leading-[18px] text-[#7b5a1f]">
          {confirmationText}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            className="h-[30px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-3 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            type="button"
            onClick={onCancelDelete}
          >
            Cancel
          </button>
          <button
            className="h-[30px] cursor-pointer rounded-lg border border-[#c75c5c] bg-[#c75c5c] px-3 text-xs font-semibold text-white hover:bg-[#b64f4f] focus:outline-none focus:ring-2 focus:ring-[#c75c5c] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isDeleting}
            type="button"
            onClick={onDelete}
          >
            {isDeleting ? pendingLabel : confirmLabel}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const TierDetailActionBar = ({
  item,
  isConfirmingDelete,
  isEditingTiers,
  mutationState,
  selectedTiers,
  onCancelDelete,
  onCancelEdit,
  onDelete,
  onOpenDelete,
  onOpenEdit,
  onOpenPairingSetPreview,
  onSaveTiers,
  onToggleTier,
}: {
  item?: TierSummaryItem;
  isConfirmingDelete: boolean;
  isEditingTiers: boolean;
  mutationState: TierDetailMutationState;
  selectedTiers: string[];
  onCancelDelete: () => void;
  onCancelEdit: () => void;
  onDelete?: () => void;
  onOpenDelete: () => void;
  onOpenEdit: () => void;
  onOpenPairingSetPreview?: () => void;
  onSaveTiers?: () => void;
  onToggleTier: (tier: string) => void;
}) => {
  const hasEditableActions = Boolean(item?.isEditable && onSaveTiers && onDelete);
  const hasPreviewAction = Boolean(onOpenPairingSetPreview);
  const deleteActionLabels = {
    buttonLabel: "Delete Bid",
    confirmationText: "Delete this bid from the current draft?",
    confirmLabel: "Delete",
    pendingLabel: "Deleting...",
  };

  if (!hasEditableActions && !hasPreviewAction) {
    return null;
  }

  return (
    <div className={`flex items-center gap-3 border-t border-[#eef1f6] pt-4 ${hasPreviewAction ? "justify-between" : "justify-end"}`}>
      {onOpenPairingSetPreview ? (
        <button
          className="h-[32px] cursor-pointer rounded-lg border border-[#c9c7f5] bg-[#f7f7ff] px-4 text-xs font-semibold text-[#5d59bd] hover:bg-[#f0f0ff] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={mutationState.status === "saving" || mutationState.status === "deleting"}
          type="button"
          onClick={onOpenPairingSetPreview}
        >
          View Pairing Set
        </button>
      ) : null}
      {hasEditableActions ? (
        <div className="flex justify-end gap-2">
          <TierEditPopoverButton
            isEditingTiers={isEditingTiers}
            mutationState={mutationState}
            selectedTiers={selectedTiers}
            onCancel={onCancelEdit}
            onOpen={onOpenEdit}
            onSave={onSaveTiers!}
            onToggleTier={onToggleTier}
          />
          <DeleteBidPopconfirmButton
            buttonLabel={deleteActionLabels.buttonLabel}
            confirmLabel={deleteActionLabels.confirmLabel}
            confirmationText={deleteActionLabels.confirmationText}
            isConfirmingDelete={isConfirmingDelete}
            mutationState={mutationState}
            onCancelDelete={onCancelDelete}
            onDelete={onDelete!}
            onShowDeleteConfirm={onOpenDelete}
            pendingLabel={deleteActionLabels.pendingLabel}
          />
        </div>
      ) : null}
    </div>
  );
};
