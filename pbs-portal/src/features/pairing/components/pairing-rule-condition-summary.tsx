import { useMemo, useState } from "react";
import { buildExistingPairingBidSummary } from "@/features/pairing/pairing-existing-bid-summary";
import {
  EFFICIENT_FLYING_PROPERTY_CODE,
  useEfficientFlyingConfig,
} from "@/features/pairing/efficient-flying-config";
import type { PairingRuleExpressionCondition } from "@/features/pairing/pairing-rule-logic";

type PairingRuleConditionSummaryProps = {
  condition: PairingRuleExpressionCondition;
};

const RULE_CONDITION_PILL_CLASS =
  "min-w-0 rounded-xl border border-[#cfd6e4] bg-white px-3 py-[6px] text-sm font-medium leading-[18px] text-[#4d4f5c]";

export const PairingRuleConditionSummary = ({
  condition,
}: PairingRuleConditionSummaryProps) => {
  const [expanded, setExpanded] = useState(false);
  const efficientFlyingConfigQuery = useEfficientFlyingConfig(
    condition.property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE,
  );
  const summary = useMemo(
    () => buildExistingPairingBidSummary(condition.property, {
      efficientFlyingConfig: efficientFlyingConfigQuery.data,
      includePropertyNameInHeadline: false,
    }),
    [condition.property, efficientFlyingConfigQuery.data],
  );

  if (summary.kind !== "grouped-list") {
    return (
      <span className={RULE_CONDITION_PILL_CLASS} title={condition.fallbackText}>
        {condition.property.propertyCode === EFFICIENT_FLYING_PROPERTY_CODE
          ? `${condition.property.name}: ${summary.value}`
          : condition.fallbackText}
      </span>
    );
  }

  const visibleGroups = expanded
    ? summary.groups
    : summary.groups.slice(0, summary.collapsedGroupLimit);
  const hasHiddenGroups = summary.groups.length > summary.collapsedGroupLimit;
  const hasHiddenValues = summary.groups.some((group) => group.values.length > summary.collapsedValueLimit);
  const canExpand = hasHiddenGroups || hasHiddenValues;
  const ariaLabel = `Rule condition ${condition.property.name}, ${summary.headline}`;

  return (
    <div
      aria-label={ariaLabel}
      className="min-w-[260px] max-w-[540px] rounded-xl border border-[#dbe1ee] bg-white px-3 py-2 text-xs leading-5 text-[#596174] shadow-[0_6px_16px_rgba(68,76,96,0.04)]"
      title={summary.title}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold leading-5 text-[#40424f]">{condition.property.name}</span>
        <span className="font-bold text-[#6b7182]">{summary.headline}</span>
      </div>
      <div className={expanded ? "mt-2 max-h-[220px] space-y-1.5 overflow-auto pr-1" : "mt-2 space-y-1.5"}>
        {visibleGroups.map((group) => {
          const visibleValues = expanded
            ? group.values
            : group.values.slice(0, summary.collapsedValueLimit);
          const hiddenValueCount = group.values.length - visibleValues.length;

          return (
            <div
              className="grid grid-cols-[minmax(62px,84px)_minmax(0,1fr)] gap-2"
              key={group.key}
            >
              <span className="font-bold text-[#4f5668]">{group.label}</span>
              <span className="min-w-0 break-words text-[#667085]">
                {visibleValues.length > 0 ? visibleValues.join(", ") : "--"}
                {!expanded && hiddenValueCount > 0 ? (
                  <span className="font-semibold text-[#6d68d9]">, +{hiddenValueCount} more</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {canExpand ? (
        <div className="mt-2 flex items-center justify-between gap-3 leading-4">
          {!expanded && hasHiddenGroups ? (
            <span className="text-[#8b91a2]">+{summary.groups.length - visibleGroups.length} more pairings</span>
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            className="cursor-pointer rounded-lg bg-transparent p-0 font-bold text-[#6764cf] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cbc8f6]"
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : `Show all ${summary.totalItemCount} selected`}
          </button>
        </div>
      ) : null}
    </div>
  );
};
