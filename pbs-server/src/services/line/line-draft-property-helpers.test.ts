import assert from "node:assert/strict";
import test from "node:test";
import type { PbsLineDraftProperty } from "../../../../packages/contracts/pbs-line-bids.js";
import {
  findLineDraftPropertyTierMerge,
  hasDuplicateLineDraftProperties,
  normalizeLinePropertyGroupKey,
} from "./line-draft-property-helpers.js";

const buildProperty = (
  property: Partial<PbsLineDraftProperty> & Pick<PbsLineDraftProperty, "propertyGroupKey" | "tiers">,
): PbsLineDraftProperty => ({
  rowSeq: 1,
  propertyCode: 403,
  name: "Clear Schedule and Start Next Bid Group",
  bid: { type: "flag" },
  ...property,
});

test("normalizeLinePropertyGroupKey rejects blank and overlong keys", () => {
  assert.equal(normalizeLinePropertyGroupKey("  line-1  "), "line-1");
  assert.equal(normalizeLinePropertyGroupKey(""), "");
  assert.equal(normalizeLinePropertyGroupKey("x".repeat(37)), "");
});

test("hasDuplicateLineDraftProperties only flags identical Line property and tier sets", () => {
  assert.equal(hasDuplicateLineDraftProperties([
    buildProperty({ propertyGroupKey: "line-1", tiers: ["T1"] }),
    buildProperty({ propertyGroupKey: "line-2", tiers: ["T2"] }),
  ]), false);

  assert.equal(hasDuplicateLineDraftProperties([
    buildProperty({ propertyGroupKey: "line-1", tiers: ["T1", "T2"] }),
    buildProperty({ propertyGroupKey: "line-2", tiers: ["T2", "T1"] }),
  ]), true);
});

test("findLineDraftPropertyTierMerge merges matching Line properties across tiers", () => {
  const mergeResult = findLineDraftPropertyTierMerge([
    buildProperty({ propertyGroupKey: "line-1", tiers: ["T1"] }),
    buildProperty({ propertyGroupKey: "line-2", tiers: ["T2"] }),
  ], buildProperty({ propertyGroupKey: "line-3", tiers: ["T3"] }));

  assert.ok(mergeResult);
  assert.equal(mergeResult.targetProperty.propertyGroupKey, "line-1");
  assert.equal(mergeResult.hasNewTier, true);
  assert.deepEqual(mergeResult.mergedProperty.tiers, ["T1", "T2", "T3"]);
});

test("findLineDraftPropertyTierMerge reports no new tier for an identical tier selection", () => {
  const mergeResult = findLineDraftPropertyTierMerge([
    buildProperty({ propertyGroupKey: "line-1", tiers: ["T1", "T2"] }),
  ], buildProperty({ propertyGroupKey: "line-2", tiers: ["T2"] }));

  assert.ok(mergeResult);
  assert.equal(mergeResult.hasNewTier, false);
  assert.deepEqual(mergeResult.mergedProperty.tiers, ["T1", "T2"]);
});
