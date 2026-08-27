import { PbsBidDialogFooter } from "@/shared/components/preferences/pbs-bid-dialog-footer";
import { useI18n } from "@/shared/i18n";

type PairingPropertyDialogFooterProps = {
  canConfirm: boolean;
  canSaveFavorite: boolean;
  confirmLabel?: string;
  confirmPendingLabel?: string;
  favoriteButtonLabel: string;
  isFavoritePending: boolean;
  isPending: boolean;
  showSaveFavorite: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSaveFavorite: () => void;
};

export const PairingPropertyDialogFooter = ({
  canConfirm,
  canSaveFavorite,
  confirmLabel,
  confirmPendingLabel,
  favoriteButtonLabel,
  isFavoritePending,
  isPending,
  showSaveFavorite,
  onCancel,
  onConfirm,
  onSaveFavorite,
}: PairingPropertyDialogFooterProps) => {
  const { t } = useI18n();

  return (
    <PbsBidDialogFooter
      cancelLabel={t("pairing.dialog.cancel")}
      canConfirm={canConfirm}
      canSecondaryAction={canSaveFavorite}
      confirmLabel={confirmLabel ?? t("pairing.dialog.addBid")}
      confirmPendingLabel={confirmPendingLabel ?? confirmLabel ?? t("pairing.dialog.addBid")}
      isPending={isPending}
      isSecondaryPending={isFavoritePending}
      secondaryLabel={showSaveFavorite ? favoriteButtonLabel : undefined}
      secondaryPendingLabel={t("pairing.dialog.savingFavorite")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onSecondaryAction={showSaveFavorite ? onSaveFavorite : undefined}
    />
  );
};
