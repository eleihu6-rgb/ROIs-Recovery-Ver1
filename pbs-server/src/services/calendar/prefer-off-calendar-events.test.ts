import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreferOffCalendarEvents,
  buildPreferOffDatesByTier,
  extractPreferOffCalendarDates,
  type PreferOffCalendarRow,
} from "./prefer-off-calendar-events.js";
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

const buildRow = (overrides: Partial<PreferOffCalendarRow> = {}): PreferOffCalendarRow => ({
  propertyGroupKey: "prefer-off-1",
  groupSeq: 1,
  tier: 1,
  legacyPropertyCode: 201,
  propertyCode: 201,
  operator: "In",
  paramA: "2026-04-05",
  paramB: null,
  paramC: null,
  ...overrides,
});

test("extractPreferOffCalendarDates reads single and comma-separated dates", () => {
  assert.deepEqual(
    extractPreferOffCalendarDates(
      buildRow({ paramA: "2026-04-05, 2026-04-07" }),
      "2026-04-01",
      "2026-04-30",
      preferOffConfig,
    ),
    ["2026-04-05", "2026-04-07"],
  );
});

test("extractPreferOffCalendarDates expands stable date ranges", () => {
  assert.deepEqual(
    extractPreferOffCalendarDates(buildRow({
      operator: "Between",
      paramA: "2026-04-05",
      paramB: "2026-04-07",
    }), "2026-04-01", "2026-04-30", preferOffConfig),
    ["2026-04-05", "2026-04-06", "2026-04-07"],
  );
  assert.deepEqual(
    extractPreferOffCalendarDates(buildRow({
      paramA: "Between 2026-04-10 - 2026-04-12, Window 08:00-18:00",
    }), "2026-04-01", "2026-04-30", preferOffConfig),
    ["2026-04-10", "2026-04-11", "2026-04-12"],
  );
});

test("extractPreferOffCalendarDates expands the configured Weekend interval", () => {
  assert.deepEqual(
    extractPreferOffCalendarDates(
      buildRow({ paramA: "Weekends, Window 09:00-17:00" }),
      "2026-06-01",
      "2026-06-30",
      preferOffConfig,
    ),
    [
      "2026-06-06",
      "2026-06-07",
      "2026-06-13",
      "2026-06-14",
      "2026-06-20",
      "2026-06-21",
      "2026-06-27",
      "2026-06-28",
    ],
  );
});

test("buildPreferOffDatesByTier groups prefer off dates by active tier", () => {
  const datesByTier = buildPreferOffDatesByTier([
    buildRow({ tier: 1, paramA: "2026-04-05,2026-04-06" }),
    buildRow({ propertyGroupKey: "prefer-off-2", tier: 3, paramA: "2026-04-06" }),
  ], "2026-04-01", "2026-04-30", preferOffConfig);

  assert.deepEqual(Array.from(datesByTier.get(1) ?? []), ["2026-04-05", "2026-04-06"]);
  assert.deepEqual(Array.from(datesByTier.get(3) ?? []), ["2026-04-06"]);
});

test("buildPreferOffCalendarEvents emits pbs_bid_group prefer off events and deduplicates tier dates", () => {
  const events = buildPreferOffCalendarEvents([
    buildRow({ propertyGroupKey: "prefer-off-1", tier: 1, paramA: "2026-04-05,2026-04-05" }),
    buildRow({ propertyGroupKey: "prefer-off-2", tier: 1, paramA: "Between 2026-04-05 - 2026-04-05" }),
    buildRow({ propertyGroupKey: "prefer-off-1", tier: 2, paramA: "2026-04-05" }),
  ], "2026-04-01", "2026-04-30", preferOffConfig);

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => ({
    type: event.type,
    tier: event.tier,
    startDate: event.startDate,
    source: event.source,
    propertyGroupKey: event.metadata?.propertyGroupKey,
  })), [
    {
      type: "prefer_off_bid",
      tier: "T1",
      startDate: "2026-04-05",
      source: "pbs_bid_group",
      propertyGroupKey: "prefer-off-1",
    },
    {
      type: "prefer_off_bid",
      tier: "T2",
      startDate: "2026-04-05",
      source: "pbs_bid_group",
      propertyGroupKey: "prefer-off-1",
    },
  ]);
});
