import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPbsPairingLengthSummary,
  normalizePbsPairingBidValueForRules,
  pbsPairingBidRoutes,
  pbsPairingF8PropertyCodes,
  pbsPairingPropertyCatalog,
} from "./pbs-pairing-bids.js";

test("defines Efficient Flying First as one award-only Pairing property", () => {
  const definitions = pbsPairingPropertyCatalog.filter(
    (property) => property.propertyCode === pbsPairingF8PropertyCodes.efficientFlyingFirst,
  );

  assert.equal(pbsPairingBidRoutes.efficientFlyingConfig, "/pairing-bids/efficient-flying-config");
  assert.equal(definitions.length, 1);
  assert.deepEqual(definitions[0], {
    propertyCode: 428,
    name: "Efficient Flying First",
    defaultBid: {
      type: "efficient-flying-preference",
      mode: "efficient",
    },
    defaultAction: "award",
    supportedActions: ["award"],
  });
});

test("normalizes Efficient Flying mode without adding company percentile to the bid payload", () => {
  assert.deepEqual(
    normalizePbsPairingBidValueForRules({
      type: "efficient-flying-preference",
      mode: "inefficient",
    }),
    {
      type: "efficient-flying-preference",
      mode: "inefficient",
    },
  );
});

test("formats Pairing Length actions, bounds, and day singular/plural", () => {
  const cases = [
    [{ action: "award", minDays: null, maxDays: 1 }, "Award pairings up to 1 day long"],
    [{ action: "avoid", minDays: null, maxDays: 3 }, "Avoid pairings up to 3 days long"],
    [{ action: "award", minDays: 1, maxDays: null }, "Award pairings at least 1 day long"],
    [{ action: "avoid", minDays: 2, maxDays: null }, "Avoid pairings at least 2 days long"],
    [{ action: "award", minDays: 1, maxDays: 1 }, "Award pairings 1 day long"],
    [{ action: "avoid", minDays: 2, maxDays: 2 }, "Avoid pairings 2 days long"],
    [{ action: "award", minDays: 2, maxDays: 4 }, "Award pairings 2–4 days long"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(formatPbsPairingLengthSummary(input), expected);
  }
});

test("formats Pairing Length specific dates and date ranges consistently", () => {
  assert.equal(
    formatPbsPairingLengthSummary({
      action: "award",
      minDays: null,
      maxDays: 1,
      dateScope: { mode: "specific_dates", dates: ["2026-07-02"] },
    }),
    "Award pairings up to 1 day long starting on Jul 2, 2026",
  );
  assert.equal(
    formatPbsPairingLengthSummary({
      action: "avoid",
      minDays: 2,
      maxDays: 4,
      dateScope: {
        mode: "specific_dates",
        dates: ["2026-07-02", "2026-07-05", "2026-07-08"],
      },
    }),
    "Avoid pairings 2–4 days long starting on Jul 2, 2026; Jul 5, 2026; or Jul 8, 2026",
  );
  assert.equal(
    formatPbsPairingLengthSummary({
      action: "award",
      minDays: 2,
      maxDays: null,
      dateScope: { mode: "date_range", from: "2026-07-02", to: "2026-07-05" },
    }),
    "Award pairings at least 2 days long starting from Jul 2, 2026 to Jul 5, 2026",
  );
});

test("rejects incomplete or invalid Pairing Length summaries", () => {
  const invalidInputs = [
    { action: "award", minDays: null, maxDays: null },
    { action: "award", minDays: 3, maxDays: 2 },
    { action: "award", minDays: 0, maxDays: null },
    { action: "award", minDays: null, maxDays: 1, dateScope: { mode: "specific_dates", dates: [] } },
    {
      action: "award",
      minDays: null,
      maxDays: 1,
      dateScope: { mode: "date_range", from: "2026-07-05", to: "2026-07-02" },
    },
    {
      action: "avoid",
      minDays: null,
      maxDays: 1,
      dateScope: { mode: "specific_dates", dates: ["2026-07-32"] },
    },
  ];

  for (const input of invalidInputs) {
    assert.equal(formatPbsPairingLengthSummary(input), null);
  }
});
