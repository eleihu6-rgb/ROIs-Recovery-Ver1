import { describe, expect, it } from "vitest";
import {
  buildEmptyPairingSearchPageData,
  buildPairingSearchPageDataWithEmptyResults,
  mapPairingSearchPreviewResponseToPageData,
  type PairingSearchPreviewResponse,
} from "@/features/pairing/pairing-search-page-data";
import type {
  PairingSearchCriteriaItem,
  PairingSearchResult,
} from "@/features/pairing/types";

const criteriaItem: PairingSearchCriteriaItem = {
  id: "criteria-131-1",
  favoriteKey: "favorite-131",
  propertyId: 700131,
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: "award",
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: [{ key: "t1", label: "T1", active: true }],
  favorited: true,
  pairingNumber: "M4959",
  pairingType: "Domestic",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
};

const result: PairingSearchResult = {
  id: "result-1",
  pairingId: "4959",
  pairingNumber: "M4959",
  base: "DFW",
  reportTime: "08:00",
  priorityLabel: "Priority 1",
  prioritySequence: "1",
  totalBlock: "12:30",
  totalCredit: "13:10",
  totalPay: "14:00",
  activeDates: ["2026-04-01", "2026-04-02", "2026-04-03"],
  legs: [
    {
      id: "leg-1",
      day: 1,
      dutyDate: "0401",
      dutyFdp: "0830",
      dutyFlyingHour: "0330",
      dutyHour: "0930",
      dutyCredit: "0345",
      flightNumber: "AA101",
      departureStation: "DFW",
      arrivalStation: "LAX",
      departureTime: "08:00",
      arrivalTime: "09:30",
      blockTime: "03:30",
      equipment: "738",
    },
  ],
};

const previewResponse: PairingSearchPreviewResponse = {
  summary: {
    pairingIdCount: 2,
    totalItems: 8,
  },
  pagination: {
    totalItems: 8,
    pageSize: 25,
    page: 2,
  },
  results: [result],
};

describe("pairing search page data helpers", () => {
  it("maps preview responses into page data and clones criteria items", () => {
    const pageData = mapPairingSearchPreviewResponseToPageData(previewResponse, [criteriaItem]);

    expect(pageData.resultSummaryText).toBe("2 pairing numbers, 8 total results");
    expect(pageData.pagination).toEqual({
      totalItems: 8,
      pageSizeOptions: [25],
      defaultPageSize: 25,
      currentPage: 2,
    });
    expect(pageData.results).toBe(previewResponse.results);
    expect(pageData.criteriaItems).toEqual([criteriaItem]);
    expect(pageData.criteriaItems[0]).not.toBe(criteriaItem);
    expect(pageData.criteriaItems[0].bid).not.toBe(criteriaItem.bid);
    expect(pageData.criteriaItems[0].tiers).not.toBe(criteriaItem.tiers);
    expect(pageData.criteriaItems[0].effectiveDateRange).not.toBe(criteriaItem.effectiveDateRange);
  });

  it("maps current-rule preview responses without criteria items", () => {
    const pageData = mapPairingSearchPreviewResponseToPageData(previewResponse);

    expect(pageData.criteriaItems).toEqual([]);
    expect(pageData.resultSummaryText).toBe("2 pairing numbers, 8 total results");
  });

  it("builds empty result page data for initial and refresh states", () => {
    const emptyPageData = buildEmptyPairingSearchPageData();
    const refreshPageData = buildPairingSearchPageDataWithEmptyResults([criteriaItem], 3);

    expect(emptyPageData.resultSummaryText).toBe("0 pairing numbers, 0 total results");
    expect(emptyPageData.criteriaItems).toEqual([]);
    expect(emptyPageData.pagination.totalItems).toBe(0);

    expect(refreshPageData.resultSummaryText).toBe("0 pairing numbers, 0 total results");
    expect(refreshPageData.criteriaItems).toEqual([criteriaItem]);
    expect(refreshPageData.criteriaItems[0]).not.toBe(criteriaItem);
    expect(refreshPageData.pagination.totalItems).toBe(0);
    expect(refreshPageData.pagination.currentPage).toBe(3);
    expect(refreshPageData.results).toEqual([]);
  });
});
