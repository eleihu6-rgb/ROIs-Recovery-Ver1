import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  buildActivePortalUserQuery,
  buildDefaultPerformanceEndpoints,
  buildPerformanceAuthToken,
  formatPerformanceBaselineReport,
  parsePerformanceBaselineConfig,
  redactSensitiveText,
  runPbsPerformanceBaseline,
  summarizeDurations,
  type ClockLike,
  type FetchLike,
  type Queryable,
} from "./pbs-performance-baseline-core.js";

const createEnv = () => ({
  DATABASE_URL: "postgresql://test:secret@localhost:5432/rois",
  DATABASE_CONNECTION_TIMEOUT_MS: "3000",
  JWT_SECRET: "test-jwt-secret",
  JWT_EXPIRES_IN: "5m",
  PBS_SCHEMA: "f8_pbs",
  PORT: "3002",
});

const createDb = (): Queryable => ({
  async query() {
    return {
      rows: [{
        id: "42",
        crew_id: "E001",
        user_code: "crew01",
        user_name: "Crew One",
        is_admin: 0,
        token_version: 7,
      }],
    };
  },
});

const createFetch = (calls: FetchCall[]): FetchLike => {
  return async (input, init) => {
    calls.push({ input, init });

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          code: 200,
          data: {},
          message: "ok",
        });
      },
    };
  };
};

type FetchCall = {
  input: string;
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
};

const createClock = (stepMs: number): ClockLike => {
  let current = 0;

  return {
    now() {
      current += stepMs;
      return current;
    },
  };
};

test("parsePerformanceBaselineConfig uses safe defaults and CLI overrides", () => {
  const config = parsePerformanceBaselineConfig(createEnv(), [
    "--base-url=http://127.0.0.1:3999/",
    "--samples=3",
    "--budget-ms=1500",
    "--pairing-id=AB123",
  ]);

  assert.equal(config.baseUrl, "http://127.0.0.1:3999");
  assert.equal(config.sampleCount, 3);
  assert.equal(config.budgetMs, 1500);
  assert.equal(config.pairingId, "AB123");
  assert.equal(config.databaseConnectionTimeoutMs, 3000);
  assert.equal(config.pbsSchema, "f8_pbs");
});

test("parsePerformanceBaselineConfig requires DATABASE_URL and validates numbers", () => {
  assert.throws(
    () => parsePerformanceBaselineConfig({ ...createEnv(), DATABASE_URL: "" }),
    /DATABASE_URL is required/,
  );
  assert.throws(
    () => parsePerformanceBaselineConfig(createEnv(), ["--samples=0"]),
    /sample count/,
  );
});

test("buildActivePortalUserQuery qualifies the PBS schema safely", () => {
  assert.match(
    buildActivePortalUserQuery("f8_pbs"),
    /from "f8_pbs"\.pbs_user/,
  );
  assert.match(
    buildActivePortalUserQuery("f8_pbs"),
    /where status = 0 and password_access = '1' and portal_access = '1'/,
  );
  assert.match(buildActivePortalUserQuery("f8_pbs"), /and eff_dt <= now\(\)/);
  assert.throws(
    () => buildActivePortalUserQuery("f8_pbs;drop"),
    /valid SQL identifier/,
  );
});

test("buildPerformanceAuthToken creates the auth payload expected by PBS routes", () => {
  const token = buildPerformanceAuthToken({
    id: "42",
    crew_id: "E001",
    user_code: "crew01",
    user_name: "Crew One",
    is_admin: 1,
    token_version: 7,
  }, "test-jwt-secret", "5m");
  const decoded = jwt.verify(token, "test-jwt-secret");

  assert.equal(typeof decoded, "object");

  if (typeof decoded === "object" && decoded !== null) {
    assert.equal(decoded.id, "42");
    assert.equal(decoded.employeeNo, "E001");
    assert.equal(decoded.userCode, "crew01");
    assert.equal(decoded.authMode, "password");
    assert.equal(decoded.isAdmin, true);
    assert.equal(decoded.tokenVersion, 7);
  }
});

test("buildDefaultPerformanceEndpoints only contains non-destructive endpoint methods", () => {
  const endpoints = buildDefaultPerformanceEndpoints();

  assert.ok(endpoints.length > 0);
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/dashboard/profile"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/dashboard/summary"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/bidding-calendar/current"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/reserve-bids/current"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/reserve-bids/current/coverage"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/award/current"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/standing-bids/current"));
  assert.ok(endpoints.some((endpoint) => endpoint.name === "portal bootstrap"));
  assert.ok(endpoints.some((endpoint) => endpoint.path === "/api/portal/bootstrap"));
  assert.deepEqual(
    Array.from(new Set(endpoints.map((endpoint) => endpoint.method))).sort(),
    ["GET"],
  );
  assert.equal(endpoints.some((endpoint) => endpoint.path.startsWith("/api/pairing-search")), false);
  assert.ok(endpoints.every((endpoint) => endpoint.method !== "PUT"));
  assert.ok(endpoints.every((endpoint) => endpoint.method !== "DELETE"));
});

test("summarizeDurations calculates percentiles, max and average", () => {
  assert.deepEqual(summarizeDurations([10, 20, 30, 40]), {
    minMs: 10,
    avgMs: 25,
    p50Ms: 20,
    p95Ms: 40,
    p99Ms: 40,
    maxMs: 40,
  });
});

test("runPbsPerformanceBaseline measures endpoints with auth without exposing token in summary", async () => {
  const calls: FetchCall[] = [];
  const summary = await runPbsPerformanceBaseline({
    ...parsePerformanceBaselineConfig(createEnv(), ["--samples=1"]),
    baseUrl: "http://localhost:3002",
    budgetMs: 100,
  }, {
    db: createDb(),
    fetchImpl: createFetch(calls),
    clock: createClock(5),
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.endpoints.length, buildDefaultPerformanceEndpoints().length);
  assert.equal(calls[0]?.init.headers.Authorization, undefined);
  assert.match(calls[1]?.init.headers.Authorization ?? "", /^Bearer /);
  assert.equal(JSON.stringify(summary).includes("Bearer "), false);
  assert.equal(JSON.stringify(summary).includes("test-jwt-secret"), false);
  assert.equal(typeof summary.endpoints[0].avgBytes, "number");
  assert.equal(typeof summary.endpoints[0].maxBytes, "number");
  assert.ok(summary.endpoints[0].maxBytes > 0);
});

test("runPbsPerformanceBaseline fails the summary when an endpoint exceeds the budget", async () => {
  const calls: FetchCall[] = [];
  const summary = await runPbsPerformanceBaseline({
    ...parsePerformanceBaselineConfig(createEnv(), ["--samples=1"]),
    budgetMs: 5,
  }, {
    db: createDb(),
    fetchImpl: createFetch(calls),
    clock: createClock(10),
  });

  assert.equal(summary.ok, false);
  assert.ok(summary.endpoints.every((endpoint) => endpoint.overBudget));
});

test("formatPerformanceBaselineReport prints table plus JSON summary", async () => {
  const summary = await runPbsPerformanceBaseline({
    ...parsePerformanceBaselineConfig(createEnv(), ["--samples=1"]),
    budgetMs: 100,
  }, {
    db: createDb(),
    fetchImpl: createFetch([]),
    clock: createClock(5),
  });
  const report = formatPerformanceBaselineReport(summary);

  assert.match(report, /PBS performance baseline/);
  assert.match(report, /JSON summary:/);
  assert.match(report, /portal bootstrap/);
  assert.doesNotMatch(report, /pairing search/);
  assert.match(report, /P99/);
  assert.match(report, /P50/);
  assert.match(report, /AvgBytes/);
  assert.match(report, /MaxBytes/);
});

test("redactSensitiveText removes configured sensitive values", () => {
  const redacted = redactSensitiveText(
    "failed with postgresql://test:secret@localhost and jwt-secret",
    ["postgresql://test:secret@localhost", "jwt-secret"],
  );

  assert.equal(redacted, "failed with [redacted] and [redacted]");
});
