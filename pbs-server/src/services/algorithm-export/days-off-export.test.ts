import assert from "node:assert/strict";
import test from "node:test";
import { buildDaysOffCsvFromRows, extractPreferOffDates } from "./days-off-export.js";
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

test("extractPreferOffDates expands each unified Prefer Off mode inside the period", () => {
  assert.deepEqual(
    extractPreferOffDates({ type: "tag-list", values: ["2026-04-03"] }, "Apr 2026", preferOffConfig),
    ["2026-04-03"],
  );
  assert.deepEqual(
    extractPreferOffDates(
      { type: "tag-list", values: ["Between 2026-04-29 - 2026-04-30"] },
      "Apr 2026",
      preferOffConfig,
    ),
    ["2026-04-29", "2026-04-30"],
  );
  assert.deepEqual(
    extractPreferOffDates({ type: "tag-list", values: ["Monday"] }, "Apr 2026", preferOffConfig),
    [
      "2026-04-06",
      "2026-04-13",
      "2026-04-20",
      "2026-04-27",
    ],
  );
  assert.deepEqual(
    extractPreferOffDates(
      { type: "tag-list", values: ["Weekends", "Window 09:00-18:00"] },
      "Apr 2026",
      preferOffConfig,
    ),
    [
      "2026-04-04",
      "2026-04-05",
      "2026-04-11",
      "2026-04-12",
      "2026-04-18",
      "2026-04-19",
      "2026-04-25",
      "2026-04-26",
    ],
  );
});

test("extractPreferOffDates rejects dates outside the bid period and incomplete Weekend blocks", () => {
  assert.deepEqual(
    extractPreferOffDates(
      { type: "tag-list", values: ["Between 2026-04-29 - 2026-05-02"] },
      "Apr 2026",
      preferOffConfig,
    ),
    [],
  );
  assert.deepEqual(
    extractPreferOffDates({ type: "tag-list", values: ["Weekends"] }, "May 2026", preferOffConfig),
    [
      "2026-05-02",
      "2026-05-03",
      "2026-05-09",
      "2026-05-10",
      "2026-05-16",
      "2026-05-17",
      "2026-05-23",
      "2026-05-24",
      "2026-05-30",
      "2026-05-31",
    ],
  );
});

test("buildDaysOffCsvFromRows accumulates counters by crew date and tier", () => {
  const csv = buildDaysOffCsvFromRows([
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 1,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-04-05",
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 1,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "Weekends",
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 3,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "Between 2026-04-05 - 2026-04-06",
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 8,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-04-05",
      paramB: null,
      paramC: null,
    },
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 1,
      propertyCode: 204,
      legacyPropertyCode: 204,
      operator: "Between",
      paramA: "2",
      paramB: "2026-04-01",
      paramC: "2026-04-07",
    },
  ], [
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 1,
      bidDate: "2026-04-05",
    },
  ], "Apr 2026", undefined, preferOffConfig);

  assert.equal(csv, [
    "Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter",
    "F8030,2026-04-04T04:00:00Z,2026-04-05T03:59:59Z,1,0,0,0,0,0,0",
    "F8030,2026-04-05T04:00:00Z,2026-04-06T03:59:59Z,3,0,1,0,0,0,0",
    "F8030,2026-04-06T04:00:00Z,2026-04-07T03:59:59Z,0,0,1,0,0,0,0",
    "F8030,2026-04-11T04:00:00Z,2026-04-12T03:59:59Z,1,0,0,0,0,0,0",
    "F8030,2026-04-12T04:00:00Z,2026-04-13T03:59:59Z,1,0,0,0,0,0,0",
    "F8030,2026-04-18T04:00:00Z,2026-04-19T03:59:59Z,1,0,0,0,0,0,0",
    "F8030,2026-04-19T04:00:00Z,2026-04-20T03:59:59Z,1,0,0,0,0,0,0",
    "F8030,2026-04-25T04:00:00Z,2026-04-26T03:59:59Z,1,0,0,0,0,0,0",
    "F8030,2026-04-26T04:00:00Z,2026-04-27T03:59:59Z,1,0,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("buildDaysOffCsvFromRows uses partial Weekend boundaries with Temporal-compatible DST handling", () => {
  const sundayConfig = (startTime: string, endTime: string): PbsPreferOffConfig => ({
    ...preferOffConfig,
    weekend: {
      available: true,
      startDayCode: "SUN",
      startDayName: "Sunday",
      startTime,
      endDayCode: "SUN",
      endDayName: "Sunday",
      endTime,
    },
  });
  const bidRow = {
    crewId: "F8030",
    zoneId: "America/Vancouver",
    tier: 1,
    propertyCode: 201,
    legacyPropertyCode: 201,
    operator: "In",
    paramA: "Weekends",
    paramB: null,
    paramC: null,
  };

  const springCsv = buildDaysOffCsvFromRows(
    [bidRow],
    [],
    "Mar 2026",
    undefined,
    sundayConfig("02:30", "04:00"),
  );
  assert.match(springCsv, /F8030,2026-03-08T10:30:00Z,2026-03-08T10:59:59Z,1,0,0,0,0,0,0/);

  const fallCsv = buildDaysOffCsvFromRows(
    [bidRow],
    [],
    "Nov 2026",
    undefined,
    sundayConfig("01:30", "02:30"),
  );
  assert.match(fallCsv, /F8030,2026-11-01T08:30:00Z,2026-11-01T10:29:59Z,1,0,0,0,0,0,0/);
});

test("buildDaysOffCsvFromRows leaves UTC timestamps blank when crew base timezone is missing", () => {
  const csv = buildDaysOffCsvFromRows([
    {
      crewId: "NOBASE",
      zoneId: null,
      tier: 1,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-06-11",
      paramB: null,
      paramC: null,
    },
  ], [], "Jun 2026");

  assert.equal(csv, [
    "Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter",
    "NOBASE,,,1,0,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("buildDaysOffCsvFromRows leaves UTC timestamps blank when crew base timezone is invalid", () => {
  const csv = buildDaysOffCsvFromRows([
    {
      crewId: "BADZONE",
      zoneId: "Not/AZone",
      tier: 2,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-06-11",
      paramB: null,
      paramC: null,
    },
  ], [], "Jun 2026");

  assert.equal(csv, [
    "Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter",
    "BADZONE,,,0,1,0,0,0,0,0",
    "",
  ].join("\n"));
});

test("buildDaysOffCsvFromRows ignores legacy Prefer Off quantity fields", () => {
  const legacyQuantityFields = { allOrNothing: false, minimumN: 2, maximumN: 3 };
  const csv = buildDaysOffCsvFromRows([
    {
      crewId: "F8030",
      zoneId: "America/Toronto",
      tier: 1,
      propertyCode: 201,
      legacyPropertyCode: 201,
      operator: "In",
      paramA: "2026-04-05",
      paramB: null,
      paramC: null,
      ...legacyQuantityFields,
    },
  ], [], "Apr 2026", undefined, preferOffConfig);

  assert.equal(csv, [
    "Crew_ID,DayOff_Start_Time_UTC,DayOff_End_Time_UTC,T1_Award_Counter,T2_Award_Counter,T3_Award_Counter,T4_Award_Counter,T5_Award_Counter,T6_Award_Counter,T7_Award_Counter",
    "F8030,2026-04-05T04:00:00Z,2026-04-06T03:59:59Z,1,0,0,0,0,0,0",
    "",
  ].join("\n"));
});
