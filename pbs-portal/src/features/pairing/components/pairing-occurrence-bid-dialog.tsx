import { XMarkIcon } from "@heroicons/react/24/outline";
import type { PbsPairingOccurrence } from "../../../../../packages/contracts/pbs-search-pairings.js";
import { formatPairingDateRange } from "@/features/pairing/pairing-date-format";
import type { PairingOccurrenceMode } from "@/features/pairing/pairing-number-occurrences";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

type PairingOccurrenceBidDialogProps = {
  confirmLabel?: string;
  errorLabel?: string | null;
  favoriteLabel?: string;
  isLoading: boolean;
  isOpen: boolean;
  isPending: boolean;
  isFavoritePending?: boolean;
  mode: PairingOccurrenceMode;
  occurrences: PbsPairingOccurrence[];
  onCancel: () => void;
  onConfirm: () => void;
  onSaveFavorite?: () => void;
  onSelectMode: (mode: PairingOccurrenceMode) => void;
  onSelectOccurrence: (occurrenceId: string) => void;
  onSelectPairingNumber: (pairingNumber: string) => void;
  onSelectTier?: (tier: string) => void;
  pairingNumbers: string[];
  selectedOccurrenceId: string | null;
  selectedPairingNumber: string;
  selectedTier?: string;
  tiers?: string[];
  title?: string;
};

const formatDateRange = (occurrence: PbsPairingOccurrence) =>
  formatPairingDateRange(occurrence.startDate, occurrence.endDate);

export const PairingOccurrenceBidDialog = ({
  confirmLabel,
  errorLabel,
  favoriteLabel,
  isLoading,
  isOpen,
  isPending,
  isFavoritePending = false,
  mode,
  occurrences,
  onCancel,
  onConfirm,
  onSaveFavorite,
  onSelectMode,
  onSelectOccurrence,
  onSelectPairingNumber,
  onSelectTier,
  pairingNumbers,
  selectedOccurrenceId,
  selectedPairingNumber,
  selectedTier,
  tiers,
  title,
}: PairingOccurrenceBidDialogProps) => {
  const { t } = useI18n();

  if (!isOpen) {
    return null;
  }

  const confirmButtonLabel = confirmLabel ?? t("pairing.dialog.addBid");
  const favoriteButtonLabel = favoriteLabel ?? t("pairing.dialog.saveFavorite");
  const titleLabel = title ?? t("pairing.dialog.occurrenceTitle");
  const requiresOccurrence = mode === "specific_date";
  const isConfirmDisabled = isPending || (requiresOccurrence && (isLoading || !selectedOccurrenceId));
  const isFavoriteDisabled = isPending || isFavoritePending || requiresOccurrence;
  const showTierChooser = Boolean(tiers?.length && selectedTier && onSelectTier);

  return (
    <PbsDialogFrame
      ariaLabel={t("pairing.dialog.occurrenceAriaLabel")}
      bodyClassName="mt-4"
      closeDisabled={isPending || isFavoritePending}
      footerClassName="mt-[18px] flex items-center justify-end gap-[10px]"
      panelClassName="w-[min(560px,calc(100vw-32px))]"
      header={(
        <div className="flex items-center">
          <p className="m-0 text-base font-bold leading-5 text-[#282c3b]">{titleLabel}</p>
          <button
            aria-label={t("pairing.dialog.closeOccurrenceAction")}
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[#6f7485] hover:text-[#6866cc] focus-visible:text-[#6866cc] focus-visible:outline-none"
            disabled={isPending || isFavoritePending}
            type="button"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4 stroke-[1.8]" />
          </button>
        </div>
      )}
      footer={(
        <>
          <button
            className="h-[34px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-[14px] text-sm font-bold text-[#282c3b] disabled:cursor-default disabled:opacity-60"
            disabled={isPending}
            type="button"
            onClick={onCancel}
          >
            {t("pairing.dialog.cancel")}
          </button>
          {onSaveFavorite ? (
            <button
              className="h-[34px] cursor-pointer rounded-lg border border-[#6866cc] bg-white px-[14px] text-sm font-bold text-[#6866cc] disabled:cursor-default disabled:opacity-60"
              disabled={isFavoriteDisabled}
              type="button"
              onClick={onSaveFavorite}
            >
              {isFavoritePending ? t("pairing.dialog.savingFavorite") : favoriteButtonLabel}
            </button>
          ) : null}
          <button
            className="h-[34px] cursor-pointer rounded-lg border border-[#6866cc] bg-[#6866cc] px-[14px] text-sm font-bold text-white disabled:cursor-default disabled:opacity-60"
            disabled={isConfirmDisabled}
            type="button"
            onClick={onConfirm}
          >
            {confirmButtonLabel}
          </button>
        </>
      )}
      onClose={onCancel}
    >
        <div>
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.pairingNumberLabel")}</p>
          {pairingNumbers.length > 1 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {pairingNumbers.map((pairingNumber) => (
                <button
                  key={pairingNumber}
                  aria-pressed={pairingNumber === selectedPairingNumber ? "true" : "false"}
                  className={cn(
                    "h-8 cursor-pointer rounded-lg border px-3 text-sm font-bold",
                    pairingNumber === selectedPairingNumber
                      ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
                      : "border-[#d8dde6] bg-white text-[#6f7485]",
                  )}
                  disabled={isPending}
                  type="button"
                  onClick={() => onSelectPairingNumber(pairingNumber)}
                >
                  {pairingNumber}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 inline-flex h-8 items-center rounded-lg border border-[#d8dde6] bg-[#fbfcff] px-3 text-sm font-bold text-[#282c3b]">
              {selectedPairingNumber}
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.bidModeLabel")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              aria-pressed={mode === "entire_month" ? "true" : "false"}
              className={cn(
                "h-9 cursor-pointer rounded-lg border px-3 text-sm font-bold",
                mode === "entire_month"
                  ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
                  : "border-[#d8dde6] bg-white text-[#6f7485]",
              )}
              disabled={isPending}
              type="button"
              onClick={() => onSelectMode("entire_month")}
            >
              {t("pairing.dialog.entireMonth")}
            </button>
            <button
              aria-pressed={mode === "specific_date" ? "true" : "false"}
              className={cn(
                "h-9 cursor-pointer rounded-lg border px-3 text-sm font-bold",
                mode === "specific_date"
                  ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
                  : "border-[#d8dde6] bg-white text-[#6f7485]",
              )}
              disabled={isPending}
              type="button"
              onClick={() => onSelectMode("specific_date")}
            >
              {t("pairing.dialog.specificDate")}
            </button>
          </div>
        </div>

        {mode === "specific_date" ? (
          <div className="mt-4">
            <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.runDateLabel")}</p>
            <div className="mt-2 max-h-[214px] overflow-auto rounded-2xl border border-[#e4e8f1] bg-[#fbfcff] p-2">
              {isLoading ? (
                <div className="px-3 py-4 text-center text-sm font-semibold text-[#6f7485]">
                  {t("pairing.dialog.loadingRuns")}
                </div>
              ) : occurrences.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {occurrences.map((occurrence) => (
                    <button
                      key={occurrence.occurrenceId}
                      aria-pressed={occurrence.occurrenceId === selectedOccurrenceId ? "true" : "false"}
                      className={cn(
                        "flex min-h-10 cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
                        occurrence.occurrenceId === selectedOccurrenceId
                          ? "border-[#6866cc] bg-[#eef2ff] text-[#282c3b]"
                          : "border-[#d8dde6] bg-white text-[#4d4f5c]",
                      )}
                      disabled={isPending}
                      type="button"
                      onClick={() => onSelectOccurrence(occurrence.occurrenceId)}
                    >
                      <span className="font-bold">{occurrence.originDate}</span>
                      <span className="ml-3 text-[#6f7485]">{formatDateRange(occurrence)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-4 text-center text-sm font-semibold text-[#8d93a5]">
                  {t("pairing.dialog.noRuns")}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {showTierChooser ? (
          <div className="mt-4">
            <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.tierLabel")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tiers?.map((tier) => (
                <button
                  key={tier}
                  aria-pressed={tier === selectedTier ? "true" : "false"}
                  className={cn(
                    "h-8 min-w-11 cursor-pointer rounded-lg border text-sm font-bold",
                    tier === selectedTier
                      ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
                      : "border-[#d8dde6] bg-white text-[#6f7485]",
                  )}
                  disabled={isPending}
                  type="button"
                  onClick={() => onSelectTier?.(tier)}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {errorLabel ? (
          <div className="mt-4 rounded-xl border border-[#ffd5cc] bg-[#fff8f6] px-3 py-2 text-sm font-semibold text-[#b42318]">
            {errorLabel}
          </div>
        ) : null}
    </PbsDialogFrame>
  );
};
