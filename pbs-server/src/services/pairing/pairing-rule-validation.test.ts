import assert from "node:assert/strict";
import test from "node:test";
import {
  findPbsPairingRuleConflict,
  getPbsPairingForcedOrRule,
} from "../../../../packages/contracts/pbs-pairing-bids.js";
import type { PbsPairingDraftProperty } from "../../../../packages/contracts/pbs-pairing-bids.js";

const buildProperty = (
  overrides: Partial<PbsPairingDraftProperty>,
): PbsPairingDraftProperty => ({
  propertyGroupKey: "property-1",
  rowSeq: 1,
  propertyCode: 131,
  name: "Prefer Pairing Length",
  action: null,
  quantifier: null,
  bid: { type: "stepper", value: 3, min: 1, max: 7 },
  tiers: ["T1"],
  ...overrides,
});

test("pairing rule validation rejects an exact same-tier duplicate", () => {
  const conflict = findPbsPairingRuleConflict(
    [buildProperty({ propertyGroupKey: "existing" })],
    buildProperty({ propertyGroupKey: "candidate" }),
  );

  assert.equal(conflict?.type, "duplicate");
  assert.equal(conflict?.tier, "T1");
});

test("pairing rule validation rejects same-tier single-use duplicates with different values", () => {
  const conflict = findPbsPairingRuleConflict(
    [
      buildProperty({
        propertyGroupKey: "existing",
        propertyCode: 142,
        name: "Minimum Avg Credit per Duty",
        bid: { type: "text", value: "06:00" },
      }),
    ],
    buildProperty({
      propertyGroupKey: "candidate",
      propertyCode: 142,
      name: "Minimum Avg Credit per Duty",
      bid: { type: "text", value: "07:00" },
    }),
  );

  assert.equal(conflict?.type, "single-use");
  assert.equal(conflict?.tier, "T1");
});

test("pairing rule validation allows multi-use properties with different values in the same tier", () => {
  const conflict = findPbsPairingRuleConflict(
    [buildProperty({ propertyGroupKey: "existing" })],
    buildProperty({
      propertyGroupKey: "candidate",
      bid: { type: "stepper", value: 4, min: 1, max: 7 },
    }),
  );

  assert.equal(conflict, null);
});

test("pairing rule validation allows multiple unified check-time bids in the same tier", () => {
  const conflict = findPbsPairingRuleConflict(
    [
      buildProperty({
        propertyGroupKey: "existing",
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        bid: {
          type: "pairing-check-time",
          timeType: "check_in",
          operator: "=",
          value: "12:16",
          dateScope: null,
        },
      }),
    ],
    buildProperty({
        propertyGroupKey: "candidate",
        propertyCode: 103,
        name: "Pairing Check-In / Check-Out Time",
        bid: {
          type: "pairing-check-time",
          timeType: "check_out",
          operator: ">",
          value: "13:00",
          dateScope: null,
      },
    }),
  );

  assert.equal(conflict, null);
});

test("pairing forced OR rules cover AA ODAN and one-day layover exceptions", () => {
  const odan = buildProperty({
    propertyGroupKey: "odan",
    propertyCode: 137,
    name: "Prefer Pairing Type",
    bid: {
      type: "select",
      value: "ODAN",
      options: ["ODAN"],
    },
  });
  const oneDay = buildProperty({
    propertyGroupKey: "one-day",
    bid: { type: "stepper", value: 1, min: 1, max: 7 },
  });
  const layoverCity = buildProperty({
    propertyGroupKey: "layover-city",
    propertyCode: 150,
    name: "Layover at City",
    bid: { type: "tag-list", values: ["LAX"] },
  });

  assert.equal(getPbsPairingForcedOrRule(odan, buildProperty({ propertyGroupKey: "length" })), "odan-pairing-length");
  assert.equal(getPbsPairingForcedOrRule(oneDay, layoverCity), "one-day-layover-city");
});
