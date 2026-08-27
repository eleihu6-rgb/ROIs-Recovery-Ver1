import assert from "node:assert/strict";
import test from "node:test";
import type { PbsLineDraftProperty } from "../../../../packages/contracts/pbs-line-bids.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import { validateLineDraftProperties } from "./line-validation.js";

const buildProperty = (
  property: Omit<PbsLineDraftProperty, "rowSeq" | "name"> & { name?: string },
): PbsLineDraftProperty => ({
  rowSeq: 1,
  name: `Property ${property.propertyCode}`,
  ...property,
});

test("allows legacy Line properties and hidden AA extensions when values are valid", () => {
  const properties: PbsLineDraftProperty[] = [
    buildProperty({
      propertyCode: 403,
      name: "Clear Schedule and Start Next Bid Group",
      bid: { type: "flag" },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 406,
      name: "Forget Line",
      bid: { type: "stepper", value: 12, min: 1, max: 999 },
      tiers: ["T2"],
    }),
    buildProperty({
      propertyCode: 407,
      name: "Minimum Base Layover",
      bid: { type: "minimum-base-layover", minimumDuration: "13:00" },
      tiers: ["T3"],
    }),
    buildProperty({
      propertyCode: 408,
      name: "Commuter Pattern",
      bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 5, maxDaysOn: 5, min: 1, max: 14 },
      tiers: ["T4"],
    }),
    buildProperty({
      propertyCode: 409,
      name: "Most Flying In Least Working Days (Configured)",
      bid: {
        type: "credit-density-preference",
        minimumTotalCredit: "78:00",
        maximumWorkingDays: 14,
        strength: "strong",
      },
      tiers: ["T5"],
    }),
    buildProperty({
      propertyCode: 410,
      name: "Reserve / Flying Date Pattern",
      bid: {
        type: "reserve-flying-date-pattern",
        segments: [
          { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
          { workType: "flying", dateScope: { mode: "second_half" } },
        ],
        callTypeOptions: ["PRAM", "PRPM"],
        strength: "strong",
      },
      tiers: ["T5"],
    }),
    buildProperty({
      propertyCode: 429,
      name: "Credit Window Preference",
      bid: {
        type: "credit-window-preference",
        direction: "more",
      },
      tiers: ["T6"],
    }),
    buildProperty({
      propertyCode: 411,
      name: "Target Credit Range",
      bid: { type: "stepper-range", from: 75, to: 85, min: 40, max: 110 },
      tiers: ["T6"],
    }),
    buildProperty({
      propertyCode: 427,
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
      tiers: ["T7"],
    }),
  ];

  assert.doesNotThrow(() => validateLineDraftProperties(properties));
});

test("allows Line Reserve when Award or Avoid is selected", () => {
  assert.doesNotThrow(() => validateLineDraftProperties([
    buildProperty({
      propertyCode: 427,
      name: "Reserve",
      action: "award",
      bid: { type: "flag" },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 427,
      name: "Reserve",
      action: "avoid",
      bid: { type: "flag" },
      tiers: ["T2"],
    }),
  ]));
});

test("allows Mixed Line Reserve Preference short-call bids", () => {
  assert.doesNotThrow(() => validateLineDraftProperties([
    buildProperty({
      propertyCode: 301,
      name: "Reserve Preference",
      action: "award",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "PRAM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "date_range", from: "2026-09-01", to: "2026-09-03" },
      },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 301,
      name: "Reserve Preference",
      action: "avoid",
      bid: {
        type: "reserve-call-type-date-scope",
        callType: "PRPM",
        options: ["PRAM", "PRPM"],
        dateScope: { mode: "whole_month" },
      },
      tiers: ["T2"],
    }),
  ]));
});

test("rejects invalid Mixed Line Reserve Preference short-call bids", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 301,
        name: "Reserve Preference",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "PRAM",
          options: ["PRAM"],
          dateScope: { mode: "whole_month" },
        },
        tiers: ["T1"],
      }),
    ]),
    /Reserve Preference requires Award or Avoid/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 301,
        name: "Reserve Preference",
        action: "award",
        bid: {
          type: "reserve-call-type-date-scope",
          callType: "BAD",
          options: ["PRAM"],
          dateScope: { mode: "date_range", from: "2026-09-03", to: "2026-09-01" },
        },
        tiers: ["T1"],
      }),
    ]),
    /Reserve Preference must use a valid reserve call type/,
  );
});

test("rejects legacy Efficient Flying First Line properties", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 428,
        name: "Efficient Flying First",
        bid: { type: "flag" },
        tiers: ["T1"],
      }),
    ]),
    /Efficient Flying First is a Pairing property/,
  );
});

test("validates Line Credit Window Preference directions", () => {
  assert.doesNotThrow(() => validateLineDraftProperties([
    buildProperty({
      propertyCode: 429,
      name: "Credit Window Preference",
      bid: {
        type: "credit-window-preference",
        direction: "less",
      },
      tiers: ["T1"],
    }),
  ]));

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 429,
        name: "Credit Window Preference",
        bid: {
          type: "credit-window-preference",
          mode: "custom",
          minimumCredit: "84:00",
          maximumCredit: "74:00",
        } as never,
        tiers: ["T1"],
      }),
    ]),
    /Credit Window Preference must use More credit or Less credit/,
  );
});

test("rejects Line Reserve without explicit action or with old avoidance payloads", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 427,
        name: "Reserve",
        bid: { type: "flag" },
        tiers: ["T1"],
      }),
    ]),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Reserve requires Award or Avoid.",
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 427,
        name: "Reserve",
        action: "avoid",
        bid: { type: "reserve-avoidance", mode: "if_possible" } as never,
        tiers: ["T1"],
      }),
    ]),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Reserve must use a flag bid.",
  );
});

test("allows Reserve / Flying Date Pattern with custom reserve and flying dates", () => {
  assert.doesNotThrow(() => validateLineDraftProperties([
    buildProperty({
      propertyCode: 410,
      name: "Reserve / Flying Date Pattern",
      bid: {
        type: "reserve-flying-date-pattern",
        segments: [
          {
            workType: "reserve",
            callType: "PRAM",
            dateScope: { mode: "specific_dates", dates: ["2026-05-01", "2026-05-03", "2026-05-05"] },
          },
          {
            workType: "reserve",
            callType: "PRPM",
            dateScope: { mode: "specific_dates", dates: ["2026-05-02", "2026-05-04", "2026-05-06"] },
          },
          {
            workType: "flying",
            dateScope: { mode: "specific_dates", dates: ["2026-05-11"] },
          },
        ],
        callTypeOptions: ["PRAM", "PRPM"],
        strength: "must_try",
      },
      tiers: ["T1", "T2"],
    }),
  ]));
});

test("rejects invalid Reserve / Flying Date Pattern values", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [],
          callTypeOptions: ["PRAM", "PRPM"],
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /Reserve \/ Flying Date Pattern must use 1-4 valid segments and a valid strength/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [
            { workType: "reserve", callType: "BAD", dateScope: { mode: "first_half" } },
          ],
          callTypeOptions: ["PRAM", "PRPM"],
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /reserve segments must use a valid call type/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [
            {
              workType: "flying",
              callType: "PRAM",
              dateScope: { mode: "second_half" },
            } as never,
          ],
          callTypeOptions: ["PRAM", "PRPM"],
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /flying segments cannot use a reserve call type/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [
            { workType: "reserve", callType: "PRAM", dateScope: { mode: "date_range", from: "2026-05-10", to: "2026-05-01" } },
          ],
          callTypeOptions: ["PRAM", "PRPM"],
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /date range end date must be on or after start date/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 410,
        name: "Reserve / Flying Date Pattern",
        bid: {
          type: "reserve-flying-date-pattern",
          segments: [
            { workType: "reserve", callType: "PRAM", dateScope: { mode: "first_half" } },
            { workType: "flying", dateScope: { mode: "specific_dates", dates: ["2026-05-03"] } },
          ],
          callTypeOptions: ["PRAM", "PRPM"],
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /segments cannot overlap on the same date/,
  );
});

test("rejects invalid legacy Line values", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 406,
        name: "Forget Line",
        bid: { type: "stepper", value: 0, min: 1, max: 999 },
        tiers: ["T1"],
      }),
    ]),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Forget Line must be a positive line number.",
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 407,
        name: "Minimum Base Layover",
        bid: { type: "minimum-base-layover", minimumDuration: "13:75" },
        tiers: ["T1"],
      }),
    ]),
    /Minimum Base Layover must use a valid duration like 13:00/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 407,
        name: "Minimum Base Layover",
        bid: { type: "minimum-base-layover", minimumDuration: "12:59" },
        tiers: ["T1"],
      }),
    ], {
      minimumBaseLayoverConfig: {
        available: true,
        minDuration: "013:00",
      },
    }),
    /Minimum Base Layover must be at least 13:00/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: { type: "stepper", value: 5 },
        tiers: ["T1"],
      }),
    ]),
    /Commuter Pattern must use valid work\/off block values between 1 and 14/,
  );

  assert.doesNotThrow(() => validateLineDraftProperties([
    buildProperty({
      propertyCode: 408,
      name: "Commuter Pattern",
      bid: {
        type: "days-off-on-pattern",
        minDaysOff: 4,
        minDaysOn: 4,
        maxDaysOn: 5,
        dateRange: { from: "2026-04-02", to: "2026-04-18" },
      },
      tiers: ["T1"],
    }),
  ]));

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: {
          type: "days-off-on-pattern",
          minDaysOff: 4,
          minDaysOn: 4,
          maxDaysOn: 5,
          dateRange: { from: "2026-04-18", to: "2026-04-02" },
        },
        tiers: ["T1"],
      }),
    ]),
    /Commuter Pattern date range end date must be on or after start date/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: {
          type: "days-off-on-pattern",
          minDaysOff: 4,
          minDaysOn: 4,
          maxDaysOn: 5,
          dateRange: { from: "2026-04-02", to: "2026-04-05" },
        },
        tiers: ["T1"],
      }),
    ]),
    /Commuter Pattern date range must be at least 8 days long/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 408,
        name: "Commuter Pattern",
        bid: { type: "days-off-on-pattern", minDaysOff: 4, minDaysOn: 6, maxDaysOn: 5 },
        tiers: ["T1"],
      }),
    ]),
    /Commuter Pattern must use valid work\/off block values between 1 and 14/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 409,
        name: "Most Flying In Least Working Days (Configured)",
        bid: { type: "flag" },
        tiers: ["T1"],
      }),
    ]),
    /Most Flying In Least Working Days \(Configured\) must use 40:00-120:00 credit and 1-31 working days/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 409,
        name: "Most Flying In Least Working Days (Configured)",
        bid: {
          type: "credit-density-preference",
          minimumTotalCredit: "20:00",
          maximumWorkingDays: 14,
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /Most Flying In Least Working Days \(Configured\) must use 40:00-120:00 credit and 1-31 working days/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 409,
        name: "Most Flying In Least Working Days (Configured)",
        bid: {
          type: "credit-density-preference",
          minimumTotalCredit: "78:00",
          maximumWorkingDays: 32,
          strength: "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /Most Flying In Least Working Days \(Configured\) must use 40:00-120:00 credit and 1-31 working days/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 409,
        name: "Most Flying In Least Working Days (Configured)",
        bid: {
          type: "credit-density-preference",
          minimumTotalCredit: "78:00",
          maximumWorkingDays: 14,
          strength: "invalid" as "strong",
        },
        tiers: ["T1"],
      }),
    ]),
    /Most Flying In Least Working Days \(Configured\) must use 40:00-120:00 credit and 1-31 working days/,
  );
});

test("uses the latest Minimum Base Layover definition for new or changed values", () => {
  const property = buildProperty({
    propertyCode: 407,
    name: "Minimum Base Layover",
    bid: { type: "minimum-base-layover", minimumDuration: "13:00" },
    tiers: ["T1"],
  });

  assert.throws(
    () => validateLineDraftProperties([property], {
      minimumBaseLayoverConfig: { available: true, minDuration: "014:00" },
    }),
    /Minimum Base Layover must be at least 14:00/,
  );

  assert.doesNotThrow(() => validateLineDraftProperties([{ ...property, bid: {
    type: "minimum-base-layover",
    minimumDuration: "14:00",
  } }], {
    minimumBaseLayoverConfig: { available: true, minDuration: "014:00" },
  }));
});

test("grandfathers only an unchanged Minimum Base Layover value", () => {
  const property = buildProperty({
    propertyCode: 407,
    name: "Minimum Base Layover",
    bid: { type: "minimum-base-layover", minimumDuration: "13:00" },
    tiers: ["T1"],
  });

  assert.doesNotThrow(() => validateLineDraftProperties([property], {
    minimumBaseLayoverConfig: { available: true, minDuration: "014:00" },
    isGrandfatheredMinimumBaseLayover: (candidate) => candidate === property,
  }));

  assert.throws(
    () => validateLineDraftProperties([property], {
      minimumBaseLayoverConfig: { available: false },
    }),
    /Minimum Base Layover configuration is unavailable/,
  );
});

test("rejects invalid AA Line ranges and duplicate single-use properties in the same tier", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 411,
        name: "Target Credit Range",
        bid: { type: "stepper-range", from: 78, to: 80, min: 40, max: 110 },
        tiers: ["T1"],
      }),
    ]),
    /Target Credit Range must be between 40 and 110/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 414,
        name: "Work Block Size",
        bid: { type: "stepper-range", from: 3, to: 5, min: 1, max: 12 },
        tiers: ["T1"],
      }),
      buildProperty({
        propertyCode: 414,
        name: "Work Block Size",
        bid: { type: "stepper-range", from: 2, to: 4, min: 1, max: 12 },
        tiers: ["T1"],
      }),
    ]),
    /Work Block Size can only be used once in T1/,
  );
});

test("rejects invalid Line tiers and AA date or tuple values", () => {
  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 419,
        name: "Allow Multiple Pairings",
        bid: { type: "flag" },
        tiers: ["T8"],
      }),
    ]),
    /Unsupported lineholder tier: T8/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 418,
        name: "Allow Double-Up on Date",
        bid: { type: "date", value: "2026-02-30" },
        tiers: ["T1"],
      }),
    ]),
    /Allow Double-Up on Date must use a valid date/,
  );

  assert.throws(
    () => validateLineDraftProperties([
      buildProperty({
        propertyCode: 417,
        name: "Pairing Mix in a Work Block",
        bid: { type: "tag-list", values: ["4,4"], suggestions: ["3,1"] },
        tiers: ["T1"],
      }),
    ]),
    /Pairing Mix in a Work Block must use pairing length pairs totaling 3 to 6 days/,
  );
});
