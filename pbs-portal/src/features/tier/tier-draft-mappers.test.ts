import { mapLineholderSummaryToTierPageData } from "@/features/tier/tier-draft-mappers";

describe("mapLineholderSummaryToTierPageData", () => {
  it("maps the unified lineholder summary into bid review statistics and tier groups", () => {
    const result = mapLineholderSummaryToTierPageData({
      periodCode: "NOV 2025",
      draftVersion: 0,
      bidContext: "Current",
      statistics: [
        { tier: "T1", totalItems: 2, pairingCount: 1, lineCount: 0, daysOffCount: 1 },
        { tier: "T2", totalItems: 1, pairingCount: 1, lineCount: 0, daysOffCount: 0 },
        { tier: "T3", totalItems: 0, pairingCount: 0, lineCount: 0, daysOffCount: 0 },
        { tier: "T4", totalItems: 0, pairingCount: 0, lineCount: 0, daysOffCount: 0 },
        { tier: "T5", totalItems: 0, pairingCount: 0, lineCount: 0, daysOffCount: 0 },
        { tier: "T6", totalItems: 1, pairingCount: 0, lineCount: 1, daysOffCount: 0 },
        { tier: "T7", totalItems: 0, pairingCount: 0, lineCount: 0, daysOffCount: 0 },
      ],
      summaryItems: [
        {
          id: "pairing-yvr",
          groupKey: "pairing-yvr",
          bidType: "Pairing",
          action: "Award",
          label: "Any Landing In Airport",
          bid: "YVR",
          value: "YVR",
          readableText: "Award Any Landing In Airport: YVR",
          tiers: ["T1", "T2"],
          editableSource: {
            module: "Pairing",
            propertyGroupKey: "pairing-yvr",
          },
          conditions: [
            {
              id: "condition-1",
              label: "Pairing Check-In Time",
              operator: "<",
              value: "12:00",
              connector: "AND",
            },
          ],
        },
        {
          id: "days-off-weekends",
          groupKey: "days-off-weekends",
          bidType: "DaysOff",
          action: "SetCondition",
          label: "Prefer Off",
          bid: "Friday, Saturday, Sunday",
          value: "Friday, Saturday, Sunday",
          tiers: ["T1"],
          editableSource: {
            module: "DaysOff",
            propertyGroupKey: "days-off-weekends",
          },
        },
        {
          id: "line-credit",
          groupKey: "line-credit",
          bidType: "Line",
          action: "SetCondition",
          label: "Max Credit Window",
          bid: "Enabled",
          value: "Enabled",
          tiers: ["T6"],
          editableSource: {
            module: "Line",
            propertyGroupKey: "line-credit",
          },
        },
      ],
      diagnostics: [
        {
          id: "duplicate-across-tier-pairing-yvr",
          code: "duplicateAcrossTier",
          severity: "info",
          message: "Review duplicate bid across Tx.",
          tiers: ["T1", "T2"],
          groupKey: "pairing-yvr",
          itemIds: ["pairing-yvr"],
        },
      ],
    });

    expect(result.statisticsTitle).toBe("PAIRING POOLS");
    expect(result.summaryTitle).toBe("BID SUMMARY");
    expect(result.diagnosticsTitle).toBe("BID REVIEW");
    expect(result.statisticsRows[0]).toMatchObject({
      id: "stat-t1",
      tier: "T1",
      totalItems: 2,
      pairingCount: 1,
      daysOffCount: 1,
    });
    expect(result.statisticsRows[5]).toMatchObject({
      tier: "T6",
      totalItems: 1,
      lineCount: 1,
    });

    expect(result.summaryGroups).toHaveLength(7);
    expect(result.summaryGroups[0]?.items).toHaveLength(2);
    expect(result.summaryGroups[0]?.items[0]).toMatchObject({
      bidType: "Pairing",
      readableText: "Award Any Landing In Airport: YVR",
      tiers: ["T1", "T2"],
      conditions: [{ text: "AND Pairing Check-In Time < 12:00" }],
      editableSource: {
        module: "Pairing",
        propertyGroupKey: "pairing-yvr",
      },
      isEditable: true,
    });
    expect(result.summaryGroups[1]?.items[0]).toMatchObject({
      groupKey: "pairing-yvr",
      readableText: "Award Any Landing In Airport: YVR",
    });
    expect(result.summaryGroups[5]?.items[0]).toMatchObject({
      bidType: "Line",
      readableText: "Set Max Credit Window: Enabled",
      isEditable: true,
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: "duplicateAcrossTier",
      severity: "info",
      tiers: ["T1", "T2"],
      itemIds: ["pairing-yvr"],
    });
  });

  it("keeps legacy tiers outside T1-T7 in a review-only legacy collection", () => {
    const result = mapLineholderSummaryToTierPageData({
      periodCode: "NOV 2025",
      draftVersion: 0,
      bidContext: "Current",
      statistics: [],
      warnings: [
        {
          code: "unsupportedTier",
          message: "Legacy bid data contains T12.",
          tier: "T12",
        },
      ],
      summaryItems: [
        {
          id: "legacy-pairing",
          groupKey: "legacy-pairing",
          bidType: "Pairing",
          action: "Award",
          label: "Pairing Number",
          bid: "E4101",
          value: "E4101",
          tiers: ["T12"],
          warningCode: "unsupportedTier",
          editableSource: {
            module: "Pairing",
            propertyGroupKey: "legacy-pairing",
          },
        },
      ],
    });

    expect(result.summaryGroups.every((group) => group.items.length === 0)).toBe(true);
    expect(result.legacyItems).toHaveLength(1);
    expect(result.legacyItems[0]).toMatchObject({
      readableText: "Award Pairing Number: E4101",
      tiers: ["T12"],
      warningCode: "unsupportedTier",
      isEditable: false,
    });
    expect(result.warnings).toHaveLength(1);
  });

  it("marks supported Prefer Off summary items as editable through DaysOff", () => {
    const result = mapLineholderSummaryToTierPageData({
      periodCode: "APR 2026",
      draftVersion: 1,
      bidContext: "Current",
      statistics: [
        { tier: "T1", totalItems: 1, pairingCount: 0, lineCount: 0, daysOffCount: 1 },
      ],
      summaryItems: [
        {
          id: "days-off-prefer-off",
          groupKey: "days-off-prefer-off",
          bidType: "DaysOff",
          action: "SetCondition",
          label: "Prefer Off",
          bid: "2026-04-01",
          value: "2026-04-01",
          readableText: "Set Prefer Off: 2026-04-01",
          tiers: ["T1"],
          editableSource: {
            module: "DaysOff",
            propertyGroupKey: "days-off-prefer-off",
          },
        },
      ],
    });

    expect(result.summaryGroups[0]?.items[0]).toMatchObject({
      bidType: "DaysOff",
      readableText: "Set Prefer Off: 2026-04-01",
      editableSource: {
        module: "DaysOff",
        propertyGroupKey: "days-off-prefer-off",
      },
      isEditable: true,
    });
  });

  it("displays Line Reserve 427 summary items as Mixed Line Bid", () => {
    const result = mapLineholderSummaryToTierPageData({
      periodCode: "JUN 2026",
      draftVersion: 2,
      bidContext: "Current",
      statistics: [
        { tier: "T1", totalItems: 1, pairingCount: 0, lineCount: 1, daysOffCount: 0 },
      ],
      summaryItems: [
        {
          id: "line-reserve",
          groupKey: "line-reserve",
          bidType: "Line",
          action: "Avoid",
          label: "Reserve",
          bid: "Enabled",
          value: "Enabled",
          tiers: ["T1"],
          editableSource: {
            module: "Line",
            propertyGroupKey: "line-reserve",
          },
        },
      ],
    });

    expect(result.summaryGroups[0]?.items[0]).toMatchObject({
      bidType: "Line",
      label: "Mixed Line Bid",
      readableText: "Avoid Mixed Line Bid: Enabled",
      editableSource: {
        module: "Line",
        propertyGroupKey: "line-reserve",
      },
      isEditable: true,
    });
  });

  it("displays Line Reserve Preference 301 summary items as Mixed Line Bid", () => {
    const result = mapLineholderSummaryToTierPageData({
      periodCode: "JUN 2026",
      draftVersion: 3,
      bidContext: "Current",
      statistics: [
        { tier: "T1", totalItems: 1, pairingCount: 0, lineCount: 1, daysOffCount: 0 },
      ],
      summaryItems: [
        {
          id: "line-short-call",
          groupKey: "line-short-call",
          bidType: "Line",
          action: "Avoid",
          label: "Reserve Preference",
          bid: "PRAM short call",
          value: "PRAM short call",
          tiers: ["T1"],
          editableSource: {
            module: "Line",
            propertyGroupKey: "line-short-call",
          },
        },
      ],
    });

    expect(result.summaryGroups[0]?.items[0]).toMatchObject({
      bidType: "Line",
      label: "Mixed Line Bid",
      readableText: "Avoid Mixed Line Bid: PRAM short call",
      isEditable: true,
    });
  });
});
