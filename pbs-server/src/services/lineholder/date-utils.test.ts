import assert from "node:assert/strict";
import test from "node:test";
import {
  getInclusiveIsoDateRangeDays,
  isIsoDateInRange,
} from "./date-utils.js";

test("isIsoDateInRange uses the configured inclusive roster-period boundaries", () => {
  assert.equal(isIsoDateInRange("2026-01-31", "2026-01-31", "2026-03-01"), true);
  assert.equal(isIsoDateInRange("2026-02-15", "2026-01-31", "2026-03-01"), true);
  assert.equal(isIsoDateInRange("2026-03-01", "2026-01-31", "2026-03-01"), true);
  assert.equal(isIsoDateInRange("2026-01-30", "2026-01-31", "2026-03-01"), false);
  assert.equal(isIsoDateInRange("2026-03-02", "2026-01-31", "2026-03-01"), false);
});

test("isIsoDateInRange rejects invalid values and reversed ranges", () => {
  assert.equal(isIsoDateInRange("bad", "2026-01-31", "2026-03-01"), false);
  assert.equal(isIsoDateInRange("2026-02-01", "bad", "2026-03-01"), false);
  assert.equal(isIsoDateInRange("2026-02-01", "2026-03-01", "2026-01-31"), false);
});

test("getInclusiveIsoDateRangeDays counts ordinary and cross-month roster periods", () => {
  assert.equal(getInclusiveIsoDateRangeDays("2026-04-01", "2026-04-30"), 30);
  assert.equal(getInclusiveIsoDateRangeDays("2026-01-31", "2026-03-01"), 30);
  assert.equal(getInclusiveIsoDateRangeDays("2026-01-01", "2026-01-31"), 31);
  assert.equal(getInclusiveIsoDateRangeDays("2026-02-01", "2026-02-28"), 28);
});

test("getInclusiveIsoDateRangeDays rejects invalid and reversed ranges", () => {
  assert.equal(getInclusiveIsoDateRangeDays("bad", "2026-03-01"), null);
  assert.equal(getInclusiveIsoDateRangeDays("2026-03-02", "2026-03-01"), null);
});
