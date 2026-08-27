import type { RuleBidAvailableProperty } from "@/features/rule-bids/types";

export type RuleBidAvailablePropertyTab = "all" | "favorited";

export const RULE_BID_ALL_CATEGORY_KEY = "all";

export type RuleBidAvailableCategoryFilter = {
  key: string;
  label: string;
  count: number;
  sortOrder: number;
};

export const normalizeRuleBidSearchText = (value: string) => value.trim().toLowerCase();

const isRuleBidPropertyVisibleInTab = (
  property: RuleBidAvailableProperty,
  activeTab: RuleBidAvailablePropertyTab,
) => {
  if (activeTab === "all" && property.source === "favorite") {
    return false;
  }

  if (activeTab === "favorited" && property.source !== "favorite") {
    return false;
  }

  return true;
};

export const normalizeRuleBidCategoryKey = (label: string) =>
  normalizeRuleBidSearchText(label).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const buildRuleBidAvailableCategoryFilters = (
  properties: RuleBidAvailableProperty[],
  activeTab: RuleBidAvailablePropertyTab,
): RuleBidAvailableCategoryFilter[] => {
  const tabProperties = properties.filter((property) => isRuleBidPropertyVisibleInTab(property, activeTab));
  const categoryByKey = new Map<string, RuleBidAvailableCategoryFilter>();

  for (const property of tabProperties) {
    const categoryLabel = property.categoryLabel?.trim();

    if (!categoryLabel) {
      continue;
    }

    const key = normalizeRuleBidCategoryKey(categoryLabel);

    if (!key) {
      continue;
    }

    const currentCategory = categoryByKey.get(key);

    if (!currentCategory) {
      categoryByKey.set(key, {
        key,
        label: categoryLabel,
        count: 1,
        sortOrder: property.categorySortOrder ?? Number.MAX_SAFE_INTEGER,
      });
      continue;
    }

    currentCategory.count += 1;
    currentCategory.sortOrder = Math.min(
      currentCategory.sortOrder,
      property.categorySortOrder ?? Number.MAX_SAFE_INTEGER,
    );
  }

  if (categoryByKey.size === 0) {
    return [];
  }

  const categories = [...categoryByKey.values()].sort((left, right) =>
    left.sortOrder - right.sortOrder
    || left.label.localeCompare(right.label));

  return [
    {
      key: RULE_BID_ALL_CATEGORY_KEY,
      label: "All",
      count: tabProperties.length,
      sortOrder: 0,
    },
    ...categories,
  ];
};

export const filterRuleBidAvailableProperties = (
  properties: RuleBidAvailableProperty[],
  activeTab: RuleBidAvailablePropertyTab,
  searchKeyword: string,
  categoryKey = RULE_BID_ALL_CATEGORY_KEY,
) => {
  const keyword = normalizeRuleBidSearchText(searchKeyword);

  const filteredProperties = properties.filter((property) => {
    if (!isRuleBidPropertyVisibleInTab(property, activeTab)) {
      return false;
    }

    if (
      categoryKey !== RULE_BID_ALL_CATEGORY_KEY
      && normalizeRuleBidCategoryKey(property.categoryLabel ?? "") !== categoryKey
    ) {
      return false;
    }

    return !keyword || normalizeRuleBidSearchText(property.name).includes(keyword);
  });

  if (activeTab === "all") {
    return filteredProperties
      .map((property, index) => ({ property, index }))
      .sort((left, right) => {
        const leftCategoryOrder = left.property.categorySortOrder;
        const rightCategoryOrder = right.property.categorySortOrder;

        if (leftCategoryOrder !== undefined || rightCategoryOrder !== undefined) {
          return (leftCategoryOrder ?? Number.MAX_SAFE_INTEGER)
            - (rightCategoryOrder ?? Number.MAX_SAFE_INTEGER)
            || left.index - right.index;
        }

        const leftRecommendedOrder = left.property.recommendedSortOrder;
        const rightRecommendedOrder = right.property.recommendedSortOrder;

        if (leftRecommendedOrder !== undefined || rightRecommendedOrder !== undefined) {
          return (leftRecommendedOrder ?? Number.MAX_SAFE_INTEGER)
            - (rightRecommendedOrder ?? Number.MAX_SAFE_INTEGER)
            || left.index - right.index;
        }

        return left.index - right.index;
      })
      .map(({ property }) => property);
  }

  return filteredProperties
    .map((property, index) => ({ property, index }))
    .sort((left, right) => {
      return left.index - right.index;
    })
    .map(({ property }) => property);
};
