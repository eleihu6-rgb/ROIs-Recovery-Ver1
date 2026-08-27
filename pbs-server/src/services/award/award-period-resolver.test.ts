import assert from "node:assert/strict";
import test from "node:test";
import { resolveCurrentAwardPeriod } from "./award-period-resolver.js";

const periodRow = (overrides: Record<string, unknown> = {}) => ({
  period_id: "75",
  period_code: "Jun 2026",
  rp_start: "2026-06-01T00:00:00.000Z",
  rp_end: "2026-06-30T00:00:00.000Z",
  bid_open_at: "2026-05-01T00:00:00.000Z",
  bid_close_at: "2026-05-08T23:59:00.000Z",
  award_publish_at: "2026-05-20T00:00:00.000Z",
  award_final_at: "2026-05-22T00:00:00.000Z",
  mis_award_deadline_at: "2026-05-26T00:00:00.000Z",
  status: "CLOSED",
  first_published_at: null,
  latest_published_at: null,
  base: "YYZ",
  zone_id: "America/Toronto",
  ...overrides,
});

const resolve = async (rows: Array<Record<string, unknown>>, businessNow = new Date("2026-05-25T00:00:00.000Z")) => {
  let queryText = "";
  let queryValues: unknown[] | undefined;
  const result = await resolveCurrentAwardPeriod({
    pgPool: {
      async query(text: string, values?: unknown[]) {
        queryText = text;
        queryValues = values;
        return { rows };
      },
    } as never,
    schema: "f8",
    pbsSchema: "f8_pbs",
    actor: { crewId: "13401", userCode: "casey.crew" },
    businessNow,
  });
  return { result, queryText, queryValues };
};

test("Award resolver requires both planned time and an exact matching publish record", async () => {
  const { result, queryText, queryValues } = await resolve([
    periodRow({
      period_id: "74",
      period_code: "May 2026",
      award_publish_at: "2026-04-20T00:00:00.000Z",
      first_published_at: "2026-04-20T01:00:00.000Z",
      latest_published_at: "2026-04-20T01:00:00.000Z",
    }),
    periodRow(),
  ]);

  assert.equal(result.periodCode, "May 2026");
  assert.equal(result.availability, "AVAILABLE");
  assert.equal(result.currentPeriod?.canEditBid, false);
  assert.deepEqual(queryValues, ["13401"]);
  assert.equal(result.base, "YYZ");
  assert.equal(result.zoneId, "America/Toronto");
  assert.match(queryText, /crew_base\.eff_dt < \(\(period\.rp_start::date \+ 1\)/);
  assert.match(queryText, /upper\(btrim\(effective_base\.base\)\)/);
  assert.doesNotMatch(queryText, /pbs_user/);
  assert.match(queryText, /record\.published = 1/);
  assert.match(queryText, /record\.roster_period_id = period\.id/);
  assert.match(queryText, /record\.str_dt::date <= period\.rp_start::date/);
  assert.match(queryText, /record\.end_dt::date >= period\.rp_end::date/);
  assert.match(queryText, /effective_base\.base_count = 1/);
  assert.match(queryText, /upper\(btrim\(record\.crew_id\)\) = upper\(btrim\(\$1\)\)/);
  assert.match(queryText, /upper\(btrim\(record\.division\)\) = upper\(btrim\(actor_crew\.division\)\)/);
  assert.match(queryText, /string_agg\(record_fleet/);
  assert.match(queryText, /string_agg\(actor_fleet_value/);
  assert.doesNotMatch(queryText, /record\.file_path/);
  assert.doesNotMatch(queryText, /record\.file_size/);
  assert.doesNotMatch(queryText, /record\.checksum/);
  assert.doesNotMatch(queryText, /nullif\(btrim\(record\.crew_id\), ''\) is null\s+or/);
});

test("Award resolver reports publish pending after the planned time without a matching record", async () => {
  const { result } = await resolve([periodRow()]);
  assert.equal(result.availability, "PUBLISH_PENDING");
  assert.equal(result.latestPublishedAt, null);
});

test("Award resolver reports scheduled before the planned time", async () => {
  const { result } = await resolve([periodRow()], new Date("2026-05-10T00:00:00.000Z"));
  assert.equal(result.availability, "SCHEDULED");
  assert.equal(result.awardPublishAt, "2026-05-20T00:00:00.000Z");
});

test("Award resolver reports unconfigured when no PBS roster period exists", async () => {
  const { result } = await resolve([]);
  assert.equal(result.availability, "UNCONFIGURED");
  assert.equal(result.id, null);
  assert.equal(result.rpStart, null);
});

test("Award resolver keeps the latest published period visible while a newer period awaits publication", async () => {
  const { result } = await resolve([
    periodRow({
      period_id: "76",
      period_code: "Jul 2026",
      rp_start: "2026-07-01T00:00:00.000Z",
      rp_end: "2026-07-31T00:00:00.000Z",
      award_publish_at: "2026-05-24T00:00:00.000Z",
      award_final_at: "2026-05-26T00:00:00.000Z",
      mis_award_deadline_at: "2026-05-30T00:00:00.000Z",
    }),
    periodRow({
      first_published_at: "2026-05-20T01:00:00.000Z",
      latest_published_at: "2026-05-20T01:00:00.000Z",
    }),
  ]);

  assert.equal(result.periodCode, "Jun 2026");
  assert.equal(result.lifecycleStage, "FINAL");
  assert.equal(result.upcomingPeriod?.periodCode, "Jul 2026");
  assert.equal(result.upcomingPeriod?.lifecycleStage, "PUBLISH_PENDING");
  assert.deepEqual(result.readablePeriods?.map((period) => period.id), [75]);
});

test("Award resolver moves a published period through Published, Final, and Mis-award Closed", async () => {
  const row = periodRow({
    first_published_at: "2026-05-20T00:05:00.000Z",
    latest_published_at: "2026-05-20T00:05:00.000Z",
  });
  assert.equal((await resolve([row], new Date("2026-05-21T00:00:00.000Z"))).result.lifecycleStage, "PUBLISHED");
  assert.equal((await resolve([row], new Date("2026-05-23T00:00:00.000Z"))).result.lifecycleStage, "FINAL");
  assert.equal((await resolve([row], new Date("2026-05-27T00:00:00.000Z"))).result.lifecycleStage, "MIS_AWARD_CLOSED");
});
