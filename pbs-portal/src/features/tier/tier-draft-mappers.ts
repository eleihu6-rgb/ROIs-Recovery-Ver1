import type { PbsLineholderCurrentSummaryResponse } from "../../../../packages/contracts/pbs-lineholder-summary.js";
import type {
  TierBidType,
  TierPageData,
  TierStatisticRow,
  TierSummaryItem,
} from "@/features/tier/types";
import {
  MIXED_LINE_BID_DISPLAY_NAME,
  MIXED_LINE_BID_PERSISTENCE_NAME,
  MIXED_LINE_SHORT_CALL_PERSISTENCE_NAME,
} from "@/features/line/mixed-line-bid";

const TIER_LABELS = Array.from({ length: 7 }, (_, index) => `T${index + 1}`);
const MIN_SEGMENT_WIDTH = 12;
const MAX_SEGMENT_WIDTH = 84;

const BID_TYPE_ORDER: Record<TierBidType, number> = {
  Pairing: 0,
  DaysOff: 1,
  Line: 2,
  Reserve: 3,
  Unsupported: 4,
};

const buildSegmentWidths = (tierCounts: number[]) => {
  const maxCount = Math.max(...tierCounts, 0);

  if (maxCount === 0) {
    return tierCounts.map(() => MIN_SEGMENT_WIDTH);
  }

  return tierCounts.map((count) => (
    count === 0
      ? MIN_SEGMENT_WIDTH
      : MIN_SEGMENT_WIDTH + Math.round((count / maxCount) * (MAX_SEGMENT_WIDTH - MIN_SEGMENT_WIDTH))
  ));
};

const buildStatisticsRows = (
  statistics: PbsLineholderCurrentSummaryResponse["statistics"],
): TierStatisticRow[] => {
  const tierCounts = TIER_LABELS.map((label) =>
    statistics.find((stat) => stat.tier === label)?.totalItems ?? 0,
  );
  const segments = buildSegmentWidths(tierCounts);

  return TIER_LABELS.map((tier, index) => {
    const stat = statistics.find((candidate) => candidate.tier === tier);

    return {
      id: `stat-${tier.toLowerCase()}`,
      tier,
      totalItems: stat?.totalItems ?? 0,
      pairingCount: stat?.pairingCount ?? 0,
      daysOffCount: stat?.daysOffCount ?? 0,
      lineCount: stat?.lineCount ?? 0,
      unsupportedItemCount: stat?.unsupportedItemCount ?? 0,
      segments,
      highlightIndex: index,
    };
  });
};

const formatConditionText = (
  condition: NonNullable<PbsLineholderCurrentSummaryResponse["summaryItems"][number]["conditions"]>[number],
) => {
  const connectorText = condition.connector ?? "AND";

  if (condition.operator) {
    return `${connectorText} ${condition.label} ${condition.operator} ${condition.value}`;
  }

  return `${connectorText} ${condition.label}: ${condition.value}`;
};

const getSummaryItemDisplayLabel = (
  item: PbsLineholderCurrentSummaryResponse["summaryItems"][number],
) => (
  item.bidType === "Line" && (
    item.label === MIXED_LINE_BID_PERSISTENCE_NAME
    || item.label === MIXED_LINE_SHORT_CALL_PERSISTENCE_NAME
  )
    ? MIXED_LINE_BID_DISPLAY_NAME
    : item.label
);

const buildReadableText = (
  item: PbsLineholderCurrentSummaryResponse["summaryItems"][number],
  displayLabel = getSummaryItemDisplayLabel(item),
) => {
  if (item.readableText) {
    return displayLabel !== item.label && item.readableText.includes(item.label)
      ? item.readableText.replaceAll(item.label, displayLabel)
      : item.readableText;
  }

  const value = item.value ?? item.bid;

  if (item.action === "Award") {
    return item.operator ? `Award ${displayLabel} ${item.operator} ${value}` : `Award ${displayLabel}: ${value}`;
  }

  if (item.action === "Avoid") {
    return item.operator ? `Avoid ${displayLabel} ${item.operator} ${value}` : `Avoid ${displayLabel}: ${value}`;
  }

  if (item.action === "SetCondition") {
    return item.operator ? `Set ${displayLabel} ${item.operator} ${value}` : `Set ${displayLabel}: ${value}`;
  }

  return item.operator ? `${displayLabel} ${item.operator} ${value}` : `${displayLabel}: ${value}`;
};

const isSupportedEditableTier = (tier: string) => TIER_LABELS.includes(tier);

const isEditableSummaryItem = (
  item: PbsLineholderCurrentSummaryResponse["summaryItems"][number],
) => Boolean(
  item.editableSource
  && !item.warningCode
  && item.bidType !== "Reserve"
  && item.bidType !== "Unsupported"
  && item.tiers.length > 0
  && item.tiers.every(isSupportedEditableTier),
);

const mapSummaryItem = (
  item: PbsLineholderCurrentSummaryResponse["summaryItems"][number],
  tier?: string,
): TierSummaryItem => {
  const displayLabel = getSummaryItemDisplayLabel(item);

  return {
    id: tier ? `${item.id}-${tier.toLowerCase()}` : item.id,
    groupKey: item.groupKey ?? item.id,
    bidType: item.bidType,
    action: item.action,
    displayTier: tier,
    label: displayLabel,
    readableText: buildReadableText(item, displayLabel),
    tiers: item.tiers,
    conditions: (item.conditions ?? []).map((condition) => ({
      id: condition.id,
      text: formatConditionText(condition),
    })),
    warningCode: item.warningCode,
    editableSource: item.editableSource,
    isEditable: isEditableSummaryItem(item),
  };
};

const sortSummaryItems = (items: TierSummaryItem[]) =>
  [...items].sort((left, right) => {
    const typeDelta = BID_TYPE_ORDER[left.bidType] - BID_TYPE_ORDER[right.bidType];

    if (typeDelta !== 0) {
      return typeDelta;
    }

    return left.readableText.localeCompare(right.readableText);
  });

const buildSummaryGroups = (
  summaryItems: PbsLineholderCurrentSummaryResponse["summaryItems"],
): TierPageData["summaryGroups"] =>
  TIER_LABELS.map((tier) => {
    const items = summaryItems
      .filter((item) => item.tiers.includes(tier))
      .map((item) => mapSummaryItem(item, tier));

    return {
      tier,
      totalItems: items.length,
      items: sortSummaryItems(items),
    };
  });

const buildLegacyItems = (
  summaryItems: PbsLineholderCurrentSummaryResponse["summaryItems"],
) =>
  sortSummaryItems(
    summaryItems
      .filter((item) => item.tiers.some((tier) => !TIER_LABELS.includes(tier)))
      .map((item) => mapSummaryItem(item)),
  );

const buildDiagnostics = (
  diagnostics: PbsLineholderCurrentSummaryResponse["diagnostics"] = [],
): TierPageData["diagnostics"] =>
  diagnostics.map((diagnostic) => ({
    id: diagnostic.id,
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    tier: diagnostic.tier,
    tiers: diagnostic.tiers ?? (diagnostic.tier ? [diagnostic.tier] : []),
    groupKey: diagnostic.groupKey,
    itemIds: diagnostic.itemIds ?? [],
  }));

export const mapLineholderSummaryToTierPageData = (
  response: PbsLineholderCurrentSummaryResponse,
): TierPageData => ({
  statisticsTitle: "PAIRING POOLS",
  summaryTitle: "BID SUMMARY",
  diagnosticsTitle: "BID REVIEW",
  warningsTitle: "TIER WARNINGS",
  statisticsRows: buildStatisticsRows(response.statistics),
  summaryGroups: buildSummaryGroups(response.summaryItems),
  legacyItems: buildLegacyItems(response.summaryItems),
  diagnostics: buildDiagnostics(response.diagnostics),
  warnings: response.warnings ?? [],
});
