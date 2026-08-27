import { describe, expect, it } from "vitest";
import { TIER_TOGGLE_COLUMN_WIDTHS } from "@/shared/components/tiers";
import {
  getRuleBidRightPanelAvailableTableLayout,
  getRuleBidRightPanelTableLayout,
} from "@/features/rule-bids/rule-bid-right-panel-layout";

describe("rule bid right panel layout", () => {
  it("uses the compact table layout below 1500px", () => {
    expect(getRuleBidRightPanelTableLayout(1200)).toEqual({
      columnGap: 14,
      existingGridTemplateColumns: `minmax(150px, 200px) minmax(260px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.compact} minmax(56px, 72px)`,
      fieldWidth: "240px",
      gridTemplateColumns: `minmax(0, 1fr) minmax(0, 220px) minmax(0, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.compact}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
    });
  });

  it("uses the medium table layout from 1500px", () => {
    expect(getRuleBidRightPanelTableLayout(1500)).toEqual({
      columnGap: 18,
      existingGridTemplateColumns: `minmax(170px, 220px) minmax(320px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.medium} minmax(64px, 80px)`,
      fieldWidth: "284px",
      gridTemplateColumns: `minmax(0, 420px) minmax(0, 244px) minmax(0, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.medium}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.medium,
    });
  });

  it("uses the wide table layout from 1750px", () => {
    expect(getRuleBidRightPanelTableLayout(1750)).toEqual({
      columnGap: 24,
      existingGridTemplateColumns: `minmax(180px, 240px) minmax(360px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.wide} minmax(64px, 80px)`,
      fieldWidth: "310px",
      gridTemplateColumns: `minmax(0, 460px) minmax(0, 260px) minmax(0, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.wide}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.wide,
    });
  });

  it("uses the default available table layout when tiers are visible", () => {
    expect(getRuleBidRightPanelAvailableTableLayout(1500, true)).toEqual(
      getRuleBidRightPanelTableLayout(1500),
    );
  });

  it("uses a two-column available table layout when tiers are hidden", () => {
    expect(getRuleBidRightPanelAvailableTableLayout(1200, false)).toEqual({
      columnGap: 14,
      fieldWidth: "284px",
      gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
    });
  });
});
