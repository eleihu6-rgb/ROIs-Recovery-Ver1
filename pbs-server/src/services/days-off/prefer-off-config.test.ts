import assert from "node:assert/strict";
import test from "node:test";
import { buildPreferOffConfigFromDictionaryRows } from "./prefer-off-config.js";

const weekdayRows = [
  { parentCode: "DOW", code: "SUN", name: "Sunday", codeValue: "7", idx: 7 },
  { parentCode: "DOW", code: "FRI", name: "Friday", codeValue: "5", idx: 5 },
  { parentCode: "DOW", code: "SAT", name: "Saturday", codeValue: "6", idx: 6 },
  { parentCode: "DOW", code: "MON", name: "Monday", codeValue: "1", idx: 1 },
];

test("buildPreferOffConfigFromDictionaryRows orders weekdays and resolves the F8 Weekend definition", () => {
  const config = buildPreferOffConfigFromDictionaryRows([
    ...weekdayRows,
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_DOW", name: "Weekend start day", codeValue: "SAT", idx: 1 },
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_TIME", name: "Weekend start time", codeValue: "00:00", idx: 2 },
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_DOW", name: "Weekend end day", codeValue: "SUN", idx: 3 },
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_TIME", name: "Weekend end time", codeValue: "24:00", idx: 4 },
  ]);

  assert.deepEqual(config.weekdays.map((weekday) => weekday.code), ["MON", "FRI", "SAT", "SUN"]);
  assert.deepEqual(config.weekend, {
    available: true,
    startDayCode: "SAT",
    startDayName: "Saturday",
    startTime: "00:00",
    endDayCode: "SUN",
    endDayName: "Sunday",
    endTime: "24:00",
  });
});

test("buildPreferOffConfigFromDictionaryRows disables Weekend mode when required dictionary values are invalid", () => {
  const config = buildPreferOffConfigFromDictionaryRows([
    ...weekdayRows,
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_DOW", name: null, codeValue: "FRI", idx: 1 },
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_START_TIME", name: null, codeValue: "24:00", idx: 2 },
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_DOW", name: null, codeValue: "SUN", idx: 3 },
    { parentCode: "PBS_PREFER_OFF", code: "WEEKEND_END_TIME", name: null, codeValue: "24:00", idx: 4 },
  ]);

  assert.deepEqual(config.weekend, { available: false });
});
