import { test } from "node:test";
import assert from "node:assert/strict";
import { computePairingEligibility, RULESET_NOT_CONFIGURED_ELIGIBILITY } from "./rule-eligibility.js";
import type { RustViolation } from "../rule-check/rust-rule-runner.js";

const pairings = [
  { pairingId: "1", originDate: "2026-08-01", endDate: "2026-08-01" },
  { pairingId: "2", originDate: "2026-08-02", endDate: "2026-08-03" },
];

const violation: RustViolation = {
  rule_code: "8071",
  rule_instance: "FLY-P",
  crew_id: "1001",
  pairing_id: 2,
  start_dt: "2026-08-02T12:00:00.000Z",
  end_dt: "2026-08-02T18:00:00.000Z",
  severity: 3,
  message: "Qualification mismatch.",
};

test("ruleset null returns the uniform not-configured alert for every pairing", async () => {
  const m = await computePairingEligibility({
    liveSchema: "f8", ruleset: null, crewId: "1001", pairings,
    runner: async () => [],
  });
  assert.equal(m.get("1")?.status, "unknown");
  assert.deepEqual(m.get("1")?.reasons, RULESET_NOT_CONFIGURED_ELIGIBILITY.reasons);
});

test("no violations → eligible; violations → ineligible with RULE_ENGINE_CONFLICT reasons", async () => {
  const runner = async (args: { pairingId: number }) =>
    args.pairingId === 1 ? [] : [violation];
  const m = await computePairingEligibility({
    liveSchema: "f8", ruleset: { rulesetId: 103, name: "PBS" }, crewId: "1001", pairings,
    runner,
  });
  assert.equal(m.get("1")?.status, "eligible");
  assert.deepEqual(m.get("1")?.unavailable, []);
  assert.equal(m.get("2")?.status, "ineligible");
  assert.equal(m.get("2")?.reasons[0]?.code, "RULE_ENGINE_CONFLICT");
  assert.equal(m.get("2")?.reasons[0]?.ruleId, "8071");
});

test("runner throws → unknown with unavailable rule_engine", async () => {
  const m = await computePairingEligibility({
    liveSchema: "f8", ruleset: { rulesetId: 103, name: "PBS" }, crewId: "1001", pairings,
    runner: async () => { throw new Error("core unavailable"); },
  });
  assert.equal(m.get("1")?.status, "unknown");
  assert.deepEqual(m.get("1")?.unavailable, ["rule_engine"]);
});
