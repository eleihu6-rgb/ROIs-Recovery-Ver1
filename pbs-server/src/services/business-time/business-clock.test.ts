import assert from "node:assert/strict";
import test from "node:test";
import { createPbsBusinessClock } from "./business-clock.js";

const createDb = (rows: Array<{ code: string; code_value: string | null }>) => ({
  async execute() {
    return { rows };
  },
}) as unknown as Parameters<typeof createPbsBusinessClock>[0]["db"];

test("business clock uses real time when override config is absent", async () => {
  const clock = createPbsBusinessClock({
    db: createDb([]),
    now: () => new Date("2026-05-01T18:00:00.000Z"),
  });

  const snapshot = await clock.getBusinessTimeSnapshot();

  assert.equal(snapshot.source, "system");
  assert.equal(snapshot.now.toISOString(), "2026-05-01T18:00:00.000Z");
  assert.deepEqual(snapshot.warnings, []);
});

test("business clock advances from the configured rolling anchor", async () => {
  const clock = createPbsBusinessClock({
    db: createDb([
      { code: "PBS_BUSINESS_TIME_MODE", code_value: "ROLLING" },
      { code: "PBS_BUSINESS_TIME_ANCHOR", code_value: "2026-04-01T12:00:00Z" },
      { code: "PBS_BUSINESS_TIME_ANCHOR_REAL", code_value: "2026-05-01T18:00:00Z" },
    ]),
    now: () => new Date("2026-05-01T18:10:00.000Z"),
  });

  const snapshot = await clock.getBusinessTimeSnapshot();

  assert.equal(snapshot.source, "override");
  assert.equal(snapshot.now.toISOString(), "2026-04-01T12:10:00.000Z");
  assert.deepEqual(snapshot.warnings, []);
});

test("business clock accepts space-separated timestamp values as UTC", async () => {
  const clock = createPbsBusinessClock({
    db: createDb([
      { code: "PBS_BUSINESS_TIME_ANCHOR", code_value: "2026-04-01 12:00:00" },
      { code: "PBS_BUSINESS_TIME_ANCHOR_REAL", code_value: "2026-05-01 18:00:00" },
    ]),
    now: () => new Date("2026-05-01T18:10:00.000Z"),
  });

  const snapshot = await clock.getBusinessTimeSnapshot();

  assert.equal(snapshot.source, "override");
  assert.equal(snapshot.now.toISOString(), "2026-04-01T12:10:00.000Z");
});

test("business clock falls back to real time for invalid override config", async () => {
  const clock = createPbsBusinessClock({
    db: createDb([
      { code: "PBS_BUSINESS_TIME_MODE", code_value: "ROLLING" },
      { code: "PBS_BUSINESS_TIME_ANCHOR", code_value: "not-a-date" },
      { code: "PBS_BUSINESS_TIME_ANCHOR_REAL", code_value: "2026-05-01T18:00:00Z" },
    ]),
    now: () => new Date("2026-05-01T18:10:00.000Z"),
  });

  const snapshot = await clock.getBusinessTimeSnapshot();

  assert.equal(snapshot.source, "system");
  assert.equal(snapshot.now.toISOString(), "2026-05-01T18:10:00.000Z");
  assert.match(snapshot.warnings.join(" "), /Invalid PBS business time anchor/);
});
