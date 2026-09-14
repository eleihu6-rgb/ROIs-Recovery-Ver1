import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppDialog, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@rois/ui";
import type {
  TierBidType,
  TierDiagnostic,
  TierPageData,
  TierSummaryItem,
  TierWarning,
} from "@/features/tier/types";

type BidReviewSource = "diagnostic" | "warning" | "legacy";

type BidReviewItem = {
  id: string;
  source: BidReviewSource;
  severity: "info" | "warning";
  module: TierBidType | "Review";
  title: string;
  tiers: string[];
  isLegacy: boolean;
};

type BidReviewPanelProps = {
  activeTier: string;
  data: TierPageData;
};

const PRIMARY_TIER_LABELS = Array.from({ length: 7 }, (_, index) => `T${index + 1}`);
const PRIMARY_TIER_SET = new Set(PRIMARY_TIER_LABELS);
const POOL_DIAGNOSTIC_CODES = new Set([
  "pairingPoolEmpty",
  "pairingPoolNoNewPairings",
  "pairingPoolCountError",
]);
const REVIEW_PREVIEW_LIMIT = 3;

const hasPrimaryTier = (tiers: string[]) => tiers.some((tier) => PRIMARY_TIER_SET.has(tier));
const hasLegacyTier = (tiers: string[]) => tiers.some((tier) => !PRIMARY_TIER_SET.has(tier));

const shouldShowReviewItem = (item: BidReviewItem, activeTier: string): boolean => {
  if (item.tiers.length === 0 || !hasPrimaryTier(item.tiers)) {
    return true;
  }

  return item.tiers.includes(activeTier);
};

const findSummaryItemForDiagnostic = (
  diagnostic: TierDiagnostic,
  itemsByGroupKey: Map<string, TierSummaryItem>,
) => (
  diagnostic.groupKey ? itemsByGroupKey.get(diagnostic.groupKey) : undefined
);

const mapDiagnostic = (
  diagnostic: TierDiagnostic,
  itemsByGroupKey: Map<string, TierSummaryItem>,
): BidReviewItem | null => {
  if (POOL_DIAGNOSTIC_CODES.has(diagnostic.code)) {
    return null;
  }

  const attachedItem = findSummaryItemForDiagnostic(diagnostic, itemsByGroupKey);
  const tiers = diagnostic.tiers ?? [];

  return {
    id: `diagnostic-${diagnostic.id}`,
    source: "diagnostic",
    severity: diagnostic.severity,
    module: attachedItem?.bidType ?? "Review",
    title: diagnostic.message,
    tiers,
    isLegacy: hasLegacyTier(tiers),
  };
};

const mapWarning = (warning: TierWarning): BidReviewItem => {
  const tiers = warning.tier ? [warning.tier] : [];

  return {
    id: `warning-${warning.code}-${warning.tier ?? "all"}-${warning.message}`,
    source: "warning",
    severity: "warning",
    module: "Review",
    title: warning.message,
    tiers,
    isLegacy: hasLegacyTier(tiers),
  };
};

const mapLegacyItem = (item: TierSummaryItem): BidReviewItem => ({
  id: `legacy-${item.id}`,
  source: "legacy",
  severity: "warning",
  module: item.bidType,
  title: item.readableText,
  tiers: item.tiers,
  isLegacy: true,
});

export const buildBidReviewItems = (data: TierPageData, activeTier: string): BidReviewItem[] => {
  const allItems = [
    ...data.summaryGroups.flatMap((group) => group.items),
    ...data.legacyItems,
  ];
  const itemsByGroupKey = new Map(allItems.map((item) => [item.groupKey, item]));
  const reviewItems = [
    ...data.diagnostics
      .map((diagnostic) => mapDiagnostic(diagnostic, itemsByGroupKey))
      .filter((item): item is BidReviewItem => item !== null),
    ...data.warnings.map(mapWarning),
    ...data.legacyItems.map(mapLegacyItem),
  ];

  return reviewItems.filter((item) => shouldShowReviewItem(item, activeTier));
};

const getSeverityLabel = (severity: BidReviewItem["severity"]) => (
  severity === "warning" ? "Warning" : "Info"
);

const getModuleLabel = (module: BidReviewItem["module"]) => {
  const labels: Record<BidReviewItem["module"], string> = {
    DaysOff: "Days Off",
    Line: "Roster",
    Pairing: "Pairing",
    Reserve: "Reserve",
    Review: "Review",
    Unsupported: "Unsupported",
  };

  return labels[module];
};

const getTierBadge = (item: BidReviewItem) => {
  if (item.isLegacy && !hasPrimaryTier(item.tiers)) {
    return "Legacy";
  }

  if (item.tiers.length === 0) {
    return "All Tx";
  }

  return item.isLegacy ? "Legacy" : item.tiers.join(", ");
};

const BidReviewChip = ({ item }: { item: BidReviewItem }) => {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  useLayoutEffect(() => {
    const titleElement = titleRef.current;

    if (!titleElement) {
      return undefined;
    }

    let isActive = true;
    const updateTruncatedState = () => {
      if (isActive) {
        const nextIsTruncated = titleElement.scrollWidth > titleElement.clientWidth;
        setIsTruncated(nextIsTruncated);
        if (!nextIsTruncated) {
          setIsTooltipOpen(false);
        }
      }
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateTruncatedState);

    updateTruncatedState();
    resizeObserver?.observe(titleElement);
    void document.fonts?.ready.then(updateTruncatedState);

    return () => {
      isActive = false;
      resizeObserver?.disconnect();
    };
  }, [item.title]);

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md border border-warning/40 bg-background px-2.5 py-1.5"
      data-testid="bid-review-chip"
    >
      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
        {getModuleLabel(item.module)}
      </span>
      <span className="shrink-0 text-xs font-bold text-warning">{getSeverityLabel(item.severity)}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip
          open={isTooltipOpen}
          onOpenChange={(open) => setIsTooltipOpen(isTruncated && open)}
        >
          <TooltipTrigger asChild>
            <span
              ref={titleRef}
              className="truncate text-xs font-semibold text-foreground"
              data-testid="bid-review-chip-title"
              tabIndex={isTruncated ? 0 : undefined}
              onBlur={() => setIsTooltipOpen(false)}
              onPointerLeave={() => setIsTooltipOpen(false)}
            >
              {item.title}
            </span>
          </TooltipTrigger>
          <TooltipContent
            className="max-w-sm whitespace-normal bg-card text-xs text-card-foreground"
            side="bottom"
          >
            {item.title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

const BidReviewPopoverRow = ({ item }: { item: BidReviewItem }) => (
  <div
    className="mb-2 last:mb-0 rounded-lg border border-border bg-muted/40 px-3 py-2"
    data-testid="bid-review-popover-row"
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">
        {getModuleLabel(item.module)}
      </span>
      <span className="text-xs font-bold text-warning">{getSeverityLabel(item.severity)}</span>
      <span className="rounded border border-warning/40 bg-background px-1.5 py-0.5 text-xs font-bold text-warning">
        {getTierBadge(item)}
      </span>
    </div>
    <p className="m-0 mt-1 text-sm font-semibold leading-5 text-foreground">
      {item.title}
    </p>
  </div>
);

export const BidReviewPanel = ({ activeTier, data }: BidReviewPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const reviewItems = useMemo(() => buildBidReviewItems(data, activeTier), [activeTier, data]);
  const visibleItems = reviewItems.slice(0, REVIEW_PREVIEW_LIMIT);
  const hiddenCount = Math.max(reviewItems.length - visibleItems.length, 0);

  return (
    <section
      aria-label="Bid review"
      className="mt-3 flex min-h-[40px] items-center gap-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2"
      data-testid="bid-review-panel"
    >
      <div className="flex shrink-0 items-center">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-warning">
          BID REVIEW
        </span>
      </div>
      {reviewItems.length === 0 ? (
        <p className="m-0 min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
          No review warnings for {activeTier}.
        </p>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {visibleItems.map((item) => (
              <BidReviewChip key={item.id} item={item} />
            ))}
          </div>
          {hiddenCount > 0 ? (
            <div className="shrink-0">
              <button
                aria-expanded={isExpanded}
                className="cursor-pointer rounded-md border border-warning/40 bg-background px-2.5 py-1.5 text-xs font-bold text-warning hover:bg-warning/10"
                data-testid="bid-review-more-button"
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
              >
                {`+${hiddenCount} more`}
              </button>
              <AppDialog
                open={isExpanded}
                onOpenChange={(nextOpen) => setIsExpanded(nextOpen)}
                title="Bid Review"
                description={`Review warnings for ${activeTier}`}
                className="w-[min(420px,calc(100vw-32px))]"
                data-testid="bid-review-popover"
              >
                <div
                  className="overscroll-contain overflow-y-auto pr-1"
                  data-testid="bid-review-popover-scroll"
                  onWheel={(event) => event.stopPropagation()}
                >
                  {reviewItems.map((item) => (
                    <BidReviewPopoverRow key={item.id} item={item} />
                  ))}
                </div>
              </AppDialog>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
