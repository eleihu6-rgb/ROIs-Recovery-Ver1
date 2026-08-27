import type { RuleBidAvailableProperty } from "@/features/rule-bids/types";

export type RuleBidPaginationItem = number | "ellipsis-start" | "ellipsis-end";

export const buildRuleBidPaginationItems = (
  currentPage: number,
  totalPages: number,
): RuleBidPaginationItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);
  const items: RuleBidPaginationItem[] = [1];

  if (windowStart > 2) {
    items.push("ellipsis-start");
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push("ellipsis-end");
  }

  items.push(totalPages);
  return items;
};

export const clampRuleBidPage = (page: number, totalPages: number) =>
  Math.min(totalPages, Math.max(1, page));

export const buildRuleBidAvailablePropertiesPage = (
  properties: RuleBidAvailableProperty[],
  currentPage: number,
  pageSize: number,
) => {
  const totalItems = properties.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;

  return {
    items: properties.slice(startIndex, startIndex + pageSize),
    totalItems,
    totalPages,
  };
};
