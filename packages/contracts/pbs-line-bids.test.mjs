import assert from "node:assert/strict";
import test from "node:test";

import {
  pbsLineAaPropertyCodes,
  pbsLineAaPropertyCatalog,
  pbsLineLegacyPropertyCodes,
} from "./pbs-line-bids.js";

test("Property 427 is canonical Reserve with explicit award and avoid actions", () => {
  const reserve = pbsLineAaPropertyCatalog.find((property) =>
    property.propertyCode === pbsLineAaPropertyCodes.reserve);

  assert.ok(reserve);
  assert.equal(reserve.name, "Reserve");
  assert.deepEqual(reserve.defaultBid, { type: "flag" });
  assert.equal(reserve.defaultAction, "award");
  assert.deepEqual(reserve.supportedActions, ["award", "avoid"]);
});

test("Line Reserve parity leaves Property 410 unchanged", () => {
  assert.equal(pbsLineLegacyPropertyCodes.reserveFlyingDatePattern, 410);
});
