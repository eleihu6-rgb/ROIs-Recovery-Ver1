import type { PbsRedeyeDefinition } from "../../../../packages/contracts/pbs-bid-definitions.js";

export type PairingSearchConditionContext = {
  pairingBaseZoneExpression?: string;
  periodStartDate?: string;
  periodEndDate?: string;
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
