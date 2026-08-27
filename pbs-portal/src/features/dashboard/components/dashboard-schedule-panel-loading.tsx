import { PanelStripHeader } from "@/shared/components/panel";
import { LoadingBlock } from "@/shared/components/ui/loading-block";

type DashboardSchedulePanelLoadingProps = {
  statusLabel: string;
  testId?: string;
};

const LOADING_TIER_ROWS = ["TIER-01", "TIER-02", "TIER-03", "TIER-04", "TIER-05", "TIER-06", "TIER-07"];
const LOADING_TIER_CELLS = Array.from({ length: 10 }, (_, index) => index);
const LOADING_MONTH_CELLS = Array.from({ length: 35 }, (_, index) => index);

export const DashboardSchedulePanelLoading = ({
  statusLabel,
  testId,
}: DashboardSchedulePanelLoadingProps) => (
  <section
    aria-busy="true"
    className="relative h-full min-h-0 min-w-0 overflow-hidden rounded-3xl bg-white shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
    data-testid={testId}
  >
    <div aria-label={statusLabel} aria-live="polite" className="sr-only" role="status">
      {statusLabel}
    </div>

    <div className="px-6 pt-6">
      <PanelStripHeader title="BIDDING CALENDAR" />
      <p className="mt-6 text-sm leading-[20px] text-[#6f7485]">
        {statusLabel}
      </p>
      <LoadingBlock className="mt-4 h-[24px] w-[148px]" />
    </div>

    <div className="px-6 pb-6 pt-5">
      <div className="rounded-xl border border-[#e6eaf1] p-4">
        <div className="space-y-1">
          {LOADING_TIER_ROWS.map((label, rowIndex) => (
            <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-1">
              <LoadingBlock className={rowIndex === 0 ? "h-7 rounded-md bg-[#706cd5]" : "h-7 rounded-md"} />
              <div className="grid grid-cols-10 gap-1">
                {LOADING_TIER_CELLS.map((cellIndex) => (
                  <LoadingBlock
                    key={`${label}-${cellIndex}`}
                    className={rowIndex === 0 && cellIndex < 5 ? "h-7 rounded-md bg-[#48c8e2]" : "h-7 rounded-md"}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-[#e6eaf1] bg-[#e6eaf1]">
        {LOADING_MONTH_CELLS.map((cellIndex) => (
          <div key={cellIndex} className="h-16 bg-white p-2">
            {cellIndex % 5 === 1 ? <LoadingBlock className="h-4 w-16 rounded-md" /> : null}
          </div>
        ))}
      </div>
    </div>
  </section>
);
