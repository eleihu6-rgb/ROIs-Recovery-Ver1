import assert from "node:assert/strict";
import test from "node:test";
import {
  cloneRuleBidValue,
  deserializeRuleBid,
  formatRuleBid,
  serializeRuleBid,
  type RuleBidValue,
  type RulePropertyDefinition,
} from "./rule-bid-value.js";

test("serializes and deserializes flag-style bids", () => {
  const definition: RulePropertyDefinition<{ type: "flag" }> = {
    propertyCode: 212,
    name: "Maximize Weekend Days Off",
    defaultBid: { type: "flag" },
  };

  const bid = cloneRuleBidValue({ type: "flag" });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: null,
    paramA: null,
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Enabled");
});

test("serializes and deserializes single-date bids", () => {
  const definition: RulePropertyDefinition<{
    type: "date";
    value: string;
    operator?: "=" | "<" | ">";
  }> = {
    propertyCode: 215,
    name: "String of Days Off Starting on Date",
    defaultBid: {
      type: "date",
      value: "2026-04-01",
    },
  };

  const bid = cloneRuleBidValue({
    type: "date",
    value: "2026-04-12",
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "=",
    paramA: "2026-04-12",
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "2026-04-12");
});

test("serializes and deserializes pairing stepper-on-date bids", () => {
  const definition: RulePropertyDefinition<{
    type: "stepper-date";
    value: number;
    date: string;
    min?: number;
    max?: number;
  }> = {
    propertyCode: 132,
    name: "Prefer Pairing Length on Date",
    defaultBid: {
      type: "stepper-date",
      value: 2,
      date: "2025-12-24",
      min: 1,
      max: 7,
    },
  };

  const bid = cloneRuleBidValue({
    type: "stepper-date",
    value: 4,
    date: "2025-12-28",
    min: 1,
    max: 7,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "=",
    paramA: "4",
    paramB: "2025-12-28",
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "4 on 2025-12-28");
});

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

  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });
  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "PR141, PR142");
});

test("serializes and deserializes stepper date range bids", () => {
  const definition: RulePropertyDefinition<{
    type: "stepper-date-range";
    value: number;
    from: string;
    to: string;
    min?: number;
    max?: number;
  }> = {
    propertyCode: 204,
    name: "Long Stretch Off / Compressed Flying",
    defaultBid: {
      type: "stepper-date-range",
      value: 2,
      from: "2026-05-01",
      to: "2026-05-07",
      min: 1,
      max: 14,
    },
  };

  const bid = cloneRuleBidValue({
    type: "stepper-date-range",
    value: 4,
    from: "2026-05-10",
    to: "2026-05-20",
    min: 1,
    max: 14,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Between",
    paramA: "4",
    paramB: "2026-05-10",
    paramC: "2026-05-20",
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "4 consecutive days between 2026-05-10 - 2026-05-20");
});

test("serializes and deserializes month-end carryover bids", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "month-end-carryover" }>> = {
    propertyCode: 163,
    name: "Month-End Carryover",
    defaultBid: {
      type: "month-end-carryover",
      operator: ">",
      days: null,
    },
  };

  const bid = cloneRuleBidValue({
    type: "month-end-carryover",
    operator: "Between",
    from: 2,
    to: 4,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Carryover between 2 - 4 days");
});

test("serializes and deserializes deadhead flying bids", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "deadhead-flying" }>> = {
    propertyCode: 122,
    name: "Deadhead Flying",
    defaultBid: {
      type: "deadhead-flying",
      mode: "any-deadhead",
      dateScope: null,
    },
  };

  const bid = cloneRuleBidValue({
    type: "deadhead-flying",
    mode: "deadhead-only-duty",
    dateScope: { mode: "specific_dates", dates: ["2026-01-03", "2026-01-05"] },
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Deadhead-only duty · on 2026-01-03, 2026-01-05");
  assert.equal(formatRuleBid({ type: "deadhead-flying", mode: "deadhead-only-duty" }), "Deadhead-only duty");
});

test("serializes and deserializes days off / days on pattern bids", () => {
  const definition: RulePropertyDefinition<{
    type: "days-off-on-pattern";
    minDaysOff: number;
    minDaysOn: number;
    maxDaysOn: number;
    dateRange?: { from: string; to: string } | null;
    min?: number;
    max?: number;
  }> = {
    propertyCode: 205,
    name: "Days Off / Days On Pattern",
    defaultBid: {
      type: "days-off-on-pattern",
      minDaysOff: 3,
      minDaysOn: 3,
      maxDaysOn: 5,
      min: 1,
      max: 14,
    },
  };

  const bid = cloneRuleBidValue({
    type: "days-off-on-pattern",
    minDaysOff: 5,
    minDaysOn: 4,
    maxDaysOn: 5,
    min: 1,
    max: 14,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Between",
    paramA: "5",
    paramB: "4",
    paramC: "5",
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Work 4-5 days, then 5 days off");
});

test("serializes days off / days on pattern bids with an optional date range", () => {
  const definition: RulePropertyDefinition<{
    type: "days-off-on-pattern";
    minDaysOff: number;
    minDaysOn: number;
    maxDaysOn: number;
    dateRange?: { from: string; to: string } | null;
    min?: number;
    max?: number;
  }> = {
    propertyCode: 408,
    name: "Commuter Pattern",
    defaultBid: {
      type: "days-off-on-pattern",
      minDaysOff: 4,
      minDaysOn: 4,
      maxDaysOn: 5,
      dateRange: null,
      min: 1,
      max: 14,
    },
  };
  const bid = cloneRuleBidValue({
    type: "days-off-on-pattern",
    minDaysOff: 4,
    minDaysOn: 4,
    maxDaysOn: 5,
    dateRange: { from: "2026-04-02", to: "2026-04-18" },
    min: 1,
    max: 14,
  });
  const serialized = serializeRuleBid(bid);

  assert.equal(serialized.operator, "Json");
  assert.deepEqual(JSON.parse(serialized.paramA ?? "{}"), {
    minDaysOff: 4,
    minDaysOn: 4,
    maxDaysOn: 5,
    dateRange: { from: "2026-04-02", to: "2026-04-18" },
  });
  assert.equal(serialized.paramB, null);
  assert.equal(serialized.paramC, null);

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Work 4-5 days, then 4 days off between 2026-04-02 - 2026-04-18");
});

test("serializes and deserializes credit density preference bids", () => {
  const definition: RulePropertyDefinition<{
    type: "credit-density-preference";
    minimumTotalCredit: string;
    maximumWorkingDays: number;
    strength: "normal" | "strong" | "must_try";
  }> = {
    propertyCode: 409,
    name: "Most Flying In Least Working Days (Configured)",
    defaultBid: {
      type: "credit-density-preference",
      minimumTotalCredit: "75:00",
      maximumWorkingDays: 15,
      strength: "strong",
    },
  };

  const bid = cloneRuleBidValue({
    type: "credit-density-preference" as const,
    minimumTotalCredit: "78:00",
    maximumWorkingDays: 14,
    strength: "must_try" as const,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "=",
    paramA: "78:00",
    paramB: "14",
    paramC: "must_try",
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Min credit 78:00, max working days 14, strength must_try");
});

test("serializes and deserializes Line minimum base layover bids", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "minimum-base-layover" }>> = {
    propertyCode: 407,
    name: "Minimum Base Layover",
    defaultBid: {
      type: "minimum-base-layover",
      minimumDuration: "",
    },
  };

  const bid = cloneRuleBidValue({
    type: "minimum-base-layover",
    minimumDuration: "013:00",
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "=",
    paramA: "013:00",
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "At least 013:00");
});

test("serializes and deserializes reserve call type date scope bids", () => {
  const definition: RulePropertyDefinition<{
    type: "reserve-call-type-date-scope";
    callType: string;
    options: string[];
    dateScope:
      | { mode: "whole_month" }
      | { mode: "first_half" }
      | { mode: "second_half" }
      | { mode: "date_range"; from: string; to: string }
      | { mode: "specific_dates"; dates: string[] };
  }> = {
    propertyCode: 301,
    name: "Short Call Type",
    defaultBid: {
      type: "reserve-call-type-date-scope",
      callType: "PRAM",
      options: ["PRAM", "PRPM"],
      dateScope: { mode: "whole_month" },
    },
  };

  const bid = cloneRuleBidValue({
    type: "reserve-call-type-date-scope" as const,
    callType: "PRPM",
    options: ["PRAM", "PRPM"],
    dateScope: { mode: "specific_dates" as const, dates: ["2026-05-01", "2026-05-03"] },
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "In",
    paramA: "PRPM",
    paramB: JSON.stringify({ mode: "specific_dates", dates: ["2026-05-01", "2026-05-03"] }),
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "PRPM on 2026-05-01, 2026-05-03");
});

test("deserializes historical reserve call type rows as whole month date scope", () => {
  const definition: RulePropertyDefinition<{
    type: "reserve-call-type-date-scope";
    callType: string;
    options: string[];
    dateScope: { mode: "whole_month" };
  }> = {
    propertyCode: 301,
    name: "Short Call Type",
    defaultBid: {
      type: "reserve-call-type-date-scope",
      callType: "PRAM",
      options: ["PRAM", "PRPM"],
      dateScope: { mode: "whole_month" },
    },
  };

  const restored = deserializeRuleBid(definition, {
    operator: "=",
    paramA: "PRAM",
    paramB: null,
    paramC: null,
  });

  assert.deepEqual(restored, {
    type: "reserve-call-type-date-scope",
    callType: "PRAM",
    options: ["PRAM", "PRPM"],
    dateScope: { mode: "whole_month" },
  });
});

test("serializes and deserializes reserve flying date pattern bids", () => {
  const definition: RulePropertyDefinition<{
    type: "reserve-flying-date-pattern";
    segments: (
      | {
          workType: "reserve";
          callType: string;
          dateScope: { mode: "specific_dates"; dates: string[] };
        }
      | {
          workType: "flying";
          dateScope: { mode: "specific_dates"; dates: string[] };
        }
    )[];
    callTypeOptions: string[];
    strength: "normal" | "strong" | "must_try";
  }> = {
    propertyCode: 410,
    name: "Reserve / Flying Date Pattern",
    defaultBid: {
      type: "reserve-flying-date-pattern",
      segments: [
        {
          workType: "reserve",
          callType: "PRAM",
          dateScope: { mode: "specific_dates", dates: ["2026-05-01"] },
        },
      ],
      callTypeOptions: ["PRAM", "PRPM"],
      strength: "strong",
    },
  };

  const bid = cloneRuleBidValue({
    type: "reserve-flying-date-pattern" as const,
    segments: [
      {
        workType: "reserve" as const,
        callType: "PRAM",
        dateScope: { mode: "specific_dates" as const, dates: ["2026-05-01", "2026-05-03"] },
      },
      {
        workType: "flying" as const,
        dateScope: { mode: "specific_dates" as const, dates: ["2026-05-11"] },
      },
    ],
    callTypeOptions: ["PRAM", "PRPM"],
    strength: "must_try" as const,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Pattern",
    paramA: JSON.stringify(bid.segments),
    paramB: "must_try",
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(
    formatRuleBid(restored),
    "PRAM on 2026-05-01, 2026-05-03; Flying on 2026-05-11; strength must_try",
  );
});

test("serializes and deserializes employee schedule preference bids", () => {
  const definition: RulePropertyDefinition<{
    type: "employee-schedule-preference";
    crewId: string;
    crewName?: string;
    relationship: "together" | "apart";
    scheduleType: "work" | "days_off";
    thresholdType: "minimum" | "maximum";
    days: number;
    min?: number;
    max?: number;
  }> = {
    propertyCode: 206,
    name: "Employee Schedule Preference",
    defaultBid: {
      type: "employee-schedule-preference",
      crewId: "",
      relationship: "together",
      scheduleType: "days_off",
      thresholdType: "minimum",
      days: 1,
      min: 1,
      max: 31,
    },
  };

  const bid = cloneRuleBidValue({
    type: "employee-schedule-preference",
    crewId: "762",
    relationship: "apart",
    scheduleType: "days_off",
    thresholdType: "minimum",
    days: 8,
    min: 1,
    max: 31,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Minimum",
    paramA: "762",
    paramB: "opposite_days_off",
    paramC: "8",
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Apart · Days Off · Crew 762 · Minimum 8");
  assert.equal(
    formatRuleBid({ ...restored, crewName: "Carolyn Susan Ann Alves" }),
    "Apart · Days Off · Crew Carolyn Susan Ann Alves · Minimum 8",
  );
});

test("deserializes legacy shared days off rows as employee schedule preference bids", () => {
  const definition: RulePropertyDefinition<{
    type: "employee-schedule-preference";
    crewId: string;
    crewName?: string;
    relationship: "together" | "apart";
    scheduleType: "work" | "days_off";
    thresholdType: "minimum" | "maximum";
    days: number;
    min?: number;
    max?: number;
  }> = {
    propertyCode: 206,
    name: "Employee Schedule Preference",
    defaultBid: {
      type: "employee-schedule-preference",
      crewId: "",
      relationship: "together",
      scheduleType: "days_off",
      thresholdType: "minimum",
      days: 1,
      min: 1,
      max: 31,
    },
  };

  const restored = deserializeRuleBid(definition, {
    operator: "In",
    paramA: "817",
    paramB: "12",
    paramC: null,
  });

  assert.deepEqual(restored, {
    type: "employee-schedule-preference",
    crewId: "817",
    relationship: "together",
    scheduleType: "days_off",
    thresholdType: "minimum",
    days: 12,
    min: 1,
    max: 31,
  });
  assert.equal(formatRuleBid(restored), "Together · Days Off · Crew 817 · Minimum 12");
});

test("serializes and deserializes legacy shared days off employee bids", () => {
  const definition: RulePropertyDefinition<{
    type: "crew-days-off-share";
    employeeNumber: string;
    minimumDays: number;
    min?: number;
  }> = {
    propertyCode: 206,
    name: "Shared Days Off With Employee",
    defaultBid: {
      type: "crew-days-off-share",
      employeeNumber: "",
      minimumDays: 1,
      min: 1,
    },
  };

  const bid = cloneRuleBidValue({
    type: "crew-days-off-share",
    employeeNumber: "817",
    minimumDays: 12,
    min: 1,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "In",
    paramA: "817",
    paramB: "12",
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Employee 817, minimum 12 shared days");
});

test("preserves compare operators for scalar pairing bids", () => {
  const definition: RulePropertyDefinition<{
    type: "stepper";
    value: number;
    min?: number;
    max?: number;
    operator?: "=" | "<" | ">";
  }> = {
    propertyCode: 131,
    name: "Prefer Pairing Length",
    defaultBid: {
      type: "stepper",
      value: 3,
      min: 1,
      max: 7,
    },
  };

  const bid = cloneRuleBidValue({
    type: "stepper",
    value: 2,
    min: 1,
    max: 7,
    operator: "<",
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "<",
    paramA: "2",
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "< 2");
});

test("serializes and deserializes pairing length preference bids as JSON payloads", () => {
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

  const bid = cloneRuleBidValue({
    type: "pairing-length-preference",
    minDays: 1,
    maxDays: 3,
    dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
    min: 1,
    max: 7,
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "1-3 days · starting 2026-06-03 - 2026-06-18");
});

test("preserves and deep clones Pairing Length specific start dates", () => {
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
  const bid = cloneRuleBidValue(source);

  if (bid.dateScope?.mode !== "specific_dates") {
    throw new Error("Expected Pairing Length specific dates.");
  }
  bid.dateScope.dates.push("2026-06-20");
  assert.deepEqual(source.dateScope, { mode: "specific_dates", dates: ["2026-06-18", "2026-06-03"] });

  const restored = deserializeRuleBid(definition, serializeRuleBid(source));
  assert.deepEqual(restored, {
    ...source,
    dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
  });
  assert.equal(formatRuleBid(restored), "1-3 days · starting on 2026-06-03, 2026-06-18");
});

test("serializes and deserializes Flight Number Preference bids as JSON payloads", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "flight-number-preference" }>> = {
    propertyCode: 116,
    name: "Flight Number Preference",
    defaultBid: {
      type: "flight-number-preference",
      flightNumbers: [],
      dateScope: null,
    },
  };
  const bid = cloneRuleBidValue({
    type: "flight-number-preference",
    flightNumbers: ["0601", "0609"],
    dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "0601, 0609 · on 2026-06-03, 2026-06-18");
});

test("serializes and deserializes Redeye Preference bids as JSON payloads", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "redeye-preference" }>> = {
    propertyCode: 117,
    name: "Redeye Preference",
    defaultBid: {
      type: "redeye-preference",
      dateScope: null,
    },
  };
  const bid = cloneRuleBidValue({
    type: "redeye-preference",
    dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Redeye · on 2026-06-03, 2026-06-18");
});

test("serializes and deserializes pairing duration bids", () => {
  const definition: RulePropertyDefinition<{
    type: "duration";
    value: string;
    operator?: "=" | "<" | ">";
  }> = {
    propertyCode: 105,
    name: "Pairing Total Credit",
    defaultBid: {
      type: "duration",
      value: "08:00",
    },
  };

  const bid = cloneRuleBidValue({
    type: "duration",
    value: "112:30",
    operator: ">",
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: ">",
    paramA: "112:30",
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "> 112:30");
});

test("serializes and deserializes pairing duration range bids", () => {
  const definition: RulePropertyDefinition<{
    type: "duration";
    value: string;
    operator?: "=" | "<" | ">";
  }> = {
    propertyCode: 105,
    name: "Pairing Total Credit",
    defaultBid: {
      type: "duration",
      value: "08:00",
    },
  };

  const restored = deserializeRuleBid(definition, {
    operator: "Between",
    paramA: "08:00",
    paramB: "12:00",
    paramC: null,
  });

  assert.deepEqual(restored, {
    type: "duration-range",
    from: "08:00",
    to: "12:00",
  });
  assert.deepEqual(serializeRuleBid(restored), {
    operator: "Between",
    paramA: "08:00",
    paramB: "12:00",
    paramC: null,
  });
  assert.equal(formatRuleBid(restored), "Between 08:00 - 12:00");
});

test("serializes and deserializes pairing time-range-on-date bids", () => {
  const definition: RulePropertyDefinition<{
    type: "time-range-date";
    from: string;
    to: string;
    date: string;
  }> = {
    propertyCode: 139,
    name: "Report Between on Date",
    defaultBid: {
      type: "time-range-date",
      from: "18:30",
      to: "23:30",
      date: "2025-12-25",
    },
  };

  const bid = cloneRuleBidValue({
    type: "time-range-date",
    from: "08:00",
    to: "12:30",
    date: "2025-12-21",
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "Between",
    paramA: "08:00",
    paramB: "12:30",
    paramC: "2025-12-21",
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Between 08:00 - 12:30 on 2025-12-21");
});

test("serializes and deserializes unified pairing check-time bids as JSON payloads", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "pairing-check-time" }>> = {
    propertyCode: 103,
    name: "Pairing Check-In / Check-Out Time",
    defaultBid: {
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "",
      to: "",
      dateScope: null,
    },
  };

  const bid = cloneRuleBidValue({
    type: "pairing-check-time",
    timeType: "check_out",
    operator: "Between",
    from: "14:00",
    to: "22:00",
    dateScope: { mode: "specific_dates", dates: ["2026-06-15", "2026-06-21"] },
  });
  const serialized = serializeRuleBid(bid);

  assert.equal(serialized.operator, "Json");
  assert.equal(serialized.paramB, null);
  assert.equal(serialized.paramC, null);
  assert.deepEqual(JSON.parse(serialized.paramA ?? "{}"), bid);

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Check-Out Between 14:00 - 22:00 on 2026-06-15, 2026-06-21");

  const restoredLegacyDate = deserializeRuleBid(definition, {
    operator: "Json",
    paramA: JSON.stringify({
      ...bid,
      dateScope: { mode: "specific_date", date: "2026-06-18" },
    }),
    paramB: null,
    paramC: null,
  });

  assert.deepEqual(restoredLegacyDate, {
    ...bid,
    dateScope: { mode: "specific_dates", dates: ["2026-06-18"] },
  });
});

test("does not deserialize old pairing check-time rows into the unified payload", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "pairing-check-time" }>> = {
    propertyCode: 103,
    name: "Pairing Check-In / Check-Out Time",
    defaultBid: {
      type: "pairing-check-time",
      timeType: "check_in",
      operator: "Between",
      from: "",
      to: "",
      dateScope: null,
    },
  };

  assert.deepEqual(deserializeRuleBid(definition, {
    operator: "Between",
    paramA: "09:00",
    paramB: "11:30",
    paramC: null,
  }), {
    type: "pairing-check-time",
    timeType: "check_in",
    operator: "Between",
    from: "",
    to: "",
    dateScope: null,
  });

  assert.deepEqual(deserializeRuleBid(definition, {
    operator: ">",
    paramA: "13:00",
    paramB: null,
    paramC: null,
  }), {
    type: "pairing-check-time",
    timeType: "check_in",
    operator: "Between",
    from: "",
    to: "",
    dateScope: null,
  });
});

test("serializes and deserializes departing on date or day bids", () => {
  const definition: RulePropertyDefinition<{
    type: "date-or-dow-list";
    dates: string[];
    daysOfWeek: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
  }> = {
    propertyCode: 106,
    name: "Departure Date / Day",
    defaultBid: {
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: [],
    },
  };

  const bid = cloneRuleBidValue({
    type: "date-or-dow-list",
    dates: ["2026-04-03"],
    daysOfWeek: ["MON", "WED"],
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "In",
    paramA: JSON.stringify({
      dates: ["2026-04-03"],
      daysOfWeek: ["MON", "WED"],
    }),
    paramB: null,
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "2026-04-03, Mon, Wed");
});

test("serializes Work Day Preference as JSON and does not accept legacy rows", () => {
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
      { dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "10:00" },
      { dayOfWeek: "WED", checkInFrom: null, checkInTo: null },
    ],
    dateScope: { mode: "date_range", from: "2026-04-03", to: "2026-04-10" },
  };

  const serialized = serializeRuleBid(bid);
  assert.deepEqual(serialized, {
    operator: "Json",
    paramA: JSON.stringify(bid),
    paramB: null,
    paramC: null,
  });
  assert.deepEqual(deserializeRuleBid(definition, serialized), bid);
  assert.equal(formatRuleBid(bid), "Mon 06:00-10:00 · Wed · 2026-04-03 - 2026-04-10");

  assert.deepEqual(deserializeRuleBid(definition, {
    operator: "In",
    paramA: JSON.stringify({ dates: [], daysOfWeek: ["MON"] }),
    paramB: null,
    paramC: null,
  }), fallback);
});

test("deserializes departing on date ranges from the date-or-dow default", () => {
  const definition: RulePropertyDefinition<{
    type: "date-or-dow-list";
    dates: string[];
    daysOfWeek: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
  }> = {
    propertyCode: 106,
    name: "Departure Date / Day",
    defaultBid: {
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: [],
    },
  };

  assert.deepEqual(deserializeRuleBid(definition, {
    operator: "Between",
    paramA: "2026-04-01",
    paramB: "2026-04-13",
    paramC: null,
  }), {
    type: "date-range",
    from: "2026-04-01",
    to: "2026-04-13",
  });
});

test("serializes and deserializes tag-list style bids", () => {
  const definition: RulePropertyDefinition<{
    type: "tag-list-date";
    values: string[];
    date: string;
    suggestions?: string[];
  }> = {
    propertyCode: 152,
    name: "Layover at City on Date",
    defaultBid: {
      type: "tag-list-date",
      values: ["ATL"],
      date: "2025-12-24",
      suggestions: ["ATL", "YYZ", "LAX"],
    },
  };

  const bid = cloneRuleBidValue({
    type: "tag-list-date",
    values: ["YYZ", "LAX"],
    date: "2025-12-30",
    suggestions: ["ATL", "YYZ", "LAX"],
  });
  const serialized = serializeRuleBid(bid);

  assert.deepEqual(serialized, {
    operator: "In",
    paramA: "YYZ,LAX",
    paramB: "2025-12-30",
    paramC: null,
  });

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "YYZ, LAX on 2025-12-30");
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
    minimumLayoverDuration: "12:00",
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
    "Both YYZ, YTO · Date Range 2026-06-15 - 2026-06-21 · Minimum layover 12:00",
  );
});

test("serializes and deserializes Line credit window preference bids as JSON payloads", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "credit-window-preference" }>> = {
    propertyCode: 429,
    name: "Credit Window Preference",
    defaultBid: {
      type: "credit-window-preference",
      direction: "more",
    },
  };
  const bid = cloneRuleBidValue({
    type: "credit-window-preference",
    direction: "less",
  });
  const serialized = serializeRuleBid(bid);

  assert.equal(serialized.operator, "Json");
  assert.equal(serialized.paramB, null);
  assert.equal(serialized.paramC, null);
  assert.deepEqual(JSON.parse(serialized.paramA ?? "{}"), bid);

  const restored = deserializeRuleBid(definition, serialized);

  assert.deepEqual(restored, bid);
  assert.equal(formatRuleBid(restored), "Less credit");
  assert.equal(formatRuleBid({ ...restored, direction: "more" }), "More credit");
});

test("deserializes between operators into range-style bids", () => {
  const definition: RulePropertyDefinition<{
    type: "percent";
    value: string;
    operator?: "=" | "<" | ">";
  }> = {
    propertyCode: 138,
    name: "Maximum TAFB-Credit Ratio",
    defaultBid: {
      type: "percent",
      value: "25.78",
    },
  };

  const restored = deserializeRuleBid(definition, {
    operator: "Between",
    paramA: "10.00",
    paramB: "20.00",
    paramC: null,
  });

  assert.deepEqual(restored, {
    type: "percent-range",
    from: "10.00",
    to: "20.00",
  });
  assert.equal(formatRuleBid(restored), "Between 10.00% - 20.00%");
});

test("round-trips Flight Legs per Duty Between with multiple event dates", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "flight-legs-per-duty" }>> = {
    propertyCode: 107,
    name: "Flight Legs per Duty",
    defaultBid: {
      type: "flight-legs-per-duty",
      operator: "=",
      legs: 2,
      dateScope: null,
    },
  };
  const bid = {
    type: "flight-legs-per-duty" as const,
    operator: "Between" as const,
    from: 2,
    to: 4,
    dateScope: { mode: "specific_dates" as const, dates: ["2026-04-03", "2026-04-10"] },
  };

  const serialized = serializeRuleBid(bid);
  assert.equal(serialized.operator, "Json");
  assert.deepEqual(deserializeRuleBid(definition, serialized), bid);
  assert.equal(
    formatRuleBid(bid),
    "Between 2 - 4 legs per duty on 2026-04-03, 2026-04-10",
  );
});

test("normalizes legacy Flight Legs per Duty stepper columns without inventing a date scope", () => {
  const definition: RulePropertyDefinition<Extract<RuleBidValue, { type: "flight-legs-per-duty" }>> = {
    propertyCode: 107,
    name: "Flight Legs per Duty",
    defaultBid: {
      type: "flight-legs-per-duty",
      operator: "=",
      legs: 2,
      dateScope: null,
    },
  };

  assert.deepEqual(deserializeRuleBid(definition, {
    operator: ">",
    paramA: "3",
    paramB: null,
    paramC: null,
  }), {
    type: "flight-legs-per-duty",
    operator: ">",
    legs: 3,
    dateScope: null,
  });

  const invalid = deserializeRuleBid(definition, {
    operator: "=",
    paramA: "not-a-number",
    paramB: null,
    paramC: null,
  });
  assert.equal(invalid.type, "flight-legs-per-duty");
  assert.equal(invalid.operator, "=");
  assert.equal("legs" in invalid && Number.isNaN(invalid.legs), true);
});
