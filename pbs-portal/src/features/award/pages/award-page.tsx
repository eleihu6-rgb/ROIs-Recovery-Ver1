import { useState, type ReactNode } from "react";
import { PanelMessageState } from "@/shared/components/panel";
import { ScaledPageCanvas } from "@/shared/components/layout/scaled-page-canvas";
import { LoadingBlock } from "@/shared/components/ui/loading-block";
import { AwardRightPanel } from "@/features/award/components/award-right-panel";
import { useAwardPageData, useAwardPeriods } from "@/features/award/hooks/use-award-page-data";

type AwardPageCanvasProps = {
  children: ReactNode;
};

const AwardPageCanvas = ({ children }: AwardPageCanvasProps) => (
  <ScaledPageCanvas
    canvasTestId="award-page-canvas"
    designHeight={968}
    designWidth={1888}
    viewportTestId="award-page-viewport"
  >
    {children}
  </ScaledPageCanvas>
);

const AwardPageLoading = () => (
  <AwardPageCanvas>
    <section
      aria-busy="true"
      className="flex h-[var(--portal-page-shell-height)] max-h-[var(--portal-page-shell-height)] min-h-0 flex-col overflow-hidden rounded-xl bg-white px-7 pb-8 pt-7 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
      data-testid="award-page-loading"
    >
      <div aria-label="Loading award results..." aria-live="polite" className="sr-only" role="status">
        Loading award results...
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <LoadingBlock className="h-8 w-24" />
          <LoadingBlock className="h-8 w-40" />
        </div>
        <LoadingBlock className="h-9 w-44" />
      </div>
      <div className="mt-4 grid grid-cols-6 gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <LoadingBlock key={`award-summary-loading-${index}`} className="h-24 w-full" />
        ))}
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1.1fr_0.9fr] gap-4" data-testid="award-loading-detail-grid">
        <LoadingBlock className="h-[620px] w-full" />
        <div className="space-y-4">
          <LoadingBlock className="h-[420px] w-full" />
          <LoadingBlock className="h-36 w-full" />
        </div>
      </div>
    </section>
  </AwardPageCanvas>
);

export const AwardPage = () => {
  const [selectedRosterPeriodId, setSelectedRosterPeriodId] = useState<number | null>(null);
  const { data, isLoading } = useAwardPageData(selectedRosterPeriodId);
  const { data: periodList } = useAwardPeriods();

  if (isLoading) {
    return <AwardPageLoading />;
  }

  if (!data) {
    return (
      <AwardPageCanvas>
        <PanelMessageState
          message="Unable to load the current award results."
          testId="award-page-error"
          title="AWARD"
        />
      </AwardPageCanvas>
    );
  }

  return (
    <AwardPageCanvas>
      <AwardRightPanel
        data={data}
        periodControl={periodList && periodList.periods.length > 0 ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-[#687184]">
            <span>Period</span>
            <select
              aria-label="Award period"
              className="h-9 min-w-36 rounded-lg border border-[#d8dde6] bg-white px-3 text-sm font-semibold text-[#283146] outline-none focus:border-[#706cd5] focus:ring-2 focus:ring-[#ded8ff]"
              data-testid="award-period-select"
              value={selectedRosterPeriodId ?? data.rosterPeriodId ?? ""}
              onChange={(event) => setSelectedRosterPeriodId(Number(event.target.value))}
            >
              {periodList.periods.map((period) => (
                <option key={period.rosterPeriodId} value={period.rosterPeriodId}>
                  {period.periodCode}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      />
    </AwardPageCanvas>
  );
};
