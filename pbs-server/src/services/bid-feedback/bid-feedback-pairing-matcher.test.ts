import assert from "node:assert/strict";
import test from "node:test";

import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  loadBidFeedbackPairingFacts,
  mapBidFeedbackPairingFactRows,
  selectBidFeedbackPairings,
  type BidFeedbackDutyFact,
  type BidFeedbackLegFact,
  type BidFeedbackLocalDateTime,
  type BidFeedbackMatcherPeriod,
  type BidFeedbackMatcherProperty,
  type BidFeedbackPairingFact,
  type BidFeedbackPairingMatcherContext,
} from "./bid-feedback-pairing-matcher.js";

const period: BidFeedbackMatcherPeriod = {
  rosterPeriodId: 6,
  rosterPeriodKey: "2026-06",
  periodCode: "Jun 2026",
  rpStartLocal: "2026-06-01",
  rpEndLocal: "2026-06-30",
};

const matcherContext: BidFeedbackPairingMatcherContext = {
  identity: "test",
  efficientFlying: { available: false },
  redeye: { available: false },
};

const local = (date: string, time: string): BidFeedbackLocalDateTime => {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  return {
    date,
    time,
    minutes: (hours ?? 0) * 60 + (minutes ?? 0),
    iso: `${date}T${time}:00`,
  };
};

const instant = (value: string): number => new Date(value).getTime();

const leg = (overrides: Partial<BidFeedbackLegFact> = {}): BidFeedbackLegFact => ({
  dutySeq: 1,
  segmentSeq: 1,
  flightNumber: "F8123",
  depAirport: "YYZ",
  depCity: "TORONTO",
  arrAirport: "YVR",
  arrCity: "VANCOUVER",
  depLocal: local("2026-06-03", "10:00"),
  arrLocal: local("2026-06-03", "12:00"),
  depInstantMs: instant("2026-06-03T14:00:00.000Z"),
  arrInstantMs: instant("2026-06-03T16:00:00.000Z"),
  assignment: "FLT",
  isFly: true,
  isDeadhead: false,
  ...overrides,
});

const duty = (
  legs: BidFeedbackLegFact[],
  overrides: Partial<BidFeedbackDutyFact> = {},
): BidFeedbackDutyFact => ({
  dutySeq: 1,
  checkInLocal: local("2026-06-03", "09:00"),
  checkOutLocal: local("2026-06-03", "13:00"),
  endAirport: "YVR",
  endCity: "VANCOUVER",
  layoverHours: 14,
  legs,
  ...overrides,
});

const pairing = (overrides: Partial<BidFeedbackPairingFact> = {}): BidFeedbackPairingFact => {
  const legs = overrides.legs ?? [leg()];
  const duties = overrides.duties ?? [duty(legs)];
  return {
    pairingId: "P1",
    pairingNumber: "T4101",
    rank: "CA+FO",
    base: "YYZ",
    zoneId: "America/Toronto",
    originDate: "2026-06-03",
    endDate: "2026-06-03",
    routeLabel: "YYZ-YVR",
    reportTime: "09:00",
    releaseTime: "13:00",
    totalCredit: "6:00",
    durationDays: 1,
    tafbDays: 1,
    assignmentGroup: "FLY",
    assignment: "FLY",
    startLocal: local("2026-06-03", "10:00"),
    endLocal: local("2026-06-03", "12:00"),
    durationDaysForSelection: 1,
    creditHours: 6,
    duties,
    legs,
    ...overrides,
  };
};

const property = (
  key: string,
  propertyCode: number,
  bid: PbsPairingDraftProperty["bid"],
  options: Pick<PbsPairingDraftProperty, "action" | "quantifier"> = {},
): BidFeedbackMatcherProperty => ({
  key,
  property: {
    rowSeq: 1,
    propertyCode,
    name: key,
    action: options.action ?? "award",
    quantifier: options.quantifier,
    bid,
    tiers: ["T1"],
  },
});

const selectedKeys = (
  facts: BidFeedbackPairingFact[],
  properties: BidFeedbackMatcherProperty[],
  context = matcherContext,
): string[] => selectBidFeedbackPairings({ facts, period, properties, context })
    .flatMap((match) => match.matchedPropertyKeys);

test("Bid Feedback selector matches explicit Pairing Preference IDs", () => {
  assert.deepEqual(
    selectBidFeedbackPairings({
      facts: [pairing({ pairingId: "P1" }), pairing({ pairingId: "P2" })],
      period,
      properties: [property("pick-p2", 102, { type: "pairing-preference", pairingIds: ["P2"] })],
      context: matcherContext,
    }).map((match) => match.pairing.pairingId),
    ["P2"],
  );
});

test("Bid Feedback Airport Preference skips final return-to-base landing but matches layovers", () => {
  const outbound = leg({ segmentSeq: 1, arrAirport: "YVR", arrCity: "VANCOUVER" });
  const inbound = leg({
    segmentSeq: 2,
    depAirport: "YVR",
    arrAirport: "YYZ",
    arrCity: "TORONTO",
    depLocal: local("2026-06-04", "08:00"),
    arrLocal: local("2026-06-04", "13:00"),
  });
  const fact = pairing({
    legs: [outbound, inbound],
    duties: [duty([outbound], { layoverHours: 14 })],
  });

  assert.deepEqual(selectedKeys([fact], [
    property("base-landing", 168, {
      type: "airport-preference",
      event: "landing",
      locations: [{ code: "YYZ", kind: "airport" }],
      dateScope: null,
      minimumLayoverDuration: null,
    }),
  ]), []);
  assert.deepEqual(selectedKeys([fact], [
    property("layover-city", 168, {
      type: "airport-preference",
      event: "layover",
      locations: [{ code: "VANCOUVER", kind: "city" }],
      dateScope: null,
      minimumLayoverDuration: "13:00",
    }),
  ]), ["layover-city"]);
});

test("Bid Feedback Efficient Flying uses a global FLY distribution and ignores RES pairings", () => {
  const context: BidFeedbackPairingMatcherContext = {
    ...matcherContext,
    efficientFlying: { available: true, percentile: 34 },
  };
  const low = pairing({ pairingId: "low", base: "YVR", creditHours: 3, durationDaysForSelection: 1 });
  const mid = pairing({ pairingId: "mid", base: "YYZ", creditHours: 8, durationDaysForSelection: 2 });
  const high = pairing({ pairingId: "high", base: "YEG", creditHours: 6, durationDaysForSelection: 1 });
  const reserve = pairing({ pairingId: "res", assignmentGroup: "RES", assignment: "PRAM", creditHours: 9, durationDaysForSelection: 1 });

  assert.deepEqual(
    selectBidFeedbackPairings({
      facts: [low, mid, high, reserve],
      period,
      properties: [property("efficient", 428, { type: "efficient-flying-preference", mode: "efficient" })],
      context,
    }).map((match) => match.pairing.pairingId),
    ["high"],
  );
  assert.deepEqual(
    selectBidFeedbackPairings({
      facts: [low, mid, high, reserve],
      period,
      properties: [property("inefficient", 428, { type: "efficient-flying-preference", mode: "inefficient" })],
      context,
    }).map((match) => match.pairing.pairingId),
    ["low"],
  );
});

test("Bid Feedback Check-In selector uses pairing report time and half-open Between windows", () => {
  const fact = pairing({ duties: [duty([leg()], { checkInLocal: local("2026-06-03", "09:00") })] });

  assert.deepEqual(selectedKeys([fact], [
    property("check-in", 103, {
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "08:00",
      to: "09:00",
      dateScope: null,
    }),
  ]), []);
  assert.deepEqual(selectedKeys([fact], [
    property("check-in", 103, {
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "09:00",
      to: "10:00",
      dateScope: null,
    }),
  ]), ["check-in"]);
});

test("Bid Feedback Flight Legs per Duty counts FLY legs only and honors quantifier", () => {
  const flightLeg = leg({ segmentSeq: 1 });
  const deadheadLeg = leg({ segmentSeq: 2, assignment: "DH", isFly: false, isDeadhead: true });
  const oneFlyDuty = duty([flightLeg, deadheadLeg]);
  const twoFlyDuty = duty([leg({ dutySeq: 2, segmentSeq: 1 }), leg({ dutySeq: 2, segmentSeq: 2 })], { dutySeq: 2 });
  const fact = pairing({ duties: [oneFlyDuty, twoFlyDuty], legs: [...oneFlyDuty.legs, ...twoFlyDuty.legs] });

  assert.deepEqual(selectedKeys([fact], [
    property("any-one", 107, { type: "flight-legs-per-duty", operator: "=", legs: 1, dateScope: null }),
  ]), ["any-one"]);
  assert.deepEqual(selectedKeys([fact], [
    property("every-two", 107, { type: "flight-legs-per-duty", operator: "=", legs: 2, dateScope: null }, { quantifier: "every" }),
  ]), []);
});

test("Bid Feedback Work Day is Award-only and supports optional check-in windows", () => {
  const fact = pairing({ duties: [duty([leg()], { checkInLocal: local("2026-06-03", "09:30") })] });
  const bid: PbsPairingDraftProperty["bid"] = {
    type: "work-day-preference",
    days: [{ dayOfWeek: "WED", checkInFrom: "09:00", checkInTo: null }],
    dateScope: null,
  };

  assert.deepEqual(selectedKeys([fact], [property("award-work", 110, bid, { action: "award" })]), ["award-work"]);
  assert.deepEqual(selectedKeys([fact], [property("avoid-work", 110, bid, { action: "avoid" })]), []);
  assert.deepEqual(selectedKeys([fact], [
    property("weekday-only", 110, {
      type: "work-day-preference",
      days: [{ dayOfWeek: "WED", checkInFrom: null, checkInTo: null }],
      dateScope: null,
    }, { action: "award" }),
  ]), ["weekday-only"]);
  assert.deepEqual(selectedKeys([fact], [
    property("end-only", 110, {
      type: "work-day-preference",
      days: [{ dayOfWeek: "WED", checkInFrom: null, checkInTo: "10:00" }],
      dateScope: null,
    }, { action: "award" }),
  ]), ["end-only"]);
  assert.deepEqual(selectedKeys([fact], [
    property("miss-end-only", 110, {
      type: "work-day-preference",
      days: [{ dayOfWeek: "WED", checkInFrom: null, checkInTo: "09:00" }],
      dateScope: null,
    }, { action: "award" }),
  ]), []);
});

test("Bid Feedback Pairing Length uses recomputed calendar span and ignores incomplete structured ranges", () => {
  const fact = pairing({
    originDate: "2026-06-03",
    endDate: "2026-06-05",
    durationDays: 1,
    tafbDays: 1,
    durationDaysForSelection: 3,
  });

  assert.deepEqual(selectedKeys([fact], [
    property("length", 112, { type: "pairing-length-preference", minDays: 2, maxDays: 3, dateScope: null }),
  ]), ["length"]);
  assert.deepEqual(selectedKeys([fact], [
    property("invalid-length", 112, { type: "pairing-length-preference", minDays: null, maxDays: 3, dateScope: null }),
  ]), []);
  assert.deepEqual(selectedKeys([fact], [
    property("specific-date-gap", 112, {
      type: "pairing-length-preference",
      minDays: 2,
      maxDays: 3,
      dateScope: { mode: "specific_dates", dates: ["2026-06-01", "2026-06-08"] },
    }),
  ]), []);
  assert.deepEqual(selectedKeys([fact], [
    property("specific-date-hit", 112, {
      type: "pairing-length-preference",
      minDays: 2,
      maxDays: 3,
      dateScope: { mode: "specific_dates", dates: ["2026-06-04"] },
    }),
  ]), ["specific-date-hit"]);
});

test("Bid Feedback Flight Number selector checks FLY departure dates", () => {
  const fact = pairing();

  assert.deepEqual(selectedKeys([fact], [
    property("flight-number", 116, {
      type: "flight-number-preference",
      flightNumbers: ["F8123"],
      dateScope: { mode: "specific_dates", dates: ["2026-06-03"] },
    }),
  ]), ["flight-number"]);
  assert.deepEqual(selectedKeys([fact], [
    property("wrong-date", 116, {
      type: "flight-number-preference",
      flightNumbers: ["F8123"],
      dateScope: { mode: "specific_dates", dates: ["2026-06-04"] },
    }),
  ]), []);
});

test("Bid Feedback Redeye selector uses the configured airborne overlap window", () => {
  const context: BidFeedbackPairingMatcherContext = {
    ...matcherContext,
    redeye: { available: true, startTime: "03:30", endTime: "05:30", crossesMidnight: false, version: "03:30|05:30" },
  };
  const fact = pairing({
    legs: [leg({
      depLocal: local("2026-06-03", "01:00"),
      arrLocal: local("2026-06-03", "06:00"),
    })],
  });

  assert.deepEqual(selectedKeys([fact], [
    property("redeye", 117, { type: "redeye-preference", dateScope: null }),
  ], context), ["redeye"]);
});

test("Bid Feedback Month-End Carryover uses the period end and Avoid threshold is fixed at one day", () => {
  const fact = pairing({ endDate: "2026-07-02" });

  assert.deepEqual(selectedKeys([fact], [
    property("month-end-award", 163, { type: "month-end-carryover", operator: ">", days: 2 }, { action: "award" }),
  ]), ["month-end-award"]);
  assert.deepEqual(selectedKeys([fact], [
    property("month-end-avoid", 163, { type: "month-end-carryover", operator: ">", days: null }, { action: "avoid" }),
  ]), ["month-end-avoid"]);
});

test("Bid Feedback Deadhead selector supports any-deadhead and deadhead-only-duty", () => {
  const deadheadOnlyDuty = duty([
    leg({ assignment: "DH", isFly: false, isDeadhead: true }),
  ]);
  const mixedDuty = duty([
    leg({ assignment: "DH", isFly: false, isDeadhead: true }),
    leg({ segmentSeq: 2 }),
  ]);

  assert.deepEqual(selectedKeys([pairing({ duties: [mixedDuty], legs: mixedDuty.legs })], [
    property("any-dh", 122, { type: "deadhead-flying", mode: "any-deadhead", dateScope: null }),
  ]), ["any-dh"]);
  assert.deepEqual(selectedKeys([pairing({ duties: [mixedDuty], legs: mixedDuty.legs })], [
    property("dh-only", 122, { type: "deadhead-flying", mode: "deadhead-only-duty", dateScope: null }),
  ]), []);
  assert.deepEqual(selectedKeys([pairing({ duties: [deadheadOnlyDuty], legs: deadheadOnlyDuty.legs })], [
    property("dh-only", 122, { type: "deadhead-flying", mode: "deadhead-only-duty", dateScope: null }),
  ]), ["dh-only"]);
});

test("Bid Feedback Time Between Flights compares same-duty leg intervals with any/every quantifiers", () => {
  const first = leg({
    segmentSeq: 1,
    depInstantMs: instant("2026-06-03T10:00:00.000Z"),
    arrInstantMs: instant("2026-06-03T12:00:00.000Z"),
  });
  const second = leg({
    segmentSeq: 2,
    depInstantMs: instant("2026-06-03T13:15:00.000Z"),
    arrInstantMs: instant("2026-06-03T15:00:00.000Z"),
  });
  const third = leg({
    segmentSeq: 3,
    depInstantMs: instant("2026-06-03T15:45:00.000Z"),
    arrInstantMs: instant("2026-06-03T17:00:00.000Z"),
  });
  const fact = pairing({ duties: [duty([first, second, third])], legs: [first, second, third] });

  assert.deepEqual(selectedKeys([fact], [
    property("any-gt", 129, { type: "duration", value: "01:00", operator: ">" }),
  ]), ["any-gt"]);
  assert.deepEqual(selectedKeys([fact], [
    property("every-gt", 129, { type: "duration", value: "01:00", operator: ">" }, { quantifier: "every" }),
  ]), []);
  assert.deepEqual(selectedKeys([pairing({ duties: [duty([first])], legs: [first] })], [
    property("no-interval", 129, { type: "duration", value: "01:00", operator: ">" }),
  ]), []);
});

test("Bid Feedback DB fact mapper keeps RES pairings with no segments", () => {
  const [fact] = mapBidFeedbackPairingFactRows([{
    pairing_id: "9001",
    pairing_label: "PRAM-1",
    base: "YYZ",
    base_zone_id: "America/Toronto",
    assignment_group: "RES",
    assignment: "PRAM",
    pairing_start_utc: "2026-06-03T10:00:00.000Z",
    pairing_end_utc: "2026-06-03T18:00:00.000Z",
    duration_days: 1,
    tafb_days: 1,
    rank_label: null,
    total_credit_minutes: "0",
    duty_seq: null,
    seg_seq: null,
    flt_num: null,
    dep_arp: null,
    dep_city: null,
    arv_arp: null,
    arv_city: null,
    duty_end_arp: null,
    duty_end_city: null,
    duty_start_utc: null,
    duty_end_utc: null,
    duty_layover_minutes: null,
    leg_start_utc: null,
    leg_end_utc: null,
    seg_assignment: null,
  }]);

  assert.equal(fact?.assignmentGroup, "RES");
  assert.equal(fact?.duties.length, 0);
  assert.deepEqual(selectedKeys([fact!], [
    property("reserve-pairing", 102, { type: "pairing-preference", pairingIds: ["9001"] }),
  ]), ["reserve-pairing"]);
});

test("Bid Feedback fact SQL includes FLY and RES candidates without requiring segments", async () => {
  let sqlText = "";
  const pgPool = {
    async query(text: string) {
      sqlText = text;
      return { rows: [] };
    },
  };

  await loadBidFeedbackPairingFacts({
    pgPool: pgPool as never,
    liveSchema: "f8",
    period,
    actorContext: { base: "YYZ", rank: null, zoneId: "America/Toronto" },
  });

  assert.match(sqlText, /upper\(btrim\(p\.assignment_group\)\) in \('FLY', 'RES'\)/i);
  assert.match(sqlText, /upper\(btrim\(p\.base\)\) = \$3::varchar/i);
  assert.doesNotMatch(sqlText, /assignment_group\)\)\s*=\s*'FLY'/i);
  assert.doesNotMatch(sqlText, /exists\s*\(/i);
});

test("Bid Feedback fact SQL applies actor rank when available", async () => {
  let sqlText = "";
  const pgPool = {
    async query(text: string) {
      sqlText = text;
      return { rows: [] };
    },
  };

  await loadBidFeedbackPairingFacts({
    pgPool: pgPool as never,
    liveSchema: "f8",
    period,
    actorContext: { base: "YYZ", rank: "CA", zoneId: "America/Toronto" },
  });

  assert.match(sqlText, /from f8\.pairing_composition actor_composition/i);
  assert.match(sqlText, /upper\(btrim\(actor_composition\.acting_rank\)\) = \$4::varchar/i);
});
