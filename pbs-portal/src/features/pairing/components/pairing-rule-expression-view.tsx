import { PairingRuleConditionSummary } from "@/features/pairing/components/pairing-rule-condition-summary";
import type { PairingRuleExpressionTier } from "@/features/pairing/pairing-rule-logic";

type PairingRuleExpressionViewProps = {
  emptyLabel: string;
  tiers: PairingRuleExpressionTier[];
};

export const PairingRuleExpressionView = ({
  emptyLabel,
  tiers,
}: PairingRuleExpressionViewProps) => {
  if (tiers.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#d8dde6] px-4 py-8 text-center text-sm text-[#8d93a5]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]" data-testid="pairing-rule-expression">
      {tiers.map((tier) => (
        <div
          key={tier.tier}
          className="flex items-start gap-4 rounded-3xl border border-[#e4e8f1] bg-[#fbfcff] px-4 py-3"
        >
          <div className="mt-[2px] inline-flex h-[24px] min-w-[42px] items-center justify-center rounded-lg bg-[#eef2ff] text-xs font-bold text-[#6467d1]">
            {tier.tier}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {tier.clauses.map((clause, clauseIndex) => (
              <div key={clause.key} className="flex min-w-0 flex-wrap items-center gap-2">
                {clauseIndex > 0 ? (
                  <span className="text-xs font-bold text-[#6f7485]">AND</span>
                ) : null}
                {clause.conditions.map((condition, conditionIndex) => (
                  <div key={condition.key} className="flex min-w-0 items-center gap-2">
                    {conditionIndex > 0 ? (
                      <span className="text-xs font-bold text-[#6467d1]">OR</span>
                    ) : null}
                    <PairingRuleConditionSummary condition={condition} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
