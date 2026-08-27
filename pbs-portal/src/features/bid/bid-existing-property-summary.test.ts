import { describe, expect, it } from "vitest";
import { resolveBidExistingPropertySummary } from "@/features/bid/bid-existing-property-summary";
import type { PairingExistingProperty } from "@/features/pairing/types";
import type { RuleBidExistingProperty } from "@/features/rule-bids/types";
import type { TierSummaryItem } from "@/features/tier/types";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";

const item: TierSummaryItem = {
  id: "summary-1",
  groupKey: "Pairing:pairing-1",
  bidType: "Pairing",
  label: "Pairing Preference",
  readableText: "server fallback",
  tiers: ["T3"],
  conditions: [],
  isEditable: true,
  editableSource: {
    module: "Pairing",
    propertyGroupKey: "pairing-1",
  },
};

const pairingProperty: PairingExistingProperty = {
  id: "pairing-1",
  propertyCode: 102,
  name: "Pairing Preference",
  action: "award",
  quantifier: null,
  bid: {
    type: "pairing-preference",
    pairingIds: ["98938", "99070"],
    pairingLabels: ["V4507", "V4507"],
  },
  tiers: [{ key: "t3", label: "T3", active: true }],
  priorityOptions: [],
  pairingNumber: "",
  pairingType: "",
  effectiveDateRange: { from: "", to: "" },
};

const emptySources = {
  daysOff: [] as RuleBidExistingProperty[],
  pairing: [] as PairingExistingProperty[],
  line: [] as RuleBidExistingProperty[],
  reserve: [] as RuleBidExistingProperty[],
};

const preferOffConfig: PbsPreferOffConfig = {
  weekdays: [{ code: "TUE", name: "Tuesday", order: 2, isoDay: 2 }],
  weekend: { available: false },
};

describe("resolveBidExistingPropertySummary", () => {
  it("uses the normalized current draft property for editable Tier Summary rows", () => {
    expect(resolveBidExistingPropertySummary(item, {
      ...emptySources,
      pairing: [pairingProperty],
    })).toEqual({
      kind: "text",
      text: "Award pairings V4507 ×2",
      title: "Award pairings V4507 ×2",
    });
  });

  it("uses the Days Off config when summarizing an editable Prefer Off weekday", () => {
    const daysOffItem: TierSummaryItem = {
      ...item,
      id: "days-off-summary-1",
      groupKey: "DaysOff:prefer-off-1",
      bidType: "DaysOff",
      label: "Prefer Off",
      editableSource: {
        module: "DaysOff",
        propertyGroupKey: "prefer-off-1",
      },
    };
    const daysOffProperty: RuleBidExistingProperty = {
      id: "prefer-off-1",
      propertyCode: 201,
      name: "Prefer Off",
      bid: { type: "tag-list", values: ["Tuesday"] },
      tiers: [{ key: "t1", label: "T1", active: true }],
    };

    expect(resolveBidExistingPropertySummary(daysOffItem, {
      ...emptySources,
      daysOff: [daysOffProperty],
    }, preferOffConfig)).toEqual({
      kind: "text",
      text: "Prefer off on Tuesdays",
      title: "Prefer off on Tuesdays",
    });
  });

  it("summarizes editable Line Reserve Preference 301 rows from the current draft", () => {
    const lineItem: TierSummaryItem = {
      ...item,
      id: "line-short-call-summary",
      groupKey: "line-short-call",
      bidType: "Line",
      label: "Mixed Line Bid",
      editableSource: {
        module: "Line",
        propertyGroupKey: "line-short-call",
      },
    };
    const lineProperty: RuleBidExistingProperty = {
      id: "line-short-call",
      propertyCode: 301,
      name: "Mixed Line Bid",
      action: "avoid",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "whole_month" },
      },
      tiers: [{ key: "t1", label: "T1", active: true }],
    };

    expect(resolveBidExistingPropertySummary(lineItem, {
      ...emptySources,
      line: [lineProperty],
    })).toEqual({
      kind: "text",
      text: "Avoid PRAM short call for the whole month",
      title: "Avoid PRAM short call for the whole month",
    });
  });

  it("summarizes editable Reserve Preference rows from the reserve draft", () => {
    const reserveItem: TierSummaryItem = {
      ...item,
      id: "reserve-short-call-summary",
      groupKey: "reserve-short-call",
      bidType: "Line",
      label: "Reserve Preference",
      editableSource: {
        module: "Reserve",
        propertyGroupKey: "reserve-short-call",
      },
    };
    const reserveProperty: RuleBidExistingProperty = {
      id: "reserve-short-call",
      propertyCode: 301,
      name: "Reserve Preference",
      action: "award",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "CRPM",
        options: ["CRPM", "PRAM"],
        dateScope: { mode: "first_half" },
      },
      tiers: [{ key: "t2", label: "T2", active: true }],
    };

    expect(resolveBidExistingPropertySummary(reserveItem, {
      ...emptySources,
      reserve: [reserveProperty],
    })).toEqual({
      kind: "text",
      text: "Award CRPM short call for the first half",
      title: "Award CRPM short call for the first half",
    });
  });

  it("relabels Line Reserve Preference summary rows as Mixed Line Bid", () => {
    const result = resolveBidExistingPropertySummary({
      ...item,
      id: "line-short-call-summary",
      groupKey: "line-short-call",
      bidType: "Line",
      label: "Reserve Preference",
      editableSource: {
        module: "Line",
        propertyGroupKey: "line-short-call",
      },
    }, {
      ...emptySources,
      line: [{
        id: "line-short-call",
        propertyCode: 301,
        name: "Reserve Preference",
        action: "avoid",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          options: ["PRAM", "PRPM"],
          dateScope: { mode: "whole_month" },
        },
        tiers: [{ key: "t1", label: "T1", active: true }],
      }],
    });

    expect(result?.title).toBe("Avoid PRAM short call for the whole month");
  });

  it("keeps the server fallback for unmatched or review-only rows", () => {
    expect(resolveBidExistingPropertySummary(item, emptySources)).toBeNull();
    expect(resolveBidExistingPropertySummary({
      ...item,
      isEditable: false,
      warningCode: "legacyOnly",
    }, {
      ...emptySources,
      pairing: [pairingProperty],
    })).toBeNull();

    expect(resolveBidExistingPropertySummary({
      ...item,
      editableSource: {
        module: "Pairing",
        propertyGroupKey: "legacy-pairing",
      },
    }, {
      ...emptySources,
      pairing: [{
        ...pairingProperty,
        id: "legacy-pairing",
        propertyCode: 133,
        name: "Prefer Duty Period",
        bid: { type: "stepper", value: 3 },
      }],
    })).toBeNull();
  });
});
