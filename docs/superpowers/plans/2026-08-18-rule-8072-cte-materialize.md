# Rule 8072 CTE Materialize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop PostgreSQL from inlining 8072 `qualificationFlightSegments` LATERAL CTEs as 1-row nested loops, without changing rule logic or result rows.

**Architecture:** Add `AS MATERIALIZED` to `crew_rows`, `crews`, `planned`, and `filled` in Live, Scenario, and seed loaders. Leave `seg` inlined. Capture tests lock the SQL text; a remote `EXPLAIN` gate locks that the planner emits `CTE Scan` on those four names.

**Tech Stack:** Node ESM (`.mjs`), `node:test`, remote PostgreSQL `EXPLAIN` via `--env-file=.env` (same pattern as `verify:assignment-overlap-sql` / `verify:flyduties-sql`).

## Global Constraints

- Exactly these four CTEs get `as materialized`: `crew_rows`, `crews`, `planned`, `filled`. Do **not** materialize `seg`.
- SQL style stays lowercase (`crew_rows as materialized (`), matching existing CTE keywords.
- Live + Scenario + seed `qualificationFlightSegments` must stay aligned (§Gantt-Unify). Do not leave one loader on the old form.
- Do **not** change SELECT lists, joins, LATERAL bodies, filters, `DIVISION` interpolation, or `rule8072` / Rust `check-8072`.
- Do **not** add indexes, rewrite LATERAL to joins, or run `EXPLAIN ANALYZE` in CI.
- No DB migration; no secrets in docs/tests.
- §No-Auto-Commit: do not `git commit` unless the user asks.
- Spec: `docs/superpowers/specs/2026-08-18-rule-8072-cte-materialize-design.md`.
- Dynamic SQL gate: `docs/modules/database/generated-sql-safety-standard.md` §2 (`EXPLAIN`, fail loud). This path is not an HTTP export — skip §3 smoke.

## File map

| File | Responsibility |
|------|----------------|
| `live-server/scripts/__tests__/qualification-flight-segments-materialize-sql.test.mjs` | Capture SQL; assert four CTEs are materialized |
| `live-server/scripts/live-legality.mjs` | Live `qualificationFlightSegments` (~769–826) |
| `live-server/scripts/scenario-legality.mjs` | Scenario `qualificationFlightSegments` (~569–627) |
| `live-server/scripts/scenario-legality-source.mjs` | Seed `qualificationFlightSegments` (~510–568) |
| `live-server/scripts/verify-8072-sql.mjs` | Remote `EXPLAIN` of the three shapes; require `CTE Scan on <cte>` |
| `live-server/package.json` | `verify:8072-sql` script |

Blast radius (GitNexus MCP may be unavailable): `qualificationFlightSegments` → `rule8072` in `live-server/scripts/legality-recheck-core.mjs` (~990). Do not rename the method.

---

### Task 1: Failing `qualificationFlightSegments` SQL capture tests

**Files:**
- Create: `live-server/scripts/__tests__/qualification-flight-segments-materialize-sql.test.mjs`

**Interfaces:**
- Consumes: `liveSource(db, from, to).qualificationFlightSegments(filters?)`, `scenarioSource(db, scenarioId, ctx).qualificationFlightSegments`, `buildSeedSource(db, scenarioId, ctx).qualificationFlightSegments`
- Produces: tests that fail until the four CTEs are `as materialized`

- [ ] **Step 1: Write the failing test file**

```javascript
/**
 * Capture 8072 qualificationFlightSegments SQL and assert the four LATERAL-heavy
 * CTEs are materialized so the planner cannot inline them as 1-row nested loops.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { liveSource } from '../live-legality.mjs'
import { scenarioSource } from '../scenario-legality.mjs'
import { buildSeedSource } from '../scenario-legality-source.mjs'

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text
      captured.push({ text, values })
      return { rows: [] }
    },
  }
}

function assertMaterializedCtes(sql, label) {
  for (const name of ['crew_rows', 'crews', 'planned', 'filled']) {
    assert.match(
      sql,
      new RegExp(`${name}\\s+as\\s+materialized\\b`, 'i'),
      `${label} must materialize ${name}`,
    )
  }
}

test('live qualificationFlightSegments materializes LATERAL CTEs', async () => {
  const db = captureDb()
  await liveSource(db, '2026-08-01', '2026-09-01').qualificationFlightSegments()
  assertMaterializedCtes(db.captured.at(-1)?.text ?? '', 'live')
})

test('scenario qualificationFlightSegments materializes LATERAL CTEs', async () => {
  const db = captureDb()
  await scenarioSource(db, 718, {}).qualificationFlightSegments()
  assertMaterializedCtes(db.captured.at(-1)?.text ?? '', 'scenario')
})

test('seed qualificationFlightSegments materializes LATERAL CTEs', async () => {
  const db = captureDb()
  await buildSeedSource(db, 0, {
    seedCrewIds: ['2496'],
    seedPairingIds: [15264],
  }).qualificationFlightSegments()
  assertMaterializedCtes(db.captured.at(-1)?.text ?? '', 'seed')
})
```

Seed must pass `seedCrewIds` / `seedPairingIds`. Without them `qualificationFlightSegments` returns `[]` before issuing SQL (`ids.length === 0 || pids.length === 0`). Dates are not required: seed `W('rf')` is crew/pairing predicates only.

- [ ] **Step 2: Run tests and confirm they fail**

Run: `cd live-server && node --test scripts/__tests__/qualification-flight-segments-materialize-sql.test.mjs`

Expected: FAIL 0 pass / 3 fail — first assertion `live must materialize crew_rows` (SQL still has `crew_rows as (`). Seed must fail on the same assertion, not `Invalid time value` and not an empty captured SQL.

Do not modify the three loaders in this task.

---

### Task 2: Materialize the four CTEs in Live / Scenario / seed

**Files:**
- Modify: `live-server/scripts/live-legality.mjs` (`async qualificationFlightSegments`)
- Modify: `live-server/scripts/scenario-legality.mjs` (`async qualificationFlightSegments`)
- Modify: `live-server/scripts/scenario-legality-source.mjs` (`async qualificationFlightSegments`)

**Interfaces:**
- Consumes: existing `qualificationFlightSegments` SQL (unchanged except CTE headers)
- Produces: four CTEs declared `as materialized`; `seg` still `with seg as (`

Each of the four headers appears once per file. Replace only those headers (9-space indent, lowercase):

```sql
         crew_rows as materialized (
         crews as materialized (
         planned as materialized (
         filled as materialized (
```

Current locations (may drift by a few lines; search the method, do not global-replace across the repo):

| Loader | `crew_rows` | `crews` | `planned` | `filled` |
|--------|-------------|---------|-----------|----------|
| `live-legality.mjs` | ~769 | ~806 | ~811 | ~826 |
| `scenario-legality.mjs` | ~569 | ~607 | ~612 | ~627 |
| `scenario-legality-source.mjs` | ~510 | ~548 | ~553 | ~568 |

Do not touch the `seg` CTE, LATERAL bodies, `order by`, or the `rows.map` mapper.

- [ ] **Step 1: Apply the four header replacements in all three files**

- [ ] **Step 2: Re-run capture tests**

Run: `cd live-server && node --test scripts/__tests__/qualification-flight-segments-materialize-sql.test.mjs`

Expected: 3/3 PASS.

---

### Task 3: Remote `EXPLAIN` gate

**Files:**
- Create: `live-server/scripts/verify-8072-sql.mjs`
- Modify: `live-server/package.json` (`scripts`)

**Interfaces:**
- Consumes: the same three factories as Task 1; `applySchemas` from live/scenario loaders
- Produces: `npm run verify:8072-sql` EXPLAINs 3 shapes, fail-loud; each plan contains `CTE Scan on crew_rows|crews|planned|filled`

- [ ] **Step 1: Add the npm script next to the other verify scripts**

In `live-server/package.json` `scripts`, after `verify:assignment-overlap-sql`:

```json
    "verify:8072-sql": "node --env-file=.env scripts/verify-8072-sql.mjs",
```

Keep the script name `verify:8072-sql`.

- [ ] **Step 2: Create `live-server/scripts/verify-8072-sql.mjs`**

Copy the connection / `resolveScenarioSchema` / `captureDb` / fail-loud pattern from `live-server/scripts/verify-flyduties-sql.mjs` (set `SCENARIO_SCHEMA` **before** importing loaders). Capture `qualificationFlightSegments()` (no filters — empty arrays). Seed factory must include `seedCrewIds` / `seedPairingIds` or it issues no SQL.

```javascript
// verify-8072-sql.mjs — remote PostgreSQL parse gate for 8072 qualificationFlightSegments.
//
//   npm run verify:8072-sql
//
// The four LATERAL-heavy CTEs (crew_rows/crews/planned/filled) must be AS MATERIALIZED
// so the planner cannot inline them as 1-row nested loops.
// docs/modules/database/generated-sql-safety-standard.md §2.

import process from 'node:process'
import pg from 'pg'

const databaseUrl = (process.env.DATABASE_URL_F8 || process.env.DATABASE_URL || '').trim()
if (!databaseUrl) throw new Error('Missing DATABASE_URL_F8 (or DATABASE_URL) for the remote PostgreSQL gate.')
if (/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(databaseUrl)) {
  throw new Error('Refusing to verify against a local database (§Remote-DB-Only).')
}

const MATERIALIZED_CTES = ['crew_rows', 'crews', 'planned', 'filled']

async function resolveScenarioSchema(client) {
  const requested = (process.env.SCENARIO_SCHEMA || '').trim()
  if (requested) {
    const ok = await client.query(
      `select has_schema_privilege($1::text, 'USAGE') as ok`,
      [requested],
    )
    if (ok.rows[0]?.ok) return requested
    throw new Error(`SCENARIO_SCHEMA=${requested} is not usable`)
  }
  const { rows } = await client.query(
    `select nspname
       from pg_namespace
      where nspname like '%\\_scenario' escape '\\'
        and has_schema_privilege(nspname, 'USAGE')
      order by nspname`,
  )
  if (!rows.length) throw new Error('No usable *_scenario schema')
  return rows[0].nspname
}

function captureDb() {
  const captured = []
  return {
    captured,
    query: async (queryConfig, values) => {
      const text = typeof queryConfig === 'string' ? queryConfig : queryConfig?.text
      captured.push({ text, values })
      return { rows: [] }
    },
  }
}

async function captureQualificationFlightSegments(sourceFactory, applySchemas) {
  const db = captureDb()
  await sourceFactory(db).qualificationFlightSegments()
  const stmt = db.captured.at(-1)
  if (!stmt?.text) throw new Error('qualificationFlightSegments issued no statement')
  return { text: applySchemas(stmt.text), values: stmt.values ?? [] }
}

function assertMaterializedPlan(planText, loaderName) {
  for (const name of MATERIALIZED_CTES) {
    if (!new RegExp(`CTE Scan on ${name}\\b`).test(planText)) {
      throw new Error(`FAIL ${loaderName}: EXPLAIN missing CTE Scan on ${name}`)
    }
  }
}

const client = new pg.Client({ connectionString: databaseUrl })
let shapes = 0

try {
  await client.connect()
  const scenarioSchema = await resolveScenarioSchema(client)
  process.env.SCENARIO_SCHEMA = scenarioSchema
  console.log(`Using SCENARIO_SCHEMA=${scenarioSchema}`)

  const { liveSource, applySchemas: applyLiveSchemas } = await import('./live-legality.mjs')
  const { scenarioSource, applySchemas: applyScenarioSchemas } = await import('./scenario-legality.mjs')
  const { buildSeedSource } = await import('./scenario-legality-source.mjs')

  const loaders = [
    {
      name: 'live',
      applySchemas: applyLiveSchemas,
      factory: (db) => liveSource(db, '2026-08-01', '2026-08-02'),
    },
    {
      name: 'scenario',
      applySchemas: applyScenarioSchemas,
      factory: (db) => scenarioSource(db, 0, {}),
    },
    {
      name: 'scenario-source',
      applySchemas: applyLiveSchemas,
      factory: (db) => buildSeedSource(db, 0, { seedCrewIds: ['0'], seedPairingIds: [0] }),
    },
  ]

  await client.query('begin read only')
  for (const loader of loaders) {
    const { text, values } = await captureQualificationFlightSegments(loader.factory, loader.applySchemas)
    try {
      const plan = await client.query({ text: `explain ${text}`, values })
      const planText = plan.rows.map((row) => String(row['QUERY PLAN'] ?? '')).join('\n')
      assertMaterializedPlan(planText, loader.name)
      shapes += 1
      console.log(`PASS ${loader.name} qualificationFlightSegments — ${planText.split('\n')[0].split('(')[0].trim()}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`FAIL ${loader.name}: ${message}`)
    }
  }
  await client.query('rollback')
  if (shapes !== loaders.length) throw new Error(`expected ${loaders.length} SQL shapes, explained ${shapes}`)
  console.log(`PASS live-server qualificationFlightSegments SQL preflight (${shapes} shapes).`)
} catch (error) {
  try {
    await client.query('rollback')
  } catch {
    // connection may have failed before a transaction existed
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error(`qualificationFlightSegments SQL preflight failed: ${message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}
```

- [ ] **Step 3: Run capture tests + remote EXPLAIN**

```bash
cd live-server && node --test scripts/__tests__/qualification-flight-segments-materialize-sql.test.mjs
cd live-server && npm run verify:8072-sql
```

Expected: capture 3/3 PASS; EXPLAIN prints `PASS live|scenario|scenario-source qualificationFlightSegments` and `PASS live-server qualificationFlightSegments SQL preflight (3 shapes).` Do not skip on connection failure.

Do not run Playwright. Do not run `EXPLAIN ANALYZE`.

---

## Self-review

1. **Spec coverage:** four CTEs materialized (Task 2), `seg` left alone (Task 2 constraint), three loaders aligned (Task 2), capture lock (Task 1), remote `EXPLAIN` + `CTE Scan` (Task 3), no LATERAL rewrite / indexes / Rust (no task).
2. **Placeholders:** none.
3. **Types:** method name stays `qualificationFlightSegments`; seed ctx uses `seedCrewIds` / `seedPairingIds`.
