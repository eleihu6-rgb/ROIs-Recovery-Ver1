import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRosterPublishDryRunSql,
  buildRosterPublishDuplicateSampleSql,
  buildRosterPublishExecuteSql,
  parsePeriodCodeRange,
  parseRosterPublishSyncArgs,
  parseRosterPublishSyncEnv,
  quoteIdentifier,
} from "./sync-roster-publish-from-roster-flight-core.js";

test("parsePeriodCodeRange maps PBS period code to an exclusive month range", () => {
  assert.deepEqual(parsePeriodCodeRange("Jun 2026"), {
    fromDate: "2026-06-01",
    toDate: "2026-07-01",
  });

  assert.deepEqual(parsePeriodCodeRange("Dec 2026"), {
    fromDate: "2026-12-01",
    toDate: "2027-01-01",
  });
});

test("parseRosterPublishSyncArgs defaults to dry-run and accepts period code", () => {
  assert.deepEqual(parseRosterPublishSyncArgs(["--period-code", "Jun 2026"]), {
    execute: false,
    fromDate: "2026-06-01",
    toDate: "2026-07-01",
    crewId: null,
    periodCode: "Jun 2026",
    sampleLimit: 5,
  });
});

test("parseRosterPublishSyncArgs accepts execute, explicit range and crew filter", () => {
  assert.deepEqual(parseRosterPublishSyncArgs([
    "--execute",
    "--from=2026-06-01",
    "--to=2026-07-01",
    "--crew-id",
    "2737",
    "--sample-limit=10",
  ]), {
    execute: true,
    fromDate: "2026-06-01",
    toDate: "2026-07-01",
    crewId: "2737",
    periodCode: null,
    sampleLimit: 10,
  });
});

test("parseRosterPublishSyncArgs rejects unsafe combinations", () => {
  assert.throws(
    () => parseRosterPublishSyncArgs(["--execute", "--dry-run", "--period-code", "Jun 2026"]),
    /either --dry-run or --execute/,
  );
  assert.throws(
    () => parseRosterPublishSyncArgs(["--period-code", "Jun 2026", "--from", "2026-06-01", "--to", "2026-07-01"]),
    /either --period-code or --from\/--to/,
  );
  assert.throws(
    () => parseRosterPublishSyncArgs(["--from", "2026-07-01", "--to", "2026-06-01"]),
    /earlier than --to/,
  );
});

test("parseRosterPublishSyncEnv derives the live schema and filiale", () => {
  assert.deepEqual(parseRosterPublishSyncEnv({
    DATABASE_URL: "postgresql://example",
    PBS_SCHEMA: "f8_pbs",
  } as NodeJS.ProcessEnv), {
    databaseUrl: "postgresql://example",
    pbsSchema: "f8_pbs",
    liveSchema: "f8",
    filiale: "F8",
    updatedBy: "roster-publish-sync",
  });
});

test("quoteIdentifier rejects unsafe schema names", () => {
  assert.equal(quoteIdentifier("f8"), "\"f8\"");
  assert.throws(() => quoteIdentifier("f8;drop schema f8"), /valid SQL identifier/);
});

test("buildRosterPublishExecuteSql uses roster_flight_id idempotency and maps full roster fields", () => {
  const sql = buildRosterPublishExecuteSql("f8");

  assert.ok(sql.includes('insert into "f8".roster_publish'));
  assert.ok(sql.includes("assignment_group"));
  assert.ok(sql.includes("sch_str_dt_utc"));
  assert.ok(sql.includes("dep_arp"));
  assert.ok(sql.includes("roster_flight_id"));
  assert.ok(sql.includes("sch_credited_minutes"));
  assert.ok(sql.includes("act_credited_minutes"));
  assert.ok(sql.includes("pairing_label"));
  assert.ok(sql.includes("pairing_base"));
  assert.ok(sql.includes("pairing_fleet"));
  assert.ok(sql.includes("fleet_seg"));
  assert.ok(sql.includes("tafb"));
  assert.ok(!sql.includes("tafb_minutes"));
  assert.ok(sql.includes('left join "f8".pairing p'));
  assert.ok(sql.includes("ps.duty_act_credited_minutes"));
  assert.ok(sql.includes("ps.duty_sch_credited_minutes"));
  assert.match(sql, /sch_credited_minutes = coalesce\(\s*excluded\.sch_credited_minutes/);
  assert.ok(sql.includes("roster_publish.sch_credited_minutes"));
  assert.match(sql, /act_credited_minutes = coalesce\(\s*excluded\.act_credited_minutes/);
  assert.ok(sql.includes("roster_publish.act_credited_minutes"));
  assert.ok(sql.includes("fleet_seg = coalesce(excluded.fleet_seg, roster_publish.fleet_seg)"));
  assert.ok(sql.includes("on conflict (roster_flight_id) where roster_flight_id is not null do update"));
  assert.equal(sql.includes("duty_id"), false);
  assert.equal(sql.includes("roster_rank"), false);
  assert.ok(sql.includes("coalesce(rf.flt_id, ps.flt_id) as flt_id"));
});

test("read-only sync SQL does not require execute-only placeholders", () => {
  const dryRunSql = buildRosterPublishDryRunSql("f8");
  const duplicateSql = buildRosterPublishDuplicateSampleSql("f8");

  assert.equal(dryRunSql.includes("$4"), false);
  assert.equal(dryRunSql.includes("$5"), false);
  assert.ok(duplicateSql.includes("limit $4::int"));
  assert.equal(duplicateSql.includes("$5"), false);
  assert.equal(duplicateSql.includes("$6"), false);
});
