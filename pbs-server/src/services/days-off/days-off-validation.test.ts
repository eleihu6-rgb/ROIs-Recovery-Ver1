import assert from "node:assert/strict";
import test from "node:test";
import { validateDaysOffDraftProperties } from "./days-off-validation.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";
import {
  pbsDaysOffAaPropertyCodes,
  type PbsDaysOffDraftProperty,
} from "../../../../packages/contracts/pbs-days-off-bids.js";
import type { PbsPreferOffConfig } from "../../../../packages/contracts/pbs-prefer-off.js";

const preferOffConfig: PbsPreferOffConfig = {
  weekdays: [
    { code: "MON", name: "Monday", order: 1, isoDay: 1 },
    { code: "TUE", name: "Tuesday", order: 2, isoDay: 2 },
    { code: "WED", name: "Wednesday", order: 3, isoDay: 3 },
    { code: "THU", name: "Thursday", order: 4, isoDay: 4 },
    { code: "FRI", name: "Friday", order: 5, isoDay: 5 },
    { code: "SAT", name: "Saturday", order: 6, isoDay: 6 },
    { code: "SUN", name: "Sunday", order: 7, isoDay: 7 },
  ],
  weekend: {
    available: true,
    startDayCode: "SAT",
    startDayName: "Saturday",
    startTime: "00:00",
    endDayCode: "SUN",
    endDayName: "Sunday",
    endTime: "24:00",
  },
};

const buildProperty = (
  property: Omit<PbsDaysOffDraftProperty, "rowSeq" | "name"> & { name?: string },
): PbsDaysOffDraftProperty => ({
  rowSeq: 1,
  name: `Property ${property.propertyCode}`,
  ...property,
});

test("allows compatible AA days off properties", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 2, min: 1, max: 12 },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      bid: { type: "flag" },
      tiers: ["T2"],
    }),
    buildProperty({
      propertyCode: 215,
      name: "String of Days Off Starting on Date",
      bid: { type: "date", value: "2026-04-10" },
      tiers: ["T3"],
    }),
  ];

  assert.doesNotThrow(() => validateDaysOffDraftProperties(properties));
});

test("rejects conflicting maximize and string properties in the same tier", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyCode: 212,
      name: "Maximize Weekend Days Off",
      bid: { type: "flag" },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 215,
      name: "String of Days Off Starting on Date",
      bid: { type: "date", value: "2026-04-10" },
      tiers: ["T1"],
    }),
  ];

  assert.throws(
    () => validateDaysOffDraftProperties(properties),
    (error) => error instanceof LineholderBidServiceError
      && error.statusCode === 400
      && error.message === "Only one maximize or string Days Off property can be active in T1.",
  );
});

test("rejects duplicate single-use properties in the same tier", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 2, min: 1, max: 12 },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 3, min: 1, max: 12 },
      tiers: ["T1"],
    }),
  ];

  assert.throws(
    () => validateDaysOffDraftProperties(properties),
    /Minimum Days Off Between Work Blocks can only be used once in T1/,
  );
});

test("rejects invalid minimum days off and invalid string dates", () => {
  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 211,
        name: "Minimum Days Off Between Work Blocks",
        bid: { type: "stepper", value: 13, min: 1, max: 12 },
        tiers: ["T1"],
      }),
    ]),
    /must be between 1 and 12/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 215,
        name: "String of Days Off Starting on Date",
        bid: { type: "date", value: "2026-02-30" },
        tiers: ["T1"],
      }),
    ]),
    /must use a valid date/,
  );
});

test("validates long stretch off date window shape and range length", () => {
  assert.doesNotThrow(() => validateDaysOffDraftProperties([
    buildProperty({
      propertyCode: 204,
      name: "Long Stretch Off / Compressed Flying",
      action: "award",
      bid: {
        type: "stepper-date-range",
        value: 2,
        from: "2026-05-01",
        to: "2026-05-07",
        min: 1,
        max: 14,
      },
      tiers: ["T1"],
    }),
  ], { rpStartLocal: "2026-05-01", rpEndLocal: "2026-05-31" }));

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 204,
        name: "Long Stretch Off / Compressed Flying",
        action: "award",
        bid: {
          type: "stepper-date-range",
          value: 2,
          from: "2026-05-07",
          to: "2026-05-01",
          min: 1,
          max: 14,
        },
        tiers: ["T1"],
      }),
    ]),
    /end date must be on or after start date/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 204,
        name: "Long Stretch Off / Compressed Flying",
        action: "award",
        bid: {
          type: "stepper-date-range",
          value: 5,
          from: "2026-05-01",
          to: "2026-05-03",
          min: 1,
          max: 14,
        },
        tiers: ["T1"],
      }),
    ], { rpStartLocal: "2026-05-01", rpEndLocal: "2026-05-31" }),
    /date range must be at least 5 days long/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 204,
        name: "Long Stretch Off / Compressed Flying",
        action: "award",
        bid: {
          type: "stepper-date-range",
          value: 2,
          from: "2026-04-30",
          to: "2026-05-03",
          min: 1,
          max: 14,
        },
        tiers: ["T1"],
      }),
    ], { rpStartLocal: "2026-05-01", rpEndLocal: "2026-05-31" }),
    /date window must be inside the current roster period/,
  );

  assert.doesNotThrow(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 204,
        name: "Long Stretch Off / Compressed Flying",
        action: null,
        bid: {
          type: "stepper-date-range",
          value: 2,
          from: "2026-05-01",
          to: "2026-05-07",
          min: 1,
          max: 14,
        },
        tiers: ["T1"],
      }),
    ], { rpStartLocal: "2026-05-01", rpEndLocal: "2026-05-31" }),
  );
});

test("validates days off / days on pattern fields", () => {
  assert.doesNotThrow(() => validateDaysOffDraftProperties([
    buildProperty({
      propertyCode: 205,
      name: "Days Off / Days On Pattern",
      bid: {
        type: "days-off-on-pattern",
        minDaysOff: 5,
        minDaysOn: 4,
        maxDaysOn: 5,
        min: 1,
        max: 14,
      },
      tiers: ["T1"],
    }),
  ]));

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 205,
        name: "Days Off / Days On Pattern",
        bid: { type: "stepper-range", from: 4, to: 5, min: 1, max: 14 },
        tiers: ["T1"],
      }),
    ]),
    /must include days on and days off values/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 205,
        name: "Days Off / Days On Pattern",
        bid: {
          type: "days-off-on-pattern",
          minDaysOff: 0,
          minDaysOn: 4,
          maxDaysOn: 5,
          min: 1,
          max: 14,
        },
        tiers: ["T1"],
      }),
    ]),
    /values must be between 1 and 14/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 205,
        name: "Days Off / Days On Pattern",
        bid: {
          type: "days-off-on-pattern",
          minDaysOff: 5,
          minDaysOn: 6,
          maxDaysOn: 4,
          min: 1,
          max: 14,
        },
        tiers: ["T1"],
      }),
    ]),
    /max days on must be greater than or equal to min days on/,
  );
});

test("validates employee schedule preference crew and days", () => {
  assert.doesNotThrow(() => validateDaysOffDraftProperties([
    buildProperty({
      propertyCode: 206,
      name: "Employee Schedule Preference",
      bid: {
        type: "employee-schedule-preference",
        crewId: "817",
        crewName: "Diana Crew",
        relationship: "apart",
        scheduleType: "days_off",
        thresholdType: "minimum",
        days: 12,
        min: 1,
        max: 31,
      },
      tiers: ["T1"],
    }),
  ]));

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 206,
        name: "Employee Schedule Preference",
        bid: {
          type: "employee-schedule-preference",
          crewId: " ",
          relationship: "apart",
          scheduleType: "days_off",
          thresholdType: "minimum",
          days: 12,
          min: 1,
          max: 31,
        },
        tiers: ["T1"],
      }),
    ]),
    /must include a crew/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 206,
        name: "Employee Schedule Preference",
        bid: {
          type: "employee-schedule-preference",
          crewId: "817",
          relationship: "apart",
          scheduleType: "days_off",
          thresholdType: "minimum",
          days: 0,
          min: 1,
          max: 31,
        },
        tiers: ["T1"],
      }),
    ]),
    /days must be between 1 and 31/,
  );

  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 206,
        name: "Employee Schedule Preference",
        bid: { type: "tag-list", values: ["817"] },
        tiers: ["T1"],
      }),
    ]),
    /must include a crew/,
  );
});

test("keeps legacy employee schedule preference employee number payload compatible", () => {
  assert.doesNotThrow(() => validateDaysOffDraftProperties([
    buildProperty({
      propertyCode: 206,
      name: "Employee Schedule Preference",
      bid: {
        type: "employee-schedule-preference",
        employeeNumber: "817",
        relationship: "apart",
        scheduleType: "days_off",
        thresholdType: "minimum",
        days: 12,
        min: 1,
        max: 31,
      } as unknown as PbsDaysOffDraftProperty["bid"],
      tiers: ["T1"],
    }),
  ]));
});

test("keeps legacy shared days off employee payload compatible", () => {
  assert.doesNotThrow(() => validateDaysOffDraftProperties([
    buildProperty({
      propertyCode: 206,
      name: "Employee Schedule Preference",
      bid: {
        type: "crew-days-off-share",
        employeeNumber: "817",
        minimumDays: 12,
        min: 1,
      },
      tiers: ["T1"],
    }),
  ]));
});

test("rejects later minimum days off values that are more restrictive than earlier tiers", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 2, min: 1, max: 12 },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 3, min: 1, max: 12 },
      tiers: ["T3"],
    }),
  ];

  assert.throws(
    () => validateDaysOffDraftProperties(properties),
    /Minimum Days Off Between Work Blocks in T3 cannot be greater than the earlier value from T1/,
  );
});

test("allows later minimum days off values that are equal or less restrictive", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 3, min: 1, max: 12 },
      tiers: ["T1"],
    }),
    buildProperty({
      propertyCode: 211,
      name: "Minimum Days Off Between Work Blocks",
      bid: { type: "stepper", value: 2, min: 1, max: 12 },
      tiers: ["T3"],
    }),
  ];

  assert.doesNotThrow(() => validateDaysOffDraftProperties(properties));
});

test("rejects days off properties outside T1-T7", () => {
  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 212,
        name: "Maximize Weekend Days Off",
        bid: { type: "flag" },
        tiers: ["T8"],
      }),
    ]),
    /Unsupported lineholder tier: T8/,
  );
});

test("allows overlapping Prefer Off dates in the same tier", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyGroupKey: "prefer-off-list",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["2026-04-19", "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-30"],
      },
      tiers: ["T1"],
      allOrNothing: true,
    }),
    buildProperty({
      propertyGroupKey: "prefer-off-range",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["Between 2026-04-19 - 2026-04-22"],
      },
      tiers: ["T1"],
      allOrNothing: true,
    }),
  ];

  assert.doesNotThrow(() => validateDaysOffDraftProperties(properties, {
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    preferOffConfig,
  }));
});

test("allows overlapping Prefer Off dates in different tiers", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyGroupKey: "prefer-off-list",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["2026-04-19"],
      },
      tiers: ["T1"],
      allOrNothing: true,
    }),
    buildProperty({
      propertyGroupKey: "prefer-off-range",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["Between 2026-04-19 - 2026-04-22"],
      },
      tiers: ["T2"],
      allOrNothing: true,
    }),
  ];

  assert.doesNotThrow(() => validateDaysOffDraftProperties(properties, {
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    preferOffConfig,
  }));
});

test("allows weekday Prefer Off values to overlap explicit dates", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyGroupKey: "prefer-off-monday",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["Monday"],
      },
      tiers: ["T1"],
      allOrNothing: true,
    }),
    buildProperty({
      propertyGroupKey: "prefer-off-date",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["2026-04-06"],
      },
      tiers: ["T1"],
      allOrNothing: true,
    }),
  ];

  assert.doesNotThrow(() => validateDaysOffDraftProperties(properties, {
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    preferOffConfig,
  }));
});

test("rejects reversed Prefer Off inline date ranges", () => {
  const properties: PbsDaysOffDraftProperty[] = [
    buildProperty({
      propertyGroupKey: "prefer-off-reversed-range",
      propertyCode: 201,
      name: "Prefer Off",
      bid: {
        type: "tag-list",
        values: ["Between 2026-04-22 - 2026-04-19"],
      },
      tiers: ["T1"],
      allOrNothing: true,
    }),
  ];

  assert.throws(
    () => validateDaysOffDraftProperties(properties, {
      rpStartLocal: "2026-04-01",
      rpEndLocal: "2026-04-30",
      preferOffConfig,
    }),
    /Prefer Off date range end date must be on or after start date\./,
  );
});

test("allows legacy Prefer Off flexible quantity fields without enforcing them", () => {
  const legacyFlexible = buildProperty({
    propertyCode: 201,
    name: "Prefer Off",
    bid: { type: "tag-list", values: ["2026-04-10", "2026-04-11", "2026-04-12"] },
    tiers: ["T1"],
    allOrNothing: false,
    minimumN: 2,
    maximumN: 3,
  });
  const legacyInvalidRange = { ...legacyFlexible, minimumN: 3, maximumN: 2 };

  assert.doesNotThrow(() => validateDaysOffDraftProperties([legacyFlexible], {
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    preferOffConfig,
  }));
  assert.doesNotThrow(() => validateDaysOffDraftProperties([legacyInvalidRange], {
    rpStartLocal: "2026-04-01",
    rpEndLocal: "2026-04-30",
    preferOffConfig,
  }));
});

test("rejects Prefer Off without a tier, with an overnight window, or without Weekend configuration", () => {
  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["2026-04-10"] },
        tiers: [],
        allOrNothing: true,
      }),
    ], { rpStartLocal: "2026-04-01", rpEndLocal: "2026-04-30", preferOffConfig }),
    /requires at least one tier/,
  );
  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["2026-04-10", "Window 23:00-02:00"] },
        tiers: ["T1"],
        allOrNothing: true,
      }),
    ], { rpStartLocal: "2026-04-01", rpEndLocal: "2026-04-30", preferOffConfig }),
    /valid same-day From and To time/,
  );
  assert.throws(
    () => validateDaysOffDraftProperties([
      buildProperty({
        propertyCode: 201,
        name: "Prefer Off",
        bid: { type: "tag-list", values: ["Weekends"] },
        tiers: ["T1"],
        allOrNothing: true,
      }),
    ], {
      rpStartLocal: "2026-04-01",
      rpEndLocal: "2026-04-30",
      preferOffConfig: { ...preferOffConfig, weekend: { available: false } },
    }),
    /weekend configuration is unavailable/,
  );
});

test("validates Prefer Off against a non-calendar roster period range", () => {
  const inside = buildProperty({
    propertyCode: 201,
    name: "Prefer Off",
    bid: { type: "tag-list", values: ["2026-01-31", "2026-03-01"] },
    tiers: ["T1"],
    allOrNothing: true,
  });
  const outside = {
    ...inside,
    bid: { type: "tag-list" as const, values: ["2026-01-30"] },
  };
  const options = {
    rpStartLocal: "2026-01-31",
    rpEndLocal: "2026-03-01",
    preferOffConfig,
  };

  assert.doesNotThrow(() => validateDaysOffDraftProperties([inside], options));
  assert.throws(
    () => validateDaysOffDraftProperties([outside], options),
    /inside the current bid period/,
  );
});

test("rejects explicit Days Off dates outside the real roster period", () => {
  const outside = buildProperty({
    propertyCode: pbsDaysOffAaPropertyCodes.stringOfDaysOffStartingOnDate,
    name: "String of Days Off Starting on Date",
    bid: { type: "date", value: "2026-01-30" },
    tiers: ["T1"],
  });

  assert.throws(
    () => validateDaysOffDraftProperties([outside], {
      rpStartLocal: "2026-01-31",
      rpEndLocal: "2026-03-01",
    }),
    (error: unknown) => error instanceof LineholderBidServiceError
      && error.errorCode === "DATE_OUTSIDE_ROSTER_PERIOD",
  );
});
