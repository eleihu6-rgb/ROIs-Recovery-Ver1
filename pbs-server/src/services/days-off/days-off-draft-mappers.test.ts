import assert from "node:assert/strict";
import test from "node:test";
import {
  pbsDaysOffAaPropertyCodes,
  pbsSupportedDaysOffPropertyCatalog,
  type PbsSaveDaysOffCurrentDraftRequest,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import {
  buildDaysOffDraftPropertiesFromSnapshotRows,
  buildDaysOffDraftPropertyFromAddRequest,
  buildDaysOffDraftPropertyFromPatchRequest,
  buildEmptyDaysOffDraft,
  normalizeDaysOffAddPropertyRequest,
  normalizeDaysOffDraftRequest,
  normalizeDaysOffFavoriteRequest,
  normalizeDaysOffAction,
  normalizeDaysOffPatchPropertyRequest,
  normalizeDaysOffPropertyGroupKey,
  type AddPropertyDraftSnapshotRow,
} from "./days-off-draft-mappers.js";

const catalogByCode = new Map(
  pbsSupportedDaysOffPropertyCatalog.map((definition) => [definition.propertyCode, definition]),
);

test("buildEmptyDaysOffDraft creates a current empty draft for the period", () => {
  const draft = buildEmptyDaysOffDraft({
    rosterPeriodId: 42,
    rosterPeriodKey: "2026RP04",
    periodCode: "Apr 2026",
    filiale: "F8",
    status: "OPEN",
    computedStage: "OPEN",
    bidOpenAt: new Date("2026-03-01T00:00:00.000Z"),
    bidCloseAt: new Date("2026-03-10T23:59:59.000Z"),
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    canEditBid: true,
    readOnlyReason: null,
  });

  assert.deepEqual(draft, {
    periodId: 42,
    draftVersion: 0,
    periodCode: "Apr 2026",
    bidContext: "Current",
    remarks: "",
    properties: [],
  });
});

test("normalizeDaysOffPropertyGroupKey trims invalid empty or overlong keys", () => {
  assert.equal(normalizeDaysOffPropertyGroupKey(" property-key "), "property-key");
  assert.equal(normalizeDaysOffPropertyGroupKey(""), "");
  assert.equal(normalizeDaysOffPropertyGroupKey("x".repeat(37)), "");
});

test("normalizeDaysOffDraftRequest normalizes row order, tiers, duplicate keys, and remarks", () => {
  const normalized = normalizeDaysOffDraftRequest({
    draft: {
      draftKey: "123",
      bidId: 123,
      periodId: 42,
      draftVersion: 7,
      periodCode: " Apr 2026 ",
      bidContext: "Current",
      remarks: " ready ",
      properties: [
        {
          propertyGroupKey: "dup-key",
          rowSeq: 5,
          propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
          name: "Ignored",
          bid: { type: "flag" },
          tiers: ["t2", "T1"],
        },
        {
          propertyGroupKey: "dup-key",
          rowSeq: 1,
          propertyCode: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
          name: "Ignored",
          bid: { type: "stepper", value: 3, min: 1, max: 12 },
          tiers: ["T3", "t3"],
          minimumN: null,
        },
      ],
    },
  }, catalogByCode);

  assert.equal(normalized.periodCode, "Apr 2026");
  assert.equal(normalized.remarks, "ready");
  assert.equal(normalized.properties[0]?.propertyCode, pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks);
  assert.equal(normalized.properties[0]?.rowSeq, 1);
  assert.deepEqual(normalized.properties[0]?.tiers, ["T3"]);
  assert.notEqual(normalized.properties[0]?.propertyGroupKey, "dup-key");
  assert.equal(normalized.properties[1]?.propertyCode, pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff);
  assert.equal(normalized.properties[1]?.rowSeq, 2);
  assert.deepEqual(normalized.properties[1]?.tiers, ["T1", "T2"]);
  assert.equal(normalized.properties[1]?.propertyGroupKey, "dup-key");
});

test("normalizeDaysOffDraftRequest rejects unsupported properties and non-current contexts", () => {
  assert.throws(
    () =>
      normalizeDaysOffDraftRequest({
        draft: {
          draftVersion: 0,
          periodCode: "Apr 2026",
          bidContext: "Current",
          properties: [
            {
              rowSeq: 1,
              propertyCode: 999,
              name: "Unsupported",
              bid: { type: "flag" },
              tiers: ["T1"],
            },
          ],
        },
      }, catalogByCode),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Unsupported days off property code: 999",
  );

  const invalidContextRequest = {
    draft: {
      draftVersion: 0,
      periodCode: "Apr 2026",
      bidContext: "Award",
      properties: [],
    },
  } as unknown as PbsSaveDaysOffCurrentDraftRequest;

  assert.throws(
    () => normalizeDaysOffDraftRequest(invalidContextRequest, catalogByCode),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Only the Current days off draft context is supported.",
  );
});

test("normalizeDaysOffAddPropertyRequest trims metadata and builds an insertable draft property", () => {
  const request = normalizeDaysOffAddPropertyRequest({
    draftKey: "123",
    periodCode: " Apr 2026 ",
    draftVersion: 0,
    remarks: " new property ",
    propertyCode: pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff,
    bid: { type: "flag" },
    tiers: ["t1", "T2"],
  }, catalogByCode);
  const property = buildDaysOffDraftPropertyFromAddRequest(request, "property-key", 3);

  assert.equal(request.periodCode, "Apr 2026");
  assert.equal(request.remarks, "new property");
  assert.deepEqual(property, {
    propertyGroupKey: "property-key",
    rowSeq: 3,
    propertyCode: pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff,
    name: "Waive Minimum Days Off",
    action: null,
    bid: { type: "flag" },
    tiers: ["T1", "T2"],
    allOrNothing: false,
    minimumN: null,
    maximumN: null,
  });
});

test("normalizeDaysOffAction standardizes Long Stretch Off to award-only", () => {
  assert.equal(normalizeDaysOffAction(204, "avoid"), "award");
  assert.equal(normalizeDaysOffAction(204, null), "award");
  assert.equal(normalizeDaysOffAction(pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff, "avoid"), null);
});

test("normalizeDaysOffPatchPropertyRequest keeps updates lightweight and preserves the current property identity", () => {
  const request = normalizeDaysOffPatchPropertyRequest({
    draftKey: "123",
    periodCode: " Apr 2026 ",
    draftVersion: 4,
    bid: { type: "flag" },
    tiers: ["t2", "T4"],
    allOrNothing: true,
    minimumN: 2,
    maximumN: null,
  });
  const property = buildDaysOffDraftPropertyFromPatchRequest(request, "property-key", 5, {
    propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
    name: "Maximize Weekend Days Off",
  });

  assert.equal(request.periodCode, "Apr 2026");
  assert.deepEqual(property, {
    propertyGroupKey: "property-key",
    rowSeq: 5,
    propertyCode: pbsDaysOffAaPropertyCodes.maximizeWeekendDaysOff,
    name: "Maximize Weekend Days Off",
    action: null,
    bid: { type: "flag" },
    tiers: ["T2", "T4"],
    allOrNothing: true,
    minimumN: 2,
    maximumN: null,
  });
});

test("buildDaysOffDraftPropertiesFromSnapshotRows merges tiers and skips incomplete rows", () => {
  const rows: AddPropertyDraftSnapshotRow[] = [
    {
      property_group_key: "minimum",
      group_seq: 2,
      property_code: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
      operator: "=",
      param_a: "4",
      all_or_nothing: 0,
      minimum_n: 2,
      tier: 2,
    },
    {
      property_group_key: "minimum",
      group_seq: 2,
      property_code: pbsDaysOffAaPropertyCodes.minimumDaysOffBetweenWorkBlocks,
      operator: "=",
      param_a: "4",
      all_or_nothing: 0,
      minimum_n: 2,
      tier: 1,
    },
    {
      property_group_key: "flag",
      group_seq: 1,
      property_code: pbsDaysOffAaPropertyCodes.maximizeTotalDaysOff,
      all_or_nothing: 1,
      tier: 3,
    },
    {
      property_group_key: "long-stretch",
      group_seq: 3,
      property_code: 204,
      action_id: 2,
      operator: "Between",
      param_a: "2",
      param_b: "2026-04-01",
      param_c: "2026-04-07",
      all_or_nothing: 0,
      tier: 4,
    },
    {
      property_group_key: null,
      group_seq: 4,
      property_code: pbsDaysOffAaPropertyCodes.waiveMinimumDaysOff,
      tier: 1,
    },
  ];

  const properties = buildDaysOffDraftPropertiesFromSnapshotRows(rows, catalogByCode);

  assert.equal(properties.length, 3);
  assert.equal(properties[0]?.propertyGroupKey, "flag");
  assert.deepEqual(properties[0]?.tiers, ["T3"]);
  assert.equal(properties[0]?.allOrNothing, true);
  assert.equal(properties[1]?.propertyGroupKey, "minimum");
  assert.deepEqual(properties[1]?.tiers, ["T1", "T2"]);
  assert.deepEqual(properties[1]?.bid, { type: "stepper", value: 4, min: 1, max: 12 });
  assert.equal(properties[1]?.minimumN, 2);
  assert.equal(properties[2]?.propertyGroupKey, "long-stretch");
  assert.equal(properties[2]?.action, "award");
  assert.deepEqual(properties[2]?.bid, {
    type: "stepper-date-range",
    value: 2,
    from: "2026-04-01",
    to: "2026-04-07",
    min: 1,
    max: 14,
  });
});

test("normalizeDaysOffFavoriteRequest trims the period and keeps configured bid details", () => {
  assert.deepEqual(
    normalizeDaysOffFavoriteRequest({
      draftKey: "123",
      bidId: 123,
      periodCode: " Apr 2026 ",
      draftVersion: 7,
      propertyCode: 212,
      bid: { type: "flag" },
      allOrNothing: true,
      minimumN: 2,
      maximumN: null,
    }, catalogByCode),
    {
      draftKey: "123",
      bidId: 123,
      draftVersion: 7,
      periodCode: "Apr 2026",
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      action: null,
      bid: { type: "flag" },
      allOrNothing: true,
      minimumN: 2,
      maximumN: null,
    },
  );

  assert.throws(
    () =>
      normalizeDaysOffFavoriteRequest({
        draftVersion: 0,
        propertyCode: 999,
        bid: { type: "flag" },
      }, catalogByCode),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Unsupported days off property code: 999",
  );
});

test("normalizeDaysOffFavoriteRequest standardizes Long Stretch Off action to award", () => {
  assert.deepEqual(
    normalizeDaysOffFavoriteRequest({
      draftVersion: 0,
      propertyCode: 204,
      action: "avoid",
      bid: {
        type: "stepper-date-range",
        value: 5,
        from: "2026-04-01",
        to: "2026-04-30",
        min: 1,
        max: 14,
      },
    }, catalogByCode),
    {
      draftKey: undefined,
      bidId: undefined,
      draftVersion: 0,
      periodCode: undefined,
      propertyCode: 204,
      name: "Long Stretch Off / Compressed Flying",
      action: "award",
      bid: {
        type: "stepper-date-range",
        value: 5,
        from: "2026-04-01",
        to: "2026-04-30",
        min: 1,
        max: 14,
      },
      allOrNothing: false,
      minimumN: null,
      maximumN: null,
    },
  );
});
