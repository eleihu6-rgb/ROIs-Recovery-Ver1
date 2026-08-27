import type { EfficientFlyingCohortContext } from "./efficient-flying-cohort.js";
import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";

export type PairingSearchConditionContext = {
  pairingBaseZoneExpression?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  useCurrentRulesFacts?: boolean;
  efficientFlying?: EfficientFlyingCohortContext;
  redeye?: PbsRedeyeDefinition;
};

export const isDateInPairingSearchPeriod = (
  value: string,
  context: PairingSearchConditionContext,
) => Boolean(
  context.periodStartDate
  && context.periodEndDate
  && value >= context.periodStartDate
  && value <= context.periodEndDate,
);
