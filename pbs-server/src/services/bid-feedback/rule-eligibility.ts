import type { PbsBidFeedbackPairing } from "../../../../packages/contracts/pbs-bid-feedback.js";
import { checkPairingViaRust, type RustViolation } from "../rule-check/rust-rule-runner.js";
import type { PbsRuleset } from "./ruleset-resolver.js";

export type PairingEligibility = NonNullable<PbsBidFeedbackPairing["eligibility"]>;

export const RULESET_NOT_CONFIGURED_ELIGIBILITY: PairingEligibility = {
  status: "unknown",
  checked: ["rule_engine"],
  unavailable: ["rule_engine"],
  reasons: [{
    code: "FACTS_MISSING",
    message: "No enabled PBS ruleset configured for this division. Please ask an administrator to configure the PBS ruleset.",
  }],
};

export interface CandidatePairingRef {
  pairingId: string;
  originDate: string;
  endDate: string;
}

export interface ComputePairingEligibilityArgs {
  liveSchema: string;
  ruleset: PbsRuleset | null;
  crewId: string;
  pairings: CandidatePairingRef[];
  runner?: (args: {
    liveSchema: string;
    crewId: string;
    pairingId: number;
    rulesetId: number;
    dateFrom: string;
    dateTo: string;
  }) => Promise<RustViolation[]>;
  /** Optional per-pairing callback fired as each pairing finishes (streaming / WS push). */
  onPairingComplete?: (pairingId: string, eligibility: PairingEligibility) => void;
  /** Concurrency cap. Defaults to 4 — higher thrashes the 4-core servers during a large batch. */
  concurrency?: number;
}

const CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const addUtcDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const UNKNOWN_ELIGIBILITY: PairingEligibility = {
  status: "unknown",
  checked: ["rule_engine"],
  unavailable: ["rule_engine"],
  reasons: [],
};

const formatUnavailableReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) {
    return "Rule engine binary is unavailable on this server. Rebuild and deploy rule-engine-rs release binaries.";
  }
  return "Rule engine check could not be completed for this pairing.";
};

/**
 * Compute per-pairing rule eligibility by directly invoking the RUST rule binaries
 * through live-server's shared legality core (see rust-rule-runner). Each award pairing
 * is evaluated in isolation over its own date window; violations are mapped to
 * RULE_ENGINE_CONFLICT reasons. Engine/core failures degrade to unknown per pairing.
 */
export const computePairingEligibility = async ({
  liveSchema,
  ruleset,
  crewId,
  pairings,
  runner = checkPairingViaRust,
  onPairingComplete,
  concurrency = CONCURRENCY,
}: ComputePairingEligibilityArgs): Promise<Map<string, PairingEligibility>> => {
  const result = new Map<string, PairingEligibility>();

  if (!ruleset) {
    for (const p of pairings) {
      result.set(p.pairingId, RULESET_NOT_CONFIGURED_ELIGIBILITY);
      onPairingComplete?.(p.pairingId, RULESET_NOT_CONFIGURED_ELIGIBILITY);
    }
    return result;
  }

  await mapWithConcurrency(pairings, concurrency, async (p) => {
    const dateFrom = p.originDate;
    const dateTo = addUtcDays(p.endDate, 1); // exclusive upper bound
    try {
      const violations = await runner({
        liveSchema,
        crewId,
        pairingId: Number(p.pairingId),
        rulesetId: ruleset.rulesetId,
        dateFrom,
        dateTo,
      });
      if (violations.length === 0) {
        const eligibility: PairingEligibility = {
          status: "eligible",
          checked: ["rule_engine"],
          unavailable: [],
          reasons: [],
        };
        result.set(p.pairingId, eligibility);
        onPairingComplete?.(p.pairingId, eligibility);
        return;
      }
      const eligibility: PairingEligibility = {
        status: "ineligible",
        checked: ["rule_engine"],
        unavailable: [],
        reasons: violations.map((v) => ({
          code: "RULE_ENGINE_CONFLICT" as const,
          message: v.message,
          ruleId: v.rule_code,
          ruleName: v.rule_code,
        })),
      };
      result.set(p.pairingId, eligibility);
      onPairingComplete?.(p.pairingId, eligibility);
    } catch (err) {
      console.error(`[rule-eligibility] rust rule check failed for pairing ${p.pairingId}:`, err);
      const eligibility: PairingEligibility = {
        ...UNKNOWN_ELIGIBILITY,
        reasons: [{
          code: "FACTS_MISSING",
          message: formatUnavailableReason(err),
        }],
      };
      result.set(p.pairingId, eligibility);
      onPairingComplete?.(p.pairingId, eligibility);
    }
  });

  return result;
};
