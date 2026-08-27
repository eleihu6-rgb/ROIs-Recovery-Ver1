import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { createPbsReserveCoverageService } from "./reserve-coverage-service.js";
import { LineholderBidServiceError } from "../lineholder/shared.js";

process.env.DATABASE_URL ||= "postgresql://user:password@localhost:5432/rois?options=-c%20search_path%3Df8_pbs";
process.env.PBS_SCHEMA ||= "f8_pbs";
process.env.JWT_SECRET ||= "test-secret";
process.env.CORS_ORIGIN ||= "http://localhost:3030";

const actor = {
  crewId: "F8030",
  userCode: "casey.crew",
};

type QueryRecord = {
  text: string;
  values: unknown[];
};

const buildPeriod = (periodCode = "Jun 2026") => ({
  rosterPeriodId: 75,
  rosterPeriodKey: "2026RP06",
  periodCode,
  filiale: "F8",
  division: "C",
  status: "OPEN",
  computedStage: "OPEN" as const,
  bidOpenAt: new Date("2026-05-01T00:00:00.000Z"),
  bidCloseAt: new Date("2026-05-08T23:59:00.000Z"),
  rpStartLocal: "2026-06-01",
  rpEndLocal: "2026-06-30",
  canEditBid: true,
  readOnlyReason: null,
});

const createPgPool = (
  handler: (text: string, values: unknown[]) => Array<Record<string, unknown>>,
  queries: QueryRecord[],
) => ({
  async query(text: string, values: unknown[] = []) {
    queries.push({ text, values });

    return {
      rows: handler(text, values),
    };
  },
}) as unknown as Pool;

test("reserve coverage computes calendar counts from live RES data", async () => {
  const queries: QueryRecord[] = [];
  const pgPool = createPgPool((text) => {
    assert.match(text, /generate_series/i);
    assert.match(text, /left join f8_pbs\.pbs_user pbs_user/i);
    assert.match(text, /from f8\.pairing p/i);
    assert.match(text, /pilot_res_pairings as materialized/i);
    assert.match(text, /cabin_res_pairings as materialized/i);
    assert.match(text, /cross join lateral/i);
    assert.match(text, /from f8\.pairing_composition pc/i);
    assert.match(text, /join f8\.crew_base crew_base/i);
    assert.match(text, /inner join f8\.crew_manday_cc_am_daily manday/i);
    assert.match(text, /inner join f8\.crew_manday_fd_daily manday/i);
    assert.match(text, /coalesce\(sum\(coalesce\(pc\.plan, 0\)\), 0\)::int as required_reserve_count/i);
    assert.match(text, /coalesce\(sum\(greatest\(coalesce\(pc\.open, 0\), 0\)\), 0\)::int as open_reserve_need/i);
    assert.match(text, /greatest\([\s\S]*active_crew_count[\s\S]*unavailable_crew_count[\s\S]*open_reserve_need[\s\S]*0[\s\S]*\)::int as available_off_count/i);
    assert.doesNotMatch(text, /pbs_reserve_coverage/i);

    return [
      {
        base_code: " yyz ",
        division: " c ",
        date: "2026-06-01",
        required_reserve_count: 60,
        available_off_count: 14,
      },
      {
        base_code: "YYZ",
        division: "C",
        date: "2026-06-02",
        required_reserve_count: "56",
        available_off_count: "0",
      },
    ];
  }, queries);
  const service = createPbsReserveCoverageService({
    pgPool,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  const response = await service.getCurrentCoverage(actor, buildPeriod());

  assert.equal(response.periodCode, "Jun 2026");
  assert.equal(response.rosterPeriodId, 75);
  assert.equal(response.rpStartLocal, "2026-06-01");
  assert.equal(response.rpEndLocal, "2026-06-30");
  assert.equal(response.baseCode, "YYZ");
  assert.deepEqual(response.days, [
    {
      date: "2026-06-01",
      requiredReserveCount: 60,
      availableOffCount: 14,
    },
    {
      date: "2026-06-02",
      requiredReserveCount: 56,
      availableOffCount: 0,
    },
  ]);
  assert.deepEqual(response.warnings, []);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0]?.values, ["2026-06-01", "2026-06-30", actor.crewId, actor.userCode]);
});

test("reserve coverage returns pilot scoped rows", async () => {
  const queries: QueryRecord[] = [];
  const pgPool = createPgPool((text) => {
    assert.match(text, /actor_scope\.division = 'P'/i);
    assert.match(text, /inner join f8\.crew_manday_fd_daily manday/i);

    return [
      {
        base_code: "YVR",
        division: "P",
        date: "2026-06-01",
        required_reserve_count: 40,
        available_off_count: 8,
      },
    ];
  }, queries);
  const service = createPbsReserveCoverageService({
    pgPool,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  const response = await service.getCurrentCoverage(actor, buildPeriod());

  assert.equal(response.baseCode, "YVR");
  assert.equal(response.days[0]?.requiredReserveCount, 40);
  assert.equal(response.days[0]?.availableOffCount, 8);
});

test("reserve coverage fails when actor scope is incomplete", async () => {
  const queries: QueryRecord[] = [];
  const pgPool = createPgPool((text) => {
    assert.match(text, /left join f8_pbs\.pbs_user/i);

    return [{
      base_code: null,
      division: "C",
      date: "2026-06-01",
      required_reserve_count: 0,
      available_off_count: 0,
    }];
  }, queries);
  const service = createPbsReserveCoverageService({
    pgPool,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  await assert.rejects(
    () => service.getCurrentCoverage(actor, buildPeriod()),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.errorCode === "PERIOD_CONTEXT_REQUIRED",
  );
  assert.equal(queries.length, 1);
});

test("reserve coverage fails before querying when the roster period range is invalid", async () => {
  const queries: QueryRecord[] = [];
  const pgPool = createPgPool(() => {
    throw new Error("Coverage query should not run for an invalid period code.");
  }, queries);
  const service = createPbsReserveCoverageService({
    pgPool,
    liveSchema: "f8",
    pbsSchema: "f8_pbs",
  });

  await assert.rejects(
    () => service.getCurrentCoverage(actor, {
      ...buildPeriod("Feb 2026"),
      rpStartLocal: "2026-03-02",
      rpEndLocal: "2026-03-01",
    }),
    (error) =>
      error instanceof LineholderBidServiceError
      && error.errorCode === "PERIOD_RANGE_INVALID",
  );
  assert.equal(queries.length, 0);
});

test("reserve coverage rejects invalid dynamic schema names", () => {
  const pgPool = { async query() { return { rows: [] }; } } as unknown as Pool;

  assert.throws(
    () => createPbsReserveCoverageService({
      pgPool,
      liveSchema: "f8;drop",
      pbsSchema: "f8_pbs",
    }),
    /Invalid live schema name/,
  );

  assert.throws(
    () => createPbsReserveCoverageService({
      pgPool,
      liveSchema: "f8",
      pbsSchema: "f8_pbs;drop",
    }),
    /Invalid PBS schema name/,
  );
});
