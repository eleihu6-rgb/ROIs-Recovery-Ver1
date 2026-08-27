import assert from "node:assert/strict";
import test from "node:test";
import type { PbsReserveDraftProperty } from "../../../../packages/contracts/pbs-reserve-bids.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const buildReservePreferOffProperty = (
  values: string[],
): PbsReserveDraftProperty => ({
  rowSeq: 1,
  propertyCode: 311,
  name: "Reserve Prefer Off",
  bid: {
    type: "tag-list",
    values,
    suggestions: [],
  },
  tiers: ["T1"],
});

const buildReservePreferenceProperty = (
  bid: PbsReserveDraftProperty["bid"],
): PbsReserveDraftProperty => ({
  rowSeq: 1,
  propertyCode: 301,
  name: "Reserve Preference",
  bid,
  tiers: ["T1"],
});

test("Reserve validation rejects hidden AA Reserve Prefer Off date lists", async () => {
  const { LineholderBidServiceError } = await import("../lineholder/shared.js");
  const { validateReserveDraftProperties } = await import("./reserve-validation.js");

  assert.throws(
    () => validateReserveDraftProperties([
      buildReservePreferOffProperty(["2026-05-01", "2026-05-02"]),
    ]),
    LineholderBidServiceError,
  );
});

test("Reserve validation accepts date-scoped Reserve Preference bids", async () => {
  const { validateReserveDraftProperties } = await import("./reserve-validation.js");

  assert.doesNotThrow(() => {
    validateReserveDraftProperties([
      buildReservePreferenceProperty({
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "first_half" },
      }),
      buildReservePreferenceProperty({
        type: "reserve-call-type-date-scope",
        callType: "PRPM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-03"] },
      }),
    ]);
  });
});

test("Reserve validation uses actor-specific Reserve Preference call types when provided", async () => {
  const { LineholderBidServiceError } = await import("../lineholder/shared.js");
  const { validateReserveDraftProperties } = await import("./reserve-validation.js");

  assert.doesNotThrow(() => {
    validateReserveDraftProperties([
      buildReservePreferenceProperty({
        type: "reserve-call-type-date-scope",
        callType: "CRPM",
        options: ["CRAM", "CRPM", "PRAM"],
        dateScope: { mode: "whole_month" },
      }),
    ], { allowedCallTypes: ["CRAM", "CRPM"] });
  });
  assert.throws(
    () => validateReserveDraftProperties([
      buildReservePreferenceProperty({
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["CRAM", "CRPM", "PRAM"],
        dateScope: { mode: "whole_month" },
      }),
    ], { allowedCallTypes: ["CRAM", "CRPM"] }),
    LineholderBidServiceError,
  );
});

test("Reserve call type option helper maps dictionary groups by crew division", async () => {
  const { filterReserveCallTypeOptionsForCrew } = await import("./reserve-call-type-options.js");
  const rows = [
    { code: "P_AM", codeValue: "PRAM|04:00|16:00|0" },
    { code: "P_MM", codeValue: "PRMM|10:00|22:00|0" },
    { code: "P_PM", codeValue: "PRPM|14:00|23:59|0" },
    { code: "C_AM", codeValue: "CRAM|03:00|15:00|0" },
    { code: "C_PM", codeValue: "CRPM|10:00|22:00|0" },
  ];

  assert.deepEqual(filterReserveCallTypeOptionsForCrew(rows, "P"), ["PRAM", "PRMM", "PRPM"]);
  assert.deepEqual(filterReserveCallTypeOptionsForCrew(rows, "C"), ["CRAM", "CRPM"]);
});

test("Reserve validation rejects historical simple Reserve Preference select bids", async () => {
  const { LineholderBidServiceError } = await import("../lineholder/shared.js");
  const { validateReserveDraftProperties } = await import("./reserve-validation.js");

  assert.throws(
    () => validateReserveDraftProperties([
      buildReservePreferenceProperty({
        type: "select",
        value: "PRAM",
        options: ["PRAM", "PRPM"],
      }),
    ]),
    LineholderBidServiceError,
  );
});

test("Reserve validation rejects invalid Reserve Preference date scopes", async () => {
  const { LineholderBidServiceError } = await import("../lineholder/shared.js");
  const { validateReserveDraftProperties } = await import("./reserve-validation.js");

  assert.throws(
    () => validateReserveDraftProperties([
      buildReservePreferenceProperty({
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "date_range", from: "2026-05-10", to: "2026-05-01" },
      }),
    ]),
    LineholderBidServiceError,
  );

  assert.throws(
    () => validateReserveDraftProperties([
      buildReservePreferenceProperty({
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-01"] },
      }),
    ]),
    LineholderBidServiceError,
  );
});
