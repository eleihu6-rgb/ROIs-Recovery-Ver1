import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationSql = readFileSync(
  resolve(
    process.cwd(),
    "../sql/migration/2026-07-28-award-published-credit-fleet-completeness.sql",
  ),
  "utf8",
);

test("Award snapshot migration adds fleet_seg and preserves existing published values", () => {
  assert.match(
    migrationSql,
    /add column if not exists fleet_seg varchar\(10\)/,
  );
  assert.match(
    migrationSql,
    /fleet_seg = coalesce\(rp\.fleet_seg, ps\.fleet_seg\)/,
  );
  assert.match(
    migrationSql,
    /act_credited_minutes = coalesce\(\s*rp\.act_credited_minutes,\s*ps\.duty_act_credited_minutes\s*\)/,
  );
  assert.match(
    migrationSql,
    /sch_credited_minutes = coalesce\(\s*rp\.sch_credited_minutes,\s*ps\.duty_sch_credited_minutes,\s*ps\.duty_act_credited_minutes\s*\)/,
  );
  assert.doesNotMatch(migrationSql, /pairing_fleet\s*=/);
});

test("Award snapshot migration uses the stable segment key and rejects duplicate matches", () => {
  assert.match(
    migrationSql,
    /ps\.pairing_id = rp\.pairing_id[\s\S]*ps\.duty_seq = rp\.duty_seq[\s\S]*ps\.seg_seq = rp\.seg_seq/,
  );
  assert.match(
    migrationSql,
    /having count\(\*\) > 1[\s\S]*raise exception/,
  );
  assert.match(
    migrationSql,
    /\(ps\.scenario_id is null or ps\.scenario_id = 0\)/,
  );
});
