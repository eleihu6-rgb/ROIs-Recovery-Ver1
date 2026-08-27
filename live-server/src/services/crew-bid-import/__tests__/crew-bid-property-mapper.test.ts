import { describe, expect, it } from "vitest";

import { normalizePbsPairingBidValueForRules } from "../../../../../packages/contracts/pbs-pairing-bids.js";
import { parsePreferOffBidValues } from "../../../../../packages/contracts/pbs-prefer-off.js";
import { mapCrewBidPreference } from "../crew-bid-property-mapper.js";
import type { ParsedCrewBidBlock, ParsedCrewBidPreference } from "../types.js";

const block: ParsedCrewBidBlock = {
  sourceStartLine: 1,
  seniority: 13,
  category: "YEG-737-CA",
  crewId: "383",
  bidContext: "Current",
  preferences: [],
};

const preference = (rawText: string): ParsedCrewBidPreference => ({
  sourceLineNumber: 1,
  sourceSeq: 1,
  rawText,
  groupIndex: 1,
});

const mappedPreferOffParamA = (rawText: string): string | null => {
  const result = mapCrewBidPreference(block, preference(rawText), "Mar 2026", "2026-03-01", "2026-03-31");
  expect(result.status).toBe("importable");

  if (result.status !== "importable") {
    throw new Error("Expected importable preference");
  }

  expect(result.preference.warnings.map((warning) => warning.code)).not.toContain("invalid_mapped_date");
  return result.preference.paramA;
};

const mappedPreference = (rawText: string) => {
  const result = mapCrewBidPreference(block, preference(rawText), "Mar 2026", "2026-03-01", "2026-03-31");
  expect(result.status).toBe("importable");

  if (result.status !== "importable") {
    throw new Error("Expected importable preference");
  }

  return result.preference;
};

describe("mapCrewBidPreference Prefer Off date parsing", () => {
  it("maps dates against a cross-month Live roster period without parsing the period label", () => {
    const result = mapCrewBidPreference(
      block,
      preference("Prefer Off Jan 31, Feb 15, Mar 1"),
      "RP 2026-02",
      "2026-01-31",
      "2026-03-01",
    );

    expect(result.status).toBe("importable");
    if (result.status === "importable") {
      expect(result.preference.paramA).toBe("2026-01-31,2026-02-15,2026-03-01");
    }
  });

  it("maps comma-separated legacy dates with years", () => {
    expect(mappedPreferOffParamA("Prefer Off Mar 16, 2026, Mar 31, 2026")).toBe(
      "2026-03-16,2026-03-31",
    );
  });

  it("maps legacy date ranges to the same tag-list format saved by Days Off", () => {
    const result = mapCrewBidPreference(block, preference("Prefer Off Mar 7, 2026 - Mar 9, 2026"), "Mar 2026", "2026-03-01", "2026-03-31");
    expect(result.status).toBe("importable");

    if (result.status !== "importable") {
      throw new Error("Expected importable preference");
    }

    expect(result.preference.operator).toBe("In");
    expect(result.preference.paramA).toBe("Between 2026-03-07 - 2026-03-09");
    expect(result.preference.paramB).toBeNull();
    expect(result.preference.warnings.map((warning) => warning.code)).not.toContain("invalid_mapped_date");
  });

  it("maps day-of-week Prefer Off values to Portal labels", () => {
    expect(mappedPreferOffParamA("Prefer Off Friday, Saturday, Sunday")).toBe(
      "Friday,Saturday,Sunday",
    );
  });

  it("maps weekends with minimum count and all-or-nothing", () => {
    const mapped = mappedPreference("Prefer Off Weekends Minimum 4 All or Nothing");

    expect(mapped.bidType).toBe("DaysOff");
    expect(mapped.propertyCode).toBe(201);
    expect(mapped.minimumN).toBe(4);
    expect(mapped.allOrNothing).toBe(1);
    expect(mapped.paramA).toBe("Weekends");
  });
});

describe("mapCrewBidPreference existing property unsupported aliases", () => {
  it("preserves source dates and rejects off-period or reversed ranges", () => {
    const offPeriod = mapCrewBidPreference(
      block,
      preference("Prefer Off Mar 6, 2026"),
      "Jul 2026",
      "2026-07-01",
      "2026-07-31",
    );
    const reversed = mapCrewBidPreference(
      block,
      preference("Prefer Off Mar 9, 2026 - Mar 7, 2026"),
      "Mar 2026",
      "2026-03-01",
      "2026-03-31",
    );

    expect(offPeriod.status).toBe("failed");
    expect(reversed.status).toBe("failed");
    if (offPeriod.status === "failed") expect(offPeriod.issues[0]?.code).toBe("invalid_source_date");
    if (reversed.status === "failed") expect(reversed.issues[0]?.code).toBe("reversed_date_range");
  });

  it("maps current Pairing Preference references for stable-ID resolution", () => {
    const mapped = mappedPreference("Award Pairings If Pairing Number C4112, C4117 Check-In Date Mar 7, 2026");

    expect(mapped.propertyCode).toBe(102);
    expect(mapped.operator).toBe("Json");
    expect(mapped.pairingReferences).toEqual([
      { pairingNumber: "C4112" },
      {
        pairingNumber: "C4117",
        sourceOriginDate: "Mar 7, 2026",
        targetOriginDate: "2026-03-07",
      },
    ]);
  });

  it("serializes current check time, legs, length, flight number, and credit-window payloads", () => {
    const checkTime = mappedPreference("Award Pairings If Pairing Check-In Time Between 05:55 And 17:00");
    const legs = mappedPreference("Avoid Pairings If Any Duty Legs > 3 legs");
    const length = mappedPreference("Award Pairings If Pairing Length < 4 days");
    const flightNumber = mappedPreference("Award Pairings If Any Flight Number 0604, 0605");
    const creditWindow = mappedPreference("Set Condition Minimum Credit Window");
    const commuter = mappedPreference("Set Condition Pattern Between 3 and 5 Days On, with 2 Days Off");

    expect(JSON.parse(checkTime.paramA ?? "{}")).toMatchObject({ type: "pairing-check-time", timeType: "check_in", operator: "Between" });
    expect(JSON.parse(legs.paramA ?? "{}")).toEqual({ type: "flight-legs-per-duty", operator: ">", legs: 3, dateScope: null });
    expect(JSON.parse(length.paramA ?? "{}")).toEqual({ type: "pairing-length-preference", minDays: null, maxDays: 3, dateScope: null });
    expect(JSON.parse(flightNumber.paramA ?? "{}")).toEqual({ type: "flight-number-preference", flightNumbers: ["0604", "0605"], dateScope: null });
    expect(creditWindow.propertyCode).toBe(429);
    expect(JSON.parse(creditWindow.paramA ?? "{}")).toEqual({
      type: "credit-window-preference",
      direction: "less",
    });
    expect(commuter).toMatchObject({ bidType: "Line", propertyCode: 408, operator: "Json", paramB: null, paramC: null });
    expect(JSON.parse(commuter.paramA ?? "{}")).toEqual({
      type: "days-off-on-pattern",
      minDaysOff: 2,
      minDaysOn: 3,
      maxDaysOn: 5,
      dateRange: null,
    });
  });

  it("maps Prefer Off time windows to the same tag-list values saved by the Portal", () => {
    const specificDates = mappedPreferOffParamA("Prefer Off Mar 7, 2026 Between 05:00 And 12:00");
    expect(specificDates).toBe(
      "2026-03-07,Window 05:00-12:00",
    );
    expect(mappedPreferOffParamA(
      "Prefer Off Between Mar 7, 2026 And Mar 9, 2026 Between 08:00 And 18:00",
    )).toBe(
      "Between 2026-03-07 - 2026-03-09,Window 08:00-18:00",
    );
    expect(mappedPreferOffParamA("Prefer Off Weekends Between 08:00 And 18:00")).toBe(
      "Weekends,Window 08:00-18:00",
    );
    expect(parsePreferOffBidValues(specificDates?.split(",") ?? [])).toMatchObject({
      mode: "specific_dates",
      specificDates: ["2026-03-07"],
      timeWindow: { from: "05:00", to: "12:00" },
      isTimeWindowValid: true,
      invalidValues: [],
    });
  });

  it.each([
    ["Prefer Off Mar 7, 2026 Between 25:00 And 26:00", "invalid_prefer_off_time_window"],
    ["Prefer Off Mar 7, 2026 Between 12:00 And 12:00", "invalid_prefer_off_time_window"],
    ["Prefer Off Mar 7, 2026 Between 23:00 And 02:00", "invalid_prefer_off_time_window"],
  ])("rejects invalid Prefer Off time windows: %s", (rawText, expectedCode) => {
    const result = mapCrewBidPreference(block, preference(rawText), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.issues[0]?.code).toBe(expectedCode);
  });

  it("blocks hidden enroute check-in and check-out criteria", () => {
    const checkIn = mapCrewBidPreference(block, preference("Avoid Pairings If Any Enroute Check-In Time > 14:00"), "Mar 2026", "2026-03-01", "2026-03-31");
    const checkOut = mapCrewBidPreference(block, preference("Avoid Pairings If Any Enroute Check-Out Time < 10:00"), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(checkIn.status).toBe("failed");
    expect(checkOut.status).toBe("failed");
    if (checkIn.status === "failed") expect(checkIn.issues[0]?.code).toBe("hidden_current_catalog");
    if (checkOut.status === "failed") expect(checkOut.issues[0]?.code).toBe("hidden_current_catalog");
  });

  it("blocks hidden Any Duty On Time", () => {
    const result = mapCrewBidPreference(block, preference("Award Pairings If Any Duty On Time Between 00:00 And 17:59"), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.issues[0]?.code).toBe("hidden_current_catalog");
  });

  it("maps Award Any Duty On dates to all-day Work Day Preference windows", () => {
    const dates = mappedPreference(
      "Award Pairings If Any Duty On Mar 2, 2026, Mar 4, 2026, Mar 9, 2026",
    );
    const range = mappedPreference(
      "Award Pairings If Any Duty On Between Mar 2, 2026 And Mar 4, 2026",
    );
    const weekdays = mappedPreference(
      "Award Pairings If Any Duty On Monday, Wednesday",
    );

    expect(dates.propertyCode).toBe(110);
    expect(dates.actionId).toBe(1);
    const datesBid = JSON.parse(dates.paramA ?? "{}");
    expect(datesBid).toEqual({
      type: "work-day-preference",
      days: [
        { dayOfWeek: "MON", checkInFrom: "00:00", checkInTo: "23:59" },
        { dayOfWeek: "WED", checkInFrom: "00:00", checkInTo: "23:59" },
      ],
      dateScope: {
        mode: "specific_dates",
        dates: ["2026-03-02", "2026-03-04", "2026-03-09"],
      },
    });
    expect(normalizePbsPairingBidValueForRules(datesBid)).toEqual(datesBid);
    expect(JSON.parse(range.paramA ?? "{}")).toEqual({
      type: "work-day-preference",
      days: [
        { dayOfWeek: "MON", checkInFrom: "00:00", checkInTo: "23:59" },
        { dayOfWeek: "TUE", checkInFrom: "00:00", checkInTo: "23:59" },
        { dayOfWeek: "WED", checkInFrom: "00:00", checkInTo: "23:59" },
      ],
      dateScope: {
        mode: "date_range",
        from: "2026-03-02",
        to: "2026-03-04",
      },
    });
    expect(JSON.parse(weekdays.paramA ?? "{}")).toEqual({
      type: "work-day-preference",
      days: [
        { dayOfWeek: "MON", checkInFrom: "00:00", checkInTo: "23:59" },
        { dayOfWeek: "WED", checkInFrom: "00:00", checkInTo: "23:59" },
      ],
      dateScope: null,
    });
  });

  it.each([
    "Award Pairings If Every Duty On Monday, Wednesday",
    "Avoid Pairings If Any Duty On Monday, Wednesday",
  ])("keeps unsupported Duty On semantics blocked: %s", (rawText) => {
    const result = mapCrewBidPreference(
      block,
      preference(rawText),
      "Mar 2026",
      "2026-03-01",
      "2026-03-31",
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.issues[0]?.code).toMatch(/unsupported_.*duty_on/);
    }
  });

  it("blocks hidden Departing On conditions", () => {
    const result = mapCrewBidPreference(
      block,
      preference("Award Pairings If Departing On Between 06:00 And 06:45 If Any Landing In PVR"),
      "Mar 2026",
      "2026-03-01",
      "2026-03-31",
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.issues.map((issue) => issue.code)).toContain("hidden_current_catalog");
    }
  });

  it("blocks hidden Work Start Station and drops it when it is a secondary clause", () => {
    const standalone = mapCrewBidPreference(block, preference("Avoid Pairings If Work Start Station YVR, YYZ"), "Mar 2026", "2026-03-01", "2026-03-31");
    const combined = mappedPreference("Award Pairings If Any Landing In GDL, LAX If Work Start Station YVR");

    expect(standalone.status).toBe("failed");
    expect(combined.propertyCode).toBe(168);
    expect(JSON.parse(combined.paramA ?? "{}")).toMatchObject({
      type: "airport-preference",
      event: "landing",
      locations: [{ code: "GDL", kind: "airport" }, { code: "LAX", kind: "airport" }],
    });
    expect(combined.conditions).toHaveLength(0);
    expect(combined.warnings.map((warning) => warning.code)).toContain("secondary_pairing_clause_dropped");
  });

  it("blocks hidden Days Off Opposite Employee set conditions", () => {
    const result = mapCrewBidPreference(block, preference("Set Condition Days Off Opposite Employee 762 Minimum 8"), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.issues[0]?.code).toBe("hidden_current_catalog");
  });

  it.each([
    "Set Condition Maximum Days On In A Row 5",
    "Set Condition Minimum Days Off In A Row 2",
    "Set Condition No Same Day Pairings",
    "Clear Schedule and Start Next Bid Group",
    "Waive No Same Day Duty Starts",
    "Forget Line 3",
  ])("blocks hidden current-catalog condition: %s", (rawText) => {
    const result = mapCrewBidPreference(block, preference(rawText), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.issues.map((issue) => issue.code)).toContain("hidden_current_catalog");
    }
  });

  it("maps explicit Efficient Flying source text to the canonical Pairing preference", () => {
    const mapped = mappedPreference("Set Condition Most Flying Hours In Least Flying Days");
    const workingDaysMapped = mappedPreference("Set Condition Most Flying In Least Working Days");
    const inefficient = mappedPreference("Award Pairings If Inefficient Flying");

    expect(mapped.bidType).toBe("Pairing");
    expect(mapped.propertyCode).toBe(428);
    expect(mapped.actionId).toBe(1);
    expect(mapped.operator).toBe("Json");
    expect(JSON.parse(mapped.paramA ?? "{}")).toEqual({
      type: "efficient-flying-preference",
      mode: "efficient",
    });
    expect(mapped.warnings.map((warning) => warning.code)).toContain("efficient_flying_legacy_normalized");
    expect(workingDaysMapped.bidType).toBe("Pairing");
    expect(workingDaysMapped.propertyCode).toBe(428);
    expect(JSON.parse(inefficient.paramA ?? "{}")).toEqual({
      type: "efficient-flying-preference",
      mode: "inefficient",
    });
  });

  it.each([
    ["Award Reserve", 1],
    ["Avoid Reserve", 2],
    ["Reserve Avoidance No Matter What", 2],
  ] as const)("maps %s to canonical Line Reserve", (rawText, actionId) => {
    const mapped = mappedPreference(rawText);

    expect(mapped.bidType).toBe("Line");
    expect(mapped.propertyCode).toBe(427);
    expect(mapped.actionId).toBe(actionId);
    expect(mapped.operator).toBeNull();
    expect(mapped.paramA).toBeNull();
    expect(mapped.paramB).toBeNull();
    expect(mapped.paramC).toBeNull();
  });

  it("skips Reserve Avoidance If Possible instead of writing noncanonical Line Reserve data", () => {
    const result = mapCrewBidPreference(
      block,
      preference("Reserve Avoidance If Possible"),
      "Mar 2026",
      "2026-03-01",
      "2026-03-31",
    );

    expect(result.status).toBe("skipped");
    if (result.status === "skipped") {
      expect(result.issues).toMatchObject([
        {
          severity: "warning",
          code: "reserve_avoidance_if_possible_unsupported",
        },
      ]);
    }
  });

  it.each([
    "Avoid Pairings If Efficient Flying First",
    "Avoid Efficient Flying First",
    "Efficient Flying First",
  ])("rejects ambiguous Efficient Flying direction: %s", (rawText) => {
    const result = mapCrewBidPreference(block, preference(rawText), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.issues[0]?.code).toBe("efficient_flying_mode_ambiguous");
    }
  });

  it("blocks hidden layover duration and layover date-or-day criteria", () => {
    const duration = mapCrewBidPreference(block, preference("Avoid Pairings If Any Layover Of Duration > 009:00"), "Mar 2026", "2026-03-01", "2026-03-31");
    const layoverOn = mapCrewBidPreference(block, preference("Avoid Pairings If Any Layover On Sunday, Monday"), "Mar 2026", "2026-03-01", "2026-03-31");

    expect(duration.status).toBe("failed");
    expect(layoverOn.status).toBe("failed");
    if (duration.status === "failed") expect(duration.issues[0]?.code).toBe("hidden_current_catalog");
    if (layoverOn.status === "failed") expect(layoverOn.issues[0]?.code).toBe("hidden_current_catalog");
  });

  it("maps the primary layover airport and records the dropped duration clause", () => {
    const mapped = mappedPreference("Avoid Pairings If Any Layover In CUN And Of Duration > 015:00");

    expect(mapped.propertyCode).toBe(168);
    expect(mapped.operator).toBe("Json");
    expect(JSON.parse(mapped.paramA ?? "{}")).toMatchObject({
      type: "airport-preference",
      event: "layover",
      locations: [{ code: "CUN", kind: "airport" }],
    });
    expect(mapped.conditions).toHaveLength(0);
    expect(mapped.warnings.map((warning) => warning.code)).toContain("secondary_pairing_clause_dropped");
  });

  it("uses the current Redeye payload and blocks unsupported Counting Deadhead semantics", () => {
    const redeye = mappedPreference("Avoid Pairings If Any Leg Is Redeye");
    const countingDeadhead = mapCrewBidPreference(
      block,
      preference("Avoid Pairings If Any Leg Is Redeye (Counting Deadhead Legs)"),
      "Mar 2026",
      "2026-03-01",
      "2026-03-31",
    );

    expect(redeye.propertyCode).toBe(117);
    expect(redeye.operator).toBe("Json");
    expect(JSON.parse(redeye.paramA ?? "{}")).toEqual({ type: "redeye-preference", dateScope: null });
    expect(countingDeadhead.status).toBe("failed");
  });

  it("blocks hidden Reserve Day On", () => {
    const result = mapCrewBidPreference(
      block,
      preference("Award Reserve Day On Mar 5, 2026 Else Start Next Bid Group All or Nothing"),
      "Mar 2026",
      "2026-03-01",
      "2026-03-31",
    );

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.issues.map((issue) => issue.code)).toContain("hidden_current_catalog");
    }
  });

  it("maps legacy Deadhead Day to the current Deadhead Flying payload", () => {
    const mapped = mappedPreference("Avoid Pairings If Deadhead Day");

    expect(mapped.propertyCode).toBe(122);
    expect(mapped.operator).toBe("Json");
    expect(JSON.parse(mapped.paramA ?? "{}")).toEqual({
      type: "deadhead-flying",
      mode: "deadhead-only-duty",
      dateScope: null,
    });
  });
});
