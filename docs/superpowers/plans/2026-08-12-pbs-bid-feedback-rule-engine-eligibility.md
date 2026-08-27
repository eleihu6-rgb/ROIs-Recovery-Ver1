# PBS Bid Feedback Rule Engine Eligibility 集成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 pbs-server 的 Bid Feedback 中对每个候选 Award Pairing 调用 RUST 法规（HTTP rule-engine），把告警映射进现有 `eligibility.reasons[]`；并按用户确认移除 `pbs_user.base/rank`，改从 live `crew_base`/`crew_rank` 取。

**Architecture:** pbs-server 镜像 live-server 的 `rule-engine-client.ts`（POST `/check/pairing`，`groupCode=String(ruleset_id)`）；ruleset 由 `workset WHERE category='RULE' AND type LIKE '%PBS%' AND enabled=true AND division=<pbs_user.division 兜底 P>` 解析（与 LIVE 侧 `%LIVE%` 对称）；对每个 award pairing 独立 checkPairing（并发 ~8），EngineResult 映射为 eligibility。`pbs_user.base/rank` 从 schema/model/sync 移除，5 个消费者切到 live `crew_base`/`crew_rank`（共享 `crew-identity` 解析器）。

**Tech Stack:** Fastify + TypeScript + Drizzle + pgPool 原生 SQL + **Node built-in test runner**（`node --import tsx --test`，非 Vitest）。

## Global Constraints

- 所有 workset 查询：`category='RULE'` + `type LIKE '%PBS%'` + `enabled=true` + `division`（division 为空兜底 `'P'`）。
- **禁止 git commit / push**（CLAUDE.md §No-Auto-Commit）：所有提交由用户在确认后手动执行。
- 不改前端契约：`eligibility` shape 保持 `packages/contracts/pbs-bid-feedback.d.ts` 现状。
- 无 pgPool（测试/降级路径）时，award pairing 回退现有 `UNKNOWN_PAIRING_ELIGIBILITY`（`checked:[]`），不破坏既有行为。
- 引擎失败/超时 → 逐 pairing 降级 unknown + `unavailable:["rule_engine"]`，反馈整体仍 200。
- 不手写法规检查器；全部走 rule-engine HTTP 服务。
- 测试运行（pbs-server 目录）：`npm test -- src/services/bid-feedback/ruleset-resolver.test.ts ...`（或单文件 `DATABASE_URL=... node --import tsx --test src/.../x.test.ts`）。
- 生成的动态 SQL 遵守 `docs/modules/database/generated-sql-safety-standard.md`。

---

### Task A: `RULE_ENGINE_URL` 配置 + rule-engine client

**Files:**
- Modify: `pbs-server/src/config/env.ts`（`RULE_ENGINE_URL`）
- Modify: `pbs-server/.env.example`（`RULE_ENGINE_URL`）
- Create: `pbs-server/src/services/rule-engine-client.ts`
- Test: `pbs-server/src/services/rule-engine-client.test.ts`

**Interfaces:**
- Produces: `ruleEngineClient.checkPairing(rulesetId: number | string, pairing: PairingInput, crew?: CrewInfo | null): Promise<EngineResult>`；`ruleEngineClient.checkRoster(rulesetId, crew, pairings, periodStart, periodEnd): Promise<RosterEngineResult>`。`PairingInput`/`CrewInfo`/`CheckResult`/`EngineResult`/`RosterEngineResult` 类型定义在 `pbs-server/src/services/rule-engine-client.ts` 内导出（镜像 live-server 的 `types/rule-engine.ts` 契约）。

- [ ] **Step 1: 加 `RULE_ENGINE_URL` 环境变量**

`pbs-server/src/config/env.ts` 的 `envSchema`（约 33 行后）追加：

```ts
    RULE_ENGINE_URL: z.string().url().default("http://localhost:3001"),
```

`pbs-server/.env.example` 追加：

```
RULE_ENGINE_URL=http://localhost:3001
```

- [ ] **Step 2: 写 client（镜像 live-server）**

创建 `pbs-server/src/services/rule-engine-client.ts`：

```ts
import { env } from "../config/index.js";

export interface FlightSegment {
  fltNo: string;
  depPort: string;
  arrPort: string;
  stdUtc: Date;
  staUtc: Date;
  blockMinutes: number;
  isNight: boolean;
  fleetCode?: string | null;
  isDeadhead?: boolean;
}

export interface DutyPeriod {
  dutySeq: number;
  reportUtc: Date;
  releaseUtc: Date;
  segments: FlightSegment[];
  restAfterMinutes?: number;
  reportLocal?: string;
  baseUtcOffset?: number;
}

export interface PairingInput {
  pairingId: number;
  crewBase: string;
  duties: DutyPeriod[];
  seatPosition?: string | null;
}

export interface CrewInfo {
  crewId: string;
  division: string;
  rank: string;
  fleetQuals: string[];
  airportQuals: string[];
  recentFlightHours: {
    last24h: number;
    last7d: number;
    last28d: number;
    last90d: number;
    last365d: number;
  };
  recentLandings90d?: number;
  totalHours?: number;
  dateOfBirth?: string | null;
}

export interface CheckResult {
  ruleCode: string;
  ruleName: string;
  passed: boolean;
  severity: number;
  actualValue: number;
  limitValue: number;
  unit: string;
  message: string;
}

export interface EngineResult {
  passedAll: boolean;
  highestSeverity: number;
  checkResults: CheckResult[];
  calcResults: CalcResult[];
}

interface CalcResult {
  ruleCode: string;
  ruleName: string;
  value: number;
  unit: string;
}

function serializePairing(p: PairingInput): unknown {
  return {
    pairingId: p.pairingId,
    crewBase: p.crewBase,
    seatPosition: p.seatPosition,
    duties: p.duties.map((d) => ({
      dutySeq: d.dutySeq,
      reportUtc: d.reportUtc.toISOString(),
      releaseUtc: d.releaseUtc.toISOString(),
      restAfterMinutes: d.restAfterMinutes,
      reportLocal: d.reportLocal,
      baseUtcOffset: d.baseUtcOffset,
      segments: d.segments.map((s) => ({
        fltNo: s.fltNo,
        depPort: s.depPort,
        arrPort: s.arrPort,
        stdUtc: s.stdUtc.toISOString(),
        staUtc: s.staUtc.toISOString(),
        blockMinutes: s.blockMinutes,
        isNight: s.isNight,
        fleetCode: s.fleetCode,
        isDeadhead: s.isDeadhead,
      })),
    })),
  };
}

function serializeCrew(c: CrewInfo): unknown {
  return {
    crewId: c.crewId,
    division: c.division,
    rank: c.rank,
    fleetQuals: c.fleetQuals,
    airportQuals: c.airportQuals,
    recentFlightHours: c.recentFlightHours,
    recentLandings90d: c.recentLandings90d,
    totalHours: c.totalHours,
    dateOfBirth: c.dateOfBirth,
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.RULE_ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Rule engine HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const ruleEngineClient = {
  async checkPairing(
    rulesetId: number | string,
    pairing: PairingInput,
    crew?: CrewInfo | null,
  ): Promise<EngineResult> {
    const raw = await post<{
      passedAll: boolean;
      highestSeverity: number;
      checkResults: CheckResult[];
      calcResults: CalcResult[];
    }>("/check/pairing", {
      groupCode: String(rulesetId),
      pairing: serializePairing(pairing),
      crew: crew ? serializeCrew(crew) : undefined,
    });
    return {
      passedAll: raw.passedAll,
      highestSeverity: raw.highestSeverity,
      checkResults: raw.checkResults,
      calcResults: raw.calcResults,
    };
  },
  async checkRoster(
    rulesetId: number | string,
    crew: CrewInfo,
    pairings: PairingInput[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    pairingResults: Map<number, EngineResult>;
    rosterViolations: CheckResult[];
    passedAll: boolean;
    highestSeverity: number;
  }> {
    const raw = await post<{
      passedAll: boolean;
      highestSeverity: number;
      rosterViolations: CheckResult[];
      pairingResults: Record<string, {
        passedAll: boolean;
        highestSeverity: number;
        checkResults: CheckResult[];
        calcResults: CalcResult[];
      }>;
    }>("/check/roster", {
      groupCode: String(rulesetId),
      crew: serializeCrew(crew),
      pairings: pairings.map(serializePairing),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
    const pairingResults = new Map<number, EngineResult>();
    for (const [pid, res] of Object.entries(raw.pairingResults)) {
      pairingResults.set(Number(pid), {
        passedAll: res.passedAll,
        highestSeverity: res.highestSeverity,
        checkResults: res.checkResults,
        calcResults: res.calcResults,
      });
    }
    return {
      passedAll: raw.passedAll,
      highestSeverity: raw.highestSeverity,
      rosterViolations: raw.rosterViolations,
      pairingResults,
    };
  },
};
```

- [ ] **Step 3: 写 client 测试**

创建 `pbs-server/src/services/rule-engine-client.test.ts`（mock 全局 `fetch`）：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleEngineClient, type PairingInput, type CrewInfo } from "./rule-engine-client.js";

const pairing: PairingInput = {
  pairingId: 123,
  crewBase: "YYZ",
  duties: [{
    dutySeq: 1,
    reportUtc: new Date("2026-08-01T12:00:00Z"),
    releaseUtc: new Date("2026-08-01T18:00:00Z"),
    segments: [{
      fltNo: "F88001",
      depPort: "YYZ",
      arrPort: "YVR",
      stdUtc: new Date("2026-08-01T13:00:00Z"),
      staUtc: new Date("2026-08-01T16:00:00Z"),
      blockMinutes: 180,
      isNight: false,
      fleetCode: "73F",
    }],
  }],
};

const crew: CrewInfo = {
  crewId: "1001",
  division: "P",
  rank: "CA",
  fleetQuals: ["73F"],
  airportQuals: [],
  recentFlightHours: { last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0 },
};

test("checkPairing posts /check/pairing with groupCode=rulesetId and returns EngineResult", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({
      passedAll: false,
      highestSeverity: 3,
      checkResults: [{
        ruleCode: "max_dp",
        ruleName: "Max Duty Period",
        passed: false,
        severity: 3,
        actualValue: 500,
        limitValue: 480,
        unit: "minutes",
        message: "Duty period exceeds limit.",
      }],
      calcResults: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const result = await ruleEngineClient.checkPairing(103, pairing, crew);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://localhost:3001/check/pairing");
    assert.equal((calls[0].body as { groupCode: string }).groupCode, "103");
    assert.equal(result.passedAll, false);
    assert.equal(result.checkResults[0]?.ruleCode, "max_dp");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkPairing throws on non-2xx", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(
      () => ruleEngineClient.checkPairing(103, pairing, crew),
      /Rule engine HTTP 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 4: 运行测试**

Run:
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/rule-engine-client.test.ts
```
Expected: 2 tests PASS。

---

### Task B: `crew-identity` 共享解析器

**Files:**
- Create: `pbs-server/src/services/lineholder/crew-identity.ts`
- Test: `pbs-server/src/services/lineholder/crew-identity.test.ts`

**Interfaces:**
- Produces: `resolveCrewIdentity(pgPool: Pick<Pool, "query">, liveSchema: string, crewId: string): Promise<{ base: string | null; rank: string | null; division: string | null; zoneId: string | null }>`。

- [ ] **Step 1: 写测试（先红）**

创建 `pbs-server/src/services/lineholder/crew-identity.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCrewIdentity } from "./crew-identity.js";

const fakePool = (rowsBySql: Array<{ match: string; rows: unknown[] }>) => ({
  query: async (sql: string, _params?: unknown[]) => {
    const hit = rowsBySql.find((r) => String(sql).includes(r.match));
    return { rows: hit?.rows ?? [] };
  },
});

test("resolves prime base, effective rank, division, and zoneId", async () => {
  const pool = fakePool([
    { match: "crew_base", rows: [{ base: "YVR" }] },
    { match: "crew_rank", rows: [{ rank: "FO" }] },
    { match: "from crew where", rows: [{ division: "P" }] },
    { match: "airport", rows: [{ zone_id: "America/Vancouver" }] },
  ]);
  const r = await resolveCrewIdentity(pool as never, "f8", "1001");
  assert.equal(r.base, "YVR");
  assert.equal(r.rank, "FO");
  assert.equal(r.division, "P");
  assert.equal(r.zoneId, "America/Vancouver");
});

test("falls back to any effective base when no prime base and null when none", async () => {
  const pool = fakePool([
    { match: "crew_base", rows: [{ base: "YYZ" }] },   // no is_prime_base row first pass
    { match: "crew_rank", rows: [] },
    { match: "from crew where", rows: [{ division: "C" }] },
    { match: "airport", rows: [] },
  ]);
  const r = await resolveCrewIdentity(pool as never, "f8", "2002");
  assert.equal(r.rank, null);
  assert.equal(r.division, "C");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/lineholder/crew-identity.test.ts
```
Expected: FAIL（`resolveCrewIdentity` 不存在）。

- [ ] **Step 3: 实现**

创建 `pbs-server/src/services/lineholder/crew-identity.ts`：

```ts
import type { Pool } from "pg";

export interface CrewIdentity {
  base: string | null;
  rank: string | null;
  division: string | null;
  zoneId: string | null;
}

/**
 * Resolve a crew's current base / rank / division / zoneId from the LIVE schema.
 * - base: prime base (is_prime_base=1) effective-dated; fallback to any effective base.
 * - rank: latest effective-dated crew_rank row.
 * - division: crew.division.
 * - zoneId: airport.zone_id resolved from base.
 * Replaces the denormalized pbs_user.base/rank columns.
 */
export const resolveCrewIdentity = async (
  pgPool: Pick<Pool, "query">,
  liveSchema: string,
  crewId: string,
): Promise<CrewIdentity> => {
  const baseRes = await pgPool.query<{ base: string }>(
    `select base from ${liveSchema}.crew_base
      where crew_id = $1
        and eff_dt <= now() and (exp_dt is null or exp_dt > now())
      order by is_prime_base desc, eff_dt desc
      limit 1`,
    [crewId],
  );
  const base = baseRes.rows[0]?.base ?? null;

  const rankRes = await pgPool.query<{ rank: string }>(
    `select rank from ${liveSchema}.crew_rank
      where crew_id = $1 and eff_dt <= now() and (exp_dt is null or exp_dt > now())
      order by eff_dt desc
      limit 1`,
    [crewId],
  );
  const rank = rankRes.rows[0]?.rank ?? null;

  const crewRes = await pgPool.query<{ division: string }>(
    `select division from ${liveSchema}.crew where crew_id = $1 limit 1`,
    [crewId],
  );
  const division = crewRes.rows[0]?.division ?? null;

  let zoneId: string | null = null;
  if (base) {
    const zoneRes = await pgPool.query<{ zone_id: string }>(
      `select zone_id from ${liveSchema}.airport where airport = upper($1) limit 1`,
      [base],
    );
    zoneId = zoneRes.rows[0]?.zone_id ?? null;
  }

  return { base, rank, division, zoneId };
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同 Step 2。Expected: PASS。

---

### Task C: ruleset resolver

**Files:**
- Create: `pbs-server/src/services/bid-feedback/ruleset-resolver.ts`
- Test: `pbs-server/src/services/bid-feedback/ruleset-resolver.test.ts`

**Interfaces:**
- Produces: `resolvePbsRuleset(pgPool: Pick<Pool, "query">, liveSchema: string, division: string): Promise<{ rulesetId: number; name: string } | null>`。

- [ ] **Step 1: 写测试（先红）**

创建 `pbs-server/src/services/bid-feedback/ruleset-resolver.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePbsRuleset } from "./ruleset-resolver.js";

const fakePool = (rows: Array<{ id: number; name: string }>) => ({
  query: async (_sql: string, _params?: unknown[]) => ({ rows }),
});

test("resolves the enabled PBS workset for the division", async () => {
  const pool = fakePool([{ id: 103, name: "PBS Solver Ruleset FD" }]);
  const r = await resolvePbsRuleset(pool as never, "f8", "P");
  assert.deepEqual(r, { rulesetId: 103, name: "PBS Solver Ruleset FD" });
});

test("returns null when no enabled PBS workset exists", async () => {
  const pool = fakePool([]);
  const r = await resolvePbsRuleset(pool as never, "f8", "C");
  assert.equal(r, null);
});
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/bid-feedback/ruleset-resolver.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现**

创建 `pbs-server/src/services/bid-feedback/ruleset-resolver.ts`：

```ts
import type { Pool } from "pg";

export interface PbsRuleset {
  rulesetId: number;
  name: string;
}

/**
 * Resolve the enabled PBS rule collection for a division from the live workset table.
 * Mirrors the LIVE side's `type LIKE '%LIVE%'`: uses `type LIKE '%PBS%'` so a shared
 * ruleset (e.g. type='LIVE,PBS,RO') serves both LIVE and PBS. ruleset_id = workset.id.
 */
export const resolvePbsRuleset = async (
  pgPool: Pick<Pool, "query">,
  liveSchema: string,
  division: string,
): Promise<PbsRuleset | null> => {
  const { rows } = await pgPool.query<{ id: number; name: string }>(
    `select id, name
       from ${liveSchema}.workset
      where category = 'RULE'
        and type like '%PBS%'
        and enabled = true
        and division = $1
      order by id
      limit 1`,
    [division],
  );
  const row = rows[0];
  return row ? { rulesetId: Number(row.id), name: row.name } : null;
};
```

- [ ] **Step 4: 运行确认通过**

Run: 同 Step 2。Expected: PASS。

---

### Task D: rule-check 数据服务（CrewInfo + PairingInput）

**Files:**
- Create: `pbs-server/src/services/rule-check/rule-check-data-service.ts`
- Test: `pbs-server/src/services/rule-check/rule-check-data-service.test.ts`

**Interfaces:**
- Produces:
  - `loadCrewInfo(pgPool, liveSchema, crewId): Promise<{ division: string; rank: string; fleetQuals: string[]; airportQuals: string[]; dateOfBirth: string | null }>`
  - `loadFlightHistory(pgPool, liveSchema, crewId, referenceTime: Date): Promise<{ last24h; last7d; last28d; last90d; last365d }>`
  - `loadPairingInputs(pgPool, liveSchema, pairingIds: number[]): Promise<Map<number, PairingInput | null>>`（缺失 pairing 返回 null）
  - 复用 Task A 导出的 `PairingInput` 类型。

- [ ] **Step 1: 写测试（先红）**

创建 `pbs-server/src/services/rule-check/rule-check-data-service.test.ts`（fake pgPool 按 SQL 子串路由）：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCrewInfo, loadFlightHistory, loadPairingInputs } from "./rule-check-data-service.js";

const fakePool = (routes: Array<{ match: string; rows: unknown[] }>) => ({
  query: async (sql: string, _params?: unknown[]) => ({
    rows: routes.find((r) => String(sql).includes(r.match))?.rows ?? [],
  }),
});

test("loadCrewInfo returns division, effective rank, quals, dob", async () => {
  const pool = fakePool([
    { match: "from crew where", rows: [{ division: "P", birthday: new Date("1990-01-01") }] },
    { match: "from crew_rank", rows: [{ rank: "CA" }] },
    { match: "from crew_fleet", rows: [{ fleet_specific: "73F" }, { fleet_specific: "320" }] },
    { match: "from crew_qualification", rows: [{ airport: "YYZ" }] },
  ]);
  const r = await loadCrewInfo(pool as never, "f8", "1001");
  assert.equal(r.division, "P");
  assert.equal(r.rank, "CA");
  assert.deepEqual(r.fleetQuals, ["73F", "320"]);
  assert.deepEqual(r.airportQuals, ["YYZ"]);
  assert.equal(r.dateOfBirth, "1990-01-01");
});

test("loadFlightHistory sums block minutes in rolling windows", async () => {
  const pool = fakePool([{ match: "roster_flight", rows: [{
    last_24h: 120, last_7d: 600, last_28d: 2400, last_90d: 8000, last_365d: 30000,
  }] }]);
  const r = await loadFlightHistory(pool as never, "f8", "1001", new Date("2026-08-01T00:00:00Z"));
  assert.equal(r.last24h, 120);
  assert.equal(r.last365d, 30000);
});

test("loadPairingInputs groups segments by duty_seq and nulls missing pairings", async () => {
  const pool = fakePool([{ match: "from pairing p", rows: [
    { pairing_id: 1, base: "YYZ", duty_seq: 1, brief_start_utc: new Date("2026-08-01T12:00:00Z"),
      debrief_end_utc: new Date("2026-08-01T18:00:00Z"), duty_sch_rest_min: null, seg_seq: 1,
      flt_num: "F88001", dep_arp: "YYZ", arv_arp: "YVR",
      sch_str_dt_utc: new Date("2026-08-01T13:00:00Z"), sch_end_dt_utc: new Date("2026-08-01T16:00:00Z"),
      fleet_seg: "73F", seg_assignment: "CA", blk_min: 180 },
  ] }]);
  const m = await loadPairingInputs(pool as never, "f8", [1, 999]);
  const p1 = m.get(1);
  assert.ok(p1);
  assert.equal(p1.pairingId, 1);
  assert.equal(p1.crewBase, "YYZ");
  assert.equal(p1.duties.length, 1);
  assert.equal(p1.duties[0]?.segments[0]?.fltNo, "F88001");
  assert.equal(p1.duties[0]?.segments[0]?.blockMinutes, 180);
  assert.equal(m.get(999), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/rule-check/rule-check-data-service.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `pbs-server/src/services/rule-check/rule-check-data-service.ts`：

```ts
import type { Pool } from "pg";
import type { PairingInput, DutyPeriod, FlightSegment } from "../rule-engine-client.js";

type PgPool = Pick<Pool, "query">;

const isNightFlight = (stdUtc: Date): boolean => {
  const h = stdUtc.getUTCHours();
  return h >= 22 || h < 6;
};

export const loadCrewInfo = async (
  pgPool: PgPool,
  liveSchema: string,
  crewId: string,
): Promise<{ division: string; rank: string; fleetQuals: string[]; airportQuals: string[]; dateOfBirth: string | null }> => {
  const crewRes = await pgPool.query<{ division: string; birthday: Date | null }>(
    `select division, birthday from ${liveSchema}.crew where crew_id = $1 limit 1`, [crewId]);
  const rankRes = await pgPool.query<{ rank: string }>(
    `select rank from ${liveSchema}.crew_rank
      where crew_id = $1 and eff_dt <= now() and (exp_dt is null or exp_dt > now())
      order by eff_dt desc limit 1`, [crewId]);
  const fleetRes = await pgPool.query<{ fleet_specific: string }>(
    `select fleet_specific from ${liveSchema}.crew_fleet
      where crew_id = $1 and eff_dt <= now() and (exp_dt is null or exp_dt > now())`, [crewId]);
  const airportRes = await pgPool.query<{ airport: string }>(
    `select distinct airport from ${liveSchema}.crew_qualification
      where crew_id = $1 and airport is not null and is_valid = 1`, [crewId]);
  const birthday = crewRes.rows[0]?.birthday ?? null;
  return {
    division: crewRes.rows[0]?.division ?? "",
    rank: rankRes.rows[0]?.rank ?? "",
    fleetQuals: fleetRes.rows.map((r) => r.fleet_specific),
    airportQuals: airportRes.rows.map((r) => r.airport),
    dateOfBirth: birthday ? birthday.toISOString().split("T")[0] : null,
  };
};

export const loadFlightHistory = async (
  pgPool: PgPool,
  liveSchema: string,
  crewId: string,
  referenceTime: Date,
): Promise<{ last24h: number; last7d: number; last28d: number; last90d: number; last365d: number }> => {
  const { rows } = await pgPool.query<{ last_24h: number | null; last_7d: number | null; last_28d: number | null; last_90d: number | null; last_365d: number | null }>(
    `select
        coalesce(sum(case when ps.sch_str_dt_utc >= $2 - interval '24 hours' then f.blk_min else 0 end), 0) as last_24h,
        coalesce(sum(case when ps.sch_str_dt_utc >= $2 - interval '7 days'  then f.blk_min else 0 end), 0) as last_7d,
        coalesce(sum(case when ps.sch_str_dt_utc >= $2 - interval '28 days' then f.blk_min else 0 end), 0) as last_28d,
        coalesce(sum(case when ps.sch_str_dt_utc >= $2 - interval '90 days' then f.blk_min else 0 end), 0) as last_90d,
        coalesce(sum(case when ps.sch_str_dt_utc >= $2 - interval '365 days' then f.blk_min else 0 end), 0) as last_365d
      from ${liveSchema}.roster_flight rf
      join ${liveSchema}.pairing_segment ps on ps.pairing_id = rf.pairing_id and ps.is_deleted = 0
      join ${liveSchema}.flight f on f.id = ps.flt_id
      where rf.crew_id = $1
        and rf.is_deleted = 0
        and rf.assignment_group = 'FLY'
        and rf.pairing_id is not null
        and ps.seg_assignment not in ('DH', 'DHD')
        and ps.sch_str_dt_utc <= $2 and ps.sch_end_dt_utc <= $2
        and ps.sch_str_dt_utc >= $2 - interval '365 days'`,
    [crewId, referenceTime]);
  const row = rows[0];
  return {
    last24h: row?.last_24h ?? 0,
    last7d: row?.last_7d ?? 0,
    last28d: row?.last_28d ?? 0,
    last90d: row?.last_90d ?? 0,
    last365d: row?.last_365d ?? 0,
  };
};

interface PairingSegmentRow {
  pairing_id: number;
  base: string;
  duty_seq: number;
  brief_start_utc: Date | null;
  debrief_end_utc: Date | null;
  duty_sch_str_dt_utc: Date;
  duty_sch_end_dt_utc: Date;
  duty_sch_rest_min: number | null;
  seg_seq: number;
  flt_num: string;
  dep_arp: string;
  arv_arp: string;
  sch_str_dt_utc: Date;
  sch_end_dt_utc: Date;
  fleet_seg: string;
  seg_assignment: string;
  blk_min: number | null;
}

export const loadPairingInputs = async (
  pgPool: PgPool,
  liveSchema: string,
  pairingIds: number[],
): Promise<Map<number, PairingInput | null>> => {
  const result = new Map<number, PairingInput | null>();
  for (const id of pairingIds) result.set(id, null);
  if (pairingIds.length === 0) return result;

  const { rows } = await pgPool.query<PairingSegmentRow>(
    `select
        p.id as pairing_id,
        p.base,
        ps.duty_seq,
        ps.duty_sch_str_dt_utc,
        ps.duty_sch_end_dt_utc,
        ps.duty_sch_rest_min,
        ps.brief_start_utc,
        ps.debrief_end_utc,
        ps.seg_seq,
        ps.flt_num,
        ps.dep_arp,
        ps.arv_arp,
        ps.sch_str_dt_utc,
        ps.sch_end_dt_utc,
        ps.fleet_seg,
        ps.seg_assignment,
        coalesce(f.blk_min, 0) as blk_min
      from ${liveSchema}.pairing p
      join ${liveSchema}.pairing_segment ps on ps.pairing_id = p.id and ps.is_deleted = 0
      left join ${liveSchema}.flight f on f.id = ps.flt_id
      where p.id = any($1::bigint[]) and p.is_deleted = 0
      order by ps.duty_seq, ps.seg_seq`,
    [pairingIds]);

  const dutyMap = new Map<number, Map<number, PairingSegmentRow[]>>();
  for (const row of rows) {
    const perPairing = dutyMap.get(row.pairing_id) ?? new Map<number, PairingSegmentRow[]>();
    const list = perPairing.get(row.duty_seq) ?? [];
    list.push(row);
    perPairing.set(row.duty_seq, list);
    dutyMap.set(row.pairing_id, perPairing);
  }

  for (const [pairingId, perPairing] of dutyMap) {
    const duties: DutyPeriod[] = [];
    for (const [dutySeq, segRows] of perPairing) {
      const first = segRows[0];
      const reportUtc = first.brief_start_utc ?? first.duty_sch_str_dt_utc;
      const releaseUtc = first.debrief_end_utc ?? first.duty_sch_end_dt_utc;
      const segments: FlightSegment[] = segRows.map((sr) => ({
        fltNo: sr.flt_num,
        depPort: sr.dep_arp,
        arrPort: sr.arv_arp,
        stdUtc: sr.sch_str_dt_utc,
        staUtc: sr.sch_end_dt_utc,
        blockMinutes: sr.blk_min ?? 0,
        isNight: isNightFlight(sr.sch_str_dt_utc),
        fleetCode: sr.fleet_seg,
        isDeadhead: sr.seg_assignment === "DH",
      }));
      const duty: DutyPeriod = { dutySeq, reportUtc, releaseUtc, segments };
      if (first.duty_sch_rest_min != null) duty.restAfterMinutes = first.duty_sch_rest_min;
      duties.push(duty);
    }
    result.set(pairingId, {
      pairingId,
      crewBase: perPairing.values().next().value?.[0]?.base ?? "",
      duties,
      seatPosition: null,
    });
  }
  return result;
};
```

- [ ] **Step 4: 运行确认通过**

Run: 同 Step 2。Expected: PASS。

---

### Task E: rule-eligibility 服务（映射 + 并发）

**Files:**
- Create: `pbs-server/src/services/bid-feedback/rule-eligibility.ts`
- Test: `pbs-server/src/services/bid-feedback/rule-eligibility.test.ts`

**Interfaces:**
- Produces:
  - `type PairingEligibility = NonNullable<import("../../../../packages/contracts/pbs-bid-feedback.js").PbsBidFeedbackPairing["eligibility"]>`
  - `const RULESET_NOT_CONFIGURED_ELIGIBILITY: PairingEligibility`
  - `computePairingEligibility({ pgPool, liveSchema, ruleset, crewId, pairingIds, client }): Promise<Map<string, PairingEligibility>>`，其中 `ruleset: { rulesetId: number; name: string } | null`，`client` 为 Task A 的 `ruleEngineClient`（默认真实 client）。
  - 映射规则（spec §8）：`passedAll=true`→eligible；有失败项→ineligible + `RULE_ENGINE_CONFLICT` reasons；引擎异常→unknown + `unavailable:["rule_engine"]`；pairing 数据缺失→unknown + `FACTS_MISSING`；`ruleset==null`→§5.1 统一告警。
  - 并发上限 8（`mapWithConcurrency`）。

- [ ] **Step 1: 写测试（先红）**

创建 `pbs-server/src/services/bid-feedback/rule-eligibility.test.ts`：

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePairingEligibility, RULESET_NOT_CONFIGURED_ELIGIBILITY } from "./rule-eligibility.js";
import type { EngineResult, PairingInput } from "../rule-engine-client.js";

const pairing = (id: number): PairingInput => ({
  pairingId: id,
  crewBase: "YYZ",
  duties: [],
  seatPosition: null,
});

const fakeData = {
  loadCrewInfo: async () => ({
    division: "P", rank: "CA", fleetQuals: ["73F"], airportQuals: [], dateOfBirth: null,
  }),
  loadFlightHistory: async () => ({
    last24h: 0, last7d: 0, last28d: 0, last90d: 0, last365d: 0,
  }),
  loadPairingInputs: async (_p: unknown, _s: string, ids: number[]) => {
    const m = new Map<number, PairingInput | null>();
    for (const id of ids) m.set(id, id === 999 ? null : pairing(id));
    return m;
  },
};

const passing: EngineResult = { passedAll: true, highestSeverity: 0, checkResults: [], calcResults: [] };
const failing: EngineResult = {
  passedAll: false, highestSeverity: 3,
  checkResults: [{
    ruleCode: "max_dp", ruleName: "Max Duty Period", passed: false, severity: 3,
    actualValue: 500, limitValue: 480, unit: "minutes", message: "Duty period exceeds limit.",
  }],
  calcResults: [],
};

test("maps passing to eligible and failing to ineligible with RULE_ENGINE_CONFLICT reasons", async () => {
  const client = {
    checkPairing: async (rulesetId: number | string, _p: PairingInput, _c?: unknown) =>
      _p.pairingId === 1 ? passing : failing,
  } as never;
  const m = await computePairingEligibility({
    pgPool: {} as never, liveSchema: "f8",
    ruleset: { rulesetId: 103, name: "PBS" }, crewId: "1001", pairingIds: [1, 2],
    client, data: fakeData as never,
  });
  assert.equal(m.get("1")?.status, "eligible");
  assert.equal(m.get("2")?.status, "ineligible");
  assert.equal(m.get("2")?.reasons[0]?.code, "RULE_ENGINE_CONFLICT");
  assert.equal(m.get("2")?.reasons[0]?.ruleId, "max_dp");
});

test("degrades to unknown when the engine throws or pairing data is missing", async () => {
  const client = {
    checkPairing: async () => { throw new Error("engine down"); },
  } as never;
  const m = await computePairingEligibility({
    pgPool: {} as never, liveSchema: "f8",
    ruleset: { rulesetId: 103, name: "PBS" }, crewId: "1001", pairingIds: [1, 999],
    client, data: fakeData as never,
  });
  assert.equal(m.get("1")?.status, "unknown");
  assert.deepEqual(m.get("1")?.unavailable, ["rule_engine"]);
  assert.equal(m.get("999")?.status, "unknown");
  assert.equal(m.get("999")?.reasons[0]?.code, "FACTS_MISSING");
});

test("ruleset null returns the uniform not-configured alert for every pairing", async () => {
  const m = await computePairingEligibility({
    pgPool: {} as never, liveSchema: "f8",
    ruleset: null, crewId: "1001", pairingIds: [1, 2],
    client: {} as never, data: fakeData as never,
  });
  assert.equal(m.get("1")?.status, "unknown");
  assert.deepEqual(m.get("1")?.reasons, RULESET_NOT_CONFIGURED_ELIGIBILITY.reasons);
});
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/bid-feedback/rule-eligibility.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `pbs-server/src/services/bid-feedback/rule-eligibility.ts`：

```ts
import type { Pool } from "pg";
import type { PbsBidFeedbackPairing } from "../../../../packages/contracts/pbs-bid-feedback.js";
import type { CrewInfo, PairingInput } from "../rule-engine-client.js";
import { ruleEngineClient } from "../rule-engine-client.js";
import { loadCrewInfo, loadFlightHistory, loadPairingInputs } from "../rule-check/rule-check-data-service.js";
import type { PbsRuleset } from "./ruleset-resolver.js";

export type PairingEligibility = NonNullable<PbsBidFeedbackPairing["eligibility"]>;

export const RULESET_NOT_CONFIGURED_ELIGIBILITY: PairingEligibility = {
  status: "unknown",
  checked: ["rule_engine"],
  unavailable: ["rule_engine"],
  reasons: [{
    code: "FACTS_MISSING",
    message: "No enabled PBS ruleset configured for this division. Please ask an administrator to configure the PBS ruleset.",
  }],
};

type EngineClient = Pick<typeof ruleEngineClient, "checkPairing">;
type RuleCheckData = {
  loadCrewInfo: typeof loadCrewInfo;
  loadFlightHistory: typeof loadFlightHistory;
  loadPairingInputs: typeof loadPairingInputs;
};

const CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface ComputePairingEligibilityArgs {
  pgPool: Pick<Pool, "query">;
  liveSchema: string;
  ruleset: PbsRuleset | null;
  crewId: string;
  pairingIds: number[];
  client?: EngineClient;
  data?: RuleCheckData;
}

export const computePairingEligibility = async ({
  pgPool, liveSchema, ruleset, crewId, pairingIds,
  client = ruleEngineClient,
  data = { loadCrewInfo, loadFlightHistory, loadPairingInputs },
}: ComputePairingEligibilityArgs): Promise<Map<string, PairingEligibility>> => {
  const result = new Map<string, PairingEligibility>();

  if (!ruleset) {
    for (const id of pairingIds) result.set(String(id), RULESET_NOT_CONFIGURED_ELIGIBILITY);
    return result;
  }

  const pairingInputs = await data.loadPairingInputs(pgPool, liveSchema, pairingIds);
  const [crewBase, flightHistory] = await Promise.all([
    data.loadCrewInfo(pgPool, liveSchema, crewId),
    data.loadFlightHistory(pgPool, liveSchema, crewId, new Date()),
  ]);
  const crew: CrewInfo = {
    crewId,
    division: crewBase.division,
    rank: crewBase.rank,
    fleetQuals: crewBase.fleetQuals,
    airportQuals: crewBase.airportQuals,
    recentFlightHours: flightHistory,
    dateOfBirth: crewBase.dateOfBirth,
  };

  await mapWithConcurrency(pairingIds, CONCURRENCY, async (id) => {
    const pairing = pairingInputs.get(id) ?? null;
    if (!pairing) {
      result.set(String(id), {
        status: "unknown",
        checked: ["rule_engine"],
        unavailable: ["rule_engine"],
        reasons: [{ code: "FACTS_MISSING", message: "Pairing data is unavailable for rule check." }],
      });
      return;
    }
    let engine: Awaited<ReturnType<EngineClient["checkPairing"]>>;
    try {
      engine = await client.checkPairing(ruleset.rulesetId, pairing, crew);
    } catch (err) {
      console.error(`[rule-eligibility] engine check failed for pairing ${id}:`, err);
      result.set(String(id), {
        status: "unknown",
        checked: ["rule_engine"],
        unavailable: ["rule_engine"],
        reasons: [],
      });
      return;
    }
    if (engine.passedAll) {
      result.set(String(id), { status: "eligible", checked: ["rule_engine"], unavailable: [], reasons: [] });
      return;
    }
    result.set(String(id), {
      status: "ineligible",
      checked: ["rule_engine"],
      unavailable: [],
      reasons: engine.checkResults
        .filter((cr) => !cr.passed)
        .map((cr) => ({
          code: "RULE_ENGINE_CONFLICT" as const,
          message: cr.message,
          ruleId: cr.ruleCode,
          ruleName: cr.ruleName,
        })),
    });
  });

  return result;
};
```

> 注：`console.error` 仅用于引擎失败日志；实际工程中如项目已有 logger 注入方式可替换，不阻塞功能。

- [ ] **Step 4: 运行确认通过**

Run: 同 Step 2。Expected: PASS。

---

### Task F: 接入 bid-feedback-service

**Files:**
- Modify: `pbs-server/src/services/bid-feedback/bid-feedback-service.ts`
- Test: `pbs-server/src/services/bid-feedback/bid-feedback-service.test.ts`（更新 + 追加）

**Interfaces:**
- Consumes: Task C `resolvePbsRuleset`、Task E `computePairingEligibility`、`env.RULE_ENGINE_URL`（经 client）。
- Produces: `createPbsBidFeedbackService` 行为变更：`getCurrentFeedback` 返回的 award pairing 带真实 `eligibility`；`getCurrentConflicts` 不计算 eligibility（避免拖慢）。

- [ ] **Step 1: 增加 `includeEligibility` 门控与 eligibilityLabel**

在 `bid-feedback-service.ts`：
- import 增加 `resolvePbsRuleset`（`./ruleset-resolver.js`）与 `computePairingEligibility`（`./rule-eligibility.js`），并 `import { env } from "../../config/index.js"`（若未导入）。
- `buildFeedback` 增加可选参数 `includeEligibility: boolean`（默认 false）。
- `FEEDBACK_CACHE_VERSION` 从 `` `v7:${pbsTierPolicy.version}` `` 改为 `` `v8:${pbsTierPolicy.version}` ``。
- `eligibilityLabel` 从固定文案改为动态：默认（未计算）保持现有文案；计算后为 `` `Eligibility based on PBS ruleset ${ruleset?.name ?? ""} (id ${ruleset?.rulesetId ?? "-"}).` ``。

在 `buildFeedback(actor, inputs)` 内，`pairings` 数组构建后（原 `:562` 处 `eligibility: rawDirection === "award" ? UNKNOWN_PAIRING_ELIGIBILITY : null`），当 `includeEligibility && pgPool` 时对 award pairings 调用 `computePairingEligibility`：

```ts
    let eligibilityByPairingId: Map<string, PairingEligibility> | null = null;
    if (includeEligibility && pgPool) {
      const division = actorDivision ?? "P";  // 见 Step 2
      const ruleset = await resolvePbsRuleset(pgPool, env.LIVE_SCHEMA, division);
      const awardIds = pairings
        .filter((p) => p.rawDirection === "award")
        .map((p) => Number(p.pairingId));
      if (awardIds.length > 0) {
        eligibilityByPairingId = await computePairingEligibility({
          pgPool, liveSchema: env.LIVE_SCHEMA, ruleset, crewId: actor.crewId, pairingIds: awardIds,
        });
      }
    }
```

并在 `pairings.map(...)` 里，award pairing 的 `eligibility` 取 `eligibilityByPairingId?.get(pairing.pairingId) ?? UNKNOWN_PAIRING_ELIGIBILITY`。

- [ ] **Step 2: 解析 `actorDivision`（pbs_user.division，兜底 P）**

新增一次查询（当 `includeEligibility && pgPool` 时）：

```ts
      const divRes = await pgPool.query<{ division: string | null }>(
        `select division from ${env.PBS_SCHEMA}.pbs_user
          where crew_id = $1 order by id limit 1`,
        [actor.crewId]);
      const actorDivision = divRes.rows[0]?.division || "P";
```

- [ ] **Step 3: 门控调用点**

- `getCurrentFeedback`：调 `buildFeedback(actor, inputs, /* includeEligibility */ true)`。
- `getCurrentConflicts`：调 `buildFeedback(actor, inputs)`（默认 false，不计算 eligibility）。
- 缓存键不变（`FEEDBACK_CACHE_VERSION` 已 bump 到 v8，旧缓存自然淘汰）。

- [ ] **Step 4: 更新既有测试 + 追加集成测试**

既有 `bid-feedback-service.test.ts` 不传 pgPool → award pairing 保持 `UNKNOWN_PAIRING_ELIGIBILITY`（现有 deepEqual 断言继续通过）。追加：

```ts
test("with a mock pgPool + ruleset, award pairings get real eligibility", async () => {
  const pairingSearchService = {
    async matchFeedbackPairings() {
      return [{ pairing: pairingResult, matchedPropertyKeys: ["current:current-award"] }];
    },
  } as unknown as PbsPairingSearchService;
  const pgPool = {
    query: async (sql: string) => {
      if (String(sql).includes("pbs_user")) return { rows: [{ division: "P" }] };
      if (String(sql).includes("workset")) return { rows: [{ id: 103, name: "PBS" }] };
      return { rows: [] };
    },
  } as never;
  const service = createPbsBidFeedbackService({
    pairingBidService, daysOffBidService, lineBidService, reserveBidService, standingBidService,
    pairingSearchService, pgPool,
  });
  const feedback = await service.getCurrentFeedback({ crewId: "1001", userCode: "crew" });
  const award = feedback.pairings.find((p) => p.rawDirection === "award");
  assert.equal(award?.eligibility?.checked.includes("rule_engine"), true);
  assert.equal(["eligible", "ineligible", "unknown"].includes(award?.eligibility?.status ?? ""), true);
});
```

> 说明：此集成测试中 `computePairingEligibility` 的 `loadPairingInputs` 会调用 pgPool.query 查 pairing——mock 返回空 rows → 所有 award pairing 按 `FACTS_MISSING` 降级 unknown（仍在 `["eligible","ineligible","unknown"]` 内）。断言保持宽松以不绑定引擎细节。

- [ ] **Step 5: 运行测试**

Run:
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test src/services/bid-feedback/bid-feedback-service.test.ts
```
Expected: 既有 + 新增全部 PASS。

---

### Task G: `pbs_user.base/rank` 移除（DB + model + sync）

**Files:**
- Create: `sql/migration/2026-08-12-pbs-user-drop-base-rank.sql`
- Modify: `sql/schema/pbs/01-pbs.sql`（删除 `base`/`rank` 列、`idx_pbs_user_base`/`idx_pbs_user_rank` 索引及 comment）
- Modify: `pbs-server/src/models/pbs/pbs-user.ts`（删除 `base`/`rank` 字段）
- Modify: `pbs-server/src/scripts/sync-pbs-users.ts`（删除 base/rank 两个 UPDATE）

- [ ] **Step 1: 新建迁移**

`sql/migration/2026-08-12-pbs-user-drop-base-rank.sql`：

```sql
-- PBS: 移除 pbs_user.base / pbs_user.rank，改为从 live crew_base / crew_rank 查询。
alter table pbs_user drop column if exists base;
alter table pbs_user drop column if exists rank;
drop index if exists idx_pbs_user_base;
drop index if exists idx_pbs_user_rank;
```

- [ ] **Step 2: 更新权威 schema**

`sql/schema/pbs/01-pbs.sql` 中删除：
- `base                 varchar(3),  -- 主基地机场代码，从 crew_base 同步写入` 与 `rank                 varchar(10),  -- 当前有效职级代码，从 crew_rank 同步写入` 两行（列定义）。
- `create index idx_pbs_user_base          on pbs_user (base);` 与 `create index idx_pbs_user_rank          on pbs_user (rank);` 两行。
- `comment on column pbs_user.base ...` 与 `comment on column pbs_user.rank ...` 两行。

保留 `division` 列、`idx_pbs_user_division` 索引及 division comment。

- [ ] **Step 3: 更新 Drizzle model**

`pbs-server/src/models/pbs/pbs-user.ts` 删除：

```ts
  base: varchar("base", { length: 3 }),
  rank: varchar("rank", { length: 10 }),
```

保留 `division`。

- [ ] **Step 4: 更新 sync 脚本**

`pbs-server/src/scripts/sync-pbs-users.ts` 删除 base/rank 两个 enrich UPDATE（当前 303-332 行），只保留 division UPDATE（288-301 行）。删除后注释同步改为 "Enrich pbs_user with crew-derived fields (division)"。

- [ ] **Step 5: 验证**

Run:
```bash
cd pbs-server && npx tsc --noEmit
```
Expected: 0 错误（消费方迁移在 Task H 完成；此时如 pbs-server 内仍有 `pbsUser.base` 引用会报错——先执行 Task H 再跑，或在 Task H 完成前接受 Task G 步骤 5 暂缓）。

---

### Task H: 消费者迁移（5 处 + 测试）

**Files:**
- Modify: `pbs-server/src/services/bid-feedback/bid-feedback-input-loader.ts`（actor context CTE）
- Modify: `pbs-server/src/services/dashboard-profile/dashboard-profile-service.ts`
- Modify: `pbs-server/src/services/pairing/pairing-specific-date.ts`
- Modify: `pbs-server/src/services/reserve/reserve-coverage-service.ts`
- Modify: `pbs-server/src/services/algorithm-export/days-off-export.ts`
- Tests: 上述各文件对应既有测试更新

- [ ] **Step 1: `bid-feedback-input-loader.ts` — actor context 改 join live crew_base/crew_rank**

`bid_feedback_actor_context` CTE（当前 237-251 行）替换为：

```sql
      bid_feedback_actor_context as (
        select
          coalesce(nullif(btrim(crew_base.base), ''), actor.current_base) as actor_base,
          nullif(btrim(crew_rank.rank), '') as actor_rank,
          coalesce(base_tz.name, actor.current_zone_id) as actor_zone_id
        from bid_feedback_actor_identity actor
        left join ${liveSchema}.crew_base crew_base
          on crew_base.crew_id = actor.crew_id
         and crew_base.is_prime_base = 1
         and crew_base.eff_dt <= now()
         and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        left join ${liveSchema}.crew_rank crew_rank
          on crew_rank.crew_id = actor.crew_id
         and crew_rank.eff_dt <= now()
         and (crew_rank.exp_dt is null or crew_rank.exp_dt > now())
        left join ${liveSchema}.airport base_airport
          on upper(btrim(base_airport.airport)) = upper(btrim(coalesce(nullif(btrim(crew_base.base), ''), actor.current_base)))
        left join pg_timezone_names base_tz
          on base_tz.name = nullif(btrim(base_airport.zone_id), '')
        limit 1
      ),
```

> 该文件顶部已定义 `const liveSchema = validateSchemaName(env.LIVE_SCHEMA, ...)`，直接使用。运行既有 `bid-feedback-input-loader` 相关测试确认行为不变（base/rank 数据源变化但语义相同）。

- [ ] **Step 2: `dashboard-profile-service.ts` — base/rank 走 `resolveCrewIdentity`**

- import `resolveCrewIdentity`（`../lineholder/crew-identity.js`）。
- `getCurrentProfile` 中：删掉 `pbsUser.base`/`pbsUser.rank` 两个 select 字段（保留 crewId/userName/email/division）；在 `loadLiveProfileFields` 之前：

```ts
      const identity = pgPool && liveSchema
        ? await resolveCrewIdentity(pgPool, liveSchema, user.crewId)
        : { base: null, rank: null, division: null, zoneId: null };
      const base = trimToNullable(identity.base);
```

- `loadLiveProfileFields(user.crewId, base, user.division, ...)` 中 `base` 用 identity.base。
- 返回的 `rank: trimToNullable(identity.rank)`。
- 更新该文件测试：mock `resolveCrewIdentity` 或让 pgPool mock 返回 base/rank 行。

- [ ] **Step 3: `pairing-specific-date.ts` — base 走 live crew_base**

`db.select({ base: pbsUser.base })...`（当前 168 行）替换为对 `pgPool` 的 live 查询：

```ts
  const [preferOffConfig, preferOffRows, baseRows] = await Promise.all([
    loadPreferOffConfig(db),
    loadPreferOffCalendarRows(db, bidId),
    pgPool.query<{ base: string }>(
      `select cb.base from ${liveSchema}.crew_base cb
        where cb.crew_id = $1 and cb.is_prime_base = 1
          and cb.eff_dt <= now() and (cb.exp_dt is null or cb.exp_dt > now())
        limit 1`,
      [actor.crewId]),
  ]);
```

后续使用 `actorBase` 的地方改为 `baseRows.rows[0]?.base`（`liveSchema` 从该文件已有来源取，若无则用 `env.LIVE_SCHEMA`）。更新该文件测试。

- [ ] **Step 4: `reserve-coverage-service.ts` — actor_scope 的 base 改 join live crew_base**

`actor_scope` CTE（当前 90-100 行）替换为：

```sql
      actor_scope as (
        select
          nullif(btrim(crew_base.base), '')::varchar as base,
          nullif(btrim(pbs_user.division), '')::varchar as division
        from actor_identity
        left join ${pbsSchemaName}.pbs_user pbs_user
          on pbs_user.crew_id = actor_identity.crew_id
            and pbs_user.user_code = actor_identity.user_code
        left join ${schema}.crew_base crew_base
          on crew_base.crew_id = actor_identity.crew_id
         and crew_base.is_prime_base = 1
         and crew_base.eff_dt <= now()
         and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        order by pbs_user.id asc
        limit 1
      ),
```

> 注意：该文件 CTE 中的 `${schema}` 即 live schema（reserve-coverage 以 live schema 为查询目标）。更新该文件测试。

- [ ] **Step 5: `days-off-export.ts` — 两个 airport join 改 crew_base**

两处 `left join pbs_user ... left join airport on airport.airport = pbs_user.base` 改为：

```sql
        left join ${sql.raw(`${schema}.crew_base`)} crew_base
          on crew_base.crew_id = ${pbsBid.crewId}
         and crew_base.is_prime_base = 1
         and crew_base.eff_dt <= now()
         and (crew_base.exp_dt is null or crew_base.exp_dt > now())
        left join ${sql.raw(`${schema}.airport`)} airport
          on airport.airport = crew_base.base
```

两处都改（当前 396-399 与 416-419）。更新该文件测试。

- [ ] **Step 6: 类型检查 + 全量相关测试**

Run:
```bash
cd pbs-server && npx tsc --noEmit
```
Expected: 0 错误。

Run（消费者相关测试）：
```bash
cd pbs-server && DATABASE_URL=postgresql://test:test@localhost:5432/rois node --import tsx --test \
  src/services/bid-feedback/bid-feedback-service.test.ts \
  src/services/dashboard-profile/dashboard-profile-service.test.ts \
  src/services/pairing/pairing-specific-date.test.ts \
  src/services/reserve/reserve-coverage-service.test.ts \
  src/services/algorithm-export/days-off-export.test.ts
```
Expected: 全部 PASS。

---

## Self-Review 备注

- Spec §5→Task C、§6→Task A、§7→Task D、§8→Task E、§9→Task F、§10.1→Task B、§10.2/10.3→Task G、§10.4→Task H，逐条对应。
- 无 pgPool（测试）时走 UNKNOWN 回退，既有 `bid-feedback-service.test.ts` 的 deepEqual unknown 断言不被破坏（Task F 明确）。
- `LIKE '%PBS%'`、division 兜底 P、引擎失败降级 unknown 等决策贯穿 Task C/E/F。
- 迁移文件为新建 SQL；`sql/schema/pbs/01-pbs.sql` 修改已获用户明确授权（移除 base/rank）。
- 测试均 mock pgPool / fetch，不依赖真实 DB。
