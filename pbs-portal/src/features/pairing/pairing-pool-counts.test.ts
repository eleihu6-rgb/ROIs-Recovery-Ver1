import { describe, expect, it } from "vitest";
import type {
  PbsPairingCurrentRulesCountsResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import {
  buildPairingPoolCountRowsByPropertyKey,
  buildPairingPoolCountsSummary,
  createInitialPairingPoolCountsState,
  normalizePairingPoolCountsTierLabel,
  resolvePairingPoolCountsTier,
  type PairingPoolCountsState,
} from "@/features/pairing/pairing-pool-counts";

const buildCountsResponse = (
  overrides: Partial<PbsPairingCurrentRulesCountsResponse> = {},
): PbsPairingCurrentRulesCountsResponse => ({
  mode: "current_rules_counts",
  periodCode: "Jun 2026",
  tier: "T2",
  computedAt: "2026-06-12T00:00:00.000Z",
  summary: {
    activePropertyCount: 2,
    allRules: {
      pairingIdCount: 8,
      totalItems: 12,
    },
  },
  rows: [
    {
      propertyGroupKey: "property-1",
      rowSeq: 1,
      propertyCode: 102,
      name: "Pairing Number",
      rule: {
        pairingIdCount: 3,
        totalItems: 5,
      },
      funnel: {
        pairingIdCount: 3,
        totalItems: 5,
      },
    },
  ],
  ...overrides,
});

describe("pairing pool counts", () => {
  it("normalizes supported tier label variants", () => {
    expect(normalizePairingPoolCountsTierLabel("T3")).toBe("T3");
    expect(normalizePairingPoolCountsTierLabel(" tier-04 ")).toBe("T4");
    expect(normalizePairingPoolCountsTierLabel("bad")).toBe("");
  });

  it("falls back to T1 when the active tier label is empty or invalid", () => {
    expect(resolvePairingPoolCountsTier("")).toBe("T1");
    expect(resolvePairingPoolCountsTier("TIER-07")).toBe("T7");
  });

  it("creates an idle initial state for a target tier", () => {
    expect(createInitialPairingPoolCountsState("T5")).toEqual({
      tier: "T5",
      status: "idle",
      response: null,
    });
  });

  it("indexes pool count rows by property group key", () => {
    expect(buildPairingPoolCountRowsByPropertyKey(null).size).toBe(0);
    expect(buildPairingPoolCountRowsByPropertyKey(buildCountsResponse()).get("property-1")).toEqual({
      pairingIdCount: 3,
      totalItems: 5,
    });
  });

  it("builds idle, loading, stale, and error summary labels", () => {
    const idleState = createInitialPairingPoolCountsState("T2");

    expect(buildPairingPoolCountsSummary(idleState, "T2")).toEqual({
      isEmptyResult: false,
      resultLabel: "Use refresh for current Tx",
      rulesLabel: "Counts not calculated",
      state: "idle",
      tier: "T2",
    });
    expect(buildPairingPoolCountsSummary(idleState, "T3")).toMatchObject({
      resultLabel: "Calculating...",
      rulesLabel: "Refreshing",
      state: "loading",
      tier: "T3",
    });
    expect(buildPairingPoolCountsSummary({ ...idleState, status: "stale" }, "T2")).toMatchObject({
      resultLabel: "Refresh current Tx",
      rulesLabel: "Counts need refresh",
      state: "stale",
    });
    expect(buildPairingPoolCountsSummary({
      ...idleState,
      status: "error",
      errorMessage: "No data",
    }, "T2")).toMatchObject({
      resultLabel: "Try refresh again",
      rulesLabel: "No data",
      state: "error",
    });
  });

  it("builds success summary labels from the count response", () => {
    const state: PairingPoolCountsState = {
      tier: "T2",
      status: "success",
      response: buildCountsResponse(),
    };

    expect(buildPairingPoolCountsSummary(state, "T2")).toEqual({
      isEmptyResult: false,
      resultLabel: "8 pairings matched",
      rulesLabel: "2 rules",
      state: "success",
      tier: "T2",
    });
    expect(buildPairingPoolCountsSummary({
      ...state,
      response: buildCountsResponse({
        summary: {
          activePropertyCount: 1,
          allRules: null,
        },
      }),
    }, "T2")).toMatchObject({
      resultLabel: "No active pairing properties",
      rulesLabel: "1 rule",
    });

    expect(buildPairingPoolCountsSummary({
      ...state,
      response: buildCountsResponse({
        summary: {
          activePropertyCount: 2,
          allRules: {
            pairingIdCount: 0,
            totalItems: 0,
          },
        },
      }),
    }, "T2")).toMatchObject({
      isEmptyResult: true,
      resultLabel: "0 pairings matched",
      rulesLabel: "2 rules",
    });
  });
});
