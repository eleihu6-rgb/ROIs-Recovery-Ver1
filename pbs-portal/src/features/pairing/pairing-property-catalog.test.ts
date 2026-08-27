import { describe, expect, it } from "vitest";
import { buildPbsPairingConditionSignature } from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingRulePropertyInput } from "../../../../packages/contracts/pbs-pairing-bids.js";
import {
  clonePairingBidValue,
  getPairingPropertyDefinitionByCode,
} from "@/features/pairing/pairing-property-catalog";

describe("pairing property catalog", () => {
  it("defines Work Day Preference as award-only weekday check-in windows", () => {
    const definition = getPairingPropertyDefinitionByCode(110);

    expect(definition?.defaultBid).toEqual({
      type: "work-day-preference",
      days: [],
      dateScope: null,
    });
    expect(definition?.supportedActions).toEqual(["award"]);
    expect(definition?.supportedOperators).toBeUndefined();
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Flight Legs per Duty with Between, numeric bounds, and a dedicated bid", () => {
    const definition = getPairingPropertyDefinitionByCode(107);

    expect(definition?.defaultBid).toEqual({
      type: "flight-legs-per-duty",
      operator: "=",
      legs: 2,
      dateScope: null,
    });
    expect(definition?.numericBounds).toEqual({ min: 1, max: 8 });
    expect(definition?.supportedOperators).toEqual(["=", "<", ">", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
  });

  it("defines Any/Every Duty Duration as a duration bid with a default compare operator", () => {
    const definition = getPairingPropertyDefinitionByCode(118);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Duty Duration");
    expect(definition?.defaultBid).toEqual({
      type: "duration",
      value: "11:30",
      operator: ">",
    });
    expect(definition?.supportedOperators).toEqual(["<", ">", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
  });

  it("defines Any/Every Layover Duration as a duration bid with a default compare operator", () => {
    const definition = getPairingPropertyDefinitionByCode(119);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Layover Duration");
    expect(definition?.defaultBid).toEqual({
      type: "duration",
      value: "15:00",
      operator: ">",
    });
    expect(definition?.supportedOperators).toEqual(["<", ">"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
  });

  it("defines Time Between Flights as an any/every duration condition", () => {
    const definition = getPairingPropertyDefinitionByCode(129);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Time Between Flights");
    expect(definition?.defaultBid).toEqual({
      type: "duration",
      value: "",
      operator: ">",
    });
    expect(definition?.supportedOperators).toEqual(["<", "=", ">"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
    expect(definition?.defaultQuantifier).toBe("any");
  });

  it("defines Average Daily Block Time as a duration bid with compare-only operators", () => {
    const definition = getPairingPropertyDefinitionByCode(121);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Average Daily Block Time");
    expect(definition?.defaultBid).toEqual({
      type: "duration",
      value: "06:00",
      operator: ">",
    });
    expect(definition?.supportedOperators).toEqual(["<", ">"]);
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Pairing Total Block Time as an award-only duration bid with between support", () => {
    const definition = getPairingPropertyDefinitionByCode(127);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Pairing Total Block Time");
    expect(definition?.defaultBid).toEqual({
      type: "duration",
      value: "06:00",
      operator: ">",
    });
    expect(definition?.supportedActions).toEqual(["award"]);
    expect(definition?.supportedOperators).toEqual([">", "Between"]);
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Credit Per Time Away From Base as a percent-or-duration bid with compare-only operators", () => {
    const definition = getPairingPropertyDefinitionByCode(125);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Credit Per Time Away From Base");
    expect(definition?.defaultBid).toEqual({
      type: "percent-or-duration",
      unit: "percent",
      value: "75",
      operator: ">",
    });
    expect(definition?.supportedOperators).toEqual([">", "<"]);
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Any/Every Enroute Check-In Time with any/every quantifiers", () => {
    const definition = getPairingPropertyDefinitionByCode(114);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Enroute Check-In Time");
    expect(definition?.defaultBid).toEqual({
      type: "time",
      value: "16:30",
    });
    expect(definition?.supportedOperators).toEqual(["=", "<", ">", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
    expect(definition?.defaultQuantifier).toBe("any");
  });

  it("defines Any/Every Enroute Check-Out Time with any/every quantifiers", () => {
    const definition = getPairingPropertyDefinitionByCode(126);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Enroute Check-Out Time");
    expect(definition?.defaultBid).toEqual({
      type: "time",
      value: "22:30",
      operator: "<",
    });
    expect(definition?.supportedOperators).toEqual(["<", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
    expect(definition?.defaultQuantifier).toBe("any");
  });

  it("defines Any/Every Enroute Check-In Date / Day as a date-or-day bid", () => {
    const definition = getPairingPropertyDefinitionByCode(166);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Enroute Check-In Date / Day");
    expect(definition?.defaultBid).toEqual({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: [],
    });
    expect(definition?.supportedOperators).toEqual(["In", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
    expect(definition?.defaultQuantifier).toBe("any");
  });

  it("defines Any/Every Enroute Check-Out Date / Day as a date-or-day bid", () => {
    const definition = getPairingPropertyDefinitionByCode(167);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Enroute Check-Out Date / Day");
    expect(definition?.defaultBid).toEqual({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: [],
    });
    expect(definition?.supportedOperators).toEqual(["In", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
    expect(definition?.defaultQuantifier).toBe("any");
  });

  it("defines Any/Every Layover On Date / Day as a date-or-day bid", () => {
    const definition = getPairingPropertyDefinitionByCode(123);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Any/Every Layover On Date / Day");
    expect(definition?.defaultBid).toEqual({
      type: "date-or-dow-list",
      dates: [],
      daysOfWeek: [],
    });
    expect(definition?.supportedOperators).toEqual(["In", "Between"]);
    expect(definition?.supportedQuantifiers).toEqual(["any", "every"]);
  });

  it("defines Airport Preference as an award/avoid compound airport bid", () => {
    const definition = getPairingPropertyDefinitionByCode(168);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Airport Preference");
    expect(definition?.defaultBid).toEqual({
      type: "airport-preference",
      event: "landing",
      locations: [],
      dateScope: null,
      minimumLayoverDuration: null,
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedOperators).toBeUndefined();
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Work Start Station as an award/avoid station tag-list bid", () => {
    const definition = getPairingPropertyDefinitionByCode(165);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Work Start Station");
    expect(definition?.defaultBid).toEqual({
      type: "tag-list",
      values: [],
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedOperators).toEqual(["In"]);
  });

  it("defines Pairing Length as a dedicated length preference without technical operators", () => {
    const definition = getPairingPropertyDefinitionByCode(112);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Pairing Length");
    expect(definition?.defaultBid).toEqual({
      type: "pairing-length-preference",
      minDays: null,
      maxDays: null,
      dateScope: null,
      min: 1,
      max: 7,
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedOperators).toBeUndefined();
  });

  it("normalizes Pairing Length specific dates for stable signatures and deep clones them", () => {
    const buildProperty = (dates: string[]): PbsPairingRulePropertyInput => ({
      propertyCode: 112,
      name: "Pairing Length",
      action: "award",
      quantifier: null,
      bid: {
        type: "pairing-length-preference",
        minDays: 1,
        maxDays: 3,
        dateScope: { mode: "specific_dates", dates },
        min: 1,
        max: 7,
      },
      tiers: ["T1"],
    });
    const first = buildProperty(["2026-06-18", "2026-06-03", "2026-06-03"]);
    const reordered = buildProperty(["2026-06-03", "2026-06-18"]);
    const different = buildProperty(["2026-06-03", "2026-06-19"]);

    expect(buildPbsPairingConditionSignature(first)).toBe(buildPbsPairingConditionSignature(reordered));
    expect(buildPbsPairingConditionSignature(first)).not.toBe(buildPbsPairingConditionSignature(different));

    const cloned = clonePairingBidValue(first.bid);
    if (cloned.type !== "pairing-length-preference" || cloned.dateScope?.mode !== "specific_dates") {
      throw new Error("Expected Pairing Length specific dates clone.");
    }
    cloned.dateScope.dates.push("2026-06-20");

    if (first.bid.type !== "pairing-length-preference" || first.bid.dateScope?.mode !== "specific_dates") {
      throw new Error("Expected source Pairing Length specific dates.");
    }
    expect(first.bid.dateScope.dates).toEqual(["2026-06-18", "2026-06-03", "2026-06-03"]);
  });

  it("defines Flight Number Preference without a legacy Any quantifier", () => {
    const definition = getPairingPropertyDefinitionByCode(116);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Flight Number Preference");
    expect(definition?.defaultBid).toEqual({
      type: "flight-number-preference",
      flightNumbers: [],
      dateScope: null,
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Redeye Preference with the dedicated date-scope bid", () => {
    const definition = getPairingPropertyDefinitionByCode(117);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Redeye Preference");
    expect(definition?.defaultAction).toBe("avoid");
    expect(definition?.defaultBid).toEqual({
      type: "redeye-preference",
      dateScope: null,
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Deadhead Flying with the dedicated mode bid", () => {
    const definition = getPairingPropertyDefinitionByCode(122);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Deadhead Flying");
    expect(definition?.defaultAction).toBe("award");
    expect(definition?.defaultBid).toEqual({
      type: "deadhead-flying",
      mode: "any-deadhead",
      dateScope: null,
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedOperators).toBeUndefined();
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

  it("defines Month-End Carryover with the dedicated comparison bid", () => {
    const definition = getPairingPropertyDefinitionByCode(163);

    expect(definition).not.toBeNull();
    expect(definition?.name).toBe("Month-End Carryover");
    expect(definition?.defaultAction).toBe("award");
    expect(definition?.defaultBid).toEqual({
      type: "month-end-carryover",
      operator: ">",
      days: null,
    });
    expect(definition?.supportedActions).toEqual(["award", "avoid"]);
    expect(definition?.supportedOperators).toEqual(["<", "=", ">", "Between"]);
    expect(definition?.supportedQuantifiers).toBeUndefined();
  });

});
