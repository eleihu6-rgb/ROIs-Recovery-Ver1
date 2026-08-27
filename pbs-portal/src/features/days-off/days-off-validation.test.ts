import { validateDaysOffExistingProperties } from "@/features/days-off/days-off-validation";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";

const buildPreferOffProperty = (
  id: string,
  values: string[],
  activeTiers: string[],
): RuleBidExistingProperty => ({
  id,
  propertyCode: 201,
  name: "Prefer Off",
  bid: {
    type: "tag-list",
    values,
    suggestions: [],
  },
  tiers: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map((tier) => ({
    key: tier.toLowerCase(),
    label: tier,
    active: activeTiers.includes(tier),
  })),
  allOrNothing: false,
  minimumN: null,
});

describe("days off validation", () => {
  it("allows overlapping Prefer Off dates in the same tier", () => {
    expect(validateDaysOffExistingProperties([
      buildPreferOffProperty(
        "prefer-off-list",
        ["2026-04-19", "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-30"],
        ["T1"],
      ),
      buildPreferOffProperty(
        "prefer-off-range",
        ["Between 2026-04-19 - 2026-04-22"],
        ["T1"],
      ),
    ])).toEqual([]);
  });

  it("allows the same Prefer Off date in different tiers", () => {
    expect(validateDaysOffExistingProperties([
      buildPreferOffProperty("prefer-off-t1", ["2026-04-19"], ["T1"]),
      buildPreferOffProperty("prefer-off-t2", ["Between 2026-04-19 - 2026-04-22"], ["T2"]),
    ])).toEqual([]);
  });

  it("allows weekday Prefer Off values to overlap explicit dates", () => {
    expect(validateDaysOffExistingProperties([
      buildPreferOffProperty("prefer-off-monday", ["Monday"], ["T1"]),
      buildPreferOffProperty("prefer-off-date", ["2026-04-06"], ["T1"]),
    ])).toEqual([]);
  });
});
