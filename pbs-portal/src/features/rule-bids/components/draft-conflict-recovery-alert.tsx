import { Button } from "@/shared/components/ui/button";

type DraftConflictRecoveryAlertProps = {
  onReload: () => void;
};

export const DraftConflictRecoveryAlert = ({
  onReload,
}: DraftConflictRecoveryAlertProps) => (
  <div
    aria-live="assertive"
    className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#f2c6c6] bg-[#fff7f7] px-3 py-2 text-xs font-medium leading-5 text-[#a24747]"
    role="alert"
  >
    <p className="m-0">
      This bid changed in another request. Reload the draft before trying again.
    </p>
    <Button
      className="h-8 shrink-0"
      type="button"
      variant="secondary"
      onClick={onReload}
    >
      Reload draft
    </Button>
  </div>
);
