import { describe, expect, it } from "vitest";
import {
  buildPairingOccurrenceCandidates,
  buildPairingOccurrenceDialogIntent,
  buildPairingSearchCriteriaCandidatesForTier,
  buildPairingSearchPreviewPageState,
  buildPairingSearchPreviewQueryEnabled,
  getUniquePairingNumbersFromSearchCriteria,
  type PairingOccurrenceDialogState,
} from "@/features/pairing/search-pairings-page-logic";
import type {
  PairingSearchCriteriaItem,
  PairingSearchResult,
} from "@/features/pairing/types";

const buildCriteriaItem = (
  overrides: Partial<PairingSearchCriteriaItem> = {},
): PairingSearchCriteriaItem => ({
  id: "criteria-150-1",
  propertyCode: 150,
  name: "Layover at City",
  action: "award",
  quantifier: "any",
  bid: { type: "tag-list", values: ["YYZ"] },
  tiers: [{ key: "t1", label: "T1", active: true }],
  favorited: false,
  pairingNumber: "M4959",
  pairingType: "Regular",
  effectiveDateRange: {
    from: "2026-04-01",
    to: "2026-04-30",
  },
  ...overrides,
});

const result: PairingSearchResult = {
  id: "result-1",
  pairingId: "496001",
  pairingNumber: "M4959",
  base: "DFW",
  reportTime: "0800",
  priorityLabel: "P1",
  prioritySequence: "1",
  totalBlock: "1230",
  totalCredit: "1310",
  totalPay: "1400",
  activeDates: ["2026-04-01", "2026-04-02", "2026-04-03"],
  legs: [],
};

const previewResponse = {
  summary: {
    pairingIdCount: 1,
    totalItems: 1,
  },
  pagination: {
    totalItems: 1,
    pageSize: 30,
    page: 1,
  },
  results: [result],
};

describe("search pairings page logic", () => {
  it("enables preview queries only when the required inputs are ready", () => {
    const criteriaItem = buildCriteriaItem();

    expect(buildPairingSearchPreviewQueryEnabled({
      criteriaItems: [],
      currentRulesTier: "",
      debouncedCriteriaItems: [],
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      previewPeriodCode: "Apr 2026",
    })).toBe(false);
    expect(buildPairingSearchPreviewQueryEnabled({
      criteriaItems: [criteriaItem],
      currentRulesTier: "",
      debouncedCriteriaItems: [criteriaItem],
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      previewPeriodCode: "Apr 2026",
    })).toBe(true);
    expect(buildPairingSearchPreviewQueryEnabled({
      criteriaItems: [criteriaItem],
      currentRulesTier: "T4",
      debouncedCriteriaItems: [criteriaItem],
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: true,
      isCurrentRulesPreview: false,
      previewPeriodCode: "Apr 2026",
    })).toBe(false);
    expect(buildPairingSearchPreviewQueryEnabled({
      criteriaItems: [],
      currentRulesTier: "T4",
      debouncedCriteriaItems: [],
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: true,
      previewPeriodCode: "Apr 2026",
    })).toBe(true);
    expect(buildPairingSearchPreviewQueryEnabled({
      criteriaItems: [],
      currentRulesTier: "",
      debouncedCriteriaItems: [],
      isAllPairingsPreview: true,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      previewPeriodCode: "Apr 2026",
    })).toBe(true);
  });

  it("resolves unique pairing ids and opens the occurrence dialog only for Pairing Number criteria", () => {
    const pairingNumberItem = buildCriteriaItem({
      propertyCode: 102,
      name: "Pairing Number",
      bid: { type: "pairing-id-list", pairingIds: ["496001", "496001", "496002"] },
    });

    expect(getUniquePairingNumbersFromSearchCriteria([pairingNumberItem])).toEqual(["496001", "496002"]);
    expect(buildPairingOccurrenceDialogIntent([buildCriteriaItem()], "T2")).toEqual({ type: "none" });
    expect(buildPairingOccurrenceDialogIntent([pairingNumberItem], "T2")).toEqual({
      type: "open-dialog",
      state: {
        mode: "entire_month",
        pairingNumbers: ["496001", "496002"],
        selectedOccurrenceId: null,
        selectedPairingNumber: "496001",
        selectedTier: "T2",
      },
    });
  });

  it("reports missing pairing numbers when a Pairing Number criterion has no value", () => {
    const emptyPairingNumberItem = buildCriteriaItem({
      propertyCode: 102,
      name: "Pairing Number",
      bid: { type: "pairing-id-list", pairingIds: ["  "] },
    });

    expect(buildPairingOccurrenceDialogIntent([emptyPairingNumberItem], "T1")).toEqual({
      type: "missing-pairing-number",
    });
  });

  it("builds tier candidates and folds multiple Pairing Number criteria into one occurrence bid", () => {
    const pairingNumberItem = buildCriteriaItem({
      id: "criteria-102-1",
      propertyCode: 102,
      name: "Pairing Number",
      bid: { type: "pairing-id-list", pairingIds: ["496001"], pairingLabels: ["M4959"] },
    });
    const duplicatePairingNumberItem = buildCriteriaItem({
      id: "criteria-102-2",
      propertyCode: 102,
      name: "Pairing Number",
      bid: { type: "pairing-id-list", pairingIds: ["496002"], pairingLabels: ["M4960"] },
    });
    const dialogState: PairingOccurrenceDialogState = {
      mode: "specific_date",
      pairingNumbers: ["496001", "496002"],
      selectedOccurrenceId: "496001:2026-04-10",
      selectedPairingNumber: "496001",
      selectedTier: "T3",
    };
    const candidates = buildPairingOccurrenceCandidates(
      [pairingNumberItem, duplicatePairingNumberItem, buildCriteriaItem()],
      dialogState,
      {
        occurrenceId: "496001:2026-04-10",
        pairingNumber: "M4959",
        pairingId: "496001",
        originDate: "2026-04-10",
        startDate: "2026-04-10",
        endDate: "2026-04-12",
        label: "M4959 · 2026-04-10",
      },
    );

    expect(buildPairingSearchCriteriaCandidatesForTier([buildCriteriaItem()], "T5")[0].tiers).toEqual([
      { key: "t1", label: "T1", active: false },
      { key: "t2", label: "T2", active: false },
      { key: "t3", label: "T3", active: false },
      { key: "t4", label: "T4", active: false },
      { key: "t5", label: "T5", active: true },
      { key: "t6", label: "T6", active: false },
      { key: "t7", label: "T7", active: false },
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      id: "criteria-102-1",
      pairingNumber: "M4959",
      bid: {
        type: "pairing-occurrence-list",
        occurrences: [
          {
            occurrenceId: "496001:2026-04-10",
            pairingId: "496001",
            pairingNumber: "M4959",
            originDate: "2026-04-10",
          },
        ],
        suggestions: ["M4959"],
      },
    });
    expect(candidates[0].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T3"]);
    expect(candidates[1]).toMatchObject({
      id: "criteria-150-1",
      name: "Layover at City",
    });
    expect(candidates[1].tiers.filter((tier) => tier.active).map((tier) => tier.label)).toEqual(["T3"]);
  });

  it("builds empty, refresh, cached, and current-rule preview page states", () => {
    const criteriaItem = buildCriteriaItem();

    expect(buildPairingSearchPreviewPageState({
      criteriaItems: [],
      currentPage: 1,
      hasCriteriaPreview: false,
      hasSearchShellRendered: false,
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      isPreviewError: false,
      isPreviewFetching: false,
      lastPreviewResponse: null,
      previewResponse: null,
    }).pageData?.resultSummaryText).toBe("0 pairing numbers, 0 total results");

    const refreshState = buildPairingSearchPreviewPageState({
      criteriaItems: [criteriaItem],
      currentPage: 2,
      hasCriteriaPreview: true,
      hasSearchShellRendered: true,
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: true,
      isCurrentRulesPreview: false,
      isPreviewError: false,
      isPreviewFetching: true,
      lastPreviewResponse: previewResponse,
      previewResponse: null,
    });

    expect(refreshState.shouldShowLocalResultsRefresh).toBe(true);
    expect(refreshState.pageData?.results).toEqual([]);
    expect(refreshState.pageData?.criteriaItems).toEqual([criteriaItem]);
    expect(refreshState.pageData?.pagination.currentPage).toBe(2);

    const cachedState = buildPairingSearchPreviewPageState({
      criteriaItems: [criteriaItem],
      currentPage: 1,
      hasCriteriaPreview: true,
      hasSearchShellRendered: true,
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      isPreviewError: false,
      isPreviewFetching: false,
      lastPreviewResponse: previewResponse,
      previewResponse: null,
    });

    expect(cachedState.pageData?.criteriaItems).toEqual([criteriaItem]);
    expect(cachedState.pageData?.results).toBe(previewResponse.results);

    const currentRulesState = buildPairingSearchPreviewPageState({
      criteriaItems: [criteriaItem],
      currentPage: 1,
      hasCriteriaPreview: false,
      hasSearchShellRendered: false,
      isAllPairingsPreview: false,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: true,
      isPreviewError: false,
      isPreviewFetching: false,
      lastPreviewResponse: null,
      previewResponse,
    });

    expect(currentRulesState.hasSearchPreview).toBe(true);
    expect(currentRulesState.pageData?.criteriaItems).toEqual([]);
    expect(currentRulesState.pageData?.results).toBe(previewResponse.results);

    const allPairingsState = buildPairingSearchPreviewPageState({
      criteriaItems: [],
      currentPage: 1,
      hasCriteriaPreview: false,
      hasSearchShellRendered: false,
      isAllPairingsPreview: true,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      isPreviewError: false,
      isPreviewFetching: false,
      lastPreviewResponse: null,
      previewResponse,
    });

    expect(allPairingsState.hasSearchPreview).toBe(true);
    expect(allPairingsState.pageData?.criteriaItems).toEqual([]);
    expect(allPairingsState.pageData?.results).toBe(previewResponse.results);

    const allPairingsPageChangeState = buildPairingSearchPreviewPageState({
      criteriaItems: [],
      currentPage: 2,
      hasCriteriaPreview: false,
      hasSearchShellRendered: false,
      isAllPairingsPreview: true,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      isPreviewError: false,
      isPreviewFetching: true,
      lastPreviewResponse: previewResponse,
      previewResponse: null,
    });

    expect(allPairingsPageChangeState.shouldShowLocalResultsRefresh).toBe(true);
    expect(allPairingsPageChangeState.pageData?.results).toEqual([]);
    expect(allPairingsPageChangeState.pageData?.pagination).toMatchObject({
      currentPage: 2,
      defaultPageSize: 30,
      totalItems: 1,
    });

    const allPairingsPageChangeErrorState = buildPairingSearchPreviewPageState({
      criteriaItems: [],
      currentPage: 2,
      hasCriteriaPreview: false,
      hasSearchShellRendered: false,
      isAllPairingsPreview: true,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      isPreviewError: true,
      isPreviewFetching: false,
      lastPreviewResponse: previewResponse,
      previewResponse: null,
    });

    expect(allPairingsPageChangeErrorState.shouldShowLocalResultsRefresh).toBe(true);
    expect(allPairingsPageChangeErrorState.pageData?.results).toEqual([]);

    const sameQueryCachedRefreshState = buildPairingSearchPreviewPageState({
      criteriaItems: [],
      currentPage: 1,
      hasCriteriaPreview: false,
      hasSearchShellRendered: true,
      isAllPairingsPreview: true,
      isCriteriaPreviewDebouncing: false,
      isCurrentRulesPreview: false,
      isPreviewError: false,
      isPreviewFetching: true,
      lastPreviewResponse: previewResponse,
      previewResponse,
    });

    expect(sameQueryCachedRefreshState.shouldShowLocalResultsRefresh).toBe(false);
    expect(sameQueryCachedRefreshState.pageData?.results).toBe(previewResponse.results);
  });
});
