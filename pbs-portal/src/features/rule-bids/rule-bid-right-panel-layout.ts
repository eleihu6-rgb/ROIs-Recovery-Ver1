import { TIER_TOGGLE_COLUMN_WIDTHS } from "@/shared/components/tiers";
import type { RuleBidPropertyTableLayout } from "@/features/rule-bids/components/rule-bid-property-table";

export const getRuleBidRightPanelTableLayout = (
  viewportWidth: number,
): RuleBidPropertyTableLayout => {
  const utilityColumn = " minmax(0, 1fr)";

  if (viewportWidth >= 1750) {
    return {
      columnGap: 24,
      existingGridTemplateColumns: `minmax(180px, 240px) minmax(360px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.wide} minmax(64px, 80px)`,
      fieldWidth: "310px",
      gridTemplateColumns: `minmax(0, 460px) minmax(0, 260px)${utilityColumn} ${TIER_TOGGLE_COLUMN_WIDTHS.wide}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.wide,
    };
  }

  if (viewportWidth >= 1500) {
    return {
      columnGap: 18,
      existingGridTemplateColumns: `minmax(170px, 220px) minmax(320px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.medium} minmax(64px, 80px)`,
      fieldWidth: "284px",
      gridTemplateColumns: `minmax(0, 420px) minmax(0, 244px)${utilityColumn} ${TIER_TOGGLE_COLUMN_WIDTHS.medium}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.medium,
    };
  }

  return {
    columnGap: 14,
    existingGridTemplateColumns: `minmax(150px, 200px) minmax(260px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.compact} minmax(56px, 72px)`,
    fieldWidth: "240px",
    gridTemplateColumns: `minmax(0, 1fr) minmax(0, 220px)${utilityColumn} ${TIER_TOGGLE_COLUMN_WIDTHS.compact}`,
    tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
  };
};

export const getRuleBidRightPanelAvailableTableLayout = (
  viewportWidth: number,
  showTiers: boolean,
): RuleBidPropertyTableLayout => {
  if (showTiers) {
    return getRuleBidRightPanelTableLayout(viewportWidth);
  }

  if (viewportWidth >= 1750) {
    return {
      columnGap: 24,
      fieldWidth: "310px",
      gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.wide,
    };
  }

  if (viewportWidth >= 1500) {
    return {
      columnGap: 18,
      fieldWidth: "284px",
      gridTemplateColumns: "minmax(0, 390px) minmax(0, 1fr)",
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.medium,
    };
  }

  return {
    columnGap: 14,
    fieldWidth: "284px",
    gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
    tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
  };
};
