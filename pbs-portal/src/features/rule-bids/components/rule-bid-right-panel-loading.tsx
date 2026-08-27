import { PanelStripHeader } from "@/shared/components/panel";
import { LoadingBlock } from "@/shared/components/ui/loading-block";

type RuleBidRightPanelLoadingProps = {
  title: string;
  addButtonLabel: string;
  statusLabel: string;
  hideAvailablePropertiesSection?: boolean;
  testId?: string;
};

export const RuleBidRightPanelLoading = ({
  title,
  addButtonLabel,
  statusLabel,
  hideAvailablePropertiesSection = false,
  testId,
}: RuleBidRightPanelLoadingProps) => (
  <section
    aria-busy="true"
    className="min-h-full min-w-0 overflow-hidden rounded-3xl bg-white px-6 pt-4 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
    data-testid={testId}
  >
    <div aria-label={statusLabel} aria-live="polite" className="sr-only" role="status">
      {statusLabel}
    </div>

    <PanelStripHeader title={title} />

    {hideAvailablePropertiesSection ? null : (
      <div className="mt-[14px] flex justify-end">
        <LoadingBlock className="h-[28px] w-[182px]" />
      </div>
    )}

    <p className="mt-5 text-sm leading-[20px] text-[#6f7485]">
      {statusLabel}
    </p>

    <div className="mt-4 space-y-3">
      <LoadingBlock className="h-[18px] w-[420px]" />
      <LoadingBlock className="h-[30px] w-full" />
      <LoadingBlock className="h-[30px] w-full" />
      <LoadingBlock className="h-[30px] w-full" />
    </div>

    {hideAvailablePropertiesSection ? null : (
      <div className="mt-6">
        <PanelStripHeader title={addButtonLabel} />
        <div className="mt-4 flex justify-end">
          <LoadingBlock className="h-[30px] w-[270px]" />
        </div>
        <div className="mt-4 space-y-3">
          <LoadingBlock className="h-[30px] w-full" />
          <LoadingBlock className="h-[30px] w-full" />
          <LoadingBlock className="h-[30px] w-full" />
        </div>
      </div>
    )}
  </section>
);
