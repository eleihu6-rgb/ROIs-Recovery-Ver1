import assert from "node:assert/strict";
import test from "node:test";
import {
  pbsDaysOffAaPropertyCodes,
  type PbsDaysOffDraftProperty,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import type { NormalizedDaysOffDraftProperty } from "./days-off-draft-mappers.js";
import {
  buildDaysOffGroupValuesForProperty,
  buildStableDaysOffGroupRows,
  parseStableCurrentDraftBidId,
} from "./days-off-persistence-mappers.js";

const propertyIdentityByCode = new Map([
  [
    201,
    {
      propertyDefinitionId: 2010,
      propertyCode: 201,
    },
  ],
  [
    204,
    {
      propertyDefinitionId: 2040,
      propertyCode: 204,
    },
  ],
  [
    pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
    {
      propertyDefinitionId: 2110,
      propertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
    },
  ],
  [
    pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
    {
      propertyDefinitionId: 2120,
      propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
    },
  ],
]);

test("parseStableCurrentDraftBidId prefers a positive numeric bid id", () => {
  assert.equal(parseStableCurrentDraftBidId({ bidId: 42, draftKey: "99" }), 42);
});

test("buildDaysOffGroupValuesForProperty stores Long Stretch Off as award-only", () => {
  const now = new Date("2026-04-29T12:00:00.000Z");
  const property: NormalizedDaysOffDraftProperty = {
    propertyGroupKey: "long-stretch-key",
    rowSeq: 2,
    propertyCode: 204,
    name: "Long Stretch Off / Compressed Flying",
    action: "avoid",
    bid: {
      type: "stepper-date-range",
      value: 10,
      from: "2026-04-01",
      to: "2026-04-30",
      min: 1,
      max: 14,
    },
    tiers: ["T1"],
    allOrNothing: false,
    minimumN: null,
    maximumN: null,
  };

  const values = buildDaysOffGroupValuesForProperty(
    property,
    propertyIdentityByCode,
    new Map([[1, 2001]]),
    9001,
    { crewId: "AA001", userCode: "tester" },
    now,
  );

  assert.equal(values[0]?.actionId, 1);
});

test("parseStableCurrentDraftBidId parses numeric draft keys and rejects invalid keys", () => {
  assert.equal(parseStableCurrentDraftBidId({ draftKey: " 123 " }), 123);
  assert.equal(parseStableCurrentDraftBidId({ draftKey: " " }), null);

  assert.throws(
    () => parseStableCurrentDraftBidId({ draftKey: "abc" }),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Invalid current draft key.",
  );
});

test("buildDaysOffGroupValuesForProperty maps normalized properties into pbs_bid_group values", () => {
  const now = new Date("2026-04-29T12:00:00.000Z");
  const property: NormalizedDaysOffDraftProperty = {
    propertyGroupKey: "minimum-key",
    rowSeq: 3,
    propertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
    name: "Minimum Days Off Between Work Blocks",
    bid: { type: "stepper", value: 4, min: 1, max: 12, operator: ">" },
    tiers: ["T2", "T4"],
    allOrNothing: true,
    minimumN: 2,
  };

  const values = buildDaysOffGroupValuesForProperty(
    property,
    propertyIdentityByCode,
    new Map([[2, 2002], [4, 2004]]),
    9001,
    { crewId: "AA001", userCode: "tester" },
    now,
  );

  assert.deepEqual(values, [
    {
      tierId: 2002,
      bidId: 9001,
      groupSeq: 3,
      propertyGroupKey: "minimum-key",
      bidType: "DaysOff",
      actionId: null,
      legacyPropertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
      propertyDefinitionId: 2110,
      operator: ">",
      paramA: "4",
      paramB: null,
      paramC: null,
      allOrNothing: 1,
      minimumN: 2,
      limitN: null,
      totalConditions: 0,
      createdBy: "tester",
      updatedBy: "tester",
      updatedAt: now,
    },
    {
      tierId: 2004,
      bidId: 9001,
      groupSeq: 3,
      propertyGroupKey: "minimum-key",
      bidType: "DaysOff",
      actionId: null,
      legacyPropertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
      propertyDefinitionId: 2110,
      operator: ">",
      paramA: "4",
      paramB: null,
      paramC: null,
      allOrNothing: 1,
      minimumN: 2,
      limitN: null,
      totalConditions: 0,
      createdBy: "tester",
      updatedBy: "tester",
      updatedAt: now,
    },
  ]);
});

test("buildDaysOffGroupValuesForProperty rejects missing tier ids", () => {
  const property: NormalizedDaysOffDraftProperty = {
    propertyGroupKey: "weekend-key",
    rowSeq: 1,
    propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
    name: "Maximize Weekend Days Off",
    bid: { type: "flag" },
    tiers: ["T3"],
    allOrNothing: false,
    minimumN: null,
  };

  assert.throws(
    () =>
      buildDaysOffGroupValuesForProperty(
        property,
        propertyIdentityByCode,
        new Map(),
        9001,
        { crewId: "AA001", userCode: "tester" },
        new Date("2026-04-29T12:00:00.000Z"),
      ),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 500
      && error.message === "Missing days off tier T3 during draft save.",
  );
});

test("buildDaysOffGroupValuesForProperty standardizes Prefer Off quantity fields", () => {
  const property: NormalizedDaysOffDraftProperty = {
    propertyGroupKey: "prefer-off-key",
    rowSeq: 1,
    propertyCode: 201,
    name: "Prefer Off",
    bid: { type: "tag-list", values: ["2026-04-10", "2026-04-11", "2026-04-12"] },
    tiers: ["T1"],
    allOrNothing: false,
    minimumN: 2,
    maximumN: 3,
  };

  const values = buildDaysOffGroupValuesForProperty(
    property,
    propertyIdentityByCode,
    new Map([[1, 2001]]),
    9001,
    { crewId: "AA001", userCode: "tester" },
    new Date("2026-04-29T12:00:00.000Z"),
  );

  assert.equal(values[0]?.allOrNothing, 1);
  assert.equal(values[0]?.minimumN, null);
  assert.equal(values[0]?.limitN, null);
});

test("buildStableDaysOffGroupRows maps draft properties into stable save group rows", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    {
      propertyGroupKey: "weekend-key",
      rowSeq: 1,
      propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
      name: "Maximize Weekend Days Off",
      bid: { type: "flag" },
      tiers: ["T1", "T2"],
      allOrNothing: false,
      minimumN: null,
    },
    {
      propertyGroupKey: "minimum-key",
      rowSeq: 2,
      propertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 5, min: 1, max: 12 },
      tiers: ["T3"],
      allOrNothing: true,
      minimumN: 1,
    },
  ];

  assert.deepEqual(
    buildStableDaysOffGroupRows({ properties }, propertyIdentityByCode),
    [
      {
        tierNumber: 1,
        groupSeq: 1,
        propertyGroupKey: "weekend-key",
        propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
        propertyDefinitionId: 2120,
        actionId: null,
        operator: null,
        paramA: null,
        paramB: null,
        paramC: null,
        allOrNothing: 0,
        minimumN: null,
        limitN: null,
      },
      {
        tierNumber: 2,
        groupSeq: 1,
        propertyGroupKey: "weekend-key",
        propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
        propertyDefinitionId: 2120,
        actionId: null,
        operator: null,
        paramA: null,
        paramB: null,
        paramC: null,
        allOrNothing: 0,
        minimumN: null,
        limitN: null,
      },
      {
        tierNumber: 3,
        groupSeq: 2,
        propertyGroupKey: "minimum-key",
        propertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
        propertyDefinitionId: 2110,
        actionId: null,
        operator: "=",
        paramA: "5",
        paramB: null,
        paramC: null,
        allOrNothing: 1,
        minimumN: 1,
        limitN: null,
      },
    ],
  );
});
