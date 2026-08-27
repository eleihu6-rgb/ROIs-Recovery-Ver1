import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCrewIdentity } from "./crew-identity.js";

const fakePool = (rowsBySql: Array<{ match: string; rows: unknown[] }>) => {
  const calls: string[] = [];

  return {
    calls,
    query: async (sql: string, _params?: unknown[]) => {
      calls.push(sql);
      const hit = rowsBySql.find((r) => String(sql).includes(r.match));
      return { rows: hit?.rows ?? [] };
    },
  };
};

test("resolves prime base, effective rank, division, and zoneId", async () => {
  const pool = fakePool([
    {
      match: "with actor",
      rows: [{
        base: "YVR",
        rank: "FO",
        division: "P",
        zoneId: "America/Vancouver",
      }],
    },
  ]);
  const r = await resolveCrewIdentity(pool as never, "f8", "1001");
  assert.equal(r.base, "YVR");
  assert.equal(r.rank, "FO");
  assert.equal(r.division, "P");
  assert.equal(r.zoneId, "America/Vancouver");
  assert.equal(pool.calls.length, 1);
});

test("returns nulls when no effective crew_base / crew_rank / division rows exist", async () => {
  const pool = fakePool([
    {
      match: "with actor",
      rows: [{
        base: null,
        rank: null,
        division: null,
        zoneId: null,
      }],
    },
  ]);
  const r = await resolveCrewIdentity(pool as never, "f8", "2002");
  assert.equal(r.base, null);
  assert.equal(r.rank, null);
  assert.equal(r.division, null);
  assert.equal(r.zoneId, null);
  assert.equal(pool.calls.length, 1);
});
