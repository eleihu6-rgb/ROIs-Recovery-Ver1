import { HelpView } from "@/features/help/components/help-view";

export const HelpPage = () => (
  <section
    className="h-full min-h-0 overflow-hidden rounded-3xl bg-white shadow-[10px_20px_60px_rgba(0,0,0,0.05)]"
    data-testid="help-page"
    data-uiid="help-page"
  >
    <HelpView />
  </section>
);
