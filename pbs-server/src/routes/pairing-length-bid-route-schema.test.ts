import { strict as assert } from "node:assert";
import test from "node:test";

import { pairingLengthBidSchema } from "./pairing-bid-route-schemas.js";

test("pairingLengthBidSchema accepts specific start dates and date ranges", () => {
  assert.equal(pairingLengthBidSchema.safeParse({
    type: "pairing-length-preference",
    minDays: 1,
    maxDays: 3,
    dateScope: { mode: "specific_dates", dates: ["2026-06-03", "2026-06-18"] },
    min: 1,
    max: 7,
  }).success, true);

  assert.equal(pairingLengthBidSchema.safeParse({
    type: "pairing-length-preference",
    minDays: 1,
    maxDays: 3,
    dateScope: { mode: "date_range", from: "2026-06-03", to: "2026-06-18" },
  }).success, true);
});

test("pairingLengthBidSchema rejects empty specific dates and reversed ranges", () => {
  assert.equal(pairingLengthBidSchema.safeParse({
    type: "pairing-length-preference",
    minDays: 1,
    maxDays: 3,
    dateScope: { mode: "specific_dates", dates: [] },
  }).success, false);

  assert.equal(pairingLengthBidSchema.safeParse({
    type: "pairing-length-preference",
    minDays: 1,
    maxDays: 3,
    dateScope: { mode: "date_range", from: "2026-06-18", to: "2026-06-03" },
  }).success, false);
});
