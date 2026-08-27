import type {
  PairingAvailableProperty,
  PairingSearchForm,
} from "@/features/pairing/types";
import { PAIRING_NUMBER_PROPERTY_CODE } from "@/features/pairing/pairing-number-occurrences";

export type PairingAvailablePropertyTab = "all" | "favorited";
export type PairingPaginationItem = number | "ellipsis-start" | "ellipsis-end";

export const normalizePairingSearchText = (value: string) => value.trim().toLowerCase();

export const doPairingDateRangesOverlap = (
  propertyFrom: string,
  propertyTo: string,
  filterFrom: string,
  filterTo: string,
) => {
  if (!filterFrom && !filterTo) {
    return true;
  }

  if (!propertyFrom && !propertyTo) {
    return true;
  }

  const start = filterFrom || propertyFrom;
  const end = filterTo || propertyTo;
  const propertyStart = propertyFrom || propertyTo;
  const propertyEnd = propertyTo || propertyFrom;

  return propertyStart <= end && propertyEnd >= start;
};

export const buildPairingPaginationItems = (
  currentPage: number,
  totalPages: number,
): PairingPaginationItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);
  const items: PairingPaginationItem[] = [1];

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

export const clampPairingPage = (page: number, totalPages: number) =>
  Math.min(totalPages, Math.max(1, page));

export const buildPairingTotalPages = (totalItems: number, pageSize: number) =>
  Math.max(1, Math.ceil(totalItems / pageSize));

export const buildPairingAvailablePropertiesPage = (
  properties: PairingAvailableProperty[],
  currentPage: number,
  pageSize: number,
) => {
  const totalItems = properties.length;
  const totalPages = buildPairingTotalPages(totalItems, pageSize);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    items: properties.slice(startIndex, startIndex + pageSize),
    totalItems,
    totalPages,
  };
};

const prioritizePairingAllProperties = (
  properties: PairingAvailableProperty[],
) => [...properties].sort((left, right) => {
  const leftRecommendedOrder = left.recommendedSortOrder;
  const rightRecommendedOrder = right.recommendedSortOrder;

  if (leftRecommendedOrder !== undefined || rightRecommendedOrder !== undefined) {
    return (leftRecommendedOrder ?? Number.MAX_SAFE_INTEGER)
      - (rightRecommendedOrder ?? Number.MAX_SAFE_INTEGER);
  }

  const leftIsPairingNumber = left.propertyCode === PAIRING_NUMBER_PROPERTY_CODE;
  const rightIsPairingNumber = right.propertyCode === PAIRING_NUMBER_PROPERTY_CODE;

  if (leftIsPairingNumber === rightIsPairingNumber) {
    return 0;
  }

  return leftIsPairingNumber ? -1 : 1;
});

export const filterPairingAvailableProperties = (
  properties: PairingAvailableProperty[],
  activeTab: PairingAvailablePropertyTab,
  searchKeyword: string,
  searchForm: PairingSearchForm,
) => {
  const keyword = normalizePairingSearchText(searchKeyword);
  const pairingNumber = normalizePairingSearchText(searchForm.pairingNumber);

  const filteredProperties = properties.filter((property) => {
    if (activeTab === "all" && property.source === "favorite") {
      return false;
    }

    if (activeTab === "favorited" && property.source !== "favorite") {
      return false;
    }

    if (keyword && !normalizePairingSearchText(property.name).includes(keyword)) {
      return false;
    }

    if (
      pairingNumber
      && !normalizePairingSearchText(property.pairingNumber).includes(pairingNumber)
    ) {
      return false;
    }

    if (
      searchForm.pairingType !== "All Types"
      && property.pairingType !== searchForm.pairingType
    ) {
      return false;
    }

    return doPairingDateRangesOverlap(
      property.effectiveDateRange.from,
      property.effectiveDateRange.to,
      searchForm.dateFrom,
      searchForm.dateTo,
    );
  });

  if (activeTab === "all") {
    return prioritizePairingAllProperties(filteredProperties);
  }

  return filteredProperties
    .map((property, index) => ({ property, index }))
    .sort((left, right) => {
      return left.index - right.index;
    })
    .map(({ property }) => property);
};
