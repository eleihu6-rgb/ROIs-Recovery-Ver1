# Scenario Persisted Legality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-scenario rule violations (keyed by `scenario_id`), computed once on first open, read by later users, invalidated by version, and reclaimed on delete/rerun/idle.

**Architecture:** Two new tables in the `scenario` Postgres schema (`scenario.rule_violation` + `scenario.legality_status`). A live-server BullMQ worker reuses the existing Rust `RuleEngine`/`RosterEngine` (the live `violations-init` path) over `scenario.roster_flight`. A read endpoint does freshness check + concurrency-dedup flip. Staleness is a monotonic `roster_version`. The gantt scenario violation source loads persisted rows and subscribes to a WS event.

**Tech Stack:** PostgreSQL 16 (schema `scenario`), Fastify + BullMQ + Redis (live-server, TS), `@rois/rule-engine` (Rust via napi), React 19 + Zustand (gantt), Playwright (e2e), Vitest (live-server integration).

Reference spec: `docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md`.

> **Codebase corrections (verified during execution):**
> - Raw SQL uses **`fastify.pgPool`** (a `pg.Pool`), NOT `fastify.pg`. `fastify.db` is a Drizzle instance (`live-server/src/plugins/database.ts:32-33`). Every `db.query(...)` / `db.connect()` in this plan = `fastify.pgPool`.
> - API responses use the envelope **`{ code: 200, data, message: 'ok' }`** (live-server/CLAUDE.md). The route returns `reply.send({ code: 200, data: {...}, message: 'ok' })`; the gantt shared `http-client` already unwraps `{code}` bodies, so Task 8 uses the standard client.
> - The **`scenario` master table lives in the airline schema** (`f8.scenario`), while roster/violation tables live in the **`scenario` schema**. `ensureLegality` reads `f8.scenario` (search_path default) for rule_group_code/dates; the worker writes `scenario.*`. Migrations touching the master row run under search_path = airline; DDL for the new tables runs under search_path = scenario.
> - **Tasks 1-2 are DONE & verified** against the remote demo DB (tables created; scenarios 6/460 → `pbs_solver_ruleset`).
>
> **⚠️ COMPUTE-PATH SUPERSEDED (Tasks 3-6).** These tasks described reusing the TS `violations-init` worker (`@rois/rule-engine`). That engine does **not** own the `pbs_solver_ruleset` rules — verified: a full run over scenario 460 produced 0 violations; live rows are `created_by` `rust_*`. The real compute is **Rust** (`rule-engine-rs` `check_*` bins), orchestrated by `live-server/scripts/scenario-legality.mjs` reading `scenario.*` from DB (spec §5c). **Rule 8002 is implemented + verified** there (14 violations on scenario 460). Remaining work: wire the other 13 rules into `scenario-legality.mjs` (same `build-TSV → check_* → map-rows` shape), calibrate block derivation vs the ruletool credit model, then the live-server orchestration (Tasks 5-7: `ensureLegality` dedup, `GET /api/scenario/:id/legality`, idle sweep, version bump — these still apply but trigger the `.mjs` instead of a TS worker), frontend (Task 8), e2e (Task 9). Task 5 freshness predicate is DONE (6/6).

---

## File Structure

| File | Responsibility | Create/Modify |
|---|---|---|
| `sql/migration/2026-06-15-scenario-legality-tables.sql` | DDL for `scenario.rule_violation` + `scenario.legality_status` | Create |
| `sql/migration/2026-06-15-scenario-6-460-rust-ruleset.sql` | Point test scenarios 6/460 at `pbs_solver_ruleset` | Create |
| `live-server/src/workers/violations-init-worker.ts` | Add scenario-mode params (schema + scenarioId + rosterVersion) to the existing engine path | Modify |
| `live-server/src/workers/scenario-legality-worker.ts` | BullMQ worker: run engine over `scenario.roster_flight`, persist, publish WS | Create |
| `live-server/src/services/scenario/legality-status.ts` | Freshness read + dedup flip (advisory lock) + enqueue | Create |
| `live-server/src/routes/scenario/legality.ts` | `GET /api/scenario/:id/legality` | Create |
| `live-server/src/routes/scenario/index.ts` | Register the legality sub-route | Modify |
| `live-server/src/index.ts` | Start the scenario-legality worker; register idle-TTL cron | Modify |
| `live-server/src/workers/scenario-legality-sweep.ts` | Idle-TTL sweep (cron-driven) | Create |
| `live-server/scripts/load-scenario-roster.mjs` | Bump `roster_version` + set status STALE on reload | Modify |
| `gantt/src/services/scenario-legality-api.ts` | Client for `GET /api/scenario/:id/legality` | Create |
| `gantt/src/stores/scenario-violation-store.ts` | Load persisted violations + subscribe to WS `scenario:legality:{id}` | Modify |
| `gantt/src/version.ts` | Bump BACKEND + FRONTEND | Modify |
| `e2e/tests/gantt/scenario-legality.spec.ts` | Playwright: first-open compute, second-open DB read, rerun invalidation, delete cleanup | Create |
| `live-server/test/scenario-legality.test.ts` | Vitest: dedup, freshness predicate, sweep | Create |

---

## Task 1: DDL — scenario legality tables

**Files:**
- Create: `sql/migration/2026-06-15-scenario-legality-tables.sql`

- [ ] **Step 1: Write the migration DDL**

```sql
-- 2026-06-15  Scenario persisted legality: scenario.rule_violation + scenario.legality_status
-- Spec: docs/superpowers/specs/2026-06-15-scenario-persisted-legality-design.md
-- Idempotent (CREATE TABLE IF NOT EXISTS). Run against the `scenario` schema.
set search_path to scenario;

create table if not exists rule_violation (
  id                bigint generated always as identity,
  scenario_id       bigint         not null,
  roster_version    bigint         not null,
  crew_id           varchar(20)    not null,
  pairing_id        bigint,
  duty_seq          smallint,
  rule_group_code   varchar(50)    not null,
  rule_code         varchar(50)    not null,
  rule_instance     varchar(20),
  start_dt          timestamptz    not null,
  end_dt            timestamptz    not null,
  severity          smallint       not null,
  actual_value      numeric,
  limit_value       numeric,
  unit              varchar(20),
  message           text           not null,
  computed_at       timestamptz    not null default now(),
  created_by        varchar(50)    not null default 'system',
  created_at        timestamptz    not null default now(),
  primary key (id),
  unique (scenario_id, crew_id, pairing_id, duty_seq, rule_group_code, rule_code)
);
create index if not exists idx_srv_scenario on rule_violation (scenario_id, crew_id);

create table if not exists legality_status (
  scenario_id       bigint       primary key,
  rule_group_code   varchar(50)  not null,
  roster_version    bigint       not null default 0,
  computed_version  bigint       not null default -1,
  status            varchar(20)  not null default 'PENDING',
  computed_at       timestamptz,
  error_text        text,
  updated_at        timestamptz  not null default now()
);
create index if not exists idx_legality_status_idle on legality_status (updated_at);
```

- [ ] **Step 2: Verify SQL parses (dry compile via psql against the scenario schema)**

Run (uses the project DB; the scenario schema must exist):
```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois" -v ON_ERROR_STOP=1 \
  -c "set search_path to scenario;" -f sql/migration/2026-06-15-scenario-legality-tables.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` with no error. If the remote DB is used, substitute the live-server connection. Re-running prints `NOTICE ... already exists, skipping` (idempotent).

- [ ] **Step 3: Verify tables exist**

Run:
```bash
psql "postgresql://f8:Pier2026AIf8@localhost:5432/rois" \
  -c "select to_regclass('scenario.rule_violation'), to_regclass('scenario.legality_status');"
```
Expected: both columns non-null.

- [ ] **Step 4: Commit**

```bash
git add sql/migration/2026-06-15-scenario-legality-tables.sql
git commit -m "feat(scenario): DDL for persisted legality (rule_violation + legality_status)"
```

---

## Task 2: Point test scenarios at the Rust ruleset

**Files:**
- Create: `sql/migration/2026-06-15-scenario-6-460-rust-ruleset.sql`

- [ ] **Step 1: Write the UPDATE migration**

```sql
-- 2026-06-15  Point test scenarios 6 / 460 at the 14-rule Rust ruleset for legality testing.
-- pbs_solver_ruleset == legacy workset 103 (the migrated Rust rules).
update scenario set rule_group_code = 'pbs_solver_ruleset', updated_at = now()
 where id in (6, 460);
```

- [ ] **Step 2: Apply and verify**

Run:
```bash
psql "<live-server DB url>" -f sql/migration/2026-06-15-scenario-6-460-rust-ruleset.sql
psql "<live-server DB url>" -c "select id, rule_group_code from scenario where id in (6,460);"
```
Expected: both rows show `pbs_solver_ruleset`.

- [ ] **Step 3: Commit**

```bash
git add sql/migration/2026-06-15-scenario-6-460-rust-ruleset.sql
git commit -m "chore(scenario): test scenarios 6/460 use pbs_solver_ruleset"
```

---

## Task 3: Scenario-mode params on the engine path

The existing `violations-init-worker.ts` hard-codes `airline` (schema) and writes to live `rule_violation`. Extract the per-crew compute so the scenario worker can reuse it against the `scenario` schema and `scenario.rule_violation`.

**Files:**
- Modify: `live-server/src/workers/violations-init-worker.ts`
- Test: `live-server/test/scenario-legality.test.ts`

- [ ] **Step 1: Read the current per-crew compute**

Run: `grep -nE "handleCrew|deleteCrewViolations|bulkInsertViolations|loadRE|search_path|schema" live-server/src/workers/violations-init-worker.ts`
Expected: locate `handleCrew` (line ~368), `bulkInsertViolations` (~252), and how the schema is applied to queries.

- [ ] **Step 2: Export a reusable `computeCrewViolations` helper**

Add an exported function that takes `{ fastify, schema, ruleGroupCode, crewId, dateFrom, dateTo }`, runs `RuleEngine`/`RosterEngine` exactly as `handleCrew` does, and **returns** the violation rows (does NOT insert). Refactor `handleCrew` to call it, then insert into live `rule_violation` as today. Show the exact extracted signature:

```typescript
export interface ComputeCrewViolationsArgs {
  fastify: FastifyInstance
  schema: string            // 'f8' for live, 'scenario' for scenario mode
  ruleGroupCode: string
  crewId: string
  dateFrom: string          // ISO date
  dateTo: string
}

// Returns engine output rows in the shape bulkInsertViolations expects, minus persistence.
export async function computeCrewViolations(args: ComputeCrewViolationsArgs): Promise<ViolationRow[]>
```

(Use the existing `ViolationRow`/insert row type already present in the file; do not invent a new one.)

- [ ] **Step 3: Run live-server typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors (pre-existing errors per memory `live-server-preexisting-test-failures` are acceptable; do not introduce new ones).

- [ ] **Step 4: Commit**

```bash
git add live-server/src/workers/violations-init-worker.ts
git commit -m "refactor(live-server): extract computeCrewViolations for schema reuse"
```

---

## Task 4: Scenario legality worker

**Files:**
- Create: `live-server/src/workers/scenario-legality-worker.ts`
- Modify: `live-server/src/index.ts`

- [ ] **Step 1: Write the worker**

```typescript
import { Worker, Queue } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { computeCrewViolations } from './violations-init-worker.js'

export const SCENARIO_LEGALITY_QUEUE = 'scenario-legality'

export interface ScenarioLegalityJob {
  scenarioId: number
  schema: 'scenario'
  ruleGroupCode: string
  rosterVersion: number
  dateFrom: string
  dateTo: string
}

export function makeScenarioLegalityQueue(fastify: FastifyInstance): Queue {
  return new Queue(SCENARIO_LEGALITY_QUEUE, { connection: fastify.redis as never })
}

export function startScenarioLegalityWorker(fastify: FastifyInstance): Worker {
  return new Worker(
    SCENARIO_LEGALITY_QUEUE,
    async (job) => {
      const { scenarioId, ruleGroupCode, rosterVersion, dateFrom, dateTo } = job.data as ScenarioLegalityJob
      const db = fastify.pg // use the live-server pg pool; queries target the scenario schema explicitly
      try {
        // 1. distinct crew in this scenario
        const crewRes = await db.query(
          `select distinct crew_id from scenario.roster_flight where scenario_id = $1`,
          [scenarioId],
        )
        const allRows: unknown[] = []
        for (const { crew_id } of crewRes.rows) {
          const rows = await computeCrewViolations({
            fastify, schema: 'scenario', ruleGroupCode, crewId: crew_id, dateFrom, dateTo,
          })
          allRows.push(...rows.map((r) => ({ ...r, scenarioId, rosterVersion })))
        }
        // 2. persist atomically
        const client = await db.connect()
        try {
          await client.query('begin')
          await client.query(`delete from scenario.rule_violation where scenario_id = $1`, [scenarioId])
          for (const r of allRows as ScenarioViolationRow[]) {
            await client.query(insertScenarioViolationSQL, scenarioViolationParams(r))
          }
          await client.query(
            `update scenario.legality_status
                set status = 'READY', computed_version = roster_version,
                    computed_at = now(), error_text = null, updated_at = now()
              where scenario_id = $1`,
            [scenarioId],
          )
          await client.query('commit')
        } catch (e) {
          await client.query('rollback'); throw e
        } finally {
          client.release()
        }
        // 3. notify open clients
        fastify.wsBroadcastAll('scenario', { type: 'scenario-legality', scenarioId, status: 'READY' })
      } catch (err) {
        await db.query(
          `update scenario.legality_status set status='FAILED', error_text=$2, updated_at=now() where scenario_id=$1`,
          [scenarioId, String(err)],
        )
        fastify.wsBroadcastAll('scenario', { type: 'scenario-legality', scenarioId, status: 'FAILED' })
        throw err
      }
    },
    { connection: fastify.redis as never, concurrency: 2 },
  )
}
```

(Define `ScenarioViolationRow`, `insertScenarioViolationSQL`, `scenarioViolationParams` at the top of the file mirroring `bulkInsertViolations` column order from `violations-init-worker.ts`. Confirm the exact pg accessor — `fastify.pg` vs `fastify.db` — via `grep -n "fastify.pg\|fastify.db\|decorate('pg'\|decorate('db'" live-server/src/plugins/*.ts` and use whatever the codebase exposes.)

- [ ] **Step 2: Register the worker in index.ts**

Modify `live-server/src/index.ts`: import `startScenarioLegalityWorker` and call it alongside the other `start*Worker(server)` calls (near line 42's `startViolationsInitWorker`).

```typescript
import { startScenarioLegalityWorker } from './workers/scenario-legality-worker.js'
// ... after server is built, where other workers start:
startScenarioLegalityWorker(server)
```

- [ ] **Step 3: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/workers/scenario-legality-worker.ts live-server/src/index.ts
git commit -m "feat(scenario): scenario-legality BullMQ worker (engine over scenario schema)"
```

---

## Task 5: Freshness + dedup service

**Files:**
- Create: `live-server/src/services/scenario/legality-status.ts`
- Test: `live-server/test/scenario-legality.test.ts`

- [ ] **Step 1: Write the failing Vitest for the freshness predicate**

```typescript
import { describe, it, expect } from 'vitest'
import { isFresh } from '../src/services/scenario/legality-status.js'

describe('scenario legality freshness', () => {
  it('fresh only when READY and versions match', () => {
    expect(isFresh({ status: 'READY', computed_version: 5, roster_version: 5 })).toBe(true)
    expect(isFresh({ status: 'READY', computed_version: 4, roster_version: 5 })).toBe(false)
    expect(isFresh({ status: 'COMPUTING', computed_version: 5, roster_version: 5 })).toBe(false)
    expect(isFresh({ status: 'STALE', computed_version: 5, roster_version: 5 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL (module missing)**

Run: `cd live-server && npx vitest run test/scenario-legality.test.ts`
Expected: FAIL — cannot find `legality-status`.

- [ ] **Step 3: Implement the service**

```typescript
import type { FastifyInstance } from 'fastify'
import { makeScenarioLegalityQueue, type ScenarioLegalityJob } from '../../workers/scenario-legality-worker.js'

export interface LegalityStatusRow {
  status: string; computed_version: number; roster_version: number
}

export const isFresh = (r: LegalityStatusRow): boolean =>
  r.status === 'READY' && r.computed_version === r.roster_version

// Returns 'READY' (caller reads rows) | 'COMPUTING' (job enqueued or already running).
export async function ensureLegality(
  fastify: FastifyInstance, scenarioId: number,
): Promise<'READY' | 'COMPUTING' | 'FAILED'> {
  const db = fastify.pg
  // Read scenario meta (rule group, dates) from the live scenario master row.
  const meta = (await db.query(
    `select rule_group_code, str_dt_loc, end_dt_loc from scenario where id = $1`, [scenarioId],
  )).rows[0]
  if (!meta) throw new Error(`scenario ${scenarioId} not found`)

  const client = await db.connect()
  try {
    await client.query('begin')
    await client.query(`select pg_advisory_xact_lock($1)`, [scenarioId])
    // ensure a status row exists, seeded with the scenario's current rule group + version 0
    await client.query(
      `insert into scenario.legality_status (scenario_id, rule_group_code, roster_version)
       values ($1, $2, coalesce((select roster_version from scenario.legality_status where scenario_id=$1), 0))
       on conflict (scenario_id) do nothing`,
      [scenarioId, meta.rule_group_code],
    )
    const cur = (await client.query(
      `select status, computed_version, roster_version from scenario.legality_status where scenario_id=$1`,
      [scenarioId],
    )).rows[0] as LegalityStatusRow
    if (isFresh(cur)) { await client.query('commit'); return 'READY' }
    // try to become the computor
    const won = await client.query(
      `update scenario.legality_status set status='COMPUTING', updated_at=now()
        where scenario_id=$1 and status <> 'COMPUTING' and computed_version <> roster_version
        returning scenario_id`,
      [scenarioId],
    )
    await client.query('commit')
    if (won.rowCount === 1) {
      const job: ScenarioLegalityJob = {
        scenarioId, schema: 'scenario', ruleGroupCode: meta.rule_group_code,
        rosterVersion: cur.roster_version,
        dateFrom: isoDate(meta.str_dt_loc), dateTo: isoDate(meta.end_dt_loc),
      }
      await makeScenarioLegalityQueue(fastify).add('compute', job, { removeOnComplete: true })
    }
    return 'COMPUTING'
  } catch (e) {
    await client.query('rollback'); throw e
  } finally {
    client.release()
  }
}

const isoDate = (d: Date | string): string =>
  (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10)
```

- [ ] **Step 4: Run the freshness test — expect PASS**

Run: `cd live-server && npx vitest run test/scenario-legality.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add live-server/src/services/scenario/legality-status.ts live-server/test/scenario-legality.test.ts
git commit -m "feat(scenario): legality freshness predicate + dedup ensureLegality"
```

---

## Task 6: Read endpoint

**Files:**
- Create: `live-server/src/routes/scenario/legality.ts`
- Modify: `live-server/src/routes/scenario/index.ts`

- [ ] **Step 1: Write the route**

```typescript
import type { FastifyPluginAsync } from 'fastify'
import { ensureLegality } from '../../services/scenario/legality-status.js'

const legalityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Params: { id: string } }>('/scenario/:id/legality', async (req, reply) => {
    const scenarioId = Number(req.params.id)
    if (!Number.isInteger(scenarioId)) return reply.code(400).send({ error: 'bad scenario id' })
    const state = await ensureLegality(fastify, scenarioId)
    if (state !== 'READY') return reply.send({ status: state, violations: [] })
    const rows = (await fastify.pg.query(
      `select crew_id, pairing_id, duty_seq, rule_code, rule_instance, severity,
              actual_value, limit_value, unit, message, start_dt, end_dt
         from scenario.rule_violation where scenario_id = $1`,
      [scenarioId],
    )).rows
    return reply.send({ status: 'READY', violations: rows })
  })
}
export default legalityRoutes
```

- [ ] **Step 2: Register it**

Modify `live-server/src/routes/scenario/index.ts` to `await fastify.register(legalityRoutes)` (match the existing registration style in that file — read it first with `cat`).

- [ ] **Step 3: Typecheck + smoke**

Run: `cd live-server && npx tsc --noEmit`
Then (with live-server running against the DB): `curl -s localhost:3000/api/scenario/6/legality | head -c 300`
Expected: JSON `{"status":"COMPUTING",...}` on first hit, `{"status":"READY","violations":[...]}` after the worker finishes.

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/scenario/legality.ts live-server/src/routes/scenario/index.ts
git commit -m "feat(scenario): GET /api/scenario/:id/legality (freshness + dedup)"
```

---

## Task 7: Version bump on reload + idle sweep

**Files:**
- Modify: `live-server/scripts/load-scenario-roster.mjs`
- Create: `live-server/src/workers/scenario-legality-sweep.ts`
- Modify: `live-server/src/index.ts`

- [ ] **Step 1: Bump roster_version on reload**

In `load-scenario-roster.mjs`, after the roster_flight delete+reload for the scenario, add an idempotent upsert that bumps the version and marks stale:

```javascript
await client.query(
  `insert into scenario.legality_status (scenario_id, rule_group_code, roster_version, status)
     values ($1, (select rule_group_code from scenario where id=$1), 1, 'STALE')
   on conflict (scenario_id) do update
     set roster_version = scenario.legality_status.roster_version + 1,
         status = 'STALE', updated_at = now()`,
  [SCENARIO_ID],
)
```

- [ ] **Step 2: Write the sweep worker**

```typescript
import type { FastifyInstance } from 'fastify'

export async function sweepIdleScenarioLegality(fastify: FastifyInstance): Promise<number> {
  const ttlDays = await getTtlDays(fastify) // from dictionary SYS_PARAM SCENARIO_LEGALITY_TTL_DAYS, default 7
  const res = await fastify.pg.query(
    `with stale as (
       select scenario_id from scenario.legality_status
        where updated_at < now() - ($1 || ' days')::interval
     )
     delete from scenario.rule_violation where scenario_id in (select scenario_id from stale)`,
    [ttlDays],
  )
  await fastify.pg.query(
    `update scenario.legality_status set status='PENDING', computed_version=-1, updated_at=now()
      where updated_at < now() - ($1 || ' days')::interval and status <> 'PENDING'`,
    [ttlDays],
  )
  return res.rowCount ?? 0
}

async function getTtlDays(fastify: FastifyInstance): Promise<number> {
  const r = (await fastify.pg.query(
    `select value from dictionary where parent_code='SYS_PARAM' and code='SCENARIO_LEGALITY_TTL_DAYS' limit 1`,
  )).rows[0]
  const n = Number(r?.value)
  return Number.isFinite(n) && n > 0 ? n : 7
}
```

- [ ] **Step 3: Schedule it in index.ts**

Near the existing 02:00 cron for `violations-init` (`live-server/src/index.ts:140-144`), add a daily call to `sweepIdleScenarioLegality(server)` (reuse the same cron mechanism already imported there).

- [ ] **Step 4: Typecheck**

Run: `cd live-server && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add live-server/scripts/load-scenario-roster.mjs live-server/src/workers/scenario-legality-sweep.ts live-server/src/index.ts
git commit -m "feat(scenario): roster_version bump on reload + idle-TTL legality sweep"
```

---

## Task 8: Frontend — load persisted violations + WS

**Files:**
- Create: `gantt/src/services/scenario-legality-api.ts`
- Modify: `gantt/src/stores/scenario-violation-store.ts`
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Write the API client**

```typescript
import { liveClient } from './http-client' // confirm the scenario-authenticated client name via grep
export interface ScenarioLegalityResponse {
  status: 'READY' | 'COMPUTING' | 'FAILED'
  violations: ScenarioViolationDto[]
}
export async function fetchScenarioLegality(scenarioId: number): Promise<ScenarioLegalityResponse> {
  const { data } = await liveClient.get(`/api/scenario/${scenarioId}/legality`)
  return data
}
```

(Confirm the correct axios instance — the project has a `{code}`-unwrapping shared `http-client`; this endpoint returns a raw body, so use a client that does NOT unwrap, per memory `gantt-httpclient-code-envelope-unwrap`.)

- [ ] **Step 2: Wire into the store**

In `scenario-violation-store.ts`, add `loadPersisted(scenarioId)` that calls `fetchScenarioLegality`, stores `status` + persisted violations (separate from the pre-check `isNew` overlay), and a WS handler for `{ type: 'scenario-legality', scenarioId }` that refetches. Keep the existing `runPreCheck` overlay untouched.

- [ ] **Step 3: Bump version**

Modify `gantt/src/version.ts`: `BACKEND_VERSION` +1 and `FRONTEND_VERSION` +1.

- [ ] **Step 4: Typecheck + UI gate**

Run: `cd gantt && npx tsc --noEmit && npm run check:ui`
Expected: no new tsc errors; `check:ui` PASS (0 hard violations).

- [ ] **Step 5: Commit**

```bash
git add gantt/src/services/scenario-legality-api.ts gantt/src/stores/scenario-violation-store.ts gantt/src/version.ts
git commit -m "feat(gantt): scenario violation source loads persisted legality + WS refresh"
```

---

## Task 9: Playwright — the lifecycle

**Files:**
- Create: `e2e/tests/gantt/scenario-legality.spec.ts`

- [ ] **Step 1: Write the spec (Scen-2xxx)**

```typescript
import { test, expect } from '@playwright/test'
import { seedAuth, openScenario } from '../../helpers/gantt' // reuse existing scenario helpers

test('Scen-2401 first open computes then shows persisted violations for scenario 6', async ({ page }) => {
  await seedAuth(page, 'Ryan')
  await openScenario(page, 6)
  // bell shows computing then a non-zero count (assert specific, not just visible)
  const bell = page.getByTestId('scenario-violation-bell')
  await expect(bell).toBeVisible()
  await expect.poll(async () => Number(await bell.getAttribute('data-count') ?? '0'),
    { timeout: 30_000 }).toBeGreaterThan(0)
})

test('Scen-2402 second session reads persisted rows without recompute', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await seedAuth(page, 'Jen')
  await openScenario(page, 6)
  const bell = page.getByTestId('scenario-violation-bell')
  // no COMPUTING flash — count is immediately present
  await expect.poll(async () => Number(await bell.getAttribute('data-count') ?? '0')).toBeGreaterThan(0)
  await expect(page.getByTestId('scenario-violation-bell-computing')).toHaveCount(0)
})
```

(Confirm/Add the `data-testid="scenario-violation-bell"` + `data-count` + `scenario-violation-bell-computing` attributes in the bell component as part of Task 8 if absent — assertions must read real testids per gantt/CLAUDE.md.)

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test tests/gantt/scenario-legality.spec.ts --reporter=list --no-deps`
Expected: PASS. Paste the PASS/FAIL summary into the completion message (§No-Illusion).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/gantt/scenario-legality.spec.ts
git commit -m "test(scenario): e2e first-open compute + second-open DB read (Scen-2401/2402)"
```

---

## Self-Review notes
- Spec §5.2 dedup → Task 5 `ensureLegality` advisory-lock flip. ✓
- Spec §6 staleness → Task 7 version bump (rerun) + Task 5 freshness gate. ✓
- Spec §7 destruction → Task 7 idle sweep; delete-cascade is handled where the scenario delete lives (add an explicit `delete from scenario.rule_violation/legality_status where scenario_id=$1` to that delete path — locate via `grep -n "delete from scenario\|deleteScenario" live-server/src`; if not in this plan's files, add a Task 7b). 
- Spec §9 frontend → Task 8. ✓
- Spec §11 testing → Task 9 (e2e) + Task 5 (vitest). Dedup-race and sweep integration tests to expand in Task 5's file.
- Type consistency: `ScenarioLegalityJob`, `LegalityStatusRow`, `ensureLegality` return union used consistently across Tasks 4–6. ✓

## Open follow-up (Task 7b — to confirm during execution)
Locate the scenario delete handler and add cascade deletes for `scenario.rule_violation` + `scenario.legality_status`. If the scenario master delete already runs in a transaction, add the two deletes there.
