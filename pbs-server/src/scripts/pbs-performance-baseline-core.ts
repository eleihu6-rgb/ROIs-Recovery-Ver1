import { performance } from "node:perf_hooks";
import jwt from "jsonwebtoken";

export type PerformanceBaselineConfig = {
  baseUrl: string;
  sampleCount: number;
  budgetMs: number;
  pairingId: string;
  databaseUrl: string;
  databaseConnectionTimeoutMs: number;
  jwtSecret: string;
  jwtExpiresIn: string;
  pbsSchema: string;
};

type EnvLike = Readonly<Record<string, string | undefined>>;

type ActivePortalUserRow = {
  id: string | number;
  crew_id: string;
  user_code: string;
  user_name: string;
  is_admin: number;
  token_version: number;
};

export type Queryable = {
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type PerformanceEndpoint = {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  requiresAuth: boolean;
  body?: unknown;
};

type FetchOptions = {
  method: string;
  headers: Record<string, string>;
  body?: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

export type FetchLike = (
  input: string,
  init: FetchOptions,
) => Promise<FetchResponseLike>;

export type ClockLike = {
  now: () => number;
};

type EndpointSample = {
  durationMs: number;
  statusCode: number | null;
  apiCode: number | null;
  responseBytes: number;
  error: string | null;
};

export type EndpointPerformanceResult = {
  name: string;
  method: PerformanceEndpoint["method"];
  path: string;
  sampleCount: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  avgBytes: number;
  maxBytes: number;
  budgetMs: number;
  overBudget: boolean;
  ok: boolean;
  statusCodes: number[];
  errors: string[];
};

export type PerformanceBaselineSummary = {
  ok: boolean;
  generatedAt: string;
  baseUrl: string;
  sampleCount: number;
  budgetMs: number;
  endpoints: EndpointPerformanceResult[];
};

const DEFAULT_SAMPLE_COUNT = 5;
const DEFAULT_BUDGET_MS = 2_000;
const DEFAULT_PORT = 3002;
const DEFAULT_PBS_SCHEMA = "f8_pbs";
const DEFAULT_PAIRING_ID = "M4959";
const DEFAULT_JWT_SECRET = "rois-dev-jwt-secret-2026";
const DEFAULT_JWT_EXPIRES_IN = "15m";
const DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS = 15_000;
const SQL_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

const getCliOption = (args: readonly string[], name: string): string | undefined => {
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const parsePositiveInteger = (name: string, value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
};

const normalizeBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (!trimmed) {
    throw new Error("PBS performance base URL is required.");
  }

  return trimmed;
};

const requireDatabaseUrl = (value: string | undefined): string => {
  if (!value?.trim()) {
    throw new Error("DATABASE_URL is required to select a PBS performance test user.");
  }

  return value.trim();
};

const validateSqlIdentifier = (identifier: string, label: string): string => {
  const normalized = identifier.trim();

  if (!SQL_IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a valid SQL identifier.`);
  }

  return normalized;
};

const quoteSqlIdentifier = (identifier: string): string => {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
};

export const parsePerformanceBaselineConfig = (
  env: EnvLike,
  args: readonly string[] = [],
): PerformanceBaselineConfig => {
  const port = parsePositiveInteger("PORT", env.PORT, DEFAULT_PORT);
  const baseUrl = normalizeBaseUrl(
    getCliOption(args, "--base-url")
      ?? env.PBS_PERF_BASE_URL
      ?? `http://localhost:${port}`,
  );
  const sampleCount = parsePositiveInteger(
    "PBS performance sample count",
    getCliOption(args, "--samples") ?? env.PBS_PERF_SAMPLES,
    DEFAULT_SAMPLE_COUNT,
  );
  const budgetMs = parsePositiveInteger(
    "PBS performance budget",
    getCliOption(args, "--budget-ms") ?? env.PBS_PERF_BUDGET_MS,
    DEFAULT_BUDGET_MS,
  );
  const databaseConnectionTimeoutMs = parsePositiveInteger(
    "DATABASE_CONNECTION_TIMEOUT_MS",
    env.DATABASE_CONNECTION_TIMEOUT_MS,
    DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS,
  );
  const pbsSchema = validateSqlIdentifier(
    env.PBS_SCHEMA ?? DEFAULT_PBS_SCHEMA,
    "PBS_SCHEMA",
  );
  const pairingId = (
    getCliOption(args, "--pairing-id")
    ?? env.PBS_PERF_PAIRING_ID
    ?? DEFAULT_PAIRING_ID
  ).trim();

  if (!pairingId) {
    throw new Error("PBS performance pairing id is required.");
  }

  return {
    baseUrl,
    sampleCount,
    budgetMs,
    pairingId,
    databaseUrl: requireDatabaseUrl(env.DATABASE_URL),
    databaseConnectionTimeoutMs,
    jwtSecret: env.JWT_SECRET?.trim() || DEFAULT_JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN?.trim() || DEFAULT_JWT_EXPIRES_IN,
    pbsSchema,
  };
};

export const buildActivePortalUserQuery = (schema: string): string => {
  const safeSchema = validateSqlIdentifier(schema, "PBS_SCHEMA");

  return [
    "select id, crew_id, user_code, user_name, is_admin, token_version",
    `from ${quoteSqlIdentifier(safeSchema)}.pbs_user`,
    "where status = 0",
    "and password_access = '1'",
    "and portal_access = '1'",
    "and eff_dt <= now()",
    "and (exp_dt is null or exp_dt > now())",
    "order by id asc",
    "limit 1",
  ].join(" ");
};

const selectActivePortalUser = async (
  db: Queryable,
  schema: string,
): Promise<ActivePortalUserRow> => {
  const result = await db.query(buildActivePortalUserQuery(schema));
  const user = result.rows[0] as ActivePortalUserRow | undefined;

  if (!user) {
    throw new Error(`No active PBS user found in PBS schema "${schema}".`);
  }

  return user;
};

export const buildPerformanceAuthToken = (
  user: ActivePortalUserRow,
  jwtSecret: string,
  jwtExpiresIn: string,
): string => {
  return jwt.sign({
    id: String(user.id),
    name: user.user_name,
    employeeNo: user.crew_id,
    userCode: user.user_code,
    userName: user.user_name,
    authMode: "password",
    isAdmin: user.is_admin === 1,
    tokenVersion: user.token_version,
  }, jwtSecret, {
    expiresIn: jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
};

export const buildDefaultPerformanceEndpoints = (
): PerformanceEndpoint[] => [
  {
    name: "health",
    method: "GET",
    path: "/api/health",
    requiresAuth: false,
  },
  {
    name: "auth session",
    method: "GET",
    path: "/api/auth/session",
    requiresAuth: true,
  },
  {
    name: "dashboard profile",
    method: "GET",
    path: "/api/dashboard/profile",
    requiresAuth: true,
  },
  {
    name: "dashboard summary",
    method: "GET",
    path: "/api/dashboard/summary",
    requiresAuth: true,
  },
  {
    name: "pairing current draft",
    method: "GET",
    path: "/api/pairing-bids/current",
    requiresAuth: true,
  },
  {
    name: "days-off current draft",
    method: "GET",
    path: "/api/days-off-bids/current",
    requiresAuth: true,
  },
  {
    name: "bidding calendar current",
    method: "GET",
    path: "/api/bidding-calendar/current",
    requiresAuth: true,
  },
  {
    name: "line current draft",
    method: "GET",
    path: "/api/line-bids/current",
    requiresAuth: true,
  },
  {
    name: "lineholder summary",
    method: "GET",
    path: "/api/lineholder-bids/current/summary",
    requiresAuth: true,
  },
  {
    name: "reserve current draft",
    method: "GET",
    path: "/api/reserve-bids/current",
    requiresAuth: true,
  },
  {
    name: "reserve coverage",
    method: "GET",
    path: "/api/reserve-bids/current/coverage",
    requiresAuth: true,
  },
  {
    name: "award current",
    method: "GET",
    path: "/api/award/current",
    requiresAuth: true,
  },
  {
    name: "standing current draft",
    method: "GET",
    path: "/api/standing-bids/current",
    requiresAuth: true,
  },
  {
    name: "portal bootstrap",
    method: "GET",
    path: "/api/portal/bootstrap",
    requiresAuth: true,
  },
];

export const percentile = (values: readonly number[], percentileValue: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );

  return sorted[index];
};

const roundMs = (value: number): number => Math.round(value * 100) / 100;

export const summarizeDurations = (
  durations: readonly number[],
): Pick<EndpointPerformanceResult, "minMs" | "avgMs" | "p50Ms" | "p95Ms" | "p99Ms" | "maxMs"> => {
  if (durations.length === 0) {
    return {
      minMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    };
  }

  const total = durations.reduce((sum, duration) => sum + duration, 0);

  return {
    minMs: roundMs(Math.min(...durations)),
    avgMs: roundMs(total / durations.length),
    p50Ms: roundMs(percentile(durations, 50)),
    p95Ms: roundMs(percentile(durations, 95)),
    p99Ms: roundMs(percentile(durations, 99)),
    maxMs: roundMs(Math.max(...durations)),
  };
};

export const summarizeBytes = (
  samples: readonly EndpointSample[],
): Pick<EndpointPerformanceResult, "avgBytes" | "maxBytes"> => {
  const values = samples.map((sample) => sample.responseBytes);

  if (values.length === 0) {
    return { avgBytes: 0, maxBytes: 0 };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    avgBytes: Math.round(total / values.length),
    maxBytes: Math.max(...values),
  };
};

const parseApiCode = (bodyText: string): number | null => {
  try {
    const parsed = JSON.parse(bodyText) as { code?: unknown };

    return typeof parsed.code === "number" ? parsed.code : null;
  } catch {
    return null;
  }
};

const getFetchImpl = (fetchImpl?: FetchLike): FetchLike => {
  const selectedFetch = fetchImpl ?? globalThis.fetch;

  if (!selectedFetch) {
    throw new Error("Global fetch is unavailable. Run this script with Node.js 18 or newer.");
  }

  return selectedFetch as FetchLike;
};

const measureEndpoint = async (
  endpoint: PerformanceEndpoint,
  baseUrl: string,
  authToken: string,
  fetchImpl: FetchLike,
  clock: ClockLike,
): Promise<EndpointSample> => {
  const startedAt = clock.now();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (endpoint.requiresAuth) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (endpoint.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetchImpl(`${baseUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers,
      body: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
    });
    const bodyText = await response.text();
    const responseBytes = Buffer.byteLength(bodyText, "utf8");
    const durationMs = roundMs(clock.now() - startedAt);
    const apiCode = parseApiCode(bodyText);
    const apiFailed = typeof apiCode === "number" && apiCode >= 400;
    const error = response.ok && !apiFailed
      ? null
      : `HTTP ${response.status}${apiCode === null ? "" : ` / API ${apiCode}`}`;

    return {
      durationMs,
      statusCode: response.status,
      apiCode,
      responseBytes,
      error,
    };
  } catch (error) {
    return {
      durationMs: roundMs(clock.now() - startedAt),
      statusCode: null,
      apiCode: null,
      responseBytes: 0,
      error: toErrorMessage(error),
    };
  }
};

const runEndpoint = async (
  endpoint: PerformanceEndpoint,
  config: PerformanceBaselineConfig,
  authToken: string,
  fetchImpl: FetchLike,
  clock: ClockLike,
): Promise<EndpointPerformanceResult> => {
  const samples: EndpointSample[] = [];

  for (let index = 0; index < config.sampleCount; index += 1) {
    samples.push(await measureEndpoint(
      endpoint,
      config.baseUrl,
      authToken,
      fetchImpl,
      clock,
    ));
  }

  const durations = samples.map((sample) => sample.durationMs);
  const metrics = summarizeDurations(durations);
  const byteMetrics = summarizeBytes(samples);
  const statusCodes = Array.from(new Set(
    samples
      .map((sample) => sample.statusCode)
      .filter((statusCode): statusCode is number => statusCode !== null),
  ));
  const errors = Array.from(new Set(
    samples
      .map((sample) => sample.error)
      .filter((error): error is string => error !== null),
  ));
  const overBudget = metrics.p99Ms > config.budgetMs;

  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    sampleCount: samples.length,
    ...metrics,
    ...byteMetrics,
    budgetMs: config.budgetMs,
    overBudget,
    ok: errors.length === 0 && !overBudget,
    statusCodes,
    errors,
  };
};

export const runPbsPerformanceBaseline = async (
  config: PerformanceBaselineConfig,
  deps: {
    db: Queryable;
    fetchImpl?: FetchLike;
    clock?: ClockLike;
  },
): Promise<PerformanceBaselineSummary> => {
  const fetchImpl = getFetchImpl(deps.fetchImpl);
  const clock = deps.clock ?? performance;
  const user = await selectActivePortalUser(deps.db, config.pbsSchema);
  const authToken = buildPerformanceAuthToken(user, config.jwtSecret, config.jwtExpiresIn);
  const endpoints = buildDefaultPerformanceEndpoints();
  const results: EndpointPerformanceResult[] = [];

  for (const endpoint of endpoints) {
    results.push(await runEndpoint(endpoint, config, authToken, fetchImpl, clock));
  }

  return {
    ok: results.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    sampleCount: config.sampleCount,
    budgetMs: config.budgetMs,
    endpoints: results,
  };
};

const pad = (value: string, size: number): string => value.padEnd(size, " ");

const formatStatus = (result: EndpointPerformanceResult): string => {
  if (result.errors.length > 0) {
    return "ERROR";
  }

  return result.overBudget ? "SLOW" : "OK";
};

export const formatPerformanceBaselineReport = (
  summary: PerformanceBaselineSummary,
): string => {
  const rows = summary.endpoints.map((result) => ({
    endpoint: `${result.method} ${result.path} (${result.name})`,
    max: `${result.maxMs}ms`,
    p99: `${result.p99Ms}ms`,
    p95: `${result.p95Ms}ms`,
    p50: `${result.p50Ms}ms`,
    avg: `${result.avgMs}ms`,
    avgBytes: `${result.avgBytes}B`,
    maxBytes: `${result.maxBytes}B`,
    status: formatStatus(result),
  }));
  const endpointWidth = Math.max(
    "Endpoint".length,
    ...rows.map((row) => row.endpoint.length),
  );
  const lines = [
    "PBS performance baseline",
    `Base URL: ${summary.baseUrl}`,
    `Samples: ${summary.sampleCount}`,
    `Budget: ${summary.budgetMs}ms p99 per endpoint`,
    "",
    `${pad("Endpoint", endpointWidth)}  ${pad("Max", 10)}  ${pad("P99", 10)}  ${pad("P95", 10)}  ${pad("P50", 10)}  ${pad("Avg", 10)}  ${pad("AvgBytes", 12)}  ${pad("MaxBytes", 12)}  Status`,
    `${"-".repeat(endpointWidth)}  ${"-".repeat(10)}  ${"-".repeat(10)}  ${"-".repeat(10)}  ${"-".repeat(10)}  ${"-".repeat(10)}  ${"-".repeat(12)}  ${"-".repeat(12)}  ------`,
    ...rows.map((row) => [
      pad(row.endpoint, endpointWidth),
      pad(row.max, 10),
      pad(row.p99, 10),
      pad(row.p95, 10),
      pad(row.p50, 10),
      pad(row.avg, 10),
      pad(row.avgBytes, 12),
      pad(row.maxBytes, 12),
      row.status,
    ].join("  ")),
    "",
    "JSON summary:",
    JSON.stringify(summary, null, 2),
  ];

  return lines.join("\n");
};

export const redactSensitiveText = (
  text: string,
  sensitiveValues: readonly string[],
): string => {
  return sensitiveValues.reduce((result, value) => {
    if (!value) {
      return result;
    }

    return result.split(value).join("[redacted]");
  }, text);
};

export const toErrorMessage = (
  error: unknown,
  sensitiveValues: readonly string[] = [],
): string => {
  const message = error instanceof Error ? error.message : String(error);

  return redactSensitiveText(message, sensitiveValues);
};
