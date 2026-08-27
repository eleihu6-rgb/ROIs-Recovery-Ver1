import { describe, expect, it } from "vitest";
import { TIER_TOGGLE_COLUMN_WIDTHS } from "@/shared/components/tiers";
import {
  getPairingRightPanelAvailableTableLayout,
  getPairingRightPanelTableLayout,
} from "@/features/pairing/pairing-right-panel-layout";

describe("pairing right panel layout", () => {
  it("uses the compact table layout below 1500px", () => {
    expect(getPairingRightPanelTableLayout(1200)).toEqual({
      countGridTemplateColumns: `minmax(300px, 1fr) minmax(0, 210px) ${TIER_TOGGLE_COLUMN_WIDTHS.compact} minmax(145px, 160px)`,
      columnGap: 16,
      existingCountGridTemplateColumns: `minmax(140px, 190px) minmax(240px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.compact} minmax(120px, 136px) minmax(84px, 92px)`,
      fieldWidth: "250px",
      gridTemplateColumns: `minmax(330px, 1fr) minmax(0, 238px) ${TIER_TOGGLE_COLUMN_WIDTHS.compact}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
    });
  });

  it("uses the medium table layout from 1500px", () => {
    expect(getPairingRightPanelTableLayout(1500)).toEqual({
      countGridTemplateColumns: `minmax(0, 390px) minmax(0, 230px) ${TIER_TOGGLE_COLUMN_WIDTHS.medium} minmax(150px, 170px)`,
      columnGap: 18,
      existingCountGridTemplateColumns: `minmax(160px, 210px) minmax(250px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.medium} minmax(124px, 140px) minmax(88px, 96px)`,
      fieldWidth: "278px",
      gridTemplateColumns: `minmax(0, 430px) minmax(0, 248px) ${TIER_TOGGLE_COLUMN_WIDTHS.medium}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.medium,
    });
  });

  it("uses the wide table layout from 1750px", () => {
    expect(getPairingRightPanelTableLayout(1750)).toEqual({
      countGridTemplateColumns: `minmax(0, 430px) minmax(0, 238px) ${TIER_TOGGLE_COLUMN_WIDTHS.wide} minmax(150px, 170px)`,
      columnGap: 20,
      existingCountGridTemplateColumns: `minmax(170px, 220px) minmax(260px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.wide} minmax(124px, 140px) minmax(88px, 96px)`,
      fieldWidth: "310px",
      gridTemplateColumns: `minmax(0, 470px) minmax(0, 248px) ${TIER_TOGGLE_COLUMN_WIDTHS.wide}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.wide,
    });
  });

  it("uses the default available table layout when tiers are visible", () => {
    expect(getPairingRightPanelAvailableTableLayout(1500, true)).toEqual(
      getPairingRightPanelTableLayout(1500),
    );
  });

  it("uses a two-column available table layout when tiers are hidden", () => {
    expect(getPairingRightPanelAvailableTableLayout(1200, false)).toEqual({
      columnGap: 14,
      fieldWidth: "284px",
      gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
    });
  });
});
