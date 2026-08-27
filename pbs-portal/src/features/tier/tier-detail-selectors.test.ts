import { tierPageData } from "@/features/tier/mock";
import {
  findTierDiagnosticsForItem,
  findTierSummaryItemsByDiagnostic,
  resolveTierDetailViewModel,
} from "@/features/tier/tier-detail-selectors";
import type { TierPageData } from "@/features/tier/types";

describe("tier-detail-selectors", () => {
  it("resolves a summary item target into a bid detail view model", () => {
    const detail = resolveTierDetailViewModel(tierPageData, {
      kind: "summaryItem",
      itemId: "pairing-yvr-t1",
      groupKey: "pairing-yvr",
    });

    expect(detail).toMatchObject({
      title: "Tier Bid Detail",
      subtitle: "Award Any Landing In Airport: YVR",
      tiers: ["T1", "T2"],
    });
    expect(detail?.primaryItem?.groupKey).toBe("pairing-yvr");
    expect(detail?.relatedItems).toHaveLength(1);
    expect(detail?.diagnostics.some((diagnostic) => diagnostic.code === "duplicateAcrossTier")).toBe(true);
  });

  it("matches diagnostic targets by group key", () => {
    const diagnostic = tierPageData.diagnostics.find((candidate) => candidate.code === "duplicateAcrossTier");

    expect(diagnostic).toBeDefined();
    expect(findTierSummaryItemsByDiagnostic(tierPageData, diagnostic!)).toHaveLength(1);
  });

  it("matches diagnostic targets by item ids", () => {
    const data: TierPageData = {
      ...tierPageData,
      diagnostics: [
        {
          id: "item-id-match",
          code: "unsupportedProperty",
          severity: "warning",
          message: "Review unsupported bid.",
          tiers: ["T1"],
          itemIds: ["pairing-yvr"],
        },
      ],
    };

    const detail = resolveTierDetailViewModel(data, {
      kind: "diagnostic",
      diagnosticId: "item-id-match",
    });

    expect(detail?.primaryItem?.groupKey).toBe("pairing-yvr");
    expect(detail?.relatedItems).toHaveLength(1);
  });

  it("keeps tier-level diagnostics as review detail without forcing a bid match", () => {
    const detail = resolveTierDetailViewModel(tierPageData, {
      kind: "diagnostic",
      diagnosticId: "empty-tier-t3",
    });

    expect(detail).toMatchObject({
      title: "Tier Review Detail",
      primaryItem: undefined,
      tiers: ["T3"],
    });
    expect(detail?.relatedItems).toHaveLength(0);
    expect(detail?.diagnostics[0]?.code).toBe("emptyTier");
  });

  it("includes legacy warnings as review reasons for legacy items", () => {
    const data: TierPageData = {
      ...tierPageData,
      legacyItems: [
        {
          id: "legacy-pairing",
          groupKey: "legacy-pairing",
          bidType: "Pairing",
          action: "Award",
          label: "Pairing Number",
          readableText: "Award Pairing Number: E4101",
          tiers: ["T12"],
          conditions: [],
          warningCode: "unsupportedTier",
          isEditable: false,
        },
      ],
      diagnostics: [
        {
          id: "legacy-tier-t12",
          code: "legacyTier",
          severity: "warning",
          message: "Legacy bid data contains T12 outside T1-T7.",
          tier: "T12",
          tiers: ["T12"],
          itemIds: [],
        },
      ],
      warnings: [
        {
          code: "unsupportedTier",
          message: "Legacy bid data contains T12.",
          tier: "T12",
        },
      ],
    };
    const legacyItem = data.legacyItems[0]!;

    expect(findTierDiagnosticsForItem(data, legacyItem)).toHaveLength(1);

    const detail = resolveTierDetailViewModel(data, {
      kind: "summaryItem",
      itemId: "legacy-pairing",
      groupKey: "legacy-pairing",
    });

    expect(detail?.warnings).toHaveLength(1);
    expect(detail?.diagnostics).toHaveLength(1);
  });
});
