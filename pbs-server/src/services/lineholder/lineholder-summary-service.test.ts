import assert from "node:assert/strict";
import test from "node:test";
import type {
  PbsLineholderSummaryItem,
  PbsLineholderSummaryStatistic,
  PbsLineholderSummaryWarning,
} from "../../../../packages/contracts/pbs-lineholder-summary.js";
import { buildLineholderSummaryDiagnostics } from "./lineholder-summary-diagnostics.js";
import { buildLineholderSummaryEditableSource } from "./lineholder-summary-service.js";

const buildStatistic = (
  tier: string,
  totalItems: number,
): PbsLineholderSummaryStatistic => ({
  tier,
  totalItems,
  pairingCount: totalItems,
  lineCount: 0,
  daysOffCount: 0,
});

const buildSummaryItem = (
  patch: Partial<PbsLineholderSummaryItem> & Pick<PbsLineholderSummaryItem, "id" | "label" | "tiers">,
): PbsLineholderSummaryItem => ({
  groupKey: patch.id,
  bidType: "Pairing",
  action: "Award",
  bid: "Enabled",
  value: "Enabled",
  ...patch,
});

test("buildLineholderSummaryDiagnostics reports empty tiers and tier distribution review points", () => {
  const diagnostics = buildLineholderSummaryDiagnostics({
    statistics: [
      buildStatistic("T1", 6),
      buildStatistic("T2", 1),
      buildStatistic("T3", 2),
      buildStatistic("T4", 0),
      buildStatistic("T5", 0),
      buildStatistic("T6", 0),
      buildStatistic("T7", 0),
    ],
    summaryItems: [],
  });

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "emptyTier" && diagnostic.tier === "T4"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "heavyTier" && diagnostic.tier === "T1"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "lightTier" && diagnostic.tier === "T2"));
});

test("buildLineholderSummaryDiagnostics reports legacy and unsupported review points", () => {
  const warnings: PbsLineholderSummaryWarning[] = [
    {
      code: "unsupportedTier",
      message: "Legacy bid data contains T12.",
      tier: "T12",
    },
  ];
  const diagnostics = buildLineholderSummaryDiagnostics({
    statistics: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map((tier) => buildStatistic(tier, 1)),
    summaryItems: [
      buildSummaryItem({
        id: "legacy-pairing",
        label: "Pairing Number",
        tiers: ["T12"],
        warningCode: "unsupportedTier",
      }),
      buildSummaryItem({
        id: "unknown-rule",
        label: "Property 9999",
        bidType: "Unsupported",
        tiers: ["T1"],
      }),
    ],
    warnings,
  });

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "legacyTier" && diagnostic.tier === "T12"));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "unsupportedProperty" && diagnostic.itemIds?.includes("unknown-rule")));
});

test("buildLineholderSummaryDiagnostics reports repeated and restrictive hints without blocking them", () => {
  const diagnostics = buildLineholderSummaryDiagnostics({
    statistics: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map((tier) => buildStatistic(tier, 1)),
    summaryItems: [
      buildSummaryItem({
        id: "pairing-yvr",
        groupKey: "pairing-yvr",
        label: "Any Landing In Airport",
        readableText: "Award Any Landing In Airport: YVR",
        tiers: ["T1", "T2"],
      }),
      buildSummaryItem({
        id: "minimum-days-off",
        groupKey: "minimum-days-off",
        bidType: "DaysOff",
        label: "Minimum Days Off Between Work Blocks",
        readableText: "Set Minimum Days Off Between Work Blocks: 3",
        tiers: ["T3"],
      }),
    ],
  });

  assert.ok(diagnostics.some((diagnostic) =>
    diagnostic.code === "duplicateAcrossTier"
    && diagnostic.groupKey === "pairing-yvr"
    && diagnostic.message === "This bid appears in T1 and T2. Review whether it should apply to multiple Tx.",
  ));
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "restrictiveHint" && diagnostic.groupKey === "minimum-days-off"));
});

test("buildLineholderSummaryEditableSource allows supported editable bid modules only", () => {
  assert.deepEqual(
    buildLineholderSummaryEditableSource("DaysOff", "days-off-prefer-off", true),
    {
      module: "DaysOff",
      propertyGroupKey: "days-off-prefer-off",
    },
  );

  assert.equal(buildLineholderSummaryEditableSource("DaysOff", "days-off-prefer-off", false), undefined);
  assert.equal(buildLineholderSummaryEditableSource("Reserve", "reserve-key", true), undefined);
  assert.equal(buildLineholderSummaryEditableSource("Unsupported", "unsupported-key", true), undefined);
});
