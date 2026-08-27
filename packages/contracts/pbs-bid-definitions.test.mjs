import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPbsEfficientFlyingPercentileDefinition,
  formatPbsMinimumBaseLayoverDefinition,
  formatPbsMinimumTimeBetweenFlightsDefinition,
  formatPbsRedeyeDefinition,
  getPbsWeekendDurationMinutes,
  parsePbsMinimumBaseLayoverDefinition,
  parsePbsMinimumTimeBetweenFlightsDefinition,
  parsePbsEfficientFlyingPercentileDefinition,
  parsePbsRedeyeDefinition,
} from "./pbs-bid-definitions.js";
import { expandPbsWeekendIntervals } from "./pbs-prefer-off.js";

test("parsePbsRedeyeDefinition derives cross-midnight without a stored flag", () => {
  assert.deepEqual(parsePbsRedeyeDefinition({ startTime: "23:00", endTime: "05:00" }), {
    available: true,
    startTime: "23:00",
    endTime: "05:00",
    crossesMidnight: true,
    version: "23:00|05:00",
  });
  assert.equal(
    formatPbsRedeyeDefinition(parsePbsRedeyeDefinition({ startTime: "23:00", endTime: "05:00" })),
    "23:00–05:00 local time · Crosses midnight",
  );
});

test("parsePbsRedeyeDefinition rejects invalid and zero-length windows", () => {
  assert.deepEqual(parsePbsRedeyeDefinition({ startTime: "25:00", endTime: "05:00" }), { available: false });
  assert.deepEqual(parsePbsRedeyeDefinition({ startTime: "05:00", endTime: "05:00" }), { available: false });
});

test("parsePbsMinimumBaseLayoverDefinition normalizes a positive duration", () => {
  assert.deepEqual(parsePbsMinimumBaseLayoverDefinition({ minDuration: "14:05" }), {
    available: true,
    minDuration: "014:05",
  });
  assert.equal(
    formatPbsMinimumBaseLayoverDefinition(parsePbsMinimumBaseLayoverDefinition({ minDuration: "14:05" })),
    "14:05 minimum",
  );
});

test("parsePbsMinimumBaseLayoverDefinition rejects invalid and zero durations", () => {
  assert.deepEqual(parsePbsMinimumBaseLayoverDefinition({ minDuration: "13:60" }), { available: false });
  assert.deepEqual(parsePbsMinimumBaseLayoverDefinition({ minDuration: "0:00" }), { available: false });
});

test("parsePbsMinimumTimeBetweenFlightsDefinition accepts integer minutes and formats HH:MM", () => {
  assert.deepEqual(parsePbsMinimumTimeBetweenFlightsDefinition({ minimumMinutes: "45" }), {
    available: true,
    minimumMinutes: 45,
  });
  assert.equal(
    formatPbsMinimumTimeBetweenFlightsDefinition(
      parsePbsMinimumTimeBetweenFlightsDefinition({ minimumMinutes: 1485 }),
    ),
    "24:45 minimum",
  );
});

test("parsePbsMinimumTimeBetweenFlightsDefinition rejects zero, decimals, and oversized values", () => {
  for (const minimumMinutes of [undefined, null, "", 0, "1.5", 1.5, 60_000, -1]) {
    assert.deepEqual(parsePbsMinimumTimeBetweenFlightsDefinition({ minimumMinutes }), { available: false });
  }
});

test("parsePbsEfficientFlyingPercentileDefinition accepts and formats integers from 1 through 50", () => {
  assert.deepEqual(parsePbsEfficientFlyingPercentileDefinition({ percentile: " 20 " }), {
    available: true,
    percentile: 20,
  });
  assert.deepEqual(parsePbsEfficientFlyingPercentileDefinition({ percentile: 50 }), {
    available: true,
    percentile: 50,
  });
  assert.equal(
    formatPbsEfficientFlyingPercentileDefinition(
      parsePbsEfficientFlyingPercentileDefinition({ percentile: 15 }),
    ),
    "15%",
  );
});

test("parsePbsEfficientFlyingPercentileDefinition rejects missing, decimal, and out-of-range values", () => {
  for (const percentile of [undefined, null, "", "20.5", 20.5, 0, 51, -1]) {
    assert.deepEqual(parsePbsEfficientFlyingPercentileDefinition({ percentile }), { available: false });
  }
});

test("getPbsWeekendDurationMinutes normalizes 24:00 and same-day windows", () => {
  assert.equal(getPbsWeekendDurationMinutes({
    startDayIso: 6,
    startTime: "00:00",
    endDayIso: 7,
    endTime: "24:00",
  }), 2880);
  assert.equal(getPbsWeekendDurationMinutes({
    startDayIso: 5,
    startTime: "18:00",
    endDayIso: 5,
    endTime: "23:00",
  }), 300);
  assert.equal(getPbsWeekendDurationMinutes({
    startDayIso: 1,
    startTime: "00:00",
    endDayIso: 7,
    endTime: "24:00",
  }), null);
});

test("expandPbsWeekendIntervals keeps partial days and clips cross-month intervals", () => {
  const config = {
    weekdays: [
      { code: "FRI", name: "Friday", isoDay: 5, order: 5 },
      { code: "SUN", name: "Sunday", isoDay: 7, order: 7 },
    ],
    weekend: {
      available: true,
      startDayCode: "FRI",
      startDayName: "Friday",
      startTime: "18:00",
      endDayCode: "SUN",
      endDayName: "Sunday",
      endTime: "12:00",
    },
  };

  const intervals = expandPbsWeekendIntervals("2026-08-01", "2026-08-31", config);
  assert.deepEqual(intervals[0], {
    anchorDate: "2026-07-31",
    startDate: "2026-08-01",
    startTime: "00:00",
    endDate: "2026-08-02",
    endTime: "12:00",
    dates: ["2026-08-01", "2026-08-02"],
  });
  assert.deepEqual(intervals.at(-1), {
    anchorDate: "2026-08-28",
    startDate: "2026-08-28",
    startTime: "18:00",
    endDate: "2026-08-30",
    endTime: "12:00",
    dates: ["2026-08-28", "2026-08-29", "2026-08-30"],
  });
});
