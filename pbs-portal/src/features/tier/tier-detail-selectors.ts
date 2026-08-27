import type {
  TierDiagnostic,
  TierPageData,
  TierSummaryItem,
  TierWarning,
} from "@/features/tier/types";

export type TierDetailTarget =
  | { kind: "summaryItem"; itemId: string; groupKey: string }
  | { kind: "diagnostic"; diagnosticId: string };

export type TierDetailViewModel = {
  title: "Tier Bid Detail" | "Tier Review Detail";
  subtitle: string;
  primaryItem?: TierSummaryItem;
  relatedItems: TierSummaryItem[];
  diagnostics: TierDiagnostic[];
  warnings: TierWarning[];
  tiers: string[];
};

const TIER_LEVEL_DIAGNOSTIC_CODES = new Set(["heavyTier", "legacyTier", "lightTier"]);

const uniqueSummaryItemsByIdentity = (items: TierSummaryItem[]) => {
  const seenKeys = new Set<string>();
  return items.filter((item) => {
    const identity = item.groupKey || item.id;

    if (seenKeys.has(identity)) {
      return false;
    }
    seenKeys.add(identity);
    return true;
  });
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values)).sort();

const getAllSummaryItems = (data: TierPageData) => [
  ...data.summaryGroups.flatMap((group) => group.items),
  ...data.legacyItems,
];

const intersects = (left: string[], right: string[]) => left.some((value) => right.includes(value));

const matchesItemIdentifier = (item: TierSummaryItem, itemId: string) => (
  item.id === itemId
  || item.groupKey === itemId
  || item.id.startsWith(`${itemId}-`)
);

const matchesDiagnosticItemReference = (
  item: TierSummaryItem,
  diagnostic: TierDiagnostic,
) => (
  (diagnostic.groupKey ? item.groupKey === diagnostic.groupKey : false)
  || diagnostic.itemIds.some((itemId) => matchesItemIdentifier(item, itemId))
);

export const findTierSummaryItemById = (
  data: TierPageData,
  itemId: string,
) => getAllSummaryItems(data).find((item) => item.id === itemId);

export const findTierSummaryItemsByDiagnostic = (
  data: TierPageData,
  diagnostic: TierDiagnostic,
) => {
  if (!diagnostic.groupKey && diagnostic.itemIds.length === 0) {
    return [];
  }

  return uniqueSummaryItemsByIdentity(getAllSummaryItems(data).filter((item) =>
    matchesDiagnosticItemReference(item, diagnostic),
  ));
};

export const findTierDiagnosticsForItem = (
  data: TierPageData,
  item: TierSummaryItem,
) =>
  data.diagnostics.filter((diagnostic) => {
    if (matchesDiagnosticItemReference(item, diagnostic)) {
      return true;
    }

    return TIER_LEVEL_DIAGNOSTIC_CODES.has(diagnostic.code)
      && intersects(item.tiers, diagnostic.tiers);
  });

export const findTierWarningsForItem = (
  data: TierPageData,
  item: TierSummaryItem,
) =>
  data.warnings.filter((warning) => (
    (warning.tier ? item.tiers.includes(warning.tier) : false)
    || item.warningCode === warning.code
  ));

const findTierWarningsForDiagnostic = (
  data: TierPageData,
  diagnostic: TierDiagnostic,
) =>
  data.warnings.filter((warning) => (
    warning.code === diagnostic.code
    || (warning.tier ? diagnostic.tiers.includes(warning.tier) : false)
  ));

const getRelatedItemsForPrimaryItem = (
  data: TierPageData,
  primaryItem: TierSummaryItem,
) =>
  uniqueSummaryItemsByIdentity(getAllSummaryItems(data).filter((item) => (
    item.id === primaryItem.id || item.groupKey === primaryItem.groupKey
  )));

export const resolveTierDetailViewModel = (
  data: TierPageData,
  target: TierDetailTarget,
): TierDetailViewModel | null => {
  if (target.kind === "summaryItem") {
    const primaryItem = findTierSummaryItemById(data, target.itemId)
      ?? getAllSummaryItems(data).find((item) => item.groupKey === target.groupKey);

    if (!primaryItem) {
      return null;
    }

    const relatedItems = getRelatedItemsForPrimaryItem(data, primaryItem);

    return {
      title: "Tier Bid Detail",
      subtitle: primaryItem.readableText,
      primaryItem,
      relatedItems,
      diagnostics: findTierDiagnosticsForItem(data, primaryItem),
      warnings: findTierWarningsForItem(data, primaryItem),
      tiers: uniqueStrings(primaryItem.tiers),
    };
  }

  const diagnostic = data.diagnostics.find((candidate) => candidate.id === target.diagnosticId);

  if (!diagnostic) {
    return null;
  }

  const relatedItems = findTierSummaryItemsByDiagnostic(data, diagnostic);
  const primaryItem = relatedItems[0];

  return {
    title: primaryItem ? "Tier Bid Detail" : "Tier Review Detail",
    subtitle: primaryItem?.readableText ?? diagnostic.message,
    primaryItem,
    relatedItems,
    diagnostics: [
      diagnostic,
      ...(primaryItem
        ? findTierDiagnosticsForItem(data, primaryItem).filter((itemDiagnostic) => itemDiagnostic.id !== diagnostic.id)
        : []),
    ],
    warnings: primaryItem ? findTierWarningsForItem(data, primaryItem) : findTierWarningsForDiagnostic(data, diagnostic),
    tiers: uniqueStrings(primaryItem?.tiers ?? diagnostic.tiers),
  };
};
