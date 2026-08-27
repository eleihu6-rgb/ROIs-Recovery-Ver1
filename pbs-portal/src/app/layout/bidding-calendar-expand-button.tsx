import { Bars3BottomLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

type ExpandBiddingCalendarButtonProps = {
  onExpand: () => void;
};

export const ExpandBiddingCalendarButton = ({ onExpand }: ExpandBiddingCalendarButtonProps) => (
  <button
    aria-label="Expand bidding calendar"
    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    data-testid="expand-bidding-calendar-button"
    type="button"
    onClick={onExpand}
  >
    <Bars3BottomLeftIcon className="h-4 w-4 shrink-0" />
    <ChevronRightIcon className="h-3 w-3 shrink-0 -ml-1" />
  </button>
);
