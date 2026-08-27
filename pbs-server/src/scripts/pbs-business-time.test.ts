import test from "node:test";
import assert from "node:assert/strict";
import {
  PBS_BUSINESS_TIME_ANCHOR_KEY,
  PBS_BUSINESS_TIME_ANCHOR_REAL_KEY,
  PBS_BUSINESS_TIME_MODE_KEY,
  buildPbsBusinessTimeStatus,
  buildPbsBusinessTimeUpdates,
  parseCompactShanghaiBusinessTime,
  parsePbsBusinessTimeArgs,
} from "./pbs-business-time-core.js";

test("parseCompactShanghaiBusinessTime parses compact Asia/Shanghai timestamps as UTC", () => {
  const date = parseCompactShanghaiBusinessTime("20260401120000");

  assert.equal(date.toISOString(), "2026-04-01T04:00:00.000Z");
});

test("parseCompactShanghaiBusinessTime rejects invalid compact timestamps", () => {
  assert.throws(
    () => parseCompactShanghaiBusinessTime("2026-04-01"),
    /YYYYMMDDHHmmss/,
  );
  assert.throws(
    () => parseCompactShanghaiBusinessTime("20261301120000"),
    /Invalid business time/,
  );
});

test("parsePbsBusinessTimeArgs maps empty, status, clear and set commands", () => {
  assert.deepEqual(parsePbsBusinessTimeArgs([]), { action: "clear" });
  assert.deepEqual(parsePbsBusinessTimeArgs(["status"]), { action: "status" });
  assert.deepEqual(parsePbsBusinessTimeArgs(["clear"]), { action: "clear" });

  const command = parsePbsBusinessTimeArgs(["20260401120000"]);

  assert.equal(command.action, "set");

  if (command.action === "set") {
    assert.equal(command.input, "20260401120000");
    assert.equal(command.anchorBusinessTime.toISOString(), "2026-04-01T04:00:00.000Z");
  }
});

test("buildPbsBusinessTimeUpdates clears only PBS business time keys", () => {
  const updates = buildPbsBusinessTimeUpdates({ action: "clear" }, new Date("2026-05-01T12:00:00.000Z"));

  assert.deepEqual(updates, [
    { code: PBS_BUSINESS_TIME_MODE_KEY, codeValue: "ROLLING" },
    { code: PBS_BUSINESS_TIME_ANCHOR_KEY, codeValue: "" },
    { code: PBS_BUSINESS_TIME_ANCHOR_REAL_KEY, codeValue: "" },
  ]);
});

test("buildPbsBusinessTimeUpdates sets rolling business time anchors", () => {
  const command = parsePbsBusinessTimeArgs(["20260401120000"]);

  assert.equal(command.action, "set");

  if (command.action !== "set") {
    return;
  }

  const updates = buildPbsBusinessTimeUpdates(command, new Date("2026-05-01T12:00:00.000Z"));

  assert.deepEqual(updates, [
    { code: PBS_BUSINESS_TIME_MODE_KEY, codeValue: "ROLLING" },
    { code: PBS_BUSINESS_TIME_ANCHOR_KEY, codeValue: "2026-04-01T04:00:00.000Z" },
    { code: PBS_BUSINESS_TIME_ANCHOR_REAL_KEY, codeValue: "2026-05-01T12:00:00.000Z" },
  ]);
});

test("buildPbsBusinessTimeStatus keeps status read-only and calculates rolling time", () => {
  const status = buildPbsBusinessTimeStatus({
    mode: "ROLLING",
    anchor: "2026-04-01T04:00:00.000Z",
    anchorReal: "2026-05-01T12:00:00.000Z",
  }, new Date("2026-05-01T12:10:00.000Z"));

  assert.equal(status.source, "override");
  assert.equal(status.businessNowIso, "2026-04-01T04:10:00.000Z");
  assert.deepEqual(status.warnings, []);
});
