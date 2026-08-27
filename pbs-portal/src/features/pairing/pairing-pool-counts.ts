import type {
  PbsPairingCurrentRulesCountsResponse,
} from "../../../../packages/contracts/pbs-search-pairings.js";
import type { PairingPropertyPoolCountDisplay } from "@/features/pairing/components/pairing-property-table";

export type PairingPoolCountsState = {
  tier: string;
  status: "idle" | "loading" | "success" | "error" | "stale";
  response: PbsPairingCurrentRulesCountsResponse | null;
  errorMessage?: string;
};

export type PairingPoolCountsSummaryDisplay = {
  isEmptyResult: boolean;
  resultLabel: string;
  rulesLabel: string;
  state: PairingPoolCountsState["status"];
  tier: string;
};

const DEFAULT_PAIRING_POOL_COUNTS_TIER = "T1";

export const normalizePairingPoolCountsTierLabel = (label: string) => {
  const compactLabel = label.trim().toUpperCase().replace(/\s+/g, "");
  const match = compactLabel.match(/^(?:T|TIER-?)0*([1-9]\d*)$/);

  return match ? `T${Number.parseInt(match[1], 10)}` : "";
};

export const resolvePairingPoolCountsTier = (activeTierLabel: string) => {
  const normalizedActiveTier = normalizePairingPoolCountsTierLabel(activeTierLabel);

  return normalizedActiveTier || DEFAULT_PAIRING_POOL_COUNTS_TIER;
};

export const createInitialPairingPoolCountsState = (tier: string): PairingPoolCountsState => ({
  tier,
  status: "idle",
  response: null,
});

const formatPoolCountSummary = (count: { pairingIdCount: number; totalItems: number }) =>
  `${count.pairingIdCount} pairings matched`;

const formatRuleQuantity = (count: number) =>
  `${count} ${count === 1 ? "rule" : "rules"}`;

export const buildPairingPoolCountRowsByPropertyKey = (
  response: PbsPairingCurrentRulesCountsResponse | null,
) => {
  if (!response) {
    return new Map<string, PairingPropertyPoolCountDisplay>();
  }

  return new Map(
    response.rows.map((row) => [
      row.propertyGroupKey,
      row.rule,
    ]),
  );
};

export const buildPairingPoolCountsSummary = (
  pairingPoolCounts: PairingPoolCountsState,
  currentPoolCountsTier: string,
): PairingPoolCountsSummaryDisplay => {
  if (
    pairingPoolCounts.tier !== currentPoolCountsTier
    || pairingPoolCounts.status === "loading"
  ) {
    return {
      isEmptyResult: false,
      resultLabel: "Calculating...",
      rulesLabel: "Refreshing",
      state: "loading",
      tier: currentPoolCountsTier,
    };
  }

  if (pairingPoolCounts.status === "stale") {
    return {
      isEmptyResult: false,
      resultLabel: "Refresh current Tx",
      rulesLabel: "Counts need refresh",
      state: "stale",
      tier: currentPoolCountsTier,
    };
  }

  if (pairingPoolCounts.status === "error") {
    return {
      isEmptyResult: false,
      resultLabel: "Try refresh again",
      rulesLabel: pairingPoolCounts.errorMessage ?? "Unable to calculate counts",
      state: "error",
      tier: currentPoolCountsTier,
    };
  }

  if (pairingPoolCounts.status === "success") {
    const allRules = pairingPoolCounts.response?.summary.allRules;
    const activePropertyCount = pairingPoolCounts.response?.summary.activePropertyCount ?? 0;

    return {
      isEmptyResult: allRules?.pairingIdCount === 0,
      resultLabel: allRules
        ? formatPoolCountSummary(allRules)
        : "No active pairing properties",
      rulesLabel: formatRuleQuantity(activePropertyCount),
      state: "success",
      tier: currentPoolCountsTier,
    };
  }

  return {
    isEmptyResult: false,
    resultLabel: "Use refresh for current Tx",
    rulesLabel: "Counts not calculated",
    state: "idle",
    tier: currentPoolCountsTier,
  };
};
