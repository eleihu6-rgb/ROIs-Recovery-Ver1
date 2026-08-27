import { describe, expect, it } from "vitest";
import {
  buildBidPropertySummary,
  type BidSummaryCategory,
  type BidSummaryProperty,
} from "@/features/bid/bid-property-summary";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";

const preferOffConfig: PbsPreferOffConfig = {
  weekdays: [
    { code: "MON", name: "Monday", order: 1, isoDay: 1 },
    { code: "TUE", name: "Tuesday", order: 2, isoDay: 2 },
    { code: "WED", name: "Wednesday", order: 3, isoDay: 3 },
    { code: "THU", name: "Thursday", order: 4, isoDay: 4 },
    { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
    { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
    { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
  ],
  weekend: { available: false },
};

const weekendPreferOffConfig: PbsPreferOffConfig = {
  ...preferOffConfig,
  weekend: {
    available: true,
    startDayCode: "SAT",
    startDayName: "Saturday",
    startTime: "00:00",
    endDayCode: "SUN",
    endDayName: "Sunday",
    endTime: "24:00",
  },
};

const summarize = (
  category: BidSummaryCategory,
  property: BidSummaryProperty,
  config?: PbsPreferOffConfig,
) => buildBidPropertySummary(category, property, config);

const text = (
  category: BidSummaryCategory,
  property: BidSummaryProperty,
  config?: PbsPreferOffConfig,
) => {
  const summary = summarize(category, property, config);

  if (summary.kind !== "text") {
    throw new Error(`Expected text summary for ${property.name}.`);
  }

  return summary.text;
};

describe("buildBidPropertySummary", () => {
  it("formats Efficient Flying with the company percentile and no Award prefix", () => {
    const summary = buildBidPropertySummary("pairing", {
      propertyCode: 428,
      name: "Efficient Flying First",
      action: "award",
      bid: {
        type: "efficient-flying-preference",
        mode: "inefficient",
      },
    }, undefined, { percentile: 20 });

    expect(summary).toEqual({
      kind: "text",
      text: "Inefficient flying · Bottom 20% by average daily credit",
      title: "Inefficient flying · Bottom 20% by average daily credit",
    });
  });

  it("formats the 2 current Days Off properties", () => {
    expect(text("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["2026-07-01", "2026-07-04"] },
    })).toBe("Prefer off on Jul 1, 2026, Jul 4, 2026");

    expect(text("days-off", {
      propertyCode: 204,
      name: "Long Stretch Off / Compressed Flying",
      action: "award",
      bid: {
        type: "stepper-date-range",
        value: 5,
        from: "2026-07-10",
        to: "2026-07-20",
      },
    })).toBe("Award at least 5 consecutive days off from Jul 10, 2026 to Jul 20, 2026");
  });

  it("formats existing Prefer Off ranges and weekdays with the shared config", () => {
    expect(text("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["Between 2026-06-03 - 2026-06-05"] },
    }, preferOffConfig)).toBe("Prefer off from Jun 3, 2026 to Jun 5, 2026");

    expect(text("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["Tuesday"] },
    }, preferOffConfig)).toBe("Prefer off on Tuesdays");
  });

  it("formats recurring Prefer Off weekends, multiple weekdays, and valid time windows", () => {
    expect(text("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["Weekends"] },
    }, weekendPreferOffConfig)).toBe("Prefer off on weekends");

    expect(text("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["Friday", "Tuesday", "Saturday", "Window 08:00-18:00"],
      },
    }, preferOffConfig)).toBe("Prefer off on Tuesday, Friday, Saturday from 08:00 to 18:00");
  });

  it("formats the 11 current Pairing properties", () => {
    const cases: Array<[BidSummaryProperty, string]> = [
      [{
        propertyCode: 102,
        name: "Pairing Preference",
        action: "award",
        bid: {
          type: "pairing-preference",
          pairingIds: ["98938", "99070", "99276"],
          pairingLabels: ["V4507", "V4507", "V4507"],
        },
      }, "Award pairings V4507 ×3"],
      [{
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        action: "award",
        bid: {
          type: "pairing-check-time",
          timeType: "check_in",
          operator: "Between",
          from: "05:55",
          to: "17:00",
          dateScope: null,
        },
      }, "Award pairings checking check-in between 05:55 and 17:00"],
      [{
        propertyCode: 107,
        name: "Flight Legs per Duty",
        action: "avoid",
        quantifier: "any",
        bid: {
          type: "flight-legs-per-duty",
          operator: ">",
          legs: 2,
          dateScope: null,
        },
      }, "Avoid pairings with any duty having more than 2 flying legs"],
      [{
        propertyCode: 110,
        name: "Work Day Preference",
        action: "award",
        bid: {
          type: "work-day-preference",
          days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "10:00" }],
          dateScope: null,
        },
      }, "Award pairings checking in on Monday between 06:00 and 10:00"],
      [{
        propertyCode: 112,
        name: "Pairing Length",
        action: "award",
        bid: {
          type: "pairing-length-preference",
          minDays: null,
          maxDays: 1,
          dateScope: null,
        },
      }, "Award pairings up to 1 day long"],
      [{
        propertyCode: 116,
        name: "Flight Number Preference",
        action: "award",
        bid: {
          type: "flight-number-preference",
          flightNumbers: ["I7013", "I7153"],
          dateScope: { mode: "specific_dates", dates: ["2026-06-30"] },
        },
      }, "Award pairings with flights I7013, I7153 on Jun 30, 2026"],
      [{
        propertyCode: 117,
        name: "Redeye Preference",
        action: "avoid",
        bid: { type: "redeye-preference", dateScope: null },
      }, "Avoid pairings with a redeye leg"],
      [{
        propertyCode: 122,
        name: "Deadhead Flying",
        action: "award",
        bid: {
          type: "deadhead-flying",
          mode: "any-deadhead",
          dateScope: { mode: "specific_dates", dates: ["2026-07-03"] },
        },
      }, "Award pairings with any deadhead on Jul 3, 2026"],
      [{
        propertyCode: 129,
        name: "Time Between Flights",
        action: "award",
        bid: { type: "duration", operator: ">", value: "01:30" },
      }, "Award pairings with more than 01:30 between flights"],
      [{
        propertyCode: 163,
        name: "Month-End Carryover",
        action: "avoid",
        bid: { type: "month-end-carryover", operator: ">", days: 6 },
      }, "Avoid pairings with month-end carryover greater than 6 days"],
      [{
        propertyCode: 168,
        name: "Airport Preference",
        action: "avoid",
        bid: {
          type: "airport-preference",
          event: "landing",
          locations: [
            { code: "LAX", kind: "airport" },
            { code: "MEX", kind: "airport" },
            { code: "SFO", kind: "airport" },
          ],
          dateScope: null,
        },
      }, "Avoid pairings landing at LAX, MEX, SFO"],
    ];

    for (const [property, expected] of cases) {
      expect(text("pairing", property)).toBe(expected);
    }
  });

  it("formats Work Day Preference with optional check-in windows", () => {
    expect(text("pairing", {
      propertyCode: 110,
      name: "Work Day Preference",
      action: "award",
      bid: {
        type: "work-day-preference",
        days: [
          { dayOfWeek: "MON", checkInFrom: null, checkInTo: null },
          { dayOfWeek: "WED", checkInFrom: "06:00", checkInTo: null },
          { dayOfWeek: "FRI", checkInFrom: null, checkInTo: "10:00" },
        ],
        dateScope: null,
      },
    })).toBe("Award pairings checking in on Monday; Wednesday at or after 06:00; Friday at or before 10:00");

    expect(text("pairing", {
      propertyCode: 110,
      name: "Work Day Preference",
      action: "award",
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "MON", checkInFrom: "06:00", checkInTo: "06:00" }],
        dateScope: null,
      },
    })).toBe("Work Day Preference needs review");
  });

  it("formats the 6 current Roster / Line properties", () => {
    const cases: Array<[BidSummaryProperty, string]> = [
      [{
        propertyCode: 407,
        name: "Minimum Base Layover",
        bid: { type: "minimum-base-layover", minimumDuration: "10:00" },
      }, "At least 10:00 base layover"],
      [{
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: {
          type: "days-off-on-pattern",
          minDaysOff: 2,
          minDaysOn: 3,
          maxDaysOn: 5,
        },
      }, "Work 3–5 days, then 2 days off"],
      [{
        propertyCode: 410,
        name: "Mixed Block Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [
            {
              workType: "reserve",
              callType: "CRAM",
              dateScope: { mode: "first_half" },
            },
            {
              workType: "flying",
              dateScope: { mode: "second_half" },
            },
          ],
          callTypeOptions: ["CRAM"],
          strength: "normal",
        },
      }, "Reserve CRAM for the first half; flying for the second half"],
      [{
        propertyCode: 427,
        name: "Reserve",
        action: "award",
        bid: { type: "flag" },
      }, "Reserve only for the whole bid month"],
      [{
        propertyCode: 427,
        name: "Reserve",
        action: "avoid",
        bid: { type: "flag" },
      }, "Pairing only for the whole bid month"],
      [{
        propertyCode: 428,
        name: "Efficient Flying First",
        action: "award",
        bid: { type: "flag" },
      }, "Award Efficient Flying First"],
      [{
        propertyCode: 429,
        name: "Credit Window Preference",
        bid: {
          type: "credit-window-preference",
          direction: "more",
        },
      }, "More credit"],
    ];

    for (const [property, expected] of cases) {
      expect(text("line", property)).toBe(expected);
    }
  });

  it("compacts 15 Prefer Off dates and preserves the selected-item count", () => {
    const values = Array.from(
      { length: 15 },
      (_, index) => `2026-07-${String(index + 1).padStart(2, "0")}`,
    );
    const summary = summarize("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values },
    });

    expect(summary).toMatchObject({
      kind: "selection-list",
      headline: "Prefer off on 15 selected dates",
      totalItemCount: 15,
      collapsedValueLimit: 3,
    });
  });

  it("does not expose Pairing IDs when labels are incomplete", () => {
    const summary = text("pairing", {
      propertyCode: 102,
      name: "Pairing Preference",
      action: "award",
      bid: {
        type: "pairing-preference",
        pairingIds: ["501001", "501002"],
        pairingLabels: ["V4507"],
      },
    });

    expect(summary).toBe("Pairing Preference needs review");
    expect(summary).not.toContain("501001");
  });

  it("uses explicit review fallbacks for invalid dates and ranges", () => {
    expect(text("days-off", {
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["2026-02-30"] },
    })).toBe("Prefer Off needs review");

    expect(text("pairing", {
      propertyCode: 116,
      name: "Flight Number Preference",
      action: "award",
      bid: {
        type: "flight-number-preference",
        flightNumbers: ["I7013"],
        dateScope: {
          mode: "date_range",
          from: "2026-07-10",
          to: "2026-07-01",
        },
      },
    })).toBe("Flight Number Preference needs review");
  });
});
