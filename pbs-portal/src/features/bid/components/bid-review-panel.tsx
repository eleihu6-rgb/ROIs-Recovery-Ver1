import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@rois/ui";
import { useScaledPageCanvasPortalTarget } from "@/shared/components/layout/scaled-page-canvas";
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
const REVIEW_POPOVER_WIDTH = 420;
const REVIEW_POPOVER_HEIGHT = 360;
const REVIEW_POPOVER_MARGIN = 16;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const getVisualScale = (element: HTMLElement): number => {
  const layoutWidth = element.offsetWidth;

  if (layoutWidth <= 0) {
    return 1;
  }

  const rect = element.getBoundingClientRect();
  const scale = rect.width / layoutWidth;

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
};

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
      className="flex min-w-0 items-center gap-2 rounded-md border border-[#f1dfb9] bg-white px-2.5 py-1.5"
      data-testid="bid-review-chip"
    >
      <span className="shrink-0 rounded bg-[#f5f1ff] px-1.5 py-0.5 text-xs font-bold text-[#6467d1]">
        {getModuleLabel(item.module)}
      </span>
      <span className="shrink-0 text-xs font-bold text-[#a5670b]">{getSeverityLabel(item.severity)}</span>
      <TooltipProvider delayDuration={150}>
        <Tooltip
          open={isTooltipOpen}
          onOpenChange={(open) => setIsTooltipOpen(isTruncated && open)}
        >
          <TooltipTrigger asChild>
            <span
              ref={titleRef}
              className="truncate text-xs font-semibold text-[#4b5060]"
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
    className="mb-2 last:mb-0 rounded-lg border border-[#edf0f6] bg-[#fbfcff] px-3 py-2"
    data-testid="bid-review-popover-row"
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-[#f5f1ff] px-1.5 py-0.5 text-xs font-bold text-[#6467d1]">
        {getModuleLabel(item.module)}
      </span>
      <span className="text-xs font-bold text-[#a5670b]">{getSeverityLabel(item.severity)}</span>
      <span className="rounded border border-[#e6dfb8] bg-white px-1.5 py-0.5 text-xs font-bold text-[#7c5b13]">
        {getTierBadge(item)}
      </span>
    </div>
    <p className="m-0 mt-1 text-sm font-semibold leading-5 text-[#343747]">
      {item.title}
    </p>
  </div>
);

export const BidReviewPanel = ({ activeTier, data }: BidReviewPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const portalTarget = useScaledPageCanvasPortalTarget();
  const reviewItems = useMemo(() => buildBidReviewItems(data, activeTier), [activeTier, data]);
  const visibleItems = reviewItems.slice(0, REVIEW_PREVIEW_LIMIT);
  const hiddenCount = Math.max(reviewItems.length - visibleItems.length, 0);

  useEffect(() => {
    if (!isExpanded || !moreButtonRef.current || !portalTarget) {
      setPopoverPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const rect = moreButtonRef.current?.getBoundingClientRect();
      const targetRect = portalTarget.getBoundingClientRect();
      const scale = getVisualScale(portalTarget);

      if (!rect) {
        return;
      }

      const viewportLeft = (REVIEW_POPOVER_MARGIN - targetRect.left) / scale;
      const viewportRight = (window.innerWidth - REVIEW_POPOVER_MARGIN - targetRect.left) / scale;
      const viewportTop = (REVIEW_POPOVER_MARGIN - targetRect.top) / scale;
      const viewportBottom = (window.innerHeight - REVIEW_POPOVER_MARGIN - targetRect.top) / scale;
      const triggerRight = (rect.right - targetRect.left) / scale;
      const triggerBottom = (rect.bottom - targetRect.top) / scale;
      const triggerTop = (rect.top - targetRect.top) / scale;
      const left = Math.max(
        viewportLeft,
        Math.min(triggerRight - REVIEW_POPOVER_WIDTH, viewportRight - REVIEW_POPOVER_WIDTH),
      );
      const belowTop = triggerBottom + 8;
      const aboveTop = triggerTop - REVIEW_POPOVER_HEIGHT - 8;
      const top = belowTop + REVIEW_POPOVER_HEIGHT <= viewportBottom
        ? belowTop
        : aboveTop >= viewportTop
          ? aboveTop
          : clamp(belowTop, viewportTop, viewportBottom - REVIEW_POPOVER_HEIGHT);

      setPopoverPosition({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isExpanded, portalTarget]);

  const reviewPopover = isExpanded && portalTarget
    ? createPortal(
        <div
          className="pointer-events-auto absolute z-50 flex max-h-[360px] w-[420px] flex-col rounded-xl border border-[#e4e8f1] bg-white p-3 shadow-[0_18px_46px_rgba(44,50,74,0.16)]"
          data-testid="bid-review-popover"
          role="dialog"
          style={{
            left: popoverPosition?.left ?? 0,
            top: popoverPosition?.top ?? 0,
            visibility: popoverPosition ? "visible" : "hidden",
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-[#6f7485]">
                Bid Review
              </p>
              <p className="m-0 mt-1 text-xs font-medium text-[#8a90a0]">
                Review warnings for {activeTier}
              </p>
            </div>
            <button
              className="cursor-pointer rounded-md border border-[#d8dde6] bg-white px-2 py-1 text-xs font-bold text-[#6f7485] hover:bg-[#f7f8fb]"
              type="button"
              onClick={() => setIsExpanded(false)}
            >
              Close
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overscroll-contain overflow-y-auto pr-1"
            data-testid="bid-review-popover-scroll"
            onWheel={(event) => event.stopPropagation()}
          >
            {reviewItems.map((item) => (
              <BidReviewPopoverRow key={item.id} item={item} />
            ))}
          </div>
        </div>,
        portalTarget,
      )
    : null;

  return (
    <section
      aria-label="Bid review"
      className="mt-3 flex min-h-[40px] items-center gap-3 rounded-lg border border-[#efdcae] bg-[#fffaf0] px-3 py-2"
      data-testid="bid-review-panel"
    >
      <div className="flex shrink-0 items-center">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#9a6b16]">
          BID REVIEW
        </span>
      </div>
      {reviewItems.length === 0 ? (
        <p className="m-0 min-w-0 flex-1 truncate text-xs font-semibold text-[#7b725f]">
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
                ref={moreButtonRef}
                aria-expanded={isExpanded}
                className="cursor-pointer rounded-md border border-[#efd08e] bg-white px-2.5 py-1.5 text-xs font-bold text-[#7c5b13] hover:bg-[#fff6df]"
                data-testid="bid-review-more-button"
                type="button"
                onClick={() => setIsExpanded((current) => !current)}
              >
                {`+${hiddenCount} more`}
              </button>
              {reviewPopover}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
