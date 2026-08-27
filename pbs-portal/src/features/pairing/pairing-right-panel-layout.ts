import { TIER_TOGGLE_COLUMN_WIDTHS } from "@/shared/components/tiers";
import type { PairingPropertyTableLayout } from "@/features/pairing/components/pairing-property-table";

export const getPairingRightPanelTableLayout = (
  viewportWidth: number,
): PairingPropertyTableLayout => {
  if (viewportWidth >= 1750) {
    return {
      countGridTemplateColumns: `minmax(0, 430px) minmax(0, 238px) ${TIER_TOGGLE_COLUMN_WIDTHS.wide} minmax(150px, 170px)`,
      columnGap: 20,
      existingCountGridTemplateColumns: `minmax(170px, 220px) minmax(260px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.wide} minmax(124px, 140px) minmax(88px, 96px)`,
      fieldWidth: "310px",
      gridTemplateColumns: `minmax(0, 470px) minmax(0, 248px) ${TIER_TOGGLE_COLUMN_WIDTHS.wide}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.wide,
    };
  }

  if (viewportWidth >= 1500) {
    return {
      countGridTemplateColumns: `minmax(0, 390px) minmax(0, 230px) ${TIER_TOGGLE_COLUMN_WIDTHS.medium} minmax(150px, 170px)`,
      columnGap: 18,
      existingCountGridTemplateColumns: `minmax(160px, 210px) minmax(250px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.medium} minmax(124px, 140px) minmax(88px, 96px)`,
      fieldWidth: "278px",
      gridTemplateColumns: `minmax(0, 430px) minmax(0, 248px) ${TIER_TOGGLE_COLUMN_WIDTHS.medium}`,
      tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.medium,
    };
  }

  return {
    countGridTemplateColumns: `minmax(300px, 1fr) minmax(0, 210px) ${TIER_TOGGLE_COLUMN_WIDTHS.compact} minmax(145px, 160px)`,
    columnGap: 16,
    existingCountGridTemplateColumns: `minmax(140px, 190px) minmax(240px, 1fr) ${TIER_TOGGLE_COLUMN_WIDTHS.compact} minmax(120px, 136px) minmax(84px, 92px)`,
    fieldWidth: "250px",
    gridTemplateColumns: `minmax(330px, 1fr) minmax(0, 238px) ${TIER_TOGGLE_COLUMN_WIDTHS.compact}`,
    tierWidth: TIER_TOGGLE_COLUMN_WIDTHS.compact,
  };
};

export const getPairingRightPanelAvailableTableLayout = (
  viewportWidth: number,
  showTiers: boolean,
): PairingPropertyTableLayout => {
  const tableLayout = getPairingRightPanelTableLayout(viewportWidth);

  if (showTiers) {
    return tableLayout;
  }

  if (viewportWidth >= 1750) {
    return {
      columnGap: 24,
      fieldWidth: "310px",
      gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
      tierWidth: tableLayout.tierWidth,
    };
  }

  if (viewportWidth >= 1500) {
    return {
      columnGap: 18,
      fieldWidth: "284px",
      gridTemplateColumns: "minmax(0, 390px) minmax(0, 1fr)",
      tierWidth: tableLayout.tierWidth,
    };
  }

  return {
    columnGap: 14,
    fieldWidth: "284px",
    gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
    tierWidth: tableLayout.tierWidth,
  };
};
