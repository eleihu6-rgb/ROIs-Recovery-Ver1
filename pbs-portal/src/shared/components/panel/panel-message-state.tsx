import { PanelStripHeader } from "@/shared/components/panel/panel-strip-header";

type PanelMessageStateProps = {
  title: string;
  message: string;
  testId?: string;
};

export const PanelMessageState = ({
  title,
  message,
  testId,
}: PanelMessageStateProps) => (
  <section
    className="min-h-full min-w-0 overflow-hidden rounded-3xl bg-white px-6 py-5 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
    data-testid={testId}
  >
    <PanelStripHeader title={title} />
    <p className="mt-6 text-sm leading-[20px] text-[#6f7485]">
      {message}
    </p>
  </section>
);
