import { useEffect, useState } from "react";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { TierBidTypeBadge } from "@/features/tier/components/tier-bid-type-badge";
import { TierDetailActionBar } from "@/features/tier/components/tier-detail-actions";
import { TIER_EDIT_LABELS } from "@/features/tier/tier-editing-actions";
import type { TierDiagnostic, TierSummaryItem, TierWarning } from "@/features/tier/types";
import type { TierDetailViewModel } from "@/features/tier/tier-detail-selectors";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";

export type TierDetailMutationState = {
  status: "idle" | "saving" | "deleting" | "error";
  message?: string;
};

type TierDetailDialogProps = {
  detail: TierDetailViewModel;
  isPairingSetPreviewOpen?: boolean;
  mutationState?: TierDetailMutationState;
  onClose: () => void;
  onDeleteBid?: (item: TierSummaryItem) => Promise<void>;
  onOpenPairingSetPreview?: () => void;
  onSaveTiers?: (item: TierSummaryItem, tiers: string[]) => Promise<void>;
  onSelectItem: (item: TierSummaryItem) => void;
};

const reasonStyles: Record<TierDiagnostic["severity"] | "warning", string> = {
  info: "border-[#d8def0] bg-[#f6f8ff] text-[#535c7c]",
  warning: "border-[#f1dcb9] bg-[#fff8ed] text-[#7b5a1f]",
};

const getActionLabel = (action?: string) => {
  if (action === "SetCondition") {
    return "Set Condition";
  }

  return action;
};

const getReadOnlyReason = (item?: TierSummaryItem) => {
  if (!item) {
    return null;
  }

  if (item.warningCode) {
    return "Review-only legacy item.";
  }

  if (item.bidType === "Unsupported") {
    return "Unsupported bid cannot be edited from Tier.";
  }

  if (item.tiers.some((tier) => !TIER_EDIT_LABELS.includes(tier))) {
    return "Outside T1-T7 review range.";
  }

  if (!item.editableSource) {
    return "Edit this bid from its source page.";
  }

  if (!item.isEditable) {
    return "This bid is review-only in Tier.";
  }

  return null;
};

const getEditableTiersFromKey = (tierSelectionKey: string) =>
  tierSelectionKey.length > 0 ? tierSelectionKey.split("|") : [];

const FieldValue = ({ label, value }: { label: string; value?: string }) => (
  <div className="min-w-0">
    <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
      {label}
    </p>
    <p className="mt-1 break-words text-sm font-semibold leading-[18px] text-[#40424f]">
      {value && value.length > 0 ? value : "N/A"}
    </p>
  </div>
);

const TierDetailReadOnlyNotice = ({
  item,
  manageFromBid,
}: {
  item?: TierSummaryItem;
  manageFromBid?: boolean;
}) => {
  if (!item) {
    return null;
  }

  const readOnlyReason = manageFromBid && item.isEditable
    ? "Manage this bid from Bid."
    : getReadOnlyReason(item);

  if (!readOnlyReason) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-[#e4e8f1] bg-white p-4">
      <p className="text-sm font-semibold leading-[18px] text-[#7f8392]">{readOnlyReason}</p>
    </section>
  );
};

const TierChips = ({ tiers }: { tiers: string[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {tiers.map((tier) => (
      <span
        key={tier}
        className="inline-flex h-[24px] min-w-[34px] items-center justify-center rounded-lg border border-[#dfe3ec] bg-white px-2 text-xs font-semibold leading-4 text-[#6f7485]"
      >
        {tier}
      </span>
    ))}
  </div>
);

const ReviewReason = ({
  message,
  severity,
}: {
  message: string;
  severity: TierDiagnostic["severity"] | "warning";
}) => (
  <div className={`flex gap-3 rounded-xl border px-3 py-3 text-sm leading-[18px] ${reasonStyles[severity]}`}>
    <ExclamationTriangleIcon className="mt-[1px] h-4 w-4 shrink-0" />
    <p className="break-words">{message}</p>
  </div>
);

const BidSummary = ({ item, tiers }: { item?: TierSummaryItem; tiers: string[] }) => {
  if (!item) {
    return (
      <section className="rounded-2xl border border-[#e4e8f1] bg-[#fbfcff] p-4">
        <p className="text-sm font-semibold leading-[18px] text-[#6f7485]">
          No bid is directly attached to this review item.
        </p>
        <div className="mt-3">
          <TierChips tiers={tiers} />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e4e8f1] bg-[#fbfcff] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TierBidTypeBadge bidType={item.bidType} />
        {item.warningCode ? (
          <span className="inline-flex rounded-lg border border-[#f1dcb9] bg-[#fff8ed] px-2 py-[3px] text-xs font-semibold leading-4 text-[#7b5a1f]">
            Review-only
          </span>
        ) : null}
      </div>
      <p className="mt-3 break-words text-lg font-semibold leading-6 text-[#282c3b]">
        {item.readableText}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <FieldValue label="Action" value={getActionLabel(item.action)} />
        <FieldValue label="Label" value={item.label} />
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
          Tx
        </p>
        <TierChips tiers={tiers} />
      </div>
    </section>
  );
};

const Conditions = ({ item }: { item?: TierSummaryItem }) => (
  <section>
    <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
      Conditions
    </h4>
    {item && item.conditions.length > 0 ? (
      <ol className="mt-2 flex flex-col gap-2">
        {item.conditions.map((condition) => (
          <li
            key={condition.id}
            className="rounded-xl border border-[#e4e8f1] bg-white px-3 py-2 text-sm font-semibold leading-[18px] text-[#5f6575]"
          >
            {condition.text}
          </li>
        ))}
      </ol>
    ) : (
      <p className="mt-2 rounded-xl border border-dashed border-[#d8dde6] px-3 py-3 text-sm font-semibold leading-[18px] text-[#7f8392]">
        No additional conditions.
      </p>
    )}
  </section>
);

const ReviewReasons = ({
  diagnostics,
  warnings,
}: {
  diagnostics: TierDiagnostic[];
  warnings: TierWarning[];
}) => (
  <section>
    <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
      Review Reasons
    </h4>
    {diagnostics.length > 0 || warnings.length > 0 ? (
      <div className="mt-2 flex flex-col gap-2">
        {diagnostics.map((diagnostic) => (
          <ReviewReason
            key={diagnostic.id}
            message={diagnostic.message}
            severity={diagnostic.severity}
          />
        ))}
        {warnings.map((warning) => (
          <ReviewReason
            key={`${warning.code}-${warning.tier ?? warning.message}`}
            message={warning.message}
            severity="warning"
          />
        ))}
      </div>
    ) : (
      <p className="mt-2 rounded-xl border border-dashed border-[#d8dde6] px-3 py-3 text-sm font-semibold leading-[18px] text-[#7f8392]">
        No review reasons are attached to this bid.
      </p>
    )}
  </section>
);

const RelatedBids = ({
  items,
  primaryItem,
  onSelectItem,
}: {
  items: TierSummaryItem[];
  primaryItem?: TierSummaryItem;
  onSelectItem: (item: TierSummaryItem) => void;
}) => {
  if (items.length <= 1) {
    return null;
  }

  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
        Related Bids
      </h4>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((item) => {
          const isSelected = item.id === primaryItem?.id;

          return (
            <button
              key={item.id}
              className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm leading-[18px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1 ${isSelected ? "border-[#c9c7f5] bg-[#f0f0ff] text-[#4d4f9f]" : "border-[#e4e8f1] bg-white text-[#5f6575] hover:bg-[#f8f9fb]"}`}
              type="button"
              onClick={() => onSelectItem(item)}
            >
              <span className="min-w-0 break-words font-semibold">{item.readableText}</span>
              <span className="shrink-0 font-semibold">{item.tiers.join(", ")}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const TierDetailDialog = ({
  detail,
  isPairingSetPreviewOpen = false,
  mutationState = { status: "idle" },
  onClose,
  onDeleteBid,
  onOpenPairingSetPreview,
  onSaveTiers,
  onSelectItem,
}: TierDetailDialogProps) => {
  const [isEditingTiers, setIsEditingTiers] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const primaryItem = detail.primaryItem;
  const isPending = mutationState.status === "saving" || mutationState.status === "deleting";
  const canMutateBid = Boolean(primaryItem && onDeleteBid && onSaveTiers);
  const editableTierSelectionKey = detail.tiers
    .filter((tier) => TIER_EDIT_LABELS.includes(tier))
    .join("|");

  useEffect(() => {
    setIsEditingTiers(false);
    setIsConfirmingDelete(false);
    setSelectedTiers(getEditableTiersFromKey(editableTierSelectionKey));
  }, [detail.primaryItem?.id, detail.subtitle, editableTierSelectionKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isPairingSetPreviewOpen) {
          return;
        }

        if (isPending) {
          return;
        }

        if (isEditingTiers) {
          setIsEditingTiers(false);
          setSelectedTiers(getEditableTiersFromKey(editableTierSelectionKey));
          return;
        }

        if (isConfirmingDelete) {
          setIsConfirmingDelete(false);
          return;
        }

        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editableTierSelectionKey, isConfirmingDelete, isEditingTiers, isPairingSetPreviewOpen, isPending, onClose]);

  const toggleTier = (tier: string) => {
    setSelectedTiers((current) =>
      current.includes(tier)
        ? current.filter((selectedTier) => selectedTier !== tier)
        : TIER_EDIT_LABELS.filter((candidate) => [...current, tier].includes(candidate)));
  };

  const cancelTierEdit = () => {
    setIsEditingTiers(false);
    setSelectedTiers(getEditableTiersFromKey(editableTierSelectionKey));
  };

  const openTierEdit = () => {
    setIsConfirmingDelete(false);
    setSelectedTiers(getEditableTiersFromKey(editableTierSelectionKey));
    setIsEditingTiers(true);
  };

  const openDeleteConfirm = () => {
    cancelTierEdit();
    setIsConfirmingDelete(true);
  };

  const saveTiers = () => {
    if (!primaryItem || !onSaveTiers) {
      return;
    }

    void onSaveTiers(primaryItem, selectedTiers)
      .then(() => {
        setIsEditingTiers(false);
        setIsConfirmingDelete(false);
      })
      .catch(() => undefined);
  };

  const deleteBid = () => {
    if (!primaryItem || !onDeleteBid) {
      return;
    }

    void onDeleteBid(primaryItem).catch(() => undefined);
  };

  return (
    <PbsDialogFrame
      ariaLabelledBy="tier-detail-title"
      bodyClassName="py-4"
      footer={(
        <TierDetailActionBar
          item={primaryItem}
          isConfirmingDelete={isConfirmingDelete}
          isEditingTiers={isEditingTiers}
          mutationState={mutationState}
          selectedTiers={selectedTiers}
          onCancelDelete={() => setIsConfirmingDelete(false)}
          onCancelEdit={cancelTierEdit}
          onDelete={canMutateBid ? deleteBid : undefined}
          onOpenDelete={openDeleteConfirm}
          onOpenEdit={openTierEdit}
          onOpenPairingSetPreview={onOpenPairingSetPreview}
          onSaveTiers={canMutateBid ? saveTiers : undefined}
          onToggleTier={toggleTier}
        />
      )}
      header={(
        <div className="flex items-start justify-between gap-4 border-b border-[#eef1f6] pb-4">
          <div className="min-w-0">
            <h3
              className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]"
              id="tier-detail-title"
            >
              {detail.title}
            </h3>
            <p className="mt-1 break-words text-xl font-semibold leading-7 text-[#282c3b]">
              {detail.subtitle}
            </p>
          </div>
          <button
            aria-label="Close tier detail"
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#d8dde6] bg-white text-[#7f8392] hover:bg-[#f8f9fb] focus:outline-none focus:ring-2 focus:ring-[#706cd5] focus:ring-offset-1"
            type="button"
            onClick={onClose}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      overlayClassName="z-40 bg-white/70"
      panelClassName="w-[calc(100%-24px)] max-w-[760px] rounded-3xl p-4 shadow-[0_20px_60px_rgba(45,49,66,0.18)]"
      testId="tier-detail-dialog"
      onClose={onClose}
    >
          <div className="flex flex-col gap-5">
            <BidSummary item={detail.primaryItem} tiers={detail.tiers} />
            <TierDetailReadOnlyNotice item={primaryItem} manageFromBid={!canMutateBid} />
            {mutationState.status === "error" && mutationState.message ? (
              <div className="rounded-xl border border-[#f0c4c4] bg-[#fff4f4] px-3 py-3 text-sm font-semibold leading-[18px] text-[#a33d3d]">
                {mutationState.message}
              </div>
            ) : null}
            <Conditions item={detail.primaryItem} />
            <ReviewReasons diagnostics={detail.diagnostics} warnings={detail.warnings} />
            <RelatedBids
              items={detail.relatedItems}
              primaryItem={detail.primaryItem}
              onSelectItem={onSelectItem}
            />
          </div>
    </PbsDialogFrame>
  );
};
