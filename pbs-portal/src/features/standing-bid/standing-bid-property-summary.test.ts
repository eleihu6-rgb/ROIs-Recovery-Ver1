import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";
import { buildStandingBidPropertySummary } from "@/features/standing-bid/standing-bid-property-summary";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";

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

const property = (
  input: Partial<RuleBidExistingProperty> & Pick<RuleBidExistingProperty, "bid" | "propertyCode">,
): RuleBidExistingProperty => ({
  id: `property-${input.propertyCode}`,
  name: "Property",
  tiers: [],
  allOrNothing: false,
  minimumN: null,
  ...input,
});

const text = (
  input: Partial<RuleBidExistingProperty> & Pick<RuleBidExistingProperty, "bid" | "propertyCode">,
  efficientFlyingConfig?: { percentile: number },
) => {
  const summary = buildStandingBidPropertySummary(
    property(input),
    preferOffConfig,
    efficientFlyingConfig,
  );

  return summary.kind === "text" ? summary.text : summary.headline;
};

describe("buildStandingBidPropertySummary", () => {
  it("reuses Current Bid summaries for shared Days Off, Pairing, and Roster properties", () => {
    expect(text({
      propertyCode: 201,
      name: "Prefer Off",
      categoryLabel: "Days Off",
      bid: { type: "tag-list", values: ["Friday", "Tuesday", "Saturday"] },
    })).toBe("Prefer off on Tuesday, Friday, Saturday");

    expect(text({
      propertyCode: 428,
      name: "Efficient Flying First",
      categoryLabel: "Pairing",
      action: "award",
      bid: { type: "efficient-flying-preference", mode: "efficient" },
    }, { percentile: 20 })).toBe("Efficient flying · Top 20% by average daily credit");

    expect(text({
      propertyCode: 410,
      name: "Mixed Block Pattern",
      categoryLabel: "Roster",
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
    })).toBe("Reserve CRAM for the first half; flying for the second half");
  });

  it("reuses Current Pairing Work Day optional-window summary for Standing", () => {
    expect(text({
      propertyCode: 110,
      name: "Work Day Preference",
      categoryLabel: "Pairing",
      action: "award",
      bid: {
        type: "work-day-preference",
        days: [{ dayOfWeek: "THU", checkInFrom: null, checkInTo: null }],
        dateScope: null,
      },
    })).toBe("Award pairings checking in on Thursday");
  });

  it("formats reusable Long Stretch Off without a concrete date range", () => {
    expect(text({
      propertyCode: 204,
      name: "Long Stretch Off / Compressed Flying",
      categoryLabel: "Days Off",
      bid: {
        type: "stepper-date-range",
        value: 8,
        from: "",
        to: "",
      },
    })).toBe("Award at least 8 consecutive days off");
  });

  it("keeps the existing Efficient Flying unavailable fallback", () => {
    expect(text({
      propertyCode: 428,
      name: "Efficient Flying First",
      categoryLabel: "Pairing",
      action: "award",
      bid: { type: "efficient-flying-preference", mode: "efficient" },
    })).toBe("Efficient flying configuration is unavailable.");
  });

  it("formats Standing-only Days Off and Reserve properties semantically", () => {
    expect(text({
      propertyCode: 218,
      name: "Day of Week Off",
      categoryLabel: "Days Off",
      bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SAT", "TUE"] },
    })).toBe("Day off on Tuesday, Saturday");

    expect(text({
      propertyCode: 312,
      name: "Reserve Day of Week Off",
      categoryLabel: "Reserve",
      bid: { type: "date-or-dow-list", dates: [], daysOfWeek: ["SUN"] },
    })).toBe("Reserve day off on Sundays");

    expect(text({
      propertyCode: 313,
      name: "Reserve Work Block Size",
      categoryLabel: "Reserve",
      bid: { type: "stepper-range", from: 3, to: 5, min: 3, max: 6 },
    })).toBe("Reserve work blocks of 3–5 days");

    expect(text({
      propertyCode: 314,
      name: "Waive to Allow Carry over to be Days Off",
      categoryLabel: "Reserve",
      bid: { type: "flag" },
    })).toBe("Waive to allow carryover to be days off");
  });

  it.each([
    [{ mode: "whole_month" }, "PRAM on Whole Month"],
    [{ mode: "first_half" }, "PRAM on First Half"],
    [{ mode: "second_half" }, "PRAM on Second Half"],
  ] as const)("reuses Current Reserve scope wording for %o", (dateScope, expected) => {
    expect(text({
      propertyCode: 301,
      name: "Reserve Preference",
      categoryLabel: "Reserve",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["PRAM"],
        dateScope,
      },
    })).toBe(expected);
  });

  it("uses needs-review wording instead of raw values for incomplete Standing-only payloads", () => {
    expect(text({
      propertyCode: 312,
      name: "Reserve Day of Week Off",
      categoryLabel: "Reserve",
      bid: { type: "date-or-dow-list", dates: [], daysOfWeek: [] },
    })).toBe("Reserve Day of Week Off needs review");
  });
});
