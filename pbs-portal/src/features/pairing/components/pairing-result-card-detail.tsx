import {
  buildPairingPreviewLegRows,
  buildPairingSummary,
} from "@/features/pairing/components/pairing-detail-display";
import type { PairingSearchResult } from "@/features/pairing/types";
import { cn } from "@/shared/lib/cn";

type PairingResultCardDetailProps = {
  className?: string;
  result: PairingSearchResult;
};

const PREVIEW_LEG_LIMIT = 5;
const PREVIEW_GRID_COLUMNS =
  "grid-cols-[1.05fr_0.48fr_0.58fr_1.35fr_0.58fr_0.58fr_0.58fr_0.58fr_0.55fr_1.05fr]";
const PREVIEW_COLUMNS = ["Flight", "ALN", "Fleet", "Route", "PCK", "RPT", "STD", "STA", "BH", "Duty"];

export const PairingResultCardDetail = ({ className, result }: PairingResultCardDetailProps) => {
  const summaryItems = buildPairingSummary(result);
  const legRows = buildPairingPreviewLegRows(result.legs);
  const visibleLegRows = legRows.slice(0, PREVIEW_LEG_LIMIT);
  const hiddenLegCount = Math.max(0, legRows.length - visibleLegRows.length);

  return (
    <article
      className={cn("mt-3 overflow-hidden rounded-2xl border border-[#e1e5ec] bg-[#fbfcff] p-3", className)}
      data-testid="pairing-result-card-detail"
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-5 gap-y-1.5 text-sm leading-5 text-[#6f7485]">
        {summaryItems.map((item) => (
          <span key={item.label} className="min-w-0" title={`${item.label} ${item.value}`}>
            <span className="font-semibold text-[#7f8392]">{item.label}</span>{" "}
            <span className="font-semibold text-[#282c3b]">{item.value}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-[#e6eaf2] bg-white px-3 py-2" data-testid="pairing-result-card-leg-preview">
        <div className={`grid ${PREVIEW_GRID_COLUMNS} gap-x-3 border-b border-[#e6eaf2] pb-1.5 text-xs font-semibold leading-4 text-[#7f8392]`}>
          {PREVIEW_COLUMNS.map((label) => (
            <span key={label} className="min-w-0">
              {label}
            </span>
          ))}
        </div>
        {visibleLegRows.length > 0 ? (
          <div className="mt-1.5 flex flex-col gap-1">
            {visibleLegRows.map((row) => (
              <div
                key={row.id}
                className={`grid ${PREVIEW_GRID_COLUMNS} gap-x-3 text-xs font-semibold leading-4 text-[#282c3b]`}
              >
                {[
                  row.flight,
                  row.airline,
                  row.fleet,
                  row.route,
                  row.pickup,
                  row.report,
                  row.std,
                  row.sta,
                  row.bh,
                  row.duty,
                ].map((value, index) => (
                  <span key={`${row.id}-${index}`} className="min-w-0 truncate" title={value}>
                    {value}
                  </span>
                ))}
              </div>
            ))}
            {hiddenLegCount > 0 ? (
              <p
                className="pt-1 text-xs font-semibold leading-4 text-[#706cd5]"
                data-testid="pairing-result-card-more-legs"
              >
                +{hiddenLegCount} more {hiddenLegCount === 1 ? "leg" : "legs"}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-[#d8dde6] px-3 py-2 text-xs font-semibold text-[#7f8392]">
            No legs available.
          </p>
        )}
      </div>
    </article>
  );
};
