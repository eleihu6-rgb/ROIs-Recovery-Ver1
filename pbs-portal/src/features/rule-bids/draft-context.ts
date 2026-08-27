import type { RuleBidRightPanelData } from "@/features/rule-bids/types";

type RuleBidContext = RuleBidRightPanelData["draftMeta"]["bidContext"];

export const requireCurrentRuleBidContext = (
  bidContext: RuleBidContext,
  featureName: string,
): "Current" => {
  if (bidContext !== "Current") {
    throw new Error(`${featureName} only supports the Current bid context.`);
  }

  return bidContext;
};
