import { useState, type MouseEvent } from "react";
import type { BidPropertySummary } from "@/features/bid/bid-property-summary-types";
import { cn } from "@/shared/lib/cn";

type BidPropertySummaryViewProps = {
  ariaLabel: string;
  summary: BidPropertySummary;
  variant?: "default" | "criteria" | "tier";
};

export const BidPropertySummaryView = ({
  ariaLabel,
  summary,
  variant = "default",
}: BidPropertySummaryViewProps) => {
  const [expanded, setExpanded] = useState(false);
  const containerClassName = cn(
    "min-h-[34px] whitespace-normal break-words text-sm leading-5 text-[#596174]",
    variant === "criteria"
      ? "rounded-lg bg-[#f5f7fc] px-3 py-2"
      : variant === "tier"
        ? ""
        : "rounded-xl border border-[#edf0f7] bg-[#fbfcff] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
  );

  if (summary.kind === "text") {
    return (
      <div
        aria-label={ariaLabel}
        className={cn(containerClassName, "font-semibold")}
        title={summary.title}
      >
        {summary.text}
      </div>
    );
  }

  const visibleGroups = expanded
    ? summary.groups
    : summary.groups.slice(0, summary.collapsedGroupLimit);
  const hasHiddenGroups = summary.groups.length > summary.collapsedGroupLimit;
  const hasHiddenValues = summary.groups.some((group) =>
    group.values.length > summary.collapsedValueLimit);
  const canExpand = hasHiddenGroups || hasHiddenValues;

  const toggleExpanded = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setExpanded((value) => !value);
  };

  return (
    <div
      aria-label={ariaLabel}
      className={containerClassName}
      title={summary.title}
    >
      <div className="font-bold text-[#40424f]">{summary.headline}</div>
      <div className={expanded ? "mt-2 max-h-[240px] space-y-1.5 overflow-auto pr-1" : "mt-2 space-y-1.5"}>
        {visibleGroups.map((group) => {
          const visibleValues = expanded
            ? group.values
            : group.values.slice(0, summary.collapsedValueLimit);
          const hiddenValueCount = group.values.length - visibleValues.length;

          return (
            <div
              className="grid grid-cols-[minmax(64px,92px)_minmax(0,1fr)] gap-2 text-xs leading-5"
              key={group.key}
            >
              <span className="font-bold text-[#4f5668]">{group.label}</span>
              <span className="min-w-0 break-words text-[#667085]">
                {visibleValues.join(", ")}
                {!expanded && hiddenValueCount > 0 ? (
                  <span className="font-semibold text-[#6d68d9]">, +{hiddenValueCount} more</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {canExpand ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs leading-4">
          {!expanded && hasHiddenGroups ? (
            <span className="text-[#8b91a2]">
              +{summary.groups.length - visibleGroups.length} more pairings
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            className="cursor-pointer rounded-lg bg-transparent p-0 text-xs font-bold text-[#6764cf] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cbc8f6]"
            type="button"
            onClick={toggleExpanded}
          >
            {expanded ? "Show less" : `Show all ${summary.totalItemCount} selected`}
          </button>
        </div>
      ) : null}
    </div>
  );
};
