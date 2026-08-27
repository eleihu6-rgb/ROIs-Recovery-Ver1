import { PairingDialogDetail } from "@/features/pairing/components/pairing-dialog-detail";
import type { PairingSearchResult } from "@/features/pairing/types";
import { useScaledPageCanvasPortalTarget } from "@/shared/components/layout/scaled-page-canvas";
import { TierSelectionTitle } from "@/shared/components/tiers";
import { PbsDialogFrame } from "@/shared/components/ui/pbs-dialog-frame";

type PairingCalendarBidDetailRow = {
  endDate: string;
  internalId: string;
  mode: string;
  originDate: string;
  pairingNumber: string;
  propertyGroupKey: string | null;
  rowKey: string;
  startDate: string;
  tier: string;
};

type PairingCalendarBidDetailDialogProps = {
  canSave: boolean;
  canEditTiers: boolean;
  detailError: string | null;
  detailRows: PairingCalendarBidDetailRow[];
  detailResults: PairingSearchResult[];
  error: string | null;
  isDetailLoading: boolean;
  isLoading: boolean;
  isPending: boolean;
  isTierEditingDisabled: boolean;
  pairingNumber: string;
  selectedDetailRowKey: string | null;
  selectedTiers: string[];
  showEditSelector: boolean;
  tiers: string[];
  onClearTiers: () => void;
  onClose: () => void;
  onDetailRowSelect: (rowKey: string) => void;
  onSave: () => void;
  onTierToggle: (tier: string) => void;
};

const SUMMARY_COLUMNS = [
  "PAIRING",
  "ID",
  "TX",
  "ORIG",
  "START",
  "END",
  "MODE",
];
const SUMMARY_GRID_COLUMNS =
  "grid-cols-[minmax(72px,1.1fr)_minmax(48px,0.7fr)_minmax(34px,0.5fr)_minmax(58px,0.8fr)_minmax(58px,0.8fr)_minmax(58px,0.8fr)_minmax(64px,0.9fr)]";
const SUMMARY_GRID_COLUMNS_WITH_EDIT =
  "grid-cols-[minmax(72px,1.1fr)_minmax(48px,0.7fr)_minmax(34px,0.5fr)_minmax(58px,0.8fr)_minmax(58px,0.8fr)_minmax(58px,0.8fr)_minmax(64px,0.9fr)_32px]";
const renderSummaryCell = (value: string, className = "") => (
  <span className={`min-w-0 truncate ${className}`} title={value}>
    {value}
  </span>
);

const buildDialogTitle = (
  pairingNumber: string,
  detailRows: PairingCalendarBidDetailRow[],
  detailResults: PairingSearchResult[],
) => {
  const titleSources = detailRows.length > 0
    ? detailRows.map((row) => ({
      internalId: row.internalId,
      pairingNumber: row.pairingNumber,
    }))
    : detailResults.map((result) => ({
      internalId: result.id,
      pairingNumber: result.pairingNumber,
    }));
  const fallbackPairingNumbers = pairingNumber
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const distinctPairingNumbers = Array.from(new Set(
    (titleSources.length > 0
      ? titleSources.map((source) => source.pairingNumber)
      : fallbackPairingNumbers)
      .map((value) => value.trim())
      .filter(Boolean),
  ));
  const primaryPairingNumber = distinctPairingNumbers[0] ?? fallbackPairingNumbers[0] ?? pairingNumber;

  if (distinctPairingNumbers.length > 1) {
    return `${primaryPairingNumber} +${distinctPairingNumbers.length - 1}`;
  }

  const internalId = titleSources.find((source) => source.pairingNumber === primaryPairingNumber)?.internalId
    ?? "";
  const normalizedInternalId = internalId.trim();

  if (!normalizedInternalId || normalizedInternalId === "-" || normalizedInternalId === primaryPairingNumber) {
    return primaryPairingNumber;
  }

  return `${primaryPairingNumber} #${normalizedInternalId}`;
};

export const PairingCalendarBidDetailDialog = ({
  canSave,
  canEditTiers,
  detailError,
  detailRows,
  detailResults,
  error,
  isDetailLoading,
  isLoading,
  isPending,
  isTierEditingDisabled,
  pairingNumber,
  selectedDetailRowKey,
  selectedTiers,
  showEditSelector,
  tiers,
  onClearTiers,
  onClose,
  onDetailRowSelect,
  onSave,
  onTierToggle,
}: PairingCalendarBidDetailDialogProps) => {
  const portalTarget = useScaledPageCanvasPortalTarget();
  const summaryGridColumns = showEditSelector ? SUMMARY_GRID_COLUMNS_WITH_EDIT : SUMMARY_GRID_COLUMNS;
  const tierControlsDisabled = isPending || isTierEditingDisabled;
  const dialogTitle = buildDialogTitle(pairingNumber, detailRows, detailResults);
  return (
    <PbsDialogFrame
      ariaLabelledBy="pairing-bid-detail-title"
      bodyClassName="p-0"
      closeOnOverlayClick
      footerClassName="mt-5 flex justify-end gap-2"
      overlayClassName="pointer-events-auto z-[80] bg-white/70 backdrop-blur-[1px]"
      overlayTestId="pairing-bid-detail-overlay"
      panelClassName="!max-h-[calc(var(--portal-page-shell-height)-32px)] !w-[880px] max-w-none shrink-0 rounded-3xl p-4 shadow-[0_20px_60px_rgba(45,49,66,0.18)]"
      portalTarget={portalTarget}
      footer={(
        <>
          <button
            className="h-[32px] cursor-pointer rounded-lg border border-[#d8dde6] bg-white px-4 text-xs font-medium text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isPending}
            type="button"
            onClick={onClose}
          >
            Close
          </button>
          {canEditTiers ? (
            <button
              className="h-[32px] cursor-pointer rounded-lg bg-[#706cd5] px-4 text-xs font-semibold text-white hover:bg-[#615ec1] disabled:cursor-not-allowed disabled:bg-[#b8b6e8]"
              disabled={!canSave || isPending}
              type="button"
              onClick={onSave}
            >
              {isPending ? "SAVING..." : "SAVE BID"}
            </button>
          ) : null}
        </>
      )}
      onClose={onClose}
    >
          <h3
            className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]"
            id="pairing-bid-detail-title"
          >
            Pairing Bid
          </h3>
          <p className="mt-1 text-xl font-semibold leading-7 text-[#282c3b]">
            {dialogTitle}
          </p>
          <div className="mt-4" data-testid="pairing-bid-summary-grid">
            <div className={`grid ${summaryGridColumns} gap-x-2 border-b border-[#e1e5ec] pb-1 text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]`}>
              {[...SUMMARY_COLUMNS, ...(showEditSelector ? ["EDIT"] : [])].map((label) => (
                <span key={label} className="min-w-0 truncate">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex flex-col">
              {detailRows.map((row, index) => (
                <div
                  key={`${row.rowKey}-${index}`}
                  className={`grid ${summaryGridColumns} gap-x-2 border-b border-[#eef1f6] py-2 text-xs leading-4 text-[#40424f]`}
                >
                  {renderSummaryCell(row.pairingNumber, "font-semibold text-[#282c3b]")}
                  {renderSummaryCell(row.internalId)}
                  {renderSummaryCell(row.tier, "font-semibold")}
                  {renderSummaryCell(row.originDate)}
                  {renderSummaryCell(row.startDate)}
                  {renderSummaryCell(row.endDate)}
                  {renderSummaryCell(row.mode)}
                  {showEditSelector ? (
                    <label className="flex min-w-0 cursor-pointer items-center justify-center">
                      <input
                        aria-label={`Select ${row.pairingNumber} ${row.startDate} for Tx editing`}
                        checked={selectedDetailRowKey === row.rowKey}
                        className="h-3.5 w-3.5 accent-[#706cd5] disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={isPending || !row.propertyGroupKey}
                        name="pairing-bid-edit-target"
                        type="radio"
                        onChange={() => onDetailRowSelect(row.rowKey)}
                      />
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[#7f8392]">
              Pairing Details
            </p>
            <div className="mt-2 overflow-x-auto" data-testid="pairing-bid-detail-scroll-region">
              {isDetailLoading ? (
                <p className="rounded-xl border border-[#e4e8f1] bg-[#fbfcff] px-3 py-3 text-xs font-semibold text-[#6f7485]">
                  Loading pairing details...
                </p>
              ) : detailError ? (
                <p className="rounded-xl border border-[#ffd5cc] bg-[#fff8f6] px-3 py-3 text-xs font-semibold text-[#b42318]">
                  {detailError}
                </p>
              ) : detailResults.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {detailResults.map((result) => (
                    <PairingDialogDetail key={result.id} result={result} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-[#e4e8f1] bg-[#fbfcff] px-3 py-3 text-xs font-semibold text-[#6f7485]">
                  No pairing details found.
                </p>
              )}
            </div>
          </div>

          {canEditTiers ? (
            <>
              <fieldset aria-label="Pairing bid tiers" className="mt-4">
                <TierSelectionTitle as="legend" />
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {tiers.map((tier) => (
                    <label
                      key={tier}
                      className="flex h-[28px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#e1e5ec] px-2 text-xs font-semibold text-[#40424f] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55"
                    >
                      <input
                        checked={selectedTiers.includes(tier)}
                        className="h-3.5 w-3.5 accent-[#706cd5]"
                        disabled={tierControlsDisabled}
                        type="checkbox"
                        onChange={() => onTierToggle(tier)}
                      />
                      {tier}
                    </label>
                  ))}
                  <button
                    className="h-[28px] cursor-pointer rounded-lg border border-dashed border-[#c8ced8] px-2 text-xs font-semibold text-[#7f8392] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={tierControlsDisabled}
                    type="button"
                    onClick={onClearTiers}
                  >
                    Clear
                  </button>
                </div>
              </fieldset>
              {isLoading ? (
                <p className="mt-3 rounded-xl border border-[#e4e8f1] bg-[#fbfcff] px-3 py-2 text-xs font-semibold text-[#6f7485]">
                  Loading pairing bid tiers...
                </p>
              ) : null}
              {error ? (
                <p className="mt-3 rounded-xl border border-[#ffd5cc] bg-[#fff8f6] px-3 py-2 text-xs font-semibold text-[#b42318]">
                  {error}
                </p>
              ) : null}
            </>
          ) : null}
    </PbsDialogFrame>
  );
};
