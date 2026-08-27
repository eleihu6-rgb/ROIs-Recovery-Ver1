import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDashboardDateTimeLabel,
  resolveDashboardBaseTimeZone,
} from "./dashboard-timezone.js";

test("formatDashboardDateTimeLabel formats UTC instants in the crew base timezone", () => {
  assert.equal(
    formatDashboardDateTimeLabel("2026-04-02T02:30:00.000Z", "America/Vancouver"),
    "Apr 01, 19:30",
  );
});

test("formatDashboardDateTimeLabel falls back to UTC for invalid timezones", () => {
  assert.equal(
    formatDashboardDateTimeLabel("2026-04-02T02:30:00.000Z", "invalid/timezone"),
    "Apr 02, 02:30",
  );
});

test("resolveDashboardBaseTimeZone resolves a base airport IANA zone", async () => {
  const resolved = await resolveDashboardBaseTimeZone({
    async query(query: string, values: unknown[]) {
      assert.match(query, /join f8\.airport airport/);
      assert.deepEqual(values, ["YVR"]);
      return { rows: [{ zone_id: "America/Vancouver" }] };
    },
  } as never, "f8", " yvr ");

  assert.deepEqual(resolved, {
    zoneId: "America/Vancouver",
    timezoneLabel: "YVR Local Time",
  });
});

test("resolveDashboardBaseTimeZone falls back to UTC when the base zone is unavailable", async () => {
  const resolved = await resolveDashboardBaseTimeZone({
    async query() {
      return { rows: [{ zone_id: null }] };
    },
  } as never, "f8", "ZZZ");

  assert.deepEqual(resolved, {
    zoneId: "UTC",
    timezoneLabel: "UTC",
  });
});
