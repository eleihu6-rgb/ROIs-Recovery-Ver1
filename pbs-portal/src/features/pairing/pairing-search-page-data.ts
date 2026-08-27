import { pairingSearchPageData } from "@/features/pairing/mock";
import { cloneSearchCriteriaItem } from "@/features/pairing/pairing-property-transform";
import type {
  PairingSearchCriteriaItem,
  PairingSearchPageData,
  PairingSearchResult,
} from "@/features/pairing/types";

export type PairingSearchPreviewResponse = {
  summary: {
    pairingIdCount: number;
    totalItems: number;
  };
  pagination: {
    totalItems: number;
    pageSize: number;
    page: number;
  };
  results: PairingSearchResult[];
};

export const mapPairingSearchPreviewResponseToPageData = (
  response: PairingSearchPreviewResponse,
  criteriaItems: PairingSearchCriteriaItem[] = [],
): PairingSearchPageData => ({
  ...pairingSearchPageData,
  criteriaItems: criteriaItems.map(cloneSearchCriteriaItem),
  resultSummaryText: `${response.summary.pairingIdCount} pairing numbers, ${response.summary.totalItems} total results`,
  pagination: {
    totalItems: response.pagination.totalItems,
    pageSizeOptions: [response.pagination.pageSize],
    defaultPageSize: response.pagination.pageSize,
    currentPage: response.pagination.page,
  },
  results: response.results,
});

export const buildPairingSearchPageDataWithEmptyResults = (
  criteriaItems: PairingSearchCriteriaItem[] = [],
  currentPage = 1,
): PairingSearchPageData => ({
  ...pairingSearchPageData,
  criteriaItems: criteriaItems.map(cloneSearchCriteriaItem),
  resultSummaryText: "0 pairing numbers, 0 total results",
  pagination: {
    ...pairingSearchPageData.pagination,
    totalItems: 0,
    currentPage,
  },
  results: [],
});

export const buildEmptyPairingSearchPageData = (): PairingSearchPageData =>
  buildPairingSearchPageDataWithEmptyResults();
