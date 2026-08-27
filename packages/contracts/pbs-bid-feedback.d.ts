import type { PbsCurrentPeriod } from "./pbs-current-period.js";

export declare const pbsBidFeedbackRoutes: {
  readonly conflicts: "/bid-feedback/current/conflicts";
  readonly current: "/bid-feedback/current";
  readonly eligibility: "/bid-feedback/current/eligibility";
  readonly eligibilityRun: "/bid-feedback/current/eligibility/run/:runId";
  readonly eligibilityWs: "/bid-feedback/current/eligibility/ws";
};

export declare const pbsBidFeedbackEligibilityPairingLimit = 25;

export type PbsBidFeedbackDirection = "award" | "avoid" | "neutral";

export declare const pbsBidFeedbackDirections: {
  readonly award: "award";
  readonly avoid: "avoid";
  readonly neutral: "neutral";
};

export type PbsBidFeedbackConflict = {
  code: string;
  stableKey: string;
  severity: "conflict" | "advisory";
  title: string;
  message: string;
  tier?: string;
  bidKeys?: string[];
  count?: number;
  dates?: Array<{ date: string; count?: number }>;
};

export type PbsBidFeedbackPairing = {
  pairingId: string;
  pairingNumber: string;
  rank: string;
  base: string;
  zoneId: string;
  originDate: string;
  endDate: string;
  routeLabel: string;
  reportTime: string;
  releaseTime: string;
  totalCredit: string;
  durationDays: number;
  tafbDays: number | null;
  rawScore: number;
  rawDirection: PbsBidFeedbackDirection;
  eligibility: null | {
    status: "eligible" | "ineligible" | "unknown";
    checked: Array<"rank" | "base" | "preassignment" | "rule_engine">;
    unavailable: Array<"rule_engine">;
    reasons: Array<{
      code: "RANK_MISMATCH" | "BASE_MISMATCH" | "PREASSIGNMENT_OVERLAP" | "FACTS_MISSING" | "RULE_ENGINE_CONFLICT";
      message: string;
      ruleId?: string;
      ruleName?: string;
      conflict?: {
        assignment: string;
        label: string;
        startUtc: string;
        endUtc: string;
      };
    }>;
  };
  matchedBids: Array<{
    propertyGroupKey: string;
    propertyName: string;
    tier: string;
    action: "award" | "avoid";
  }>;
};

export type PbsBidFeedbackPairingEligibility = NonNullable<PbsBidFeedbackPairing["eligibility"]>;

export type PbsBidFeedbackEligibilityResponse = {
  draftVersion: string;
  generatedAt: string;
  eligibilityLabel: string;
  pairings: Array<{
    pairingId: string;
    eligibility: PbsBidFeedbackPairingEligibility;
  }>;
};

/** Asynchronous start: /eligibility returns this immediately; results stream via WS + the run endpoint. */
export type PbsBidFeedbackEligibilityStartResponse = {
  runId: string;
  status: "computing";
  draftVersion: string;
  eligibilityLabel: string;
};

/** Accumulated run snapshot from GET /eligibility/run/:runId. */
export type PbsBidFeedbackEligibilityRunResponse = {
  runId: string;
  status: "computing" | "done";
  eligibilityLabel: string;
  pairings: Array<{
    pairingId: string;
    eligibility: PbsBidFeedbackPairingEligibility;
  }>;
};

export type PbsBidFeedbackDayOff = {
  date: string;
  propertyGroupKey: string;
  propertyName: string;
  tier: string;
  source: "prefer_off";
  fromOption: boolean;
  description: string;
};

export type PbsBidFeedbackConflictSummaryResponse = {
  draftVersion: string;
  generatedAt: string;
  conflictCount: number;
  advisoryCount: number;
  conflicts: PbsBidFeedbackConflict[];
};

export type PbsBidFeedbackResponse = PbsBidFeedbackConflictSummaryResponse & {
  crewId: string;
  currentPeriod: PbsCurrentPeriod;
  timezoneLabel: string;
  eligibilityLabel: string;
  pairings: PbsBidFeedbackPairing[];
  daysOff: PbsBidFeedbackDayOff[];
};
