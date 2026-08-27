import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTimeBetweenFlightsMinimumConfigFromDictionaryRows,
  parseTimeBetweenFlightsDurationMinutes,
  validateTimeBetweenFlightsMinimum,
} from "./time-between-flights-config.js";

const property = (value: string) => ({
  propertyCode: 129,
  bid: { type: "duration", value },
});

test("builds the Time Between Flights minimum from one dictionary row", () => {
  assert.deepEqual(buildTimeBetweenFlightsMinimumConfigFromDictionaryRows([{
    parentCode: "SYS_PARAM",
    code: "PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES",
    codeValue: "45",
  }]), { available: true, minimumMinutes: 45 });
});

test("marks missing, duplicate, and invalid Time Between Flights rows unavailable", () => {
  const validRow = {
    parentCode: "SYS_PARAM",
    code: "PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES",
    codeValue: "45",
  };
  assert.deepEqual(buildTimeBetweenFlightsMinimumConfigFromDictionaryRows([]), { available: false });
  assert.deepEqual(buildTimeBetweenFlightsMinimumConfigFromDictionaryRows([validRow, validRow]), { available: false });
  assert.deepEqual(buildTimeBetweenFlightsMinimumConfigFromDictionaryRows([{ ...validRow, codeValue: "0" }]), {
    available: false,
  });
});

test("validates new values against the latest minimum and grandfathers unchanged values", () => {
  const config = { available: true as const, minimumMinutes: 60 };
  assert.equal(validateTimeBetweenFlightsMinimum(property("00:45"), config),
    "Time Between Flights must be at least 01:00.");
  assert.equal(validateTimeBetweenFlightsMinimum(property("01:00"), config), null);
  assert.equal(validateTimeBetweenFlightsMinimum(property("00:45"), config, true), null);
  assert.equal(validateTimeBetweenFlightsMinimum(property("00:45"), { available: false }, true), null);
});

test("parses canonical duration minutes", () => {
  assert.equal(parseTimeBetweenFlightsDurationMinutes("24:45"), 1485);
  assert.equal(parseTimeBetweenFlightsDurationMinutes("01:75"), null);
});
