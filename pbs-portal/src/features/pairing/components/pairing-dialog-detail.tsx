import {
  buildGanttLegRows,
  buildPairingSummary,
  PAIRING_GANTT_LEG_COLUMNS,
} from "@/features/pairing/components/pairing-detail-display";
import type { PairingSearchResult } from "@/features/pairing/types";
import { cn } from "@/shared/lib/cn";

type PairingDialogDetailProps = {
  className?: string;
  result: PairingSearchResult;
};

const LEG_GRID_COLUMNS =
  "grid-cols-[46px_44px_64px_56px_44px_44px_72px_64px_64px_64px_64px_72px_64px_64px_64px_54px_54px_54px_78px_minmax(120px,1fr)]";

export const PairingDialogDetail = ({ className, result }: PairingDialogDetailProps) => {
  const summaryItems = buildPairingSummary(result);
  const legRows = buildGanttLegRows(result.legs);

  return (
    <article
      className={cn("rounded-2xl border border-[#e1e5ec] bg-[#fbfcff] p-3", className)}
      data-testid="pairing-dialog-detail"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="inline-flex h-[24px] shrink-0 items-center rounded-lg bg-[#4fcfed] px-2 text-xs font-semibold text-white"
          data-testid="pairing-dialog-detail-badge"
        >
          {result.pairingNumber}
        </span>
        <div className="grid min-w-[640px] flex-1 grid-cols-[repeat(auto-fit,minmax(136px,1fr))] gap-x-4 gap-y-1 text-xs leading-4 text-[#6f7485] max-md:min-w-0">
          {summaryItems.map((item) => (
            <span key={item.label} className="min-w-0" title={`${item.label} ${item.value}`}>
              <span className="font-semibold text-[#7f8392]">{item.label}</span>{" "}
              <span className="font-semibold text-[#282c3b]">{item.value}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto" data-testid="pairing-dialog-gantt-table">
        <div className="min-w-[1420px]">
          <div className={`grid ${LEG_GRID_COLUMNS} gap-x-2 border-b border-[#e1e5ec] pb-1 text-xs font-semibold leading-4 text-[#7f8392]`}>
            {PAIRING_GANTT_LEG_COLUMNS.map((label) => (
              <span key={label} className="min-w-0">
                {label}
              </span>
            ))}
          </div>
          {legRows.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1">
              {legRows.map((row) => (
                <div
                  key={row.id}
                  className={`grid ${LEG_GRID_COLUMNS} gap-x-2 text-xs font-semibold leading-4 text-[#282c3b]`}
                >
                  {row.values.map((value, index) => (
                    <span key={`${row.id}-${index}`} className="min-w-0" title={value}>
                      {value}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed border-[#d8dde6] px-3 py-2 text-xs font-semibold text-[#7f8392]">
              No legs available.
            </p>
          )}
        </div>
      </div>
    </article>
  );
};
