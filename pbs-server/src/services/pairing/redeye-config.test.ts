import assert from "node:assert/strict";
import test from "node:test";

import { buildRedeyeConfigFromDictionaryRows } from "./redeye-config.js";

test("buildRedeyeConfigFromDictionaryRows uses dictionary values as source of truth", () => {
  assert.deepEqual(buildRedeyeConfigFromDictionaryRows([
    { parentCode: "PBS_PAIRING_REDEYE_CONFIG", code: "START_TIME", codeValue: "23:00" },
    { parentCode: "PBS_PAIRING_REDEYE_CONFIG", code: "END_TIME", codeValue: "05:00" },
  ]), {
    available: true,
    startTime: "23:00",
    endTime: "05:00",
    crossesMidnight: true,
    version: "23:00|05:00",
  });
});

test("buildRedeyeConfigFromDictionaryRows does not fall back when rows are missing", () => {
  assert.deepEqual(buildRedeyeConfigFromDictionaryRows([]), { available: false });
});
