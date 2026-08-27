import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLineMinimumBaseLayoverConfigFromDictionaryRows,
  formatLineDurationCompact,
  normalizeLineDurationPadded,
} from "./line-minimum-base-layover-config.js";

test("builds Line Minimum Base Layover config from dictionary rows", () => {
  const config = buildLineMinimumBaseLayoverConfigFromDictionaryRows([
    {
      parentCode: "SYS_PARAM",
      code: "PBS_LINE_MINIMUM_BASE_LAYOVER",
      codeValue: "13:00",
    },
  ]);

  assert.deepEqual(config, {
    available: true,
    minDuration: "013:00",
  });
});

test("marks the definition unavailable when the dictionary value is invalid", () => {
  const config = buildLineMinimumBaseLayoverConfigFromDictionaryRows([
    {
      parentCode: "SYS_PARAM",
      code: "PBS_LINE_MINIMUM_BASE_LAYOVER",
      codeValue: "bad",
    },
  ]);

  assert.deepEqual(config, {
    available: false,
  });
});

test("marks the definition unavailable when the dictionary row is missing", () => {
  assert.deepEqual(buildLineMinimumBaseLayoverConfigFromDictionaryRows([]), {
    available: false,
  });
});

test("formats Line duration values for storage and display", () => {
  assert.equal(normalizeLineDurationPadded("13:00"), "013:00");
  assert.equal(formatLineDurationCompact("013:00"), "13:00");
});
