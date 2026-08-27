import assert from "node:assert/strict";
import test from "node:test";
import {
  deadheadFlyingBidSchema,
  flightNumberPreferenceBidSchema,
  monthEndCarryoverBidSchema,
  pairingAirportPreferenceBidSchema,
  pairingPreferenceBidSchema,
  redeyePreferenceBidSchema,
  workDayPreferenceBidSchema,
} from "./pairing-bid-route-schemas.js";

test("monthEndCarryoverBidSchema accepts valid single-value and range bids", () => {
  assert.deepEqual(monthEndCarryoverBidSchema.parse({
    type: "month-end-carryover",
    operator: "<",
    days: 2,
  }), {
    type: "month-end-carryover",
    operator: "<",
    days: 2,
  });
  assert.doesNotThrow(() => monthEndCarryoverBidSchema.parse({
    type: "month-end-carryover",
    operator: "Between",
    from: 2,
    to: 4,
  }));
});

test("monthEndCarryoverBidSchema rejects invalid values and mismatched fields", () => {
  const invalidBids = [
    { type: "month-end-carryover", operator: "<", days: 0 },
    { type: "month-end-carryover", operator: "<" },
    { type: "month-end-carryover", operator: "<", days: 2, from: 1 },
    { type: "month-end-carryover", operator: "Between", from: 4, to: 2 },
    { type: "month-end-carryover", operator: "Between", from: 2 },
    { type: "month-end-carryover", operator: "Between", from: 2, to: 4, days: 3 },
  ];

  for (const bid of invalidBids) {
    assert.equal(monthEndCarryoverBidSchema.safeParse(bid).success, false);
  }
});

test("pairingAirportPreferenceBidSchema rejects removed fulfilment fields", () => {
  const bid = {
    type: "airport-preference" as const,
    event: "layover" as const,
    locations: [{ code: "YYZ", kind: "airport" as const }],
    dateScope: null,
    minimumLayoverDuration: "13:00",
  };

  assert.deepEqual(pairingAirportPreferenceBidSchema.parse(bid), bid);
  assert.equal(pairingAirportPreferenceBidSchema.safeParse({ ...bid, minimumRequired: 1 }).success, false);
  assert.equal(pairingAirportPreferenceBidSchema.safeParse({ ...bid, maximumRequired: 2 }).success, false);
  assert.equal(pairingAirportPreferenceBidSchema.safeParse({
    ...bid,
    minimumRequired: 1,
    maximumRequired: 2,
  }).success, false);
});

test("deadheadFlyingBidSchema accepts both modes with dates and rejects legacy fields", () => {
  assert.deepEqual(deadheadFlyingBidSchema.parse({
    type: "deadhead-flying",
    mode: "any-deadhead",
    dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-08"] },
  }), {
    type: "deadhead-flying",
    mode: "any-deadhead",
    dateScope: { mode: "specific_dates", dates: ["2026-04-03", "2026-04-08"] },
  });
  assert.doesNotThrow(() => deadheadFlyingBidSchema.parse({
    type: "deadhead-flying",
    mode: "deadhead-only-duty",
    dateScope: { mode: "date_range", from: "2026-04-10", to: "2026-04-12" },
  }));
  assert.throws(() => deadheadFlyingBidSchema.parse({
    type: "deadhead-flying",
    mode: "deadhead-legs",
    operator: ">",
    legs: 1,
  }));
  assert.throws(() => deadheadFlyingBidSchema.parse({
    type: "deadhead-flying",
    mode: "any-deadhead",
    dateScope: { mode: "specific_dates", dates: [] },
  }));
});

test("pairingPreferenceBidSchema accepts selected stable Pairing IDs only", () => {
  assert.deepEqual(pairingPreferenceBidSchema.parse({
    type: "pairing-preference",
    pairingIds: ["496001", "496002"],
    pairingLabels: ["PR141", "PR142"],
  }), {
    type: "pairing-preference",
    pairingIds: ["496001", "496002"],
    pairingLabels: ["PR141", "PR142"],
  });
});

for (const removedField of ["dateScope", "minimumRequired", "maximumRequired"] as const) {
  test(`pairingPreferenceBidSchema rejects removed ${removedField}`, () => {
    assert.throws(() => pairingPreferenceBidSchema.parse({
      type: "pairing-preference",
      pairingIds: ["496001"],
      [removedField]: removedField === "dateScope" ? null : 1,
    }));
  });
}

test("flightNumberPreferenceBidSchema accepts multiple dates and rejects removed matching-flight fields", () => {
  const bid = {
    type: "flight-number-preference" as const,
    flightNumbers: [" 0601 ", "0609"],
    dateScope: { mode: "specific_dates" as const, dates: ["2026-06-03", "2026-06-18"] },
  };

  assert.deepEqual(flightNumberPreferenceBidSchema.parse(bid), {
    ...bid,
    flightNumbers: ["0601", "0609"],
  });
  assert.throws(() => flightNumberPreferenceBidSchema.parse({ ...bid, minimumRequired: 1 }));
  assert.throws(() => flightNumberPreferenceBidSchema.parse({
    ...bid,
    dateScope: { mode: "specific_date", date: "2026-06-03" },
  }));
});

test("redeyePreferenceBidSchema accepts multiple dates and rejects the legacy single date", () => {
  const bid = {
    type: "redeye-preference" as const,
    dateScope: { mode: "specific_dates" as const, dates: ["2026-06-03", "2026-06-18"] },
  };

  assert.deepEqual(redeyePreferenceBidSchema.parse(bid), bid);
  assert.throws(() => redeyePreferenceBidSchema.parse({
    ...bid,
    dateScope: { mode: "specific_date", date: "2026-06-03" },
  }));
  assert.throws(() => redeyePreferenceBidSchema.parse({
    ...bid,
    dateScope: { mode: "specific_dates", dates: [] },
  }));
});

test("workDayPreferenceBidSchema accepts weekday-only and open-ended check-in windows", () => {
  const bid = {
    type: "work-day-preference" as const,
    days: [
      { dayOfWeek: "MON" as const, checkInFrom: null, checkInTo: null },
      { dayOfWeek: "WED" as const, checkInFrom: "06:00", checkInTo: null },
      { dayOfWeek: "FRI" as const, checkInFrom: null, checkInTo: "10:00" },
    ],
    dateScope: null,
  };

  assert.deepEqual(workDayPreferenceBidSchema.parse(bid), bid);
});

test("workDayPreferenceBidSchema rejects duplicate weekdays and equal check-in endpoints", () => {
  assert.throws(() => workDayPreferenceBidSchema.parse({
    type: "work-day-preference",
    days: [
      { dayOfWeek: "MON", checkInFrom: null, checkInTo: null },
      { dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: null },
    ],
    dateScope: null,
  }));

  assert.throws(() => workDayPreferenceBidSchema.parse({
    type: "work-day-preference",
    days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "06:00" }],
    dateScope: null,
  }));
});
