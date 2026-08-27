import { Button } from "@/shared/components/ui/button";

type PbsBidDialogFooterProps = {
  cancelLabel?: string;
  canConfirm: boolean;
  canSecondaryAction?: boolean;
  confirmLabel: string;
  confirmPendingLabel: string;
  isPending: boolean;
  isSecondaryPending?: boolean;
  secondaryLabel?: string;
  secondaryPendingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  onSecondaryAction?: () => void;
};

export const PbsBidDialogFooter = ({
  cancelLabel = "CANCEL",
  canConfirm,
  canSecondaryAction = canConfirm,
  confirmLabel,
  confirmPendingLabel,
  isPending,
  isSecondaryPending = false,
  secondaryLabel,
  secondaryPendingLabel,
  onCancel,
  onConfirm,
  onSecondaryAction,
}: PbsBidDialogFooterProps) => {
  const isDisabled = isPending || isSecondaryPending;

  return (
    <div className="flex items-center justify-end gap-[10px]">
      <Button
        className="h-[34px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-[14px] text-sm font-bold text-[#282c3b] shadow-none"
        disabled={isDisabled}
        type="button"
        variant="ghost"
        onClick={onCancel}
      >
        {cancelLabel}
      </Button>
      {secondaryLabel && onSecondaryAction ? (
        <Button
          className="h-[34px] cursor-pointer rounded-lg border border-[#6866cc] bg-white px-[14px] text-sm font-bold text-[#6866cc] shadow-none disabled:cursor-default disabled:opacity-60"
          disabled={!canSecondaryAction || isDisabled}
          type="button"
          variant="ghost"
          onClick={onSecondaryAction}
        >
          {isSecondaryPending ? (secondaryPendingLabel ?? secondaryLabel) : secondaryLabel}
        </Button>
      ) : null}
      <Button
        className="h-[34px] cursor-pointer rounded-lg bg-[#6866cc] px-[14px] text-sm font-bold text-white disabled:cursor-default disabled:opacity-60"
        disabled={!canConfirm || isDisabled}
        type="button"
        onClick={onConfirm}
      >
        {isPending ? confirmPendingLabel : confirmLabel}
      </Button>
    </div>
  );
};
