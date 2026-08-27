import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type {
  PbsBidFeedbackConflict,
  PbsBidFeedbackDayOff,
  PbsBidFeedbackDirection,
  PbsBidFeedbackEligibilityResponse,
  PbsBidFeedbackEligibilityRunResponse,
  PbsBidFeedbackEligibilityStartResponse,
  PbsBidFeedbackPairing,
  PbsBidFeedbackResponse,
} from "../../../../packages/contracts/pbs-bid-feedback.js";
import { pbsBidFeedbackEligibilityPairingLimit } from "../../../../packages/contracts/pbs-bid-feedback.js";
import {
  pbsStandingBidContexts,
  pbsStandingPeriodCode,
} from "../../../../packages/contracts/pbs-standing-bids.js";
import type { PbsDaysOffDraftProperty } from "../../../../packages/contracts/pbs-days-off-bids.js";
import {
  expandPreferOffBidValues,
  type PbsPreferOffConfig,
} from "../../../../packages/contracts/pbs-prefer-off.js";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsReserveDraftProperty } from "../../../../packages/contracts/pbs-reserve-bids.js";
import { getPbsTierWeight, pbsTierPolicy } from "../../../../packages/contracts/pbs-tier-policy.js";
import type { PbsDaysOffBidService } from "../days-off/types.js";
import type { PbsLineBidService } from "../line/types.js";
import type { PbsLineDraftProperty } from "../../../../packages/contracts/pbs-line-bids.js";
import { env } from "../../config/index.js";
import {
  CURRENT_BID_CONTEXT,
  LineholderBidServiceError,
  resolveCurrentPeriod,
  type LineholderDraftActor,
  type LineholderPeriodContext,
} from "../lineholder/shared.js";
import type { PbsPairingBidService } from "../pairing/types.js";
import type { PbsStandingBidService } from "../standing-bid/types.js";
import type { PbsReserveBidService } from "../reserve/types.js";
import type { PbsBidFeedbackService } from "./types.js";
import type { PbsCache } from "../../utils/cache.js";
import {
  deserializeLineholderPeriodContext,
  serializeLineholderPeriodContext,
} from "../lineholder/cache-serialization.js";
import { createPbsBusinessClock } from "../business-time/business-clock.js";
import { loadBidFeedbackInputs, type BidFeedbackInputDrafts } from "./bid-feedback-input-loader.js";
import { resolvePbsRuleset } from "./ruleset-resolver.js";
import { eligibilityRunManager } from "./eligibility-run-manager.js";
import {
  computePairingEligibility,
  type ComputePairingEligibilityArgs,
  type PairingEligibility,
} from "./rule-eligibility.js";
import {
  EMPTY_BID_FEEDBACK_MATCHER_CONTEXT,
  loadBidFeedbackPairingMatcherContext,
  matchBidFeedbackPairings,
  type BidFeedbackMatcherActorContext,
  type BidFeedbackMatcherProperty,
  type BidFeedbackPairingMatcher,
  type BidFeedbackPairingMatcherContext,
} from "./bid-feedback-pairing-matcher.js";

type CreatePbsBidFeedbackServiceOptions = {
  pairingBidService: PbsPairingBidService;
  daysOffBidService: PbsDaysOffBidService;
  lineBidService: PbsLineBidService;
  standingBidService: PbsStandingBidService;
  reserveBidService: PbsReserveBidService;
  pairingMatcher?: BidFeedbackPairingMatcher;
  liveSchema?: string;
  cache?: PbsCache;
  db?: Pick<ReturnType<typeof drizzle>, "execute">;
  pgPool?: Pool;
  pairingEligibilityRunner?: ComputePairingEligibilityArgs["runner"];
};

type EffectivePairingProperty = PbsPairingDraftProperty & { source: "current" | "standing" };
type EffectiveDaysOffProperty = PbsDaysOffDraftProperty & { source: "current" | "standing" };
type EffectiveLineProperty = PbsLineDraftProperty & { source: "current" | "standing" };
type EffectiveReserveProperty = PbsReserveDraftProperty & { source: "current" | "standing" };
type FullBidFeedbackInputSet = [
  Awaited<ReturnType<PbsPairingBidService["getCurrentDraft"]>>,
  Awaited<ReturnType<PbsDaysOffBidService["getCurrentDraft"]>>,
  Awaited<ReturnType<PbsLineBidService["getCurrentDraft"]>>,
  Awaited<ReturnType<PbsReserveBidService["getCurrentDraft"]>>,
  Awaited<ReturnType<PbsStandingBidService["getCurrentStandingBid"]>>,
];
type BidFeedbackInputSet = FullBidFeedbackInputSet | BidFeedbackInputDrafts;
type BidFeedbackResolvedPeriod = PbsBidFeedbackResponse["currentPeriod"] & {
  rosterPeriodId: number;
  periodCode: string;
  rpStartLocal?: string | null;
  rpEndLocal?: string | null;
  rosterPeriodKey?: string | null;
};
type ResolvedBidFeedbackState = {
  currentPeriod: BidFeedbackResolvedPeriod;
  rosterPeriodId: number;
  effectivePairings: EffectivePairingProperty[];
  effectiveDaysOff: EffectiveDaysOffProperty[];
  effectiveLines: EffectiveLineProperty[];
  effectiveReserves: EffectiveReserveProperty[];
  preferOffConfig?: PbsPreferOffConfig;
  actorContext: BidFeedbackMatcherActorContext;
  draftVersion: string;
};

const FEEDBACK_CACHE_TTL_SECONDS = 5 * 60;
const CURRENT_PERIOD_CACHE_TTL_SECONDS = 60;
const FEEDBACK_CACHE_VERSION = `v10:${pbsTierPolicy.version}`;
const FEEDBACK_STAMPEDE_PROTECTION = { stampedeProtection: { enabled: true as const } };
export const BID_FEEDBACK_ELIGIBILITY_PAIRING_LIMIT = pbsBidFeedbackEligibilityPairingLimit;
const UNKNOWN_PAIRING_ELIGIBILITY: NonNullable<PbsBidFeedbackPairing["eligibility"]> = {
  status: "unknown",
  checked: [],
  unavailable: ["rule_engine"],
  reasons: [],
};

type BidFeedbackDraftVersionRow = {
  bid_context: string;
  draft_version: string | number;
};

const loadBidFeedbackDraftVersion = async (
  pgPool: Pool,
  actor: LineholderDraftActor,
  rosterPeriodId: number,
): Promise<string> => {
  const result = await pgPool.query<BidFeedbackDraftVersionRow>(
    `select bid_context, draft_version
       from pbs_bid
      where crew_id = $1
        and (
          (bid_context = $2 and roster_period_id = $3)
          or (period_code = $4 and bid_context in ($5, $6))
        )
      order by bid_context, id`,
    [
      actor.crewId,
      CURRENT_BID_CONTEXT,
      rosterPeriodId,
      pbsStandingPeriodCode,
      pbsStandingBidContexts.lineholder,
      pbsStandingBidContexts.reserve,
    ],
  );
  const versions = new Map<string, number>();
  for (const row of result.rows) {
    if (versions.has(row.bid_context)) {
      throw new LineholderBidServiceError(
        409,
        "Multiple Bid version sources exist for the current Crew and Period.",
        "BID_FEEDBACK_DRAFT_VERSION_SOURCE_CONFLICT",
      );
    }
    const version = Number(row.draft_version);
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new LineholderBidServiceError(
        422,
        "The current Bid version source is invalid.",
        "BID_FEEDBACK_DRAFT_VERSION_SOURCE_INVALID",
      );
    }
    versions.set(row.bid_context, version);
  }

  const currentVersion = versions.get(CURRENT_BID_CONTEXT) ?? 0;
  return [
    currentVersion,
    currentVersion,
    currentVersion,
    currentVersion,
    versions.get(pbsStandingBidContexts.lineholder) ?? 0,
    versions.get(pbsStandingBidContexts.reserve) ?? 0,
  ].join(":");
};

export const resolveBidFeedbackTierWeight = (tier: string): number => {
  return getPbsTierWeight(tier.trim().toUpperCase()) ?? 0;
};

const directionFromScore = (score: number): PbsBidFeedbackDirection => {
  if (score > 0) return "award";
  if (score < 0) return "avoid";
  return "neutral";
};

const normalizeAction = (action: PbsPairingDraftProperty["action"]): "award" | "avoid" =>
  action === "avoid" ? "avoid" : "award";

const propertyKey = (property: { propertyGroupKey?: string; propertyCode: number; rowSeq: number }) =>
  property.propertyGroupKey ?? `${property.propertyCode}:${property.rowSeq}`;

const actorContextCacheKey = (context: BidFeedbackMatcherActorContext): string =>
  [context.base ?? "", context.rank ?? "", context.zoneId ?? ""].join("|");

const normalizeEligibilityPairingIds = (pairingIds: string[]): string[] => {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const pairingId of pairingIds) {
    const value = pairingId.trim();
    if (!/^\d+$/.test(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length >= BID_FEEDBACK_ELIGIBILITY_PAIRING_LIMIT) break;
  }

  return normalized;
};

const sortFeedbackTiers = (tiers: string[]): string[] =>
  [...new Set(tiers)].sort((left, right) => resolveBidFeedbackTierWeight(right) - resolveBidFeedbackTierWeight(left)
    || left.localeCompare(right));

const formatFeedbackTiers = (tiers: string[]): string =>
  `(${sortFeedbackTiers(tiers).join(", ")})`;

const describeReserveDateScope = (dateScope: Extract<PbsReserveDraftProperty["bid"], { type: "reserve-call-type-date-scope" }>["dateScope"]): string => {
  if (dateScope.mode === "whole_month") {
    return "for whole month";
  }

  if (dateScope.mode === "first_half") {
    return "for the first half";
  }

  if (dateScope.mode === "second_half") {
    return "for the second half";
  }

  if (dateScope.mode === "date_range") {
    return `for ${dateScope.from} to ${dateScope.to}`;
  }

  return `on ${dateScope.dates.join(", ")}`;
};

const describeReservePreference = (property: EffectiveReserveProperty): string => {
  if (property.bid.type !== "reserve-call-type-date-scope") {
    return property.name;
  }

  return `${property.name} ${property.bid.callType} ${describeReserveDateScope(property.bid.dateScope)}`;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const toUtcDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const addUtcDays = (isoDate: string, days: number) => {
  const date = toUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const expandDateRange = (from: string, to: string) => {
  if (!isoDatePattern.test(from) || !isoDatePattern.test(to) || from > to) return [];
  const dates: string[] = [];
  for (let date = from; date <= to; date = addUtcDays(date, 1)) dates.push(date);
  return dates;
};

const PREFER_OFF_PROPERTY_CODE = 201;

const describePreferOffBid = (property: EffectiveDaysOffProperty): string => {
  if (property.bid.type !== "tag-list" || property.bid.values.length === 0) return property.name;
  return property.bid.values.join(", ");
};

const compileBidFeedbackDaysOff = (
  properties: EffectiveDaysOffProperty[],
  activeDates: string[],
  preferOffConfig?: PbsPreferOffConfig,
): PbsBidFeedbackDayOff[] => {
  const activeDateSet = new Set(activeDates);
  const byDate = new Map<string, PbsBidFeedbackDayOff>();

  for (const property of properties) {
    if (property.propertyCode !== PREFER_OFF_PROPERTY_CODE || property.bid.type !== "tag-list") continue;
    const expansion = expandPreferOffBidValues(
      property.bid.values,
      activeDates[0] ?? "",
      activeDates.at(-1) ?? "",
      preferOffConfig,
    );
    if (!expansion.isValid) continue;

    for (const tier of property.tiers) {
      for (const date of expansion.dates) {
        if (!activeDateSet.has(date)) continue;
        const existing = byDate.get(date);
        if (existing && resolveBidFeedbackTierWeight(existing.tier) >= resolveBidFeedbackTierWeight(tier)) continue;
        byDate.set(date, {
          date,
          propertyGroupKey: propertyKey(property),
          propertyName: property.name,
          tier,
          source: "prefer_off",
          fromOption: true,
          description: describePreferOffBid(property),
        });
      }
    }
  }

  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
};

const collectConflicts = (
  pairings: PbsBidFeedbackPairing[],
  daysOff: PbsBidFeedbackDayOff[],
  pairingProperties: EffectivePairingProperty[],
  daysOffProperties: EffectiveDaysOffProperty[],
  lineProperties: EffectiveLineProperty[],
  reserveProperties: EffectiveReserveProperty[],
  activeDates: string[],
): PbsBidFeedbackConflict[] => {
  const conflicts: PbsBidFeedbackConflict[] = [];
  const pairingIdsByBidKey = new Map<string, Set<string>>();
  for (const pairing of pairings) {
    for (const bid of pairing.matchedBids) {
      const ids = pairingIdsByBidKey.get(bid.propertyGroupKey) ?? new Set<string>();
      ids.add(pairing.pairingId);
      pairingIdsByBidKey.set(bid.propertyGroupKey, ids);
    }
  }
  const awardProperties = pairingProperties.filter((property) => normalizeAction(property.action) === "award");
  const avoidProperties = pairingProperties.filter((property) => normalizeAction(property.action) === "avoid");
  for (const award of awardProperties) {
    for (const avoid of avoidProperties) {
      const awardKey = propertyKey(award);
      const avoidKey = propertyKey(avoid);
      const awardIds = pairingIdsByBidKey.get(awardKey) ?? new Set<string>();
      const avoidIds = pairingIdsByBidKey.get(avoidKey) ?? new Set<string>();
      const overlapCount = [...awardIds].filter((id) => avoidIds.has(id)).length;
      if (overlapCount === 0) continue;
      conflicts.push({
        code: "A1",
        stableKey: `A1:${award.source}:${awardKey}:${avoid.source}:${avoidKey}`,
        severity: "conflict",
        title: "Contradicting Pairing bids",
        message: `${award.name} and ${avoid.name} overlap on ${overlapCount} pairing${overlapCount === 1 ? "" : "s"}.`,
        bidKeys: [awardKey, avoidKey],
        count: overlapCount,
      });
    }
  }

  const awardCoverage = new Map<string, number>();
  for (const pairing of pairings.filter((item) => item.rawDirection === "award")) {
    for (const date of expandDateRange(pairing.originDate, pairing.endDate)) {
      awardCoverage.set(date, (awardCoverage.get(date) ?? 0) + 1);
    }
  }
  const offDates = [...new Set(daysOff.map((item) => item.date))].sort();
  const coveredOffDates = offDates.filter((date) => awardCoverage.has(date));
  if (coveredOffDates.length > 0) {
    conflicts.push({
      code: "B1",
      stableKey: `B1:${coveredOffDates.join(",")}`,
      severity: "conflict",
      title: "Days Off overlap Award Pairings",
      message: `${coveredOffDates.length} requested day${coveredOffDates.length === 1 ? " is" : "s are"} covered by Award Pairings.`,
      count: coveredOffDates.length,
      dates: coveredOffDates.map((date) => ({ date, count: awardCoverage.get(date) })),
    });
  }

  const longStretchProperties = daysOffProperties.filter((property) => property.propertyCode === 204);
  for (const property of longStretchProperties) {
    const bid = property.bid as unknown as Record<string, unknown>;
    const minimumDays = typeof bid.value === "number" ? bid.value : 0;
    const range = typeof bid.from === "string" && typeof bid.to === "string"
      ? expandDateRange(bid.from, bid.to)
      : activeDates;
    const hasWindow = minimumDays > 0 && range.some((_, index) =>
      index + minimumDays <= range.length
      && range.slice(index, index + minimumDays).every((date) => !awardCoverage.has(date)));
    if (minimumDays > 0 && !hasWindow) {
      conflicts.push({
        code: "B3",
        stableKey: `B3:${property.source}:${propertyKey(property)}`,
        severity: "conflict",
        title: "Long Stretch cannot fit",
        message: `Award Pairings cover every available ${minimumDays}-day window for ${property.name}.`,
        bidKeys: [propertyKey(property)],
        count: minimumDays,
      });
    }
  }

  const creditDirections = new Set(lineProperties.flatMap((property) =>
    property.propertyCode === 429 && property.bid.type === "credit-window-preference"
      ? [property.bid.direction]
      : []));
  if (creditDirections.has("more") && creditDirections.has("less")) {
    conflicts.push({
      code: "A4",
      stableKey: "A4:credit-window-more-less",
      severity: "conflict",
      title: "Conflicting Credit Window bids",
      message: "Credit Window asks for both more and less credit.",
    });
  }

  const reserveAvoidLineProperties = lineProperties.filter((property) =>
    property.propertyCode === 427 && normalizeAction(property.action) === "avoid");
  const reservePreferenceProperties = reserveProperties.filter((property) => property.propertyCode === 301);
  for (const lineProperty of reserveAvoidLineProperties) {
    const lineKey = propertyKey(lineProperty);
    for (const reserveProperty of reservePreferenceProperties) {
      const reserveKey = propertyKey(reserveProperty);
      conflicts.push({
        code: "A2",
        stableKey: `A2:${lineProperty.source}:${lineKey}:${reserveProperty.source}:${reserveKey}`,
        severity: "conflict",
        title: "Reserve bid conflict",
        message: `Avoid · no reserve ${formatFeedbackTiers(lineProperty.tiers)} contradicts ${describeReservePreference(reserveProperty)} ${formatFeedbackTiers(reserveProperty.tiers)}.`,
        bidKeys: [lineKey, reserveKey],
      });
    }
  }

  const commuter = lineProperties.find((property) => property.propertyCode === 408 && property.bid.type === "days-off-on-pattern");
  if (commuter && commuter.bid.type === "days-off-on-pattern" && offDates.length > 0) {
    const commuterBid = commuter.bid;
    const runs: string[][] = [];
    for (const date of offDates) {
      const current = runs.at(-1);
      if (current && addUtcDays(current.at(-1)!, 1) === date) current.push(date);
      else runs.push([date]);
    }
    const invalidOffRun = runs.find((run) => run.length < commuterBid.minDaysOff);
    const invalidOnGap = runs.slice(1).find((run, index) => {
      const prior = runs[index]!;
      const gap = Math.round((toUtcDate(run[0]!).getTime() - toUtcDate(prior.at(-1)!).getTime()) / 86_400_000) - 1;
      return gap < commuterBid.minDaysOn || gap > commuterBid.maxDaysOn;
    });
    if (invalidOffRun || invalidOnGap) {
      conflicts.push({
        code: "D1",
        stableKey: `D1:${propertyKey(commuter)}`,
        severity: "advisory",
        title: "Commuter Pattern needs review",
        message: "The requested Days Off do not fit the configured on/off pattern.",
        bidKeys: [propertyKey(commuter)],
      });
    }
  }

  if (creditDirections.has("more") && activeDates.length > 0 && offDates.length * 3 >= activeDates.length) {
    conflicts.push({
      code: "D2",
      stableKey: `D2:${offDates.length}:${activeDates.length}`,
      severity: "advisory",
      title: "More Credit with many Days Off",
      message: `More Credit is requested while ${offDates.length} of ${activeDates.length} period days are bid off.`,
      count: offDates.length,
    });
  }

  return conflicts;
};

export const createPbsBidFeedbackService = ({
  pairingBidService,
  daysOffBidService,
  lineBidService,
  standingBidService,
  reserveBidService,
  pairingMatcher,
  liveSchema,
  cache,
  db,
  pgPool,
  pairingEligibilityRunner,
}: CreatePbsBidFeedbackServiceOptions): PbsBidFeedbackService => {
  const businessClock = db ? createPbsBusinessClock({ db }) : null;
  const feedbackLiveSchema = liveSchema ?? env.LIVE_SCHEMA;
  const matchPairings: BidFeedbackPairingMatcher = pairingMatcher ?? (async ({ period, actorContext, properties, context, pairingIds }) => {
    if (!pgPool) {
      throw new Error("Bid Feedback pairing matcher requires PostgreSQL pool.");
    }
    return matchBidFeedbackPairings({
      pgPool,
      liveSchema: feedbackLiveSchema,
      period,
      actorContext,
      properties,
      context,
      pairingIds,
    });
  });
  const loadMatcherContext = async (
    properties: BidFeedbackMatcherProperty[],
  ): Promise<BidFeedbackPairingMatcherContext> => {
    if (!pgPool) return EMPTY_BID_FEEDBACK_MATCHER_CONTEXT;
    return loadBidFeedbackPairingMatcherContext({
      pgPool,
      liveSchema: feedbackLiveSchema,
      properties,
    });
  };
  const fallbackLoadInputs = (actor: LineholderDraftActor) => Promise.all([
      pairingBidService.getCurrentDraft(actor),
      daysOffBidService.getCurrentDraft(actor),
      lineBidService.getCurrentDraft(actor),
      reserveBidService.getCurrentDraft(actor),
      standingBidService.getCurrentStandingBid(actor),
  ]);
  const isLightweightInputs = (inputs: BidFeedbackInputSet): inputs is BidFeedbackInputDrafts =>
    !Array.isArray(inputs);
  const loadInputs = async (
    actor: LineholderDraftActor,
    currentPeriod?: LineholderPeriodContext,
  ): Promise<BidFeedbackInputSet> => {
    if (pgPool && currentPeriod) {
      return loadBidFeedbackInputs({
        actor,
        currentPeriod: {
          id: currentPeriod.rosterPeriodId,
          rosterPeriodId: currentPeriod.rosterPeriodId,
          rosterPeriodKey: currentPeriod.rosterPeriodKey,
          periodCode: currentPeriod.periodCode,
          filiale: currentPeriod.filiale,
          status: currentPeriod.status,
          computedStage: currentPeriod.computedStage,
          bidOpenAt: currentPeriod.bidOpenAt?.toISOString() ?? null,
          bidCloseAt: currentPeriod.bidCloseAt?.toISOString() ?? null,
          base: currentPeriod.base ?? null,
          zoneId: currentPeriod.zoneId ?? null,
          timezoneLabel: currentPeriod.timezoneLabel ?? null,
          rpStartLocal: currentPeriod.rpStartLocal,
          rpEndLocal: currentPeriod.rpEndLocal,
          canEditBid: currentPeriod.canEditBid,
          readOnlyReason: currentPeriod.readOnlyReason,
        },
        pgPool,
      });
    }
    return fallbackLoadInputs(actor);
  };
  const resolveDraftVersion = (inputs: BidFeedbackInputSet): string => [
    isLightweightInputs(inputs) ? inputs.pairingDraft.draftVersion : inputs[0].draft.draftVersion,
    isLightweightInputs(inputs) ? inputs.daysOffDraft.draftVersion : inputs[1].draft.draftVersion,
    isLightweightInputs(inputs) ? inputs.lineDraft.draftVersion : inputs[2].draft.draftVersion,
    isLightweightInputs(inputs) ? inputs.reserveDraft.draftVersion : inputs[3].draft.draftVersion,
    isLightweightInputs(inputs) ? inputs.standingLineholderDraft.draftVersion : inputs[4].lineholderDraft.draftVersion,
    isLightweightInputs(inputs) ? inputs.standingReserveDraft.draftVersion : inputs[4].reserveDraft.draftVersion,
  ].join(":");
  const loadCurrentPeriod = async (actor: LineholderDraftActor): Promise<LineholderPeriodContext> => {
    if (!db || !businessClock) {
      throw new Error("Bid Feedback current Period resolver is unavailable");
    }
    const load = async () => resolveCurrentPeriod(db, actor, await businessClock.getBusinessNow());
    if (!cache) return load();
    return cache.getOrSet(
      cache.key("period", "current", "v3", actor.crewId),
      CURRENT_PERIOD_CACHE_TTL_SECONDS,
      load,
      {
        serialize: serializeLineholderPeriodContext,
        deserialize: deserializeLineholderPeriodContext,
      },
    );
  };
  const buildMatcherProperties = (
    pairingProperties: EffectivePairingProperty[],
  ): BidFeedbackMatcherProperty[] => pairingProperties.map((property) => ({
    key: `${property.source}:${propertyKey(property)}`,
    property,
  }));
  const computeAwardPairingEligibility = async (
    actor: LineholderDraftActor,
    awardPairings: PbsBidFeedbackPairing[],
    options?: {
      onPairingComplete?: (pairingId: string, eligibility: PairingEligibility) => void;
      concurrency?: number;
    },
  ): Promise<{
    eligibilityLabel: string;
    eligibilityByPairingId: Map<string, NonNullable<PbsBidFeedbackPairing["eligibility"]>>;
  }> => {
    const eligibilityByPairingId = new Map<string, NonNullable<PbsBidFeedbackPairing["eligibility"]>>();
    if (!pgPool || awardPairings.length === 0) {
      return {
        eligibilityLabel: "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.",
        eligibilityByPairingId,
      };
    }

    const divRes = await pgPool.query<{ division: string | null }>(
      `select division from ${env.PBS_SCHEMA}.pbs_user where crew_id = $1 order by id limit 1`,
      [actor.crewId],
    );
    const actorDivision = divRes.rows[0]?.division || "P";
    const ruleset = await resolvePbsRuleset(pgPool, feedbackLiveSchema, actorDivision);
    const eligibilityLabel = ruleset
      ? `Eligibility based on PBS ruleset "${ruleset.name}".`
      : "Eligibility unavailable: no enabled PBS ruleset. Please contact your administrator.";
    const computedEligibility = await computePairingEligibility({
      liveSchema: feedbackLiveSchema,
      ruleset,
      crewId: actor.crewId,
      pairings: awardPairings.map((p) => ({
        pairingId: p.pairingId,
        originDate: p.originDate,
        endDate: p.endDate,
      })),
      runner: pairingEligibilityRunner,
      onPairingComplete: options?.onPairingComplete,
      concurrency: options?.concurrency,
    });

    for (const [pairingId, eligibility] of computedEligibility.entries()) {
      eligibilityByPairingId.set(pairingId, eligibility);
    }

    return { eligibilityLabel, eligibilityByPairingId };
  };

  const resolveFeedbackState = (inputs: BidFeedbackInputSet): ResolvedBidFeedbackState => {
    const pairingDraft = isLightweightInputs(inputs)
      ? { currentPeriod: inputs.currentPeriod, draft: inputs.pairingDraft }
      : inputs[0];
    const daysOffDraft = isLightweightInputs(inputs)
      ? { currentPeriod: inputs.currentPeriod, draft: inputs.daysOffDraft }
      : inputs[1];
    const lineDraft = isLightweightInputs(inputs)
      ? { currentPeriod: inputs.currentPeriod, draft: inputs.lineDraft }
      : inputs[2];
    const reserveDraft = isLightweightInputs(inputs)
      ? { currentPeriod: inputs.currentPeriod, draft: inputs.reserveDraft }
      : inputs[3];
    const standingDraft = isLightweightInputs(inputs)
      ? {
        currentPeriod: inputs.currentPeriod,
        preferOffConfig: inputs.preferOffConfig,
        lineholderDraft: inputs.standingLineholderDraft,
        reserveDraft: inputs.standingReserveDraft,
      }
      : inputs[4];
    const currentPeriod = (pairingDraft.currentPeriod
      ?? daysOffDraft.currentPeriod
      ?? lineDraft.currentPeriod
      ?? reserveDraft.currentPeriod
      ?? standingDraft.currentPeriod) as BidFeedbackResolvedPeriod | undefined;
    const rosterPeriodId = currentPeriod?.rosterPeriodId;

    if (!currentPeriod || !rosterPeriodId) {
      throw new LineholderBidServiceError(409, "The current Bid Period is not configured.");
    }

    const standingPairings = standingDraft.lineholderDraft.properties
      .filter((property) => property.bidType === "Pairing")
      .map((property) => ({ ...property, source: "standing" as const })) as EffectivePairingProperty[];
    const hasCurrentBid = pairingDraft.draft.properties.length > 0
      || daysOffDraft.draft.properties.length > 0
      || lineDraft.draft.properties.length > 0
      || reserveDraft.draft.properties.length > 0;
    const currentPairings = pairingDraft.draft.properties.map((property) => ({ ...property, source: "current" as const }));
    const effectivePairings: EffectivePairingProperty[] = hasCurrentBid ? currentPairings : standingPairings;
    const standingDaysOff = standingDraft.lineholderDraft.properties
      .filter((property) => property.bidType === "DaysOff")
      .map((property) => ({ ...property, source: "standing" as const })) as EffectiveDaysOffProperty[];
    const currentDaysOff = daysOffDraft.draft.properties.map((property) => ({ ...property, source: "current" as const }));
    const effectiveDaysOff: EffectiveDaysOffProperty[] = hasCurrentBid ? currentDaysOff : standingDaysOff;
    const standingLines = standingDraft.lineholderDraft.properties
      .filter((property) => property.bidType === "Line")
      .map((property) => ({
        rowSeq: property.rowSeq,
        propertyGroupKey: property.propertyGroupKey,
        propertyCode: property.propertyCode,
        name: property.name,
        action: property.action,
        bid: property.bid,
        tiers: property.tiers,
        source: "standing" as const,
      })) as EffectiveLineProperty[];
    const currentLines = lineDraft.draft.properties.map((property) => ({ ...property, source: "current" as const }));
    const effectiveLines: EffectiveLineProperty[] = hasCurrentBid
      ? currentLines
      : standingLines;
    const currentReserves = reserveDraft.draft.properties.map((property) => ({ ...property, source: "current" as const }));
    const standingReserves = standingDraft.reserveDraft.properties
      .map((property) => ({
        rowSeq: property.rowSeq,
        propertyGroupKey: property.propertyGroupKey,
        propertyCode: property.propertyCode,
        name: property.name,
        action: property.action,
        bid: property.bid as PbsReserveDraftProperty["bid"],
        tiers: property.tiers,
        source: "standing" as const,
      }));
    const effectiveReserves: EffectiveReserveProperty[] = hasCurrentBid ? currentReserves : standingReserves;

    return {
      currentPeriod,
      rosterPeriodId,
      effectivePairings,
      effectiveDaysOff,
      effectiveLines,
      effectiveReserves,
      preferOffConfig: isLightweightInputs(inputs)
        ? inputs.preferOffConfig
        : (inputs[1].preferOffConfig ?? inputs[4].preferOffConfig),
      actorContext: isLightweightInputs(inputs)
        ? inputs.actorContext
        : {
          base: currentPeriod.base ?? null,
          rank: null,
          zoneId: currentPeriod.zoneId ?? null,
        },
      draftVersion: resolveDraftVersion(inputs),
    };
  };

  const buildFeedback = async (
    actor: LineholderDraftActor,
    state: ResolvedBidFeedbackState,
    matcherContext: BidFeedbackPairingMatcherContext,
    includeEligibility = false,
    pairingIds?: string[],
  ): Promise<PbsBidFeedbackResponse> => {
    const {
      currentPeriod,
      rosterPeriodId,
      effectivePairings,
      effectiveDaysOff,
      effectiveLines,
      effectiveReserves,
      preferOffConfig,
      actorContext,
      draftVersion,
    } = state;
    const pairingsById = new Map<string, PbsBidFeedbackPairing>();
    const matcherProperties = buildMatcherProperties(effectivePairings);
    const propertiesByFeedbackKey = new Map(matcherProperties.map(({ key, property }) => [key, property]));
    const matches = await matchPairings({
      period: {
        rosterPeriodId,
        rosterPeriodKey: currentPeriod.rosterPeriodKey,
        periodCode: currentPeriod.periodCode,
        rpStartLocal: currentPeriod.rpStartLocal,
        rpEndLocal: currentPeriod.rpEndLocal,
      },
      actorContext,
      properties: matcherProperties,
      context: matcherContext,
      pairingIds,
    });

    for (const match of matches) {
      const pairing = match.pairing;
      const existing = pairingsById.get(pairing.pairingId) ?? {
          pairingId: pairing.pairingId,
          pairingNumber: pairing.pairingNumber,
          rank: pairing.rank,
          base: pairing.base,
          zoneId: pairing.zoneId,
          originDate: pairing.originDate,
          endDate: pairing.endDate,
          routeLabel: pairing.routeLabel,
          reportTime: pairing.reportTime,
          releaseTime: pairing.releaseTime,
          totalCredit: pairing.totalCredit,
          durationDays: pairing.durationDays,
          tafbDays: pairing.tafbDays,
          rawScore: 0,
          rawDirection: "neutral" as const,
          eligibility: UNKNOWN_PAIRING_ELIGIBILITY,
          matchedBids: [],
        };
      for (const feedbackKey of match.matchedPropertyKeys) {
        const property = propertiesByFeedbackKey.get(feedbackKey);
        if (!property) continue;
        const action = normalizeAction(property.action);
        for (const tier of property.tiers) {
          const contribution = resolveBidFeedbackTierWeight(tier) * (action === "award" ? 1 : -1);
          existing.rawScore += contribution;
          existing.matchedBids.push({
            propertyGroupKey: propertyKey(property),
            propertyName: property.name,
            tier,
            action,
          });
        }
      }
      pairingsById.set(pairing.pairingId, existing);
    }

    const scoredPairings = Array.from(pairingsById.values())
      .map((pairing) => {
        const rawDirection = directionFromScore(pairing.rawScore);
        return {
          ...pairing,
          rawDirection,
          eligibility: rawDirection === "award" ? UNKNOWN_PAIRING_ELIGIBILITY : null,
        };
      })
      .sort((left, right) => left.originDate.localeCompare(right.originDate)
        || left.reportTime.localeCompare(right.reportTime)
        || left.pairingNumber.localeCompare(right.pairingNumber));
    const visiblePairings = scoredPairings.filter((pairing) => pairing.rawDirection !== "neutral");
    const activeDates = currentPeriod.rpStartLocal && currentPeriod.rpEndLocal
      ? expandDateRange(currentPeriod.rpStartLocal, currentPeriod.rpEndLocal)
      : [];
    const daysOff = compileBidFeedbackDaysOff(effectiveDaysOff, activeDates, preferOffConfig);
    const conflicts = collectConflicts(scoredPairings, daysOff, effectivePairings, effectiveDaysOff, effectiveLines, effectiveReserves, activeDates);

    let eligibilityLabel = "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.";
    const awardPairings = visiblePairings.filter((pairing) => pairing.rawDirection === "award");
    if (includeEligibility && awardPairings.length > 0) {
      const eligibilityResult = await computeAwardPairingEligibility(actor, awardPairings);
      eligibilityLabel = eligibilityResult.eligibilityLabel;
      for (const pairing of visiblePairings) {
        if (pairing.rawDirection === "award") {
          const eligibility = eligibilityResult.eligibilityByPairingId.get(pairing.pairingId);
          if (eligibility) pairing.eligibility = eligibility;
        }
      }
    }

    return {
      crewId: actor.crewId,
      currentPeriod,
      timezoneLabel: currentPeriod.timezoneLabel ?? currentPeriod.zoneId ?? "Crew Base Local Time",
      eligibilityLabel,
      draftVersion,
      generatedAt: new Date().toISOString(),
      conflictCount: conflicts.filter((conflict) => conflict.severity === "conflict").length,
      advisoryCount: conflicts.filter((conflict) => conflict.severity === "advisory").length,
      conflicts,
      pairings: visiblePairings,
      daysOff,
    };
  };

  return {
    async getCurrentConflicts(actor) {
      const inputs = await loadInputs(actor);
      const state = resolveFeedbackState(inputs);
      const matcherContext = await loadMatcherContext(buildMatcherProperties(state.effectivePairings));
      const load = async () => {
        const feedback = await buildFeedback(actor, state, matcherContext);
        const latestInputs = await loadInputs(actor);
        if (resolveDraftVersion(latestInputs) !== state.draftVersion) {
          throw new LineholderBidServiceError(
            409,
            "The Bid changed while Feedback was being calculated. Please try again.",
            "BID_FEEDBACK_DRAFT_CHANGED",
          );
        }
        return {
          draftVersion: state.draftVersion,
          generatedAt: feedback.generatedAt,
          conflictCount: feedback.conflictCount,
          advisoryCount: feedback.advisoryCount,
          conflicts: feedback.conflicts,
        };
      };
      if (!cache) return load();
      const cacheKey = cache.key(
        "bid-feedback",
        "conflicts",
        FEEDBACK_CACHE_VERSION,
        actor.crewId,
        state.rosterPeriodId,
        state.draftVersion,
        actorContextCacheKey(state.actorContext),
        matcherContext.identity,
      );
      return cache.getOrSet(cacheKey, FEEDBACK_CACHE_TTL_SECONDS, load, FEEDBACK_STAMPEDE_PROTECTION);
    },
    async getCurrentFeedback(actor) {
      if (db && pgPool) {
        const currentPeriod = await loadCurrentPeriod(actor);
        const rosterPeriodId = currentPeriod.rosterPeriodId;
        const inputs = await loadInputs(actor, currentPeriod);
        const state = resolveFeedbackState(inputs);
        const matcherContext = await loadMatcherContext(buildMatcherProperties(state.effectivePairings));
        const load = async () => {
          const feedback = await buildFeedback(actor, state, matcherContext);
          const latestVersion = await loadBidFeedbackDraftVersion(pgPool, actor, rosterPeriodId);
          if (latestVersion !== state.draftVersion) {
            throw new LineholderBidServiceError(
              409,
              "The Bid changed while Feedback was being calculated. Please try again.",
              "BID_FEEDBACK_DRAFT_CHANGED",
            );
          }
          return { ...feedback, draftVersion: state.draftVersion };
        };
        if (!cache) return load();
        const cacheKey = cache.key(
          "bid-feedback",
          "current",
          FEEDBACK_CACHE_VERSION,
          actor.crewId,
          rosterPeriodId,
          state.draftVersion,
          actorContextCacheKey(state.actorContext),
          matcherContext.identity,
        );
        return cache.getOrSet(cacheKey, FEEDBACK_CACHE_TTL_SECONDS, load, FEEDBACK_STAMPEDE_PROTECTION);
      }

      const inputs = await loadInputs(actor);
      const state = resolveFeedbackState(inputs);
      const matcherContext = await loadMatcherContext(buildMatcherProperties(state.effectivePairings));
      const load = async () => {
        const feedback = await buildFeedback(actor, state, matcherContext);
        const latestInputs = await loadInputs(actor);
        const latestVersion = resolveDraftVersion(latestInputs);

        if (latestVersion !== state.draftVersion) {
          throw new LineholderBidServiceError(
            409,
            "The Bid changed while Feedback was being calculated. Please try again.",
            "BID_FEEDBACK_DRAFT_CHANGED",
          );
        }

        return { ...feedback, draftVersion: state.draftVersion };
      };

      if (!cache) return load();
      const cacheKey = cache.key(
        "bid-feedback",
        "current",
        FEEDBACK_CACHE_VERSION,
        actor.crewId,
        state.rosterPeriodId,
        state.draftVersion,
        actorContextCacheKey(state.actorContext),
        matcherContext.identity,
      );
      return cache.getOrSet(cacheKey, FEEDBACK_CACHE_TTL_SECONDS, load, FEEDBACK_STAMPEDE_PROTECTION);
    },
    async getCurrentEligibility(actor, input): Promise<PbsBidFeedbackEligibilityResponse> {
      const requestedPairingIds = normalizeEligibilityPairingIds(input.pairingIds);

      if (db && pgPool) {
        const currentPeriod = await loadCurrentPeriod(actor);
        const rosterPeriodId = currentPeriod.rosterPeriodId;
        const inputs = await loadInputs(actor, currentPeriod);
        const state = resolveFeedbackState(inputs);
        const matcherContext = await loadMatcherContext(buildMatcherProperties(state.effectivePairings));
        const load = async () => {
          const feedback = await buildFeedback(actor, state, matcherContext, false, requestedPairingIds);
          const requested = new Set(requestedPairingIds);
          const awardPairings = feedback.pairings.filter((pairing) =>
            pairing.rawDirection === "award" && requested.has(pairing.pairingId));
          const { eligibilityLabel, eligibilityByPairingId } = await computeAwardPairingEligibility(actor, awardPairings);
          const latestVersion = await loadBidFeedbackDraftVersion(pgPool, actor, rosterPeriodId);
          if (latestVersion !== state.draftVersion) {
            throw new LineholderBidServiceError(
              409,
              "The Bid changed while Feedback was being calculated. Please try again.",
              "BID_FEEDBACK_DRAFT_CHANGED",
            );
          }

          return {
            draftVersion: state.draftVersion,
            generatedAt: new Date().toISOString(),
            eligibilityLabel,
            pairings: awardPairings.flatMap((pairing) => {
              const eligibility = eligibilityByPairingId.get(pairing.pairingId);
              return eligibility ? [{ pairingId: pairing.pairingId, eligibility }] : [];
            }),
          };
        };

        if (!cache) return load();
        const cacheKey = cache.key(
          "bid-feedback",
          "eligibility",
          FEEDBACK_CACHE_VERSION,
          actor.crewId,
          rosterPeriodId,
          state.draftVersion,
          actorContextCacheKey(state.actorContext),
          matcherContext.identity,
          requestedPairingIds.join(","),
        );
        return cache.getOrSet(cacheKey, FEEDBACK_CACHE_TTL_SECONDS, load, FEEDBACK_STAMPEDE_PROTECTION);
      }

      const inputs = await loadInputs(actor);
      const state = resolveFeedbackState(inputs);
      const matcherContext = await loadMatcherContext(buildMatcherProperties(state.effectivePairings));
      const load = async () => {
        const feedback = await buildFeedback(actor, state, matcherContext, false, requestedPairingIds);
        const requested = new Set(requestedPairingIds);
        const awardPairings = feedback.pairings.filter((pairing) =>
          pairing.rawDirection === "award" && requested.has(pairing.pairingId));
        const { eligibilityLabel, eligibilityByPairingId } = await computeAwardPairingEligibility(actor, awardPairings);
        const latestInputs = await loadInputs(actor);
        const latestVersion = resolveDraftVersion(latestInputs);

        if (latestVersion !== state.draftVersion) {
          throw new LineholderBidServiceError(
            409,
            "The Bid changed while Feedback was being calculated. Please try again.",
            "BID_FEEDBACK_DRAFT_CHANGED",
          );
        }

        return {
          draftVersion: state.draftVersion,
          generatedAt: new Date().toISOString(),
          eligibilityLabel,
          pairings: awardPairings.flatMap((pairing) => {
            const eligibility = eligibilityByPairingId.get(pairing.pairingId);
            return eligibility ? [{ pairingId: pairing.pairingId, eligibility }] : [];
          }),
        };
      };

      if (!cache) return load();
      const cacheKey = cache.key(
        "bid-feedback",
        "eligibility",
        FEEDBACK_CACHE_VERSION,
        actor.crewId,
        state.rosterPeriodId,
        state.draftVersion,
        actorContextCacheKey(state.actorContext),
        matcherContext.identity,
        requestedPairingIds.join(","),
      );
      return cache.getOrSet(cacheKey, FEEDBACK_CACHE_TTL_SECONDS, load, FEEDBACK_STAMPEDE_PROTECTION);
    },

    async startEligibilityRun(actor, input): Promise<PbsBidFeedbackEligibilityStartResponse> {
      const requestedPairingIds = normalizeEligibilityPairingIds(input.pairingIds);
      const inputs = await loadInputs(actor);
      const state = resolveFeedbackState(inputs);
      const matcherContext = await loadMatcherContext(buildMatcherProperties(state.effectivePairings));
      const feedback = await buildFeedback(actor, state, matcherContext, false, requestedPairingIds);
      const requested = new Set(requestedPairingIds);
      const awardPairings = feedback.pairings.filter((pairing) =>
        pairing.rawDirection === "award" && requested.has(pairing.pairingId));

      let eligibilityLabel = "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.";
      let ruleset = null;
      if (pgPool) {
        const divRes = await pgPool.query<{ division: string | null }>(
          `select division from ${env.PBS_SCHEMA}.pbs_user where crew_id = $1 order by id limit 1`,
          [actor.crewId],
        );
        const actorDivision = divRes.rows[0]?.division || "P";
        ruleset = await resolvePbsRuleset(pgPool, feedbackLiveSchema, actorDivision);
        eligibilityLabel = ruleset
          ? `Eligibility based on PBS ruleset "${ruleset.name}".`
          : "Eligibility unavailable: no enabled PBS ruleset. Please contact your administrator.";
      }

      const run = eligibilityRunManager.createRun(actor.crewId, eligibilityLabel);
      if (pgPool && ruleset && awardPairings.length > 0) {
        // Fire-and-forget background computation; per-pairing results stream over WS.
        eligibilityRunManager.runInBackground(run, async (publish) => {
          await computePairingEligibility({
            liveSchema: feedbackLiveSchema,
            ruleset,
            crewId: actor.crewId,
            pairings: awardPairings.map((p) => ({
              pairingId: p.pairingId,
              originDate: p.originDate,
              endDate: p.endDate,
            })),
            runner: pairingEligibilityRunner,
            onPairingComplete: publish,
            concurrency: 3,
          });
        });
      } else {
        // Nothing to compute (no ruleset / no award pairings) → done immediately.
        eligibilityRunManager.runInBackground(run, async () => {});
      }

      return {
        runId: run.runId,
        status: "computing",
        draftVersion: state.draftVersion,
        eligibilityLabel,
      };
    },

    async getEligibilityRun(runId): Promise<PbsBidFeedbackEligibilityRunResponse> {
      const run = eligibilityRunManager.getRun(runId);
      if (!run) {
        throw new LineholderBidServiceError(
          404,
          "Eligibility run not found or expired. Please retry.",
          "ELIGIBILITY_RUN_NOT_FOUND",
        );
      }
      return {
        runId: run.runId,
        status: run.status,
        eligibilityLabel: run.eligibilityLabel,
        pairings: [...run.results.entries()].map(([pairingId, eligibility]) => ({
          pairingId,
          eligibility,
        })),
      };
    },
  };
};
