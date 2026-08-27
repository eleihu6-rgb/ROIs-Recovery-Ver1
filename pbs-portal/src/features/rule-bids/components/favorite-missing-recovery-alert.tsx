import { Button } from "@/shared/components/ui/button";

type FavoriteMissingRecoveryAlertProps = {
  onClose: () => void;
  onReload: () => void;
};

export const FavoriteMissingRecoveryAlert = ({
  onClose,
  onReload,
}: FavoriteMissingRecoveryAlertProps) => (
  <div
    aria-live="assertive"
    className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f2c6c6] bg-[#fff7f7] px-3 py-2 text-xs font-medium leading-5 text-[#a24747]"
    role="alert"
  >
    <p className="m-0">
      This favorite no longer exists. Reload the draft to refresh the favorite list.
    </p>
    <div className="flex shrink-0 gap-2">
      <Button className="h-8" type="button" variant="ghost" onClick={onClose}>
        Close
      </Button>
      <Button className="h-8" type="button" variant="secondary" onClick={onReload}>
        Reload draft
      </Button>
    </div>
  </div>
);
