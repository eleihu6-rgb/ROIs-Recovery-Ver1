import { XMarkIcon } from "@heroicons/react/24/outline";
import type { PbsPairingOccurrence } from "../../../../../packages/contracts/pbs-search-pairings.js";
import { formatPairingDateRange } from "@/features/pairing/pairing-date-format";
import type { PairingOccurrenceMode } from "@/features/pairing/pairing-number-occurrences";
import type { PairingOccurrenceBidItem } from "@/features/pairing/types";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";

type PairingPropertyRunSectionProps = {
  activePairingNumber: string;
  confirmedOccurrences: PairingOccurrenceBidItem[];
  entireMonthPairingIds: string[];
  hasPairingRunError: boolean;
  isFavoritePending: boolean;
  isPairingRunLoading: boolean;
  isPending: boolean;
  pairingNumbers: string[];
  pairingOccurrenceMode: PairingOccurrenceMode;
  pairingOccurrences: PbsPairingOccurrence[];
  selectedOccurrenceId: string | null;
  getPairingNumberDisplayLabel: (pairingNumber: string) => string;
  onAddConfirmedOccurrence: (occurrence: PbsPairingOccurrence) => void;
  onEntireMonthPairingToggle: (pairingNumber: string) => void;
  onModeChange: (mode: PairingOccurrenceMode) => void;
  onRemoveConfirmedOccurrence: (occurrence: PairingOccurrenceBidItem) => void;
  onSelectedPairingNumberChange: (pairingNumber: string) => void;
};

export const PairingPropertyRunSection = ({
  activePairingNumber,
  confirmedOccurrences,
  entireMonthPairingIds,
  hasPairingRunError,
  isFavoritePending,
  isPairingRunLoading,
  isPending,
  pairingNumbers,
  pairingOccurrenceMode,
  pairingOccurrences,
  selectedOccurrenceId,
  getPairingNumberDisplayLabel,
  onAddConfirmedOccurrence,
  onEntireMonthPairingToggle,
  onModeChange,
  onRemoveConfirmedOccurrence,
  onSelectedPairingNumberChange,
}: PairingPropertyRunSectionProps) => {
  const { t } = useI18n();
  const isDisabled = isPending || isFavoritePending;
  const isOccurrenceConfirmed = (occurrence: PbsPairingOccurrence) =>
    confirmedOccurrences.some((item) =>
      item.pairingId === occurrence.pairingId
      && item.originDate === occurrence.originDate);

  return (
    <div>
      <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.bidModeLabel")}</p>
      {pairingNumbers.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {pairingNumbers.map((pairingNumber) => {
            const isActive = pairingOccurrenceMode === "entire_month"
              ? entireMonthPairingIds.includes(pairingNumber)
              : pairingNumber === activePairingNumber;

            return (
              <button
                key={pairingNumber}
                aria-pressed={isActive ? "true" : "false"}
                className={cn(
                  "h-8 cursor-pointer rounded-lg border px-3 text-sm font-bold",
                  isActive
                    ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
                    : "border-[#d8dde6] bg-white text-[#6f7485]",
                )}
                disabled={isDisabled}
                type="button"
                onClick={() => {
                  if (pairingOccurrenceMode === "entire_month") {
                    onEntireMonthPairingToggle(pairingNumber);
                    return;
                  }

                  onSelectedPairingNumberChange(pairingNumber);
                }}
              >
                {getPairingNumberDisplayLabel(pairingNumber)}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          aria-pressed={pairingOccurrenceMode === "entire_month" ? "true" : "false"}
          className={cn(
            "h-9 cursor-pointer rounded-lg border px-3 text-sm font-bold",
            pairingOccurrenceMode === "entire_month"
              ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
              : "border-[#d8dde6] bg-white text-[#6f7485]",
          )}
          disabled={isDisabled}
          type="button"
          onClick={() => onModeChange("entire_month")}
        >
          {t("pairing.dialog.entireMonth")}
        </button>
        <button
          aria-pressed={pairingOccurrenceMode === "specific_date" ? "true" : "false"}
          className={cn(
            "h-9 cursor-pointer rounded-lg border px-3 text-sm font-bold",
            pairingOccurrenceMode === "specific_date"
              ? "border-[#6866cc] bg-[#eef2ff] text-[#6866cc]"
              : "border-[#d8dde6] bg-white text-[#6f7485]",
          )}
          disabled={isDisabled}
          type="button"
          onClick={() => onModeChange("specific_date")}
        >
          {t("pairing.dialog.specificDate")}
        </button>
      </div>

      {pairingOccurrenceMode === "specific_date" ? (
        <div className="mt-3">
          <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">{t("pairing.dialog.runDateLabel")}</p>
          <div className="mt-2 max-h-[190px] overflow-auto rounded-2xl border border-[#e4e8f1] bg-[#fbfcff] p-2">
            {isPairingRunLoading ? (
              <div className="px-3 py-4 text-center text-sm font-semibold text-[#6f7485]">
                {t("pairing.dialog.loadingRuns")}
              </div>
            ) : hasPairingRunError ? (
              <div className="px-3 py-4 text-center text-sm font-semibold text-[#b42318]">
                {t("pairing.dialog.loadRunDatesError")}
              </div>
            ) : pairingOccurrences.length > 0 ? (
              <div className="flex flex-col gap-2">
                {pairingOccurrences.map((occurrence) => (
                  <button
                    key={occurrence.occurrenceId}
                    aria-pressed={occurrence.occurrenceId === selectedOccurrenceId ? "true" : "false"}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left text-sm",
                      isOccurrenceConfirmed(occurrence) || occurrence.occurrenceId === selectedOccurrenceId
                        ? "border-[#6866cc] bg-[#eef2ff] text-[#282c3b]"
                        : "border-[#d8dde6] bg-white text-[#4d4f5c]",
                    )}
                    disabled={isDisabled}
                    type="button"
                    onClick={() => onAddConfirmedOccurrence(occurrence)}
                  >
                    <span className="font-bold">{occurrence.originDate}</span>
                    <span className="ml-3 text-[#6f7485]">
                      {formatPairingDateRange(occurrence.startDate, occurrence.endDate)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-sm font-semibold text-[#8d93a5]">
                {t("pairing.dialog.noRuns")}
              </div>
            )}
          </div>
          <div className="mt-3 rounded-2xl border border-[#e4e8f1] bg-white p-2">
            <div className="flex items-center justify-between gap-3">
              <p className="m-0 text-xs font-bold leading-4 text-[#8d93a5]">
                {t("pairing.dialog.confirmedRuns")}
              </p>
              {confirmedOccurrences.length > 0 ? (
                <span className="text-xs font-bold leading-4 text-[#6f7485]">
                  {t("pairing.dialog.selectedRunCount", { count: confirmedOccurrences.length })}
                </span>
              ) : null}
            </div>
            {confirmedOccurrences.length > 0 ? (
              <div
                className="mt-2 max-h-[260px] overflow-y-auto pr-1"
                data-testid="pairing-confirmed-runs-list"
              >
                <div className="flex flex-col gap-2">
                  {confirmedOccurrences.map((occurrence) => (
                    <div
                      key={`${occurrence.pairingNumber}-${occurrence.originDate}`}
                      className="flex min-h-9 items-center justify-between rounded-lg bg-[#f6f8fc] px-3 py-2 text-sm font-semibold text-[#4d4f5c]"
                    >
                      <span>{occurrence.pairingNumber}</span>
                      <span className="ml-3 text-[#6f7485]">{occurrence.originDate}</span>
                      <button
                        aria-label={t("pairing.dialog.removeRunDate", {
                          pairingNumber: occurrence.pairingNumber,
                          originDate: occurrence.originDate,
                        })}
                        className="ml-auto inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[#8d93a5] hover:bg-[#e8ecf5] hover:text-[#6866cc] focus-visible:outline-none"
                        disabled={isDisabled}
                        type="button"
                        onClick={() => onRemoveConfirmedOccurrence(occurrence)}
                      >
                        <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="m-0 mt-2 text-sm font-medium leading-5 text-[#8d93a5]">
                {t("pairing.dialog.noConfirmedRuns")}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
