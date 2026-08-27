import type {
  PbsLineholderCurrentSummaryResponse,
  PbsLineholderSummaryDiagnostic,
  PbsLineholderSummaryStatistic,
  PbsLineholderSummaryWarning,
} from "../../../../packages/contracts/pbs-lineholder-summary.js";

export const LINEHOLDER_SUMMARY_TIER_LABELS = Array.from({ length: 7 }, (_, index) => `T${index + 1}`);

type SummaryItem = PbsLineholderCurrentSummaryResponse["summaryItems"][number];

type LineholderSummaryDiagnosticsConfig = {
  heavyTierMinItems: number;
  heavyTierAverageMultiplier: number;
  lightTierMinAverage: number;
  reviewHintKeywords: string[];
};

const DEFAULT_LINEHOLDER_SUMMARY_DIAGNOSTICS_CONFIG: LineholderSummaryDiagnosticsConfig = {
  heavyTierMinItems: 4,
  heavyTierAverageMultiplier: 2,
  lightTierMinAverage: 3,
  reviewHintKeywords: [
    "Minimum Days Off Between Work Blocks",
    "Waive Minimum Days Off",
    "Clear Bids",
    "Waive 24 hrs Rest in Domicile",
    "Waive Minimum Domicile Rest",
    "Waive 30 hrs in 7 Days",
    "Waive Carry-Over Credit",
  ],
};

type BuildLineholderSummaryDiagnosticsInput = {
  statistics: PbsLineholderSummaryStatistic[];
  summaryItems: SummaryItem[];
  warnings?: PbsLineholderSummaryWarning[];
  config?: Partial<LineholderSummaryDiagnosticsConfig>;
};

const joinTierLabels = (tiers: string[]) => {
  if (tiers.length <= 2) {
    return tiers.join(" and ");
  }

  return `${tiers.slice(0, -1).join(", ")}, and ${tiers[tiers.length - 1]}`;
};

const getPrimaryText = (item: SummaryItem) => item.readableText ?? `${item.label}: ${item.value ?? item.bid}`;

const isReviewHintItem = (
  item: SummaryItem,
  config: LineholderSummaryDiagnosticsConfig,
) => {
  const haystack = `${item.label} ${item.readableText ?? ""}`.toLowerCase();
  return config.reviewHintKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
};

const resolveDiagnosticsConfig = (
  config?: Partial<LineholderSummaryDiagnosticsConfig>,
): LineholderSummaryDiagnosticsConfig => ({
  ...DEFAULT_LINEHOLDER_SUMMARY_DIAGNOSTICS_CONFIG,
  ...config,
  reviewHintKeywords: config?.reviewHintKeywords
    ?? DEFAULT_LINEHOLDER_SUMMARY_DIAGNOSTICS_CONFIG.reviewHintKeywords,
});

export const buildLineholderSummaryDiagnostics = ({
  statistics,
  summaryItems,
  warnings = [],
  config: configPatch,
}: BuildLineholderSummaryDiagnosticsInput): PbsLineholderSummaryDiagnostic[] => {
  const config = resolveDiagnosticsConfig(configPatch);
  const diagnostics: PbsLineholderSummaryDiagnostic[] = [];
  const statisticsByTier = new Map(statistics.map((stat) => [stat.tier, stat]));

  for (const tier of LINEHOLDER_SUMMARY_TIER_LABELS) {
    const stat = statisticsByTier.get(tier);

    if ((stat?.totalItems ?? 0) === 0) {
      diagnostics.push({
        id: `empty-tier-${tier.toLowerCase()}`,
        code: "emptyTier",
        severity: "info",
        tier,
        tiers: [tier],
        message: `${tier} has no saved bids. Review whether this Tx should remain empty.`,
      });
    }
  }

  const legacyTiers = new Set<string>();
  for (const item of summaryItems) {
    for (const tier of item.tiers) {
      if (!LINEHOLDER_SUMMARY_TIER_LABELS.includes(tier)) {
        legacyTiers.add(tier);
      }
    }
  }
  for (const warning of warnings) {
    if (warning.code === "unsupportedTier" && warning.tier) {
      legacyTiers.add(warning.tier);
    }
  }

  for (const tier of Array.from(legacyTiers).sort()) {
    diagnostics.push({
      id: `legacy-tier-${tier.toLowerCase()}`,
      code: "legacyTier",
      severity: "warning",
      tier,
      tiers: [tier],
      message: `Legacy bid data contains ${tier} outside T1-T7. Review-only legacy items are shown separately.`,
    });
  }

  for (const item of summaryItems) {
    if (
      item.bidType !== "Unsupported"
      && item.warningCode !== "unsupportedProperty"
      && item.warningCode !== "legacyOnly"
    ) {
      continue;
    }

    diagnostics.push({
      id: `unsupported-property-${item.id}`,
      code: "unsupportedProperty",
      severity: "warning",
      tiers: item.tiers,
      groupKey: item.groupKey ?? item.id,
      itemIds: [item.id],
      message: `Unsupported bid "${getPrimaryText(item)}" needs review before final submission.`,
    });
  }

  for (const item of summaryItems) {
    const mainTiers = item.tiers.filter((tier) => LINEHOLDER_SUMMARY_TIER_LABELS.includes(tier));

    if (mainTiers.length <= 1) {
      continue;
    }

    diagnostics.push({
      id: `duplicate-across-tier-${item.id}`,
      code: "duplicateAcrossTier",
      severity: "info",
      tiers: mainTiers,
      groupKey: item.groupKey ?? item.id,
      itemIds: [item.id],
      message: `This bid appears in ${joinTierLabels(mainTiers)}. Review whether it should apply to multiple Tx.`,
    });
  }

  const nonEmptyStats = LINEHOLDER_SUMMARY_TIER_LABELS
    .map((tier) => statisticsByTier.get(tier))
    .filter((stat): stat is PbsLineholderSummaryStatistic => Boolean(stat && stat.totalItems > 0));
  const average = nonEmptyStats.length > 0
    ? nonEmptyStats.reduce((total, stat) => total + stat.totalItems, 0) / nonEmptyStats.length
    : 0;

  if (average > 0) {
    for (const stat of nonEmptyStats) {
      if (stat.totalItems >= Math.max(config.heavyTierMinItems, average * config.heavyTierAverageMultiplier)) {
        diagnostics.push({
          id: `heavy-tier-${stat.tier.toLowerCase()}`,
          code: "heavyTier",
          severity: "info",
          tier: stat.tier,
          tiers: [stat.tier],
          message: `${stat.tier} has ${stat.totalItems} bids, which is heavier than nearby Tx distribution. Review the bid concentration.`,
        });
      } else if (stat.totalItems === 1 && average >= config.lightTierMinAverage) {
        diagnostics.push({
          id: `light-tier-${stat.tier.toLowerCase()}`,
          code: "lightTier",
          severity: "info",
          tier: stat.tier,
          tiers: [stat.tier],
          message: `${stat.tier} has only 1 bid while other Tx have more activity. Review whether this Tx is intentionally light.`,
        });
      }
    }
  }

  for (const item of summaryItems) {
    if (!isReviewHintItem(item, config)) {
      continue;
    }

    diagnostics.push({
      id: `restrictive-hint-${item.id}`,
      code: "restrictiveHint",
      severity: "info",
      tiers: item.tiers,
      groupKey: item.groupKey ?? item.id,
      itemIds: [item.id],
      message: `"${item.label}" may affect later Tx. Review this bid before final submission.`,
    });
  }

  return diagnostics;
};
