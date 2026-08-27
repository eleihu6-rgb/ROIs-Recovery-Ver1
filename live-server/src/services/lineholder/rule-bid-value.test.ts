import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
  cloneRuleBidValue,
  deserializeRuleBid,
  formatRuleBid,
  serializeRuleBid,
  type RuleBidValue,
  type RulePropertyDefinition,
} from "./rule-bid-value.js";

test("serializes and deserializes Pairing Preference using stable pairing ids only", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "pairing-preference" }>> = {
    propertyCode: 102,
    name: "Pairing Preference",
    defaultBid: {
      type: "pairing-preference",
      pairingIds: [],
      pairingLabels: [],
    },
  };
  const bid = cloneRuleBidValue({
    type: "pairing-preference",
    pairingIds: ["496001", "496002"],
    pairingLabels: ["PR141", "PR142"],
  });
  const serialized = serializeRuleBid(bid);
  const restored = deserializeRuleBid(definition, serialized);

  assert.equal(serialized.operator, "Json");
  assert.deepEqual(JSON.parse(serialized.paramA ?? "{}"), bid);
  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "PR141, PR142");
});

test("serializes and deserializes Work Day Preference for live scoring", () => {
  const fallback: Extract<RuleBidValue, { type: "work-day-preference" }> = {
    type: "work-day-preference",
    days: [],
    dateScope: null,
  };
  const definition: RulePropertyDefinition<typeof fallback> = {
    propertyCode: 110,
    name: "Work Day Preference",
    defaultBid: fallback,
  };
  const bid: typeof fallback = {
    type: "work-day-preference",
    days: [
      { dayOfWeek: "FRI", checkInFrom: "22:00", checkInTo: "04:00" },
      { dayOfWeek: "SUN", checkInFrom: null, checkInTo: null },
    ],
    dateScope: { mode: "specific_dates", dates: ["2026-06-19", "2026-06-21"] },
  };

  const serialized = serializeRuleBid(bid);
  assert.equal(serialized.operator, "Json");
  assert.deepEqual(deserializeRuleBid(definition, serialized), bid);
  assert.equal(formatRuleBid(bid), "Fri 22:00-04:00, Sun Incomplete check-in window, 2026-06-19, 2026-06-21");
  assert.deepEqual(deserializeRuleBid(definition, {
    operator: "In",
    paramA: JSON.stringify({ dates: [], daysOfWeek: ["FRI"] }),
    paramB: null,
    paramC: null,
  }), fallback);
});

test("serializes and deserializes airport preference bids as JSON payloads", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "airport-preference" }>> = {
    propertyCode: 168,
    name: "Airport Preference",
    defaultBid: {
      type: "airport-preference",
      event: "layover",
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    },
  };
  const bid = cloneRuleBidValue({
    type: "airport-preference",
    event: "landing_or_layover",
    locations: [{ code: "YYZ", kind: "airport" }, { code: "YTO", kind: "city" }],
    dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
    minimumLayoverDuration: "16:00",
  });
  const serialized = serializeRuleBid(bid);

  assert.equal(serialized.operator, "Json");
  assert.equal(serialized.paramB, null);
  assert.equal(serialized.paramC, null);
  assert.deepEqual(JSON.parse(serialized.paramA ?? "{}"), bid);

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(
    formatRuleBid(restored),
    "Both YYZ, YTO · Date Range 2026-06-15 - 2026-06-21 · Minimum layover 16:00",
  );
});

test("serializes and deserializes Pairing Length specific start dates", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "pairing-length-preference" }>> = {
    propertyCode: 112,
    name: "Pairing Length",
    defaultBid: {
      type: "pairing-length-preference",
      minDays: null,
      maxDays: null,
      dateScope: null,
      min: 1,
      max: 7,
    },
  };
  const source: Extract<RuleBidValue, { type: "pairing-length-preference" }> = {
    type: "pairing-length-preference",
    minDays: 1,
    maxDays: 3,
    dateScope: { mode: "specific_dates", dates: ["2026-06-18", "2026-06-03"] },
    min: 1,
    max: 7,
  };
  const cloned = cloneRuleBidValue(source);

  if (cloned.dateScope?.mode !== "specific_dates") {
    throw new Error("Expected Pairing Length specific dates.");
  }
  cloned.dateScope.dates.push("2026-06-20");
  assert.deepEqual(source.dateScope, { mode: "specific_dates", dates: ["2026-06-18", "2026-06-03"] });

  const serialized = serializeRuleBid(source);
  const restored = deserializeRuleBid(definition, serialized);

  assert.equal(serialized.operator, "Json");
  assert.deepEqual(restored, {
    ...source,
    dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
  });
  assert.equal(formatRuleBid(restored), "1-3 days · starting on 2026-06-03, 2026-06-18");
});

test("deserializes legacy airport preference JSON into the contract airport shape", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "airport-preference" }>> = {
    propertyCode: 168,
    name: "Airport Preference",
    defaultBid: {
      type: "airport-preference",
      event: "layover",
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    },
  };

  const restored = deserializeRuleBid(definition, {
    operator: "Json",
    paramA: JSON.stringify({
      type: "airport-preference",
      event: "layover",
      airports: ["yyz"],
      dateCondition: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
      layoverDuration: { operator: "=", value: "13:00" },
    }),
    paramB: null,
    paramC: null,
  });

  assert.deepEqual(restored, {
    type: "airport-preference",
    event: "layover",
    locations: [{ code: "YYZ", kind: "airport" }],
    dateScope: { mode: "date_range", from: "2026-06-15", to: "2026-06-21" },
    minimumLayoverDuration: "13:00",
  });
});

test("round-trips Flight Number Preference with multiple dates and deep clones its payload", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "flight-number-preference" }>> = {
    propertyCode: 116,
    name: "Flight Number Preference",
    defaultBid: { type: "flight-number-preference", flightNumbers: [], dateScope: null },
  };
  const source = {
    type: "flight-number-preference" as const,
    flightNumbers: ["0601", "0609"],
    dateScope: { mode: "specific_dates" as const, dates: ["2026-06-03", "2026-06-18"] },
  };
  const cloned = cloneRuleBidValue(source);

  cloned.flightNumbers.push("0610");
  if (cloned.dateScope?.mode === "specific_dates") cloned.dateScope.dates.push("2026-06-20");
  assert.deepEqual(source.flightNumbers, ["0601", "0609"]);
  assert.deepEqual(source.dateScope.dates, ["2026-06-03", "2026-06-18"]);

  const restored = deserializeRuleBid(definition, serializeRuleBid(source));
  assert.deepEqual(restored, source);
  assert.equal(formatRuleBid(restored), "0601, 0609 · on 2026-06-03, 2026-06-18");
});

test("round-trips Redeye Preference with multiple dates and deep clones its payload", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "redeye-preference" }>> = {
    propertyCode: 117,
    name: "Redeye Preference",
    defaultBid: { type: "redeye-preference", dateScope: null },
  };
  const source = {
    type: "redeye-preference" as const,
    dateScope: { mode: "specific_dates" as const, dates: ["2026-06-03", "2026-06-18"] },
  };
  const cloned = cloneRuleBidValue(source);

  if (cloned.dateScope?.mode === "specific_dates") cloned.dateScope.dates.push("2026-06-20");
  assert.deepEqual(source.dateScope.dates, ["2026-06-03", "2026-06-18"]);

  const restored = deserializeRuleBid(definition, serializeRuleBid(source));
  assert.deepEqual(restored, source);
  assert.equal(formatRuleBid(restored), "Redeye · on 2026-06-03, 2026-06-18");
});

test("round-trips Deadhead Flying with multiple dates and deep clones its payload", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "deadhead-flying" }>> = {
    propertyCode: 122,
    name: "Deadhead Flying",
    defaultBid: { type: "deadhead-flying", mode: "any-deadhead", dateScope: null },
  };
  const source = {
    type: "deadhead-flying" as const,
    mode: "deadhead-only-duty" as const,
    dateScope: { mode: "specific_dates" as const, dates: ["2026-06-03", "2026-06-18"] },
  };
  const cloned = cloneRuleBidValue(source);

  if (cloned.dateScope?.mode === "specific_dates") cloned.dateScope.dates.push("2026-06-20");
  assert.deepEqual(source.dateScope.dates, ["2026-06-03", "2026-06-18"]);

  const restored = deserializeRuleBid(definition, serializeRuleBid(source));
  assert.deepEqual(restored, source);
  assert.equal(formatRuleBid(restored), "Deadhead-only duty · on 2026-06-03, 2026-06-18");
});
