import assert from "node:assert/strict";
import test from "node:test";
import type { PbsDaysOffBidService } from "../days-off/types.js";
import type { PbsLineBidService } from "../line/types.js";
import type { PbsPairingBidService } from "../pairing/types.js";
import type { PbsStandingBidService } from "../standing-bid/types.js";
import type { PbsReserveBidService } from "../reserve/types.js";
import type { PbsCache } from "../../utils/cache.js";
import { createPbsBidFeedbackService, resolveBidFeedbackTierWeight } from "./bid-feedback-service.js";
import { loadBidFeedbackInputs } from "./bid-feedback-input-loader.js";
import type { BidFeedbackPairingMatcher } from "./bid-feedback-pairing-matcher.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

test("Bid Feedback tier weights match the seven-tier solver contract", () => {
  assert.deepEqual(
    ["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map(resolveBidFeedbackTierWeight),
    [7, 6, 5, 4, 3, 2, 1],
  );
  assert.equal(resolveBidFeedbackTierWeight("T8"), 0);
});

test("Bid Feedback uses Current as the authoritative source when it contains formal bids", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
    timezoneLabel: "YYZ Local Time",
  };
  const pairingResult = {
    id: "13335",
    pairingId: "13335",
    pairingNumber: "V4126",
    rank: "CA+FO",
    base: "YYZ",
    zoneId: "America/Toronto",
    originDate: "2026-06-08",
    endDate: "2026-06-10",
    routeLabel: "YYZ-MEX-YYZ",
    reportTime: "16:57",
    releaseTime: "23:21",
    durationDays: 3,
    tafbDays: 3,
    priorityLabel: "",
    prioritySequence: "",
    totalBlock: "15:45",
    totalCredit: "15:48",
    totalPay: "15:48",
    legs: [],
    activeDates: ["2026-06-08", "2026-06-09", "2026-06-10"],
  };
  const pairingBidService = {
    async getCurrentDraft() {
      return {
        currentPeriod,
        draft: { draftVersion: 2, periodCode: "Jun 2026", bidContext: "Current", properties: [{
          propertyGroupKey: "current-award",
          rowSeq: 1,
          propertyCode: 131,
          name: "Pairing Length",
          action: "award",
          bid: { type: "stepper", value: 3 },
          tiers: ["T1"],
        }] },
        propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [],
      };
    },
  } as unknown as PbsPairingBidService;
  const daysOffBidService = {
    async getCurrentDraft() {
      return { currentPeriod, draft: { draftVersion: 1, periodCode: "Jun 2026", bidContext: "Current", properties: [] }, propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [] };
    },
  } as unknown as PbsDaysOffBidService;
  const lineBidService = {
    async getCurrentDraft() {
      return { currentPeriod, draft: { draftVersion: 1, periodCode: "Jun 2026", bidContext: "Current", properties: [] }, propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [] };
    },
  } as unknown as PbsLineBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return {
        currentPeriod,
        preferOffConfig: {},
        lineholderDraft: { draftVersion: 3, periodCode: "STANDING", bidContext: "StandingLineholder", properties: [{
          propertyGroupKey: "standing-avoid",
          rowSeq: 1,
          bidType: "Pairing",
          propertyCode: 131,
          name: "Pairing Length",
          action: "avoid",
          bid: { type: "stepper", value: 3 },
          tiers: ["T2"],
        }] },
        reserveDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingReserve", properties: [] },
        propertyCatalog: { lineholder: [], reserve: [] },
      };
    },
  } as unknown as PbsStandingBidService;
  const reserveBidService = {
    async getCurrentDraft() {
      return { currentPeriod, draft: { draftVersion: 0, periodCode: "Jun 2026", bidContext: "Current", mode: "legacy", properties: [] }, propertyCatalog: [] };
    },
  } as unknown as PbsReserveBidService;
  let batchCalls = 0;
  const pairingMatcher: BidFeedbackPairingMatcher = async () => {
    batchCalls += 1;
    return [{
      pairing: pairingResult,
      matchedPropertyKeys: ["current:current-award"],
    }];
  };

  const service = createPbsBidFeedbackService({
    pairingBidService,
    daysOffBidService,
    lineBidService,
    reserveBidService,
    standingBidService,
    pairingMatcher,
  });
  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });

  assert.equal(batchCalls, 1);
  assert.equal("eligibleScore" in feedback.pairings[0]!, false);
  assert.equal("exportDirection" in feedback.pairings[0]!, false);
  assert.equal(feedback.pairings[0]?.rawScore, 7);
  assert.equal(feedback.pairings[0]?.rawDirection, "award");
  assert.deepEqual(feedback.pairings[0]?.eligibility, {
    status: "unknown",
    checked: [],
    unavailable: ["rule_engine"],
    reasons: [],
  });
  assert.equal(feedback.eligibilityLabel, "Eligibility unavailable. Rule Engine eligibility checks have not been run for Bid Feedback.");
  assert.equal(feedback.conflictCount, 0);
  assert.equal(feedback.draftVersion, "2:1:1:0:3:0");
});

test("Bid Feedback returns Award matches even when phase-one eligibility inputs would be incompatible", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
    timezoneLabel: "YYZ Local Time",
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
  };
  const pairingBidService = {
    async getCurrentDraft() {
      return {
        currentPeriod,
        draft: { draftVersion: 1, periodCode: "Jun 2026", bidContext: "Current", properties: [{
          propertyGroupKey: "award",
          rowSeq: 1,
          propertyCode: 131,
          name: "Pairing Length",
          action: "award",
          bid: { type: "stepper", value: 1 },
          tiers: ["T1"],
        }] },
        propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [],
      };
    },
  } as unknown as PbsPairingBidService;
  const emptyDraft = { currentPeriod, draft: { draftVersion: 0, periodCode: "Jun 2026", bidContext: "Current", properties: [] }, propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [] };
  const daysOffBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsDaysOffBidService;
  const lineBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsLineBidService;
  const reserveBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsReserveBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return { currentPeriod, preferOffConfig: {}, lineholderDraft: { draftVersion: 0, properties: [] }, reserveDraft: { draftVersion: 0, properties: [] }, propertyCatalog: { lineholder: [], reserve: [] } };
    },
  } as unknown as PbsStandingBidService;
  const pairingMatcher: BidFeedbackPairingMatcher = async () => [{
    pairing: {
      pairingId: "10722", pairingNumber: "T4101", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto",
      originDate: "2026-06-01", endDate: "2026-06-01", routeLabel: "YYZ-YWG-YYZ",
      reportTime: "06:00", releaseTime: "13:05", durationDays: 1, tafbDays: 1, totalCredit: "5:10",
    },
    matchedPropertyKeys: ["current:award"],
  }];

  const service = createPbsBidFeedbackService({ pairingBidService, daysOffBidService, lineBidService, reserveBidService, standingBidService, pairingMatcher });
  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });

  assert.equal(feedback.pairings[0]?.rawDirection, "award");
  assert.equal("exportDirection" in feedback.pairings[0]!, false);
  assert.deepEqual(feedback.pairings[0]?.eligibility, {
    status: "unknown",
    checked: [],
    unavailable: ["rule_engine"],
    reasons: [],
  });
});

test("Bid Feedback keeps neutralized Pairing rows hidden while still reporting Award/Avoid overlap conflicts", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
    timezoneLabel: "YYZ Local Time",
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
  };
  const pairingBidService = {
    async getCurrentDraft() {
      return {
        currentPeriod,
        draft: { draftVersion: 1, periodCode: "Jun 2026", bidContext: "Current", properties: [
          {
            propertyGroupKey: "award-redeye",
            rowSeq: 1,
            propertyCode: 117,
            name: "Redeye",
            action: "award",
            bid: { type: "redeye-preference", dateScope: null },
            tiers: ["T1"],
          },
          {
            propertyGroupKey: "avoid-redeye",
            rowSeq: 2,
            propertyCode: 117,
            name: "Redeye",
            action: "avoid",
            bid: { type: "redeye-preference", dateScope: null },
            tiers: ["T1"],
          },
        ] },
        propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [],
      };
    },
  } as unknown as PbsPairingBidService;
  const emptyDraft = {
    currentPeriod,
    draft: { draftVersion: 0, periodCode: "Jun 2026", bidContext: "Current", properties: [] },
    propertyCatalog: [],
    favoriteProperties: [],
    recommendedPropertyCodes: [],
  };
  const daysOffBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsDaysOffBidService;
  const lineBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsLineBidService;
  const reserveBidService = { async getCurrentDraft() { return { ...emptyDraft, draft: { ...emptyDraft.draft, mode: "legacy" } }; } } as unknown as PbsReserveBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return { currentPeriod, preferOffConfig: {}, lineholderDraft: { draftVersion: 0, properties: [] }, reserveDraft: { draftVersion: 0, properties: [] }, propertyCatalog: { lineholder: [], reserve: [] } };
    },
  } as unknown as PbsStandingBidService;
  const pairingMatcher: BidFeedbackPairingMatcher = async () => [{
    pairing: {
      pairingId: "10722", pairingNumber: "T4101", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto",
      originDate: "2026-06-02", endDate: "2026-06-02", routeLabel: "YYZ-YVR-YYZ",
      reportTime: "22:00", releaseTime: "06:00", durationDays: 2, tafbDays: 2, totalCredit: "8:00",
    },
    matchedPropertyKeys: ["current:award-redeye", "current:avoid-redeye"],
  }];

  const service = createPbsBidFeedbackService({ pairingBidService, daysOffBidService, lineBidService, reserveBidService, standingBidService, pairingMatcher });
  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });

  assert.deepEqual(feedback.pairings, []);
  assert.equal(feedback.conflictCount, 1);
  assert.equal(feedback.conflicts[0]?.code, "A1");
  assert.equal(feedback.conflicts[0]?.count, 1);
});

test("Bid Feedback Days Off tab expands only Prefer Off bids and keeps the strongest tier per date", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
    timezoneLabel: "YYZ Local Time",
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
  };
  const emptyDraft = {
    currentPeriod,
    draft: { draftVersion: 0, periodCode: "Jun 2026", bidContext: "Current", properties: [] },
    propertyCatalog: [],
    favoriteProperties: [],
    recommendedPropertyCodes: [],
  };
  const pairingBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsPairingBidService;
  const daysOffBidService = {
    async getCurrentDraft() {
      return {
        currentPeriod,
        draft: {
          draftVersion: 1,
          periodCode: "Jun 2026",
          bidContext: "Current",
          properties: [
            {
              propertyGroupKey: "prefer-single",
              rowSeq: 1,
              propertyCode: 201,
              name: "Prefer Off",
              action: "award",
              bid: { type: "tag-list", values: ["2026-06-03"] },
              tiers: ["T3"],
            },
            {
              propertyGroupKey: "prefer-range",
              rowSeq: 2,
              propertyCode: 201,
              name: "Prefer Off",
              action: "award",
              bid: { type: "tag-list", values: ["Between 2026-06-03 - 2026-06-04"] },
              tiers: ["T1"],
            },
            {
              propertyGroupKey: "long-stretch",
              rowSeq: 3,
              propertyCode: 204,
              name: "Long Stretch Off / Compressed Flying",
              action: "award",
              bid: { type: "stepper-date-range", value: 10, from: "2026-06-01", to: "2026-06-30", min: 1, max: 14 },
              tiers: ["T1"],
            },
          ],
        },
        propertyCatalog: [],
        favoriteProperties: [],
        recommendedPropertyCodes: [],
      };
    },
  } as unknown as PbsDaysOffBidService;
  const lineBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsLineBidService;
  const reserveBidService = {
    async getCurrentDraft() {
      return { ...emptyDraft, draft: { ...emptyDraft.draft, mode: "legacy" } };
    },
  } as unknown as PbsReserveBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return {
        currentPeriod,
        preferOffConfig: {},
        lineholderDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingLineholder", properties: [] },
        reserveDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingReserve", properties: [] },
        propertyCatalog: { lineholder: [], reserve: [] },
      };
    },
  } as unknown as PbsStandingBidService;
  const pairingMatcher: BidFeedbackPairingMatcher = async () => [];
  const service = createPbsBidFeedbackService({
    pairingBidService,
    daysOffBidService,
    lineBidService,
    reserveBidService,
    standingBidService,
    pairingMatcher,
  });

  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });

  assert.deepEqual(feedback.daysOff, [
    {
      date: "2026-06-03",
      propertyGroupKey: "prefer-range",
      propertyName: "Prefer Off",
      tier: "T1",
      source: "prefer_off",
      fromOption: true,
      description: "Between 2026-06-03 - 2026-06-04",
    },
    {
      date: "2026-06-04",
      propertyGroupKey: "prefer-range",
      propertyName: "Prefer Off",
      tier: "T1",
      source: "prefer_off",
      fromOption: true,
      description: "Between 2026-06-03 - 2026-06-04",
    },
  ]);
});

test("Bid Feedback reports A2 conflict for Avoid Line Reserve against Reserve Preference", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
    timezoneLabel: "YYZ Local Time",
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
  };
  const emptyDraft = {
    currentPeriod,
    draft: { draftVersion: 0, periodCode: "Jun 2026", bidContext: "Current", properties: [] },
    propertyCatalog: [],
    favoriteProperties: [],
    recommendedPropertyCodes: [],
  };
  const pairingBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsPairingBidService;
  const daysOffBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsDaysOffBidService;
  const lineBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsLineBidService;
  const reserveBidService = {
    async getCurrentDraft() {
      return { ...emptyDraft, draft: { ...emptyDraft.draft, mode: "legacy" } };
    },
  } as unknown as PbsReserveBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return {
        currentPeriod,
        preferOffConfig: {},
        lineholderDraft: {
          draftVersion: 3,
          periodCode: "STANDING",
          bidContext: "StandingLineholder",
          properties: [{
            propertyGroupKey: "standing-line-reserve-avoid",
            rowSeq: 1,
            bidType: "Line",
            propertyCode: 427,
            name: "Reserve",
            action: "avoid",
            bid: { type: "flag" },
            tiers: ["T1", "T3"],
          }],
        },
        reserveDraft: {
          draftVersion: 4,
          periodCode: "STANDING",
          bidContext: "StandingReserve",
          properties: [{
            propertyGroupKey: "standing-reserve-pram",
            rowSeq: 1,
            propertyCode: 301,
            name: "Reserve Preference",
            bid: {
              type: "reserve-call-type-date-scope",
              callType: "PRAM",
              options: ["PRAM", "PRPM"],
              dateScope: { mode: "whole_month" },
            },
            tiers: ["T2", "T4"],
          }],
        },
        propertyCatalog: { lineholder: [], reserve: [] },
      };
    },
  } as unknown as PbsStandingBidService;
  const pairingMatcher: BidFeedbackPairingMatcher = async () => [];

  const service = createPbsBidFeedbackService({
    pairingBidService,
    daysOffBidService,
    lineBidService,
    reserveBidService,
    standingBidService,
    pairingMatcher,
  });

  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });
  const conflicts = await service.getCurrentConflicts({ crewId: "1001", userCode: "crew" });

  assert.equal(feedback.conflictCount, 1);
  assert.equal(conflicts.conflictCount, 1);
  assert.deepEqual(feedback.conflicts, [{
    code: "A2",
    stableKey: "A2:standing:standing-line-reserve-avoid:standing:standing-reserve-pram",
    severity: "conflict",
    title: "Reserve bid conflict",
    message: "Avoid · no reserve (T1, T3) contradicts Reserve Preference PRAM for whole month (T2, T4).",
    bidKeys: ["standing-line-reserve-avoid", "standing-reserve-pram"],
  }]);
  assert.deepEqual(conflicts.conflicts, feedback.conflicts);
});

test("Bid Feedback caches by every draft version and keeps conflict eligibility lightweight", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
    timezoneLabel: "YYZ Local Time",
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
  };
  let pairingVersion = 1;
  const pairingBidService = {
    async getCurrentDraft() {
      return {
        currentPeriod,
        draft: { draftVersion: pairingVersion, periodCode: "Jun 2026", bidContext: "Current", properties: [{
          propertyGroupKey: "award",
          rowSeq: 1,
          propertyCode: 112,
          name: "Pairing Length",
          action: "award",
          bid: { type: "pairing-length-preference", minDays: 1, maxDays: 1, dateScope: null },
          tiers: ["T1"],
        }] },
        propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [],
      };
    },
  } as unknown as PbsPairingBidService;
  const emptyDraft = { currentPeriod, draft: { draftVersion: 0, periodCode: "Jun 2026", bidContext: "Current", properties: [] }, propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [] };
  const daysOffBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsDaysOffBidService;
  const lineBidService = { async getCurrentDraft() { return emptyDraft; } } as unknown as PbsLineBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return { currentPeriod, preferOffConfig: {}, lineholderDraft: { draftVersion: 0, properties: [] }, reserveDraft: { draftVersion: 0, properties: [] }, propertyCatalog: { lineholder: [], reserve: [] } };
    },
  } as unknown as PbsStandingBidService;
  const reserveBidService = {
    async getCurrentDraft() {
      return { currentPeriod, draft: { draftVersion: 0, properties: [] } };
    },
  } as unknown as PbsReserveBidService;
  const feedbackRequestHasEligibilityFlag: boolean[] = [];
  const pairingMatcher: BidFeedbackPairingMatcher = async (request) => {
    feedbackRequestHasEligibilityFlag.push(Object.prototype.hasOwnProperty.call(request, "includeEligibility"));
    return [];
  };
  const values = new Map<string, unknown>();
  const inFlight = new Map<string, Promise<unknown>>();
  const cache: PbsCache = {
    key: (...parts) => parts.join(":"),
    async getOrSet(key, _ttl, load) {
      if (values.has(key)) return values.get(key) as never;
      const existing = inFlight.get(key);
      if (existing) return existing as never;
      const pending = load().then((value) => {
        values.set(key, value);
        inFlight.delete(key);
        return value;
      });
      inFlight.set(key, pending);
      return pending;
    },
    async invalidate(...keys) { keys.forEach((key) => values.delete(key)); },
    async invalidatePattern() { values.clear(); },
  };
  const service = createPbsBidFeedbackService({ pairingBidService, daysOffBidService, lineBidService, reserveBidService, standingBidService, pairingMatcher, cache });
  const actor = { crewId: "1001", userCode: "crew" };

  await Promise.all([service.getCurrentFeedback(actor), service.getCurrentFeedback(actor)]);
  await service.getCurrentFeedback(actor);
  pairingVersion = 2;
  await service.getCurrentFeedback(actor);
  await service.getCurrentConflicts(actor);

  assert.deepEqual(feedbackRequestHasEligibilityFlag, [false, false, false]);
});

test("Bid Feedback cache hits use lightweight version keys without reloading full Drafts", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    rosterPeriodKey: "2026-06",
    periodCode: "Jun 2026",
    filiale: "F8",
    status: "OPEN",
    computedStage: "OPEN" as const,
    bidOpenAt: null,
    bidCloseAt: null,
    base: "YYZ",
    zoneId: "America/Toronto",
    timezoneLabel: "YYZ Local Time",
    rpStartLocal: "2026-06-01",
    rpEndLocal: "2026-06-30",
    canEditBid: true,
    readOnlyReason: null,
  };
  const draftLoads = {
    pairing: 0,
    daysOff: 0,
    line: 0,
    reserve: 0,
    standing: 0,
  };
  const emptyCurrentDraft = {
    currentPeriod,
    draft: { draftVersion: 1, periodCode: "Jun 2026", bidContext: "Current", properties: [] },
    propertyCatalog: [],
    favoriteProperties: [],
    recommendedPropertyCodes: [],
  };
  const pairingBidService = {
    async getCurrentDraft() {
      draftLoads.pairing += 1;
      return emptyCurrentDraft;
    },
  } as unknown as PbsPairingBidService;
  const daysOffBidService = {
    async getCurrentDraft() {
      draftLoads.daysOff += 1;
      return emptyCurrentDraft;
    },
  } as unknown as PbsDaysOffBidService;
  const lineBidService = {
    async getCurrentDraft() {
      draftLoads.line += 1;
      return emptyCurrentDraft;
    },
  } as unknown as PbsLineBidService;
  const reserveBidService = {
    async getCurrentDraft() {
      draftLoads.reserve += 1;
      return { ...emptyCurrentDraft, draft: { ...emptyCurrentDraft.draft, mode: "legacy" } };
    },
  } as unknown as PbsReserveBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      draftLoads.standing += 1;
      return {
        currentPeriod,
        preferOffConfig: {},
        lineholderDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingLineholder", properties: [] },
        reserveDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingReserve", properties: [] },
        propertyCatalog: { lineholder: [], reserve: [] },
      };
    },
  } as unknown as PbsStandingBidService;
  let matchCalls = 0;
  const feedbackRequestHasEligibilityFlag: boolean[] = [];
  const pairingMatcher: BidFeedbackPairingMatcher = async (request) => {
    matchCalls += 1;
    feedbackRequestHasEligibilityFlag.push(Object.prototype.hasOwnProperty.call(request, "includeEligibility"));
    return [];
  };
  const values = new Map<string, unknown>([["period:current:v3:1001", currentPeriod]]);
  const cache: PbsCache = {
    key: (...parts) => parts.join(":"),
    async getOrSet(key, _ttl, load) {
      if (values.has(key)) return values.get(key) as never;
      const value = await load();
      values.set(key, value);
      return value;
    },
    async invalidate(...keys) { keys.forEach((key) => values.delete(key)); },
    async invalidatePattern() { values.clear(); },
  };
  let versionReads = 0;
  let inputReads = 0;
  const pgPool = {
    async query(text: string) {
      if (text.includes("from pbs_bid")) {
        versionReads += 1;
        return { rows: [{ bid_context: "Current", draft_version: 1 }] };
      }
      if (text.includes("bid_feedback_input_rows")) {
        inputReads += 1;
        return { rows: [{
          bid_id: 1,
          bid_context: "Current",
          draft_version: 1,
          actor_base: "YYZ",
          actor_rank: "CA",
          actor_zone_id: "America/Toronto",
        }] };
      }
      if (text.includes("bid_feedback_pairing_occurrences")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;
  const service = createPbsBidFeedbackService({
    pairingBidService,
    daysOffBidService,
    lineBidService,
    reserveBidService,
    standingBidService,
    pairingMatcher,
    cache,
    db: { execute: async () => { throw new Error("Period cache should be reused"); } } as never,
    pgPool,
  });
  const actor = { crewId: "1001", userCode: "crew" };

  await service.getCurrentFeedback(actor);
  await service.getCurrentFeedback(actor);

  assert.deepEqual(draftLoads, { pairing: 0, daysOff: 0, line: 0, reserve: 0, standing: 0 });
  assert.equal(matchCalls, 1);
  assert.deepEqual(feedbackRequestHasEligibilityFlag, [false]);
  assert.equal(inputReads, 2);
  assert.equal(versionReads, 1);
});

test("Bid Feedback DB cold path loads only feedback inputs without UI draft catalogs", async () => {
  const currentPeriod = {
    period_id: "6",
    roster_period_key: "2026-06",
    period_code: "Jun 2026",
    filiale: "F8",
    status: "OPEN",
    bid_open_at: "2026-05-01T00:00:00.000Z",
    bid_close_at: "2026-06-30T00:00:00.000Z",
    base: "YYZ",
    zone_id: "America/Toronto",
    rp_start_local: "2026-06-01",
    rp_end_local: "2026-06-30",
  };
  const fullDraftError = new Error("Full UI draft service must not be used by Bid Feedback cold path");
  const pairingBidService = { async getCurrentDraft() { throw fullDraftError; } } as unknown as PbsPairingBidService;
  const daysOffBidService = { async getCurrentDraft() { throw fullDraftError; } } as unknown as PbsDaysOffBidService;
  const lineBidService = { async getCurrentDraft() { throw fullDraftError; } } as unknown as PbsLineBidService;
  const reserveBidService = { async getCurrentDraft() { throw fullDraftError; } } as unknown as PbsReserveBidService;
  const standingBidService = { async getCurrentStandingBid() { throw fullDraftError; } } as unknown as PbsStandingBidService;
  const pairingMatcherRequests: Array<Parameters<BidFeedbackPairingMatcher>[0]> = [];
  const pairingMatcher: BidFeedbackPairingMatcher = async (request) => {
    pairingMatcherRequests.push(request);
    return [{
      pairing: {
        pairingId: "10722", pairingNumber: "T4101", rank: "CA+FO", base: "YYZ", zoneId: "America/Toronto",
        originDate: "2026-06-01", endDate: "2026-06-01", routeLabel: "YYZ-YWG-YYZ",
        reportTime: "06:00", releaseTime: "13:05", durationDays: 1, tafbDays: 1, totalCredit: "5:10",
      },
      matchedPropertyKeys: ["current:award"],
    }];
  };
  const db = {
    async execute() {
      return { rows: [currentPeriod] };
    },
  };
  const sqlTexts: string[] = [];
  const pgPool = {
    async query(text: string) {
      sqlTexts.push(text);
      if (/select\s+bid_context,\s+draft_version/i.test(text)) {
        return { rows: [
          { bid_context: "Current", draft_version: 2 },
          { bid_context: "StandingLineholder", draft_version: 4 },
        ] };
      }
      if (/bid_feedback_input_rows/i.test(text)) {
        return { rows: [
          {
            bid_id: 101,
            bid_context: "Current",
            period_code: "Jun 2026",
            roster_period_id: "6",
            draft_version: 2,
            remarks: "",
            property_group_key: "award",
            group_seq: 1,
            bid_type: "Pairing",
            legacy_property_code: 131,
            property_code: 131,
            property_name: "Pairing Length",
            action_id: 1,
            operator: "=",
            param_a: "1",
            param_b: null,
            param_c: null,
            preference_json: null,
            all_or_nothing: null,
            minimum_n: null,
            limit_n: null,
            tier: 1,
            actor_base: "YYZ",
            actor_rank: "CA",
            actor_zone_id: "America/Toronto",
            occurrence_rows: [],
          },
          {
            bid_id: 201,
            bid_context: "StandingLineholder",
            period_code: "STANDING",
            roster_period_id: null,
            draft_version: 4,
            remarks: "",
            property_group_key: "standing-prefer-off",
            group_seq: 1,
            bid_type: "DaysOff",
            legacy_property_code: 201,
            property_code: 201,
            property_name: "Prefer Off",
            action_id: 1,
            operator: "In",
            param_a: JSON.stringify({ daysOfWeek: ["MON"] }),
            param_b: null,
            param_c: null,
            preference_json: null,
            all_or_nothing: null,
            minimum_n: null,
            limit_n: null,
            tier: 1,
            actor_base: "YYZ",
            actor_rank: "CA",
            actor_zone_id: "America/Toronto",
            occurrence_rows: [],
          },
        ] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;
  const service = createPbsBidFeedbackService({
    pairingBidService,
    daysOffBidService,
    lineBidService,
    reserveBidService,
    standingBidService,
    pairingMatcher,
    db: db as never,
    pgPool,
  });

  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });

  assert.equal(sqlTexts.filter((text) => text.includes("bid_feedback_input_rows")).length, 1);
  assert.equal(feedback.pairings[0]?.rawDirection, "award");
  assert.equal(feedback.draftVersion, "2:2:2:2:4:0");
  assert.deepEqual(
    pairingMatcherRequests[0]?.properties.map((property) => property.key),
    ["current:award"],
  );
  const combinedSql = sqlTexts.join("\n");
  assert.doesNotMatch(combinedSql, /pbs_bid_property_context/i);
  assert.doesNotMatch(combinedSql, /pbs_bid_pairing_configured_favorite/i);
  assert.doesNotMatch(combinedSql, /pbs_bid_days_off_favorite/i);
  assert.doesNotMatch(combinedSql, /pbs_bid_line_favorite/i);
  assert.doesNotMatch(combinedSql, /live_dictionary|from\s+dictionary/i);
});

test("Bid Feedback lightweight loader reads Standing Prefer Off config from dictionary", async () => {
  const queries: string[] = [];
  const pgPool = {
    async query(text: string) {
      queries.push(text);
      if (/bid_feedback_input_rows/i.test(text)) {
        return { rows: [{
          bid_id: 201,
          bid_context: "StandingLineholder",
          period_code: "STANDING",
          roster_period_id: null,
          draft_version: 4,
          remarks: "",
          property_group_key: "standing-prefer-off",
          group_seq: 1,
          bid_type: "DaysOff",
          legacy_property_code: 201,
          property_code: 201,
          property_name: "Prefer Off",
          action_id: 1,
          operator: "In",
          param_a: JSON.stringify({ daysOfWeek: ["MON"] }),
          param_b: null,
          param_c: null,
          preference_json: null,
          all_or_nothing: null,
          minimum_n: null,
          limit_n: null,
          tier: 1,
          actor_base: "YYZ",
          actor_rank: "CA",
          actor_zone_id: "America/Toronto",
        }] };
      }
      if (/from\s+[a-z][a-z0-9_]*\.dictionary/i.test(text)) {
        return { rows: [
          { parentCode: "DOW", code: "MON", name: "Moon Day", codeValue: "1", idx: 1 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_DOW", name: "Weekend start day", codeValue: "MON", idx: 1 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_TIME", name: "Weekend start time", codeValue: "00:00", idx: 2 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_DOW", name: "Weekend end day", codeValue: "MON", idx: 3 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_TIME", name: "Weekend end time", codeValue: "24:00", idx: 4 },
        ] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;

  const inputs = await loadBidFeedbackInputs({
    actor: { crewId: "1001", userCode: "crew" },
    currentPeriod: {
      id: 6,
      rosterPeriodId: 6,
      periodCode: "Jun 2026",
      filiale: "F8",
      status: "OPEN",
      computedStage: "OPEN",
      bidOpenAt: null,
      bidCloseAt: null,
      canEditBid: true,
      readOnlyReason: null,
    },
    pgPool,
  });

  const standingBid = inputs.standingLineholderDraft.properties[0]?.bid;
  assert.equal(queries.filter((query) => /from\s+[a-z][a-z0-9_]*\.dictionary/i.test(query)).length, 1);
  assert.deepEqual(
    standingBid && "values" in standingBid ? standingBid.values : [],
    ["Moon Day"],
  );
});

test("Bid Feedback lightweight loader reads Current Prefer Off config from dictionary", async () => {
  const queries: string[] = [];
  const pgPool = {
    async query(text: string) {
      queries.push(text);
      if (/bid_feedback_input_rows/i.test(text)) {
        return { rows: [{
          bid_id: 201,
          bid_context: "Current",
          period_code: "Jun 2026",
          roster_period_id: "6",
          draft_version: 4,
          remarks: "",
          property_group_key: "current-prefer-off",
          group_seq: 1,
          bid_type: "DaysOff",
          legacy_property_code: 201,
          property_code: 201,
          property_name: "Prefer Off",
          action_id: 1,
          operator: "In",
          param_a: "Moon Day",
          param_b: null,
          param_c: null,
          preference_json: null,
          all_or_nothing: null,
          minimum_n: null,
          limit_n: null,
          tier: 1,
          actor_base: "YYZ",
          actor_rank: "CA",
          actor_zone_id: "America/Toronto",
        }] };
      }
      if (/from\s+[a-z][a-z0-9_]*\.dictionary/i.test(text)) {
        return { rows: [
          { parentCode: "DOW", code: "MON", name: "Moon Day", codeValue: "1", idx: 1 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_DOW", name: "Weekend start day", codeValue: "MON", idx: 1 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_TIME", name: "Weekend start time", codeValue: "00:00", idx: 2 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_DOW", name: "Weekend end day", codeValue: "MON", idx: 3 },
          { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_TIME", name: "Weekend end time", codeValue: "24:00", idx: 4 },
        ] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;

  const inputs = await loadBidFeedbackInputs({
    actor: { crewId: "1001", userCode: "crew" },
    currentPeriod: {
      id: 6,
      rosterPeriodId: 6,
      periodCode: "Jun 2026",
      filiale: "F8",
      status: "OPEN",
      computedStage: "OPEN",
      bidOpenAt: null,
      bidCloseAt: null,
      canEditBid: true,
      readOnlyReason: null,
    },
    pgPool,
  });

  assert.equal(queries.filter((query) => /from\s+[a-z][a-z0-9_]*\.dictionary/i.test(query)).length, 1);
  assert.deepEqual(inputs.preferOffConfig.weekdays.map((weekday) => weekday.name), ["Moon Day"]);
});

test("Bid Feedback lightweight loader resolves actor base and rank by bid period", async () => {
  const queries: string[] = [];
  const pgPool = {
    async query(text: string, params?: unknown[]) {
      queries.push(text);
      assert.equal(params?.[9], "2026-06-01");
      assert.equal(params?.[10], "2026-06-30");
      if (/bid_feedback_input_rows/i.test(text)) return { rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;

  await loadBidFeedbackInputs({
    actor: { crewId: "1001", userCode: "crew" },
    currentPeriod: {
      id: 6,
      rosterPeriodId: 6,
      periodCode: "Jun 2026",
      filiale: "F8",
      status: "OPEN",
      computedStage: "OPEN",
      bidOpenAt: null,
      bidCloseAt: null,
      rpStartLocal: "2026-06-01",
      rpEndLocal: "2026-06-30",
      canEditBid: true,
      readOnlyReason: null,
    },
    pgPool,
  });

  const sql = queries.join("\n");
  assert.match(sql, /\$10::date as rp_start_local/i);
  assert.match(sql, /\$11::date as rp_end_local/i);
  assert.match(sql, /cb\.eff_dt < \(\(actor\.rp_end_local \+ 1\)::timestamp at time zone/i);
  assert.match(sql, /cr\.eff_dt < \(\(actor\.rp_end_local \+ 1\)::timestamp at time zone 'UTC'\)/i);
});

test("Bid Feedback lightweight loader rejects unsupported Standing saved properties", async () => {
  const pgPool = {
    async query(text: string) {
      if (/bid_feedback_input_rows/i.test(text)) {
        return { rows: [{
          bid_id: 202,
          bid_context: "StandingLineholder",
          period_code: "STANDING",
          roster_period_id: null,
          draft_version: 1,
          remarks: "",
          property_group_key: "unsupported-standing",
          group_seq: 1,
          bid_type: "DaysOff",
          legacy_property_code: 999,
          property_code: 999,
          property_name: "Removed Standing Property",
          action_id: 1,
          operator: "=",
          param_a: "1",
          param_b: null,
          param_c: null,
          preference_json: null,
          all_or_nothing: null,
          minimum_n: null,
          limit_n: null,
          tier: 1,
          actor_base: "YYZ",
          actor_rank: "CA",
          actor_zone_id: "America/Toronto",
        }] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;

  await assert.rejects(
    () => loadBidFeedbackInputs({
      actor: { crewId: "1001", userCode: "crew" },
      currentPeriod: {
        id: 6,
        rosterPeriodId: 6,
        periodCode: "Jun 2026",
        filiale: "F8",
        status: "OPEN",
        computedStage: "OPEN",
        bidOpenAt: null,
        bidCloseAt: null,
        canEditBid: true,
        readOnlyReason: null,
      },
      pgPool,
    }),
    { message: "Standing Bid contains a saved property that is no longer supported." },
  );
});

test("Bid Feedback lightweight loader still rejects unsupported Standing properties when Current is active", async () => {
  const pgPool = {
    async query(text: string) {
      if (/bid_feedback_input_rows/i.test(text)) {
        return { rows: [
          {
            bid_id: 101,
            bid_context: "Current",
            period_code: "Jun 2026",
            roster_period_id: "6",
            draft_version: 2,
            remarks: "",
            property_group_key: "award",
            group_seq: 1,
            bid_type: "Pairing",
            legacy_property_code: 131,
            property_code: 131,
            property_name: "Pairing Length",
            action_id: 1,
            operator: "=",
            param_a: "1",
            param_b: null,
            param_c: null,
            preference_json: null,
            all_or_nothing: null,
            minimum_n: null,
            limit_n: null,
            tier: 1,
            actor_base: "YYZ",
            actor_rank: "CA",
            actor_zone_id: "America/Toronto",
            occurrence_rows: [],
          },
          {
            bid_id: 202,
            bid_context: "StandingLineholder",
            period_code: "STANDING",
            roster_period_id: null,
            draft_version: 1,
            remarks: "",
            property_group_key: "unsupported-standing",
            group_seq: 1,
            bid_type: "DaysOff",
            legacy_property_code: 999,
            property_code: 999,
            property_name: "Removed Standing Property",
            action_id: 1,
            operator: "=",
            param_a: "1",
            param_b: null,
            param_c: null,
            preference_json: null,
            all_or_nothing: null,
            minimum_n: null,
            limit_n: null,
            tier: 1,
            actor_base: "YYZ",
            actor_rank: "CA",
            actor_zone_id: "America/Toronto",
            occurrence_rows: [],
          },
        ] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
  } as never;

  await assert.rejects(
    () => loadBidFeedbackInputs({
      actor: { crewId: "1001", userCode: "crew" },
      currentPeriod: {
        id: 6,
        rosterPeriodId: 6,
        periodCode: "Jun 2026",
        filiale: "F8",
        status: "OPEN",
        computedStage: "OPEN",
        bidOpenAt: null,
        bidCloseAt: null,
        canEditBid: true,
        readOnlyReason: null,
      },
      pgPool,
    }),
    { message: "Standing Bid contains a saved property that is no longer supported." },
  );
});

test("Bid Feedback lazy eligibility endpoint evaluates only requested Award pairings", async () => {
  const currentPeriod = {
    id: 6,
    rosterPeriodId: 6,
    periodCode: "Jun 2026",
    computedStage: "OPEN" as const,
    canEditBid: true,
    readOnlyReason: null,
  };
  const pairingResult = {
    id: "13335",
    pairingId: "13335",
    pairingNumber: "V4126",
    rank: "CA+FO",
    base: "YYZ",
    zoneId: "America/Toronto",
    originDate: "2026-06-08",
    endDate: "2026-06-10",
    routeLabel: "YYZ-MEX-YYZ",
    reportTime: "16:57",
    releaseTime: "23:21",
    durationDays: 3,
    tafbDays: 3,
    totalCredit: "15:48",
  };
  const pairingBidService = {
    async getCurrentDraft() {
      return {
        currentPeriod,
        draft: { draftVersion: 2, periodCode: "Jun 2026", bidContext: "Current", properties: [{
          propertyGroupKey: "current-award",
          rowSeq: 1,
          propertyCode: 131,
          name: "Pairing Length",
          action: "award",
          bid: { type: "stepper", value: 3 },
          tiers: ["T1"],
        }] },
        propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [],
      };
    },
  } as unknown as PbsPairingBidService;
  const emptyDraft = {
    async getCurrentDraft() {
      return { currentPeriod, draft: { draftVersion: 1, periodCode: "Jun 2026", bidContext: "Current", properties: [] }, propertyCatalog: [], favoriteProperties: [], recommendedPropertyCodes: [] };
    },
  } as unknown as PbsDaysOffBidService & PbsLineBidService & PbsReserveBidService;
  const standingBidService = {
    async getCurrentStandingBid() {
      return {
        currentPeriod,
        preferOffConfig: {},
        lineholderDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingLineholder", properties: [] },
        reserveDraft: { draftVersion: 0, periodCode: "STANDING", bidContext: "StandingReserve", properties: [] },
        propertyCatalog: { lineholder: [], reserve: [] },
      };
    },
  } as unknown as PbsStandingBidService;
  const pairingMatcherRequests: Array<Parameters<BidFeedbackPairingMatcher>[0]> = [];
  const pairingMatcher: BidFeedbackPairingMatcher = async (request) => {
    pairingMatcherRequests.push(request);
    return [{
    pairing: pairingResult,
    matchedPropertyKeys: ["current:current-award"],
    }];
  };
  const pgPool = {
    query: async (sql: string) => {
      if (String(sql).includes("pbs_user")) return { rows: [{ division: "P" }] };
      if (String(sql).includes("workset")) return { rows: [{ id: 103, name: "PBS Solver Ruleset FD" }] };
      return { rows: [] };  // pairing/crew queries → no rows → FACTS_MISSING
    },
  } as never;
  const runnerCalls: Array<{ pairingId: number; rulesetId: number; dateFrom: string; dateTo: string }> = [];
  const service = createPbsBidFeedbackService({
    pairingBidService,
    daysOffBidService: emptyDraft,
    lineBidService: emptyDraft,
    reserveBidService: emptyDraft,
    standingBidService,
    pairingMatcher,
    pgPool,
    pairingEligibilityRunner: async ({ pairingId, rulesetId, dateFrom, dateTo }) => {
      runnerCalls.push({ pairingId, rulesetId, dateFrom, dateTo });
      return [{
        rule_code: "8072",
        rule_instance: null,
        crew_id: "1001",
        pairing_id: pairingId,
        start_dt: `${dateFrom}T00:00:00.000Z`,
        end_dt: `${dateTo}T00:00:00.000Z`,
        severity: 3,
        message: "Minimum rest between duties is not satisfied.",
      }];
    },
  });

  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });
  const award = feedback.pairings.find((p) => p.rawDirection === "award");
  assert.ok(award);
  assert.deepEqual(runnerCalls, []);
  assert.equal(award.eligibility?.status, "unknown");
  assert.deepEqual(award.eligibility?.unavailable, ["rule_engine"]);

  const eligibility = await service.getCurrentEligibility(
    { crewId: "1001", userCode: "crew" },
    { pairingIds: ["13335", "999999", "13335"] },
  );

  assert.deepEqual(pairingMatcherRequests.map((request) => request.pairingIds ?? null), [
    null,
    ["13335", "999999"],
  ]);
  assert.deepEqual(runnerCalls, [{
    pairingId: 13335,
    rulesetId: 103,
    dateFrom: "2026-06-08",
    dateTo: "2026-06-11",
  }]);
  assert.equal(eligibility.draftVersion, "2:1:1:1:0:0");
  assert.equal(eligibility.eligibilityLabel.includes("PBS Solver Ruleset FD"), true);
  assert.deepEqual(eligibility.pairings, [{
    pairingId: "13335",
    eligibility: {
      status: "ineligible",
      checked: ["rule_engine"],
      unavailable: [],
      reasons: [{
        code: "RULE_ENGINE_CONFLICT",
        message: "Minimum rest between duties is not satisfied.",
        ruleId: "8072",
        ruleName: "8072",
      }],
    },
  }]);
});
