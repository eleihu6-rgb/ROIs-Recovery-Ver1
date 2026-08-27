import assert from "node:assert/strict";
import test from "node:test";
import { buildLineCreditWindowConfigFromDictionaryRows } from "./line-credit-window-config.js";

const buildRow = (codeValue: string | null) => ({
  parentCode: "PBS_LINE_CREDIT_WINDOW_CONFIG",
  code: "DELTA_HOURS",
  codeValue,
});

test("buildLineCreditWindowConfigFromDictionaryRows parses DELTA_HOURS", () => {
  assert.deepEqual(buildLineCreditWindowConfigFromDictionaryRows([buildRow("5")]), {
    available: true,
    deltaHours: 5,
  });
});

test("buildLineCreditWindowConfigFromDictionaryRows accepts the supported boundaries", () => {
  assert.deepEqual(buildLineCreditWindowConfigFromDictionaryRows([buildRow("1")]), {
    available: true,
    deltaHours: 1,
  });
  assert.deepEqual(buildLineCreditWindowConfigFromDictionaryRows([buildRow("20")]), {
    available: true,
    deltaHours: 20,
  });
});

test("buildLineCreditWindowConfigFromDictionaryRows returns unavailable when config is missing", () => {
  assert.deepEqual(buildLineCreditWindowConfigFromDictionaryRows([]), { available: false });
});

test("buildLineCreditWindowConfigFromDictionaryRows rejects invalid DELTA_HOURS", () => {
  for (const value of [null, "", "0", "21", "5.5", "five"]) {
    assert.deepEqual(
      buildLineCreditWindowConfigFromDictionaryRows([buildRow(value)]),
      { available: false },
    );
  }
});
