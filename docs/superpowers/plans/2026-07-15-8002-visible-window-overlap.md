# 8002 Visible Window Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a July-anchored rule 8002 rolling-window violation visible in the June crew bell and Alert Center when its effective violation window overlaps the opened June Gantt range.

**Architecture:** Keep `pairing_id`, `start_dt`, and `end_dt` as the physical anchor used by canvas task badges. Add nullable effective-window fields (`window_start_dt`, `window_end_dt`) to persisted violation rows, query by effective-window overlap, and compute crew-row bell severity separately from task-level puck severity. The shared roster pane remains unchanged; Live and Scenario adapters provide the same shaped roster model through `GanttPaneSource`.

**Tech Stack:** PostgreSQL 16, Fastify + TypeScript + Vitest in `live-server`, Node legality scripts, React 19 + Zustand + Vite in `gantt`, Playwright under `e2e`.

## Global Constraints

- Do not write database passwords, tokens, or the user-pasted connection string into files.
- Business data validation uses the remote PostgreSQL authority through environment variables, not local empty schemas.
- Do not modify already-confirmed schema creation files unless the task explicitly requires it; add idempotent migrations under `sql/migration/`.
- Preserve §First-Paint: violations load after first paint and only for loaded crew IDs.
- Preserve §Gantt-Unify: shared user-facing Gantt behavior goes through `GanttPaneSource` and `SharedRosterPane`, not a Live-only or Scenario-only UI fork.
- Canvas puck badges remain anchor-based. A cross-window row may light the crew bell, but must not create a fake June task badge.
- UI text remains English. This change should not introduce visible product copy.
- UI changes require Playwright coverage that drives the real UI or a deterministic mocked Gantt UI. Backend route/service changes require focused Vitest/integration coverage.
- Before editing code symbols, run GitNexus impact analysis for each target symbol when GitNexus tools are available. Before committing, run GitNexus `detect_changes()` when available and report if the tool is unavailable.
- Runtime versions are bumped by module `dev` / `build` scripts via ignored `live-server/version.tmp`; do not edit tracked version files.

---

## Spec And Current Evidence

Approved design:

- `docs/superpowers/specs/2026-07-15-8002-visible-window-overlap-design.md`

Critical real-data example:

- Schema: `f8_sit_live` or the configured F8 live schema for the current environment.
- Crew: `2380`.
- Effective 8002 YYC-local window: `2026-06-16..2026-07-13`.
- Physical anchor pairing: `2026-07-13`.
- Opened range: `2026-06-01..2026-06-30`.
- Expected: crew bell and Alert Center show 8002; canvas task puck stays on the July anchor only when July is visible.

Current code facts:

- `live-server/src/routes/roster/roster-violations.ts` currently filters persisted rows with contained anchor bounds: `start_dt >= $3` and `end_dt <= $4`.
- `live-server/scripts/legality-recheck-core.mjs` already receives `wStart` and `wEnd` from Rust rule 8002 and turns them into `wStartIso` / `wEndIso` for the message, but persists only the anchor `start_dt` / `end_dt`.
- `live-server/scripts/live-legality.mjs` and `live-server/scripts/scenario-legality.mjs` own the bulk insert column lists for Live and Scenario persisted violations.
- `gantt/src/hooks/use-persisted-violations.ts` ignores rows whose `pairingId` is `null`, stores Live persisted rows by `crewId:pairingId`, and then Live source builds Alert Center rows from `session-violation-store.displayViolations`.
- `gantt/src/components/gantt/source/live-gantt-source.ts` computes `panelRows[*].maxViolationSeverity` only from `violationMap`, where `violationMap` is task-id based and therefore cannot represent a row-level cross-window bell without also creating fake task pucks.
- `gantt/src/components/gantt/source/scenario-gantt-source.ts` has the same coupling: `buildViolationMap()` is task-id based, and panel row severity is derived from that map.

## File Structure

Create:

- `sql/migration/2026-07-15-8002-visible-window-overlap.sql`
  Idempotently adds `window_start_dt` and `window_end_dt` to Live and Scenario persisted violation tables, plus overlap-friendly indexes.

- `live-server/src/__tests__/routes/roster-violations-window-overlap.test.ts`
  Focused Fastify route test with mocked `pgPool`, proving the `/api/violations` SQL and response include effective-window overlap rows.

- `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`
  Pure Vitest tests for the shared source helpers: task badge severity remains anchor-based, crew-row severity includes cross-window rows.

Modify:

- `live-server/scripts/legality-recheck-core.mjs`
  Add 8002 `window_start_dt` and `window_end_dt` row fields from Rust `wStart` / `wEnd`.

- `live-server/scripts/live-legality.mjs`
  Persist Live effective-window columns and update them on conflict.

- `live-server/scripts/scenario-legality.mjs`
  Persist Scenario effective-window columns and update them on conflict.

- `live-server/src/routes/roster/roster-violations.ts`
  Select window fields and query by overlap of `coalesce(window_*, anchor_*)`.

- `live-server/src/routes/scenario/legality.ts`
  Select window fields for Scenario persisted violations.

- `gantt/src/services/scenario-legality-api.ts`
  Add optional nullable `window_start_dt` and `window_end_dt` to the DTO.

- `gantt/src/services/rule-session-api.ts`
  Add optional persisted-window metadata to `ViolationItem` so Live persisted rows can carry the API fields through `session-violation-store`.

- `gantt/src/types/rule-check.ts`
  Add optional `crewId`, `anchorPairingId`, `windowStartDt`, and `windowEndDt` to `RuleViolation`.

- `gantt/src/stores/scenario-violation-store.ts`
  Preserve Scenario effective-window fields and crew ownership in `RuleViolation`.

- `gantt/src/stores/session-violation-store.ts`
  Allow persisted Live violations to carry an explicit effective-window span while preserving the existing map shape.

- `gantt/src/hooks/use-persisted-violations.ts`
  Map Live API window fields into stored persisted violations and keep anchor pairing rows even when the anchor pairing is outside the visible roster items.

- `gantt/src/components/gantt/source/gantt-pane-source.ts`
  Add `crewViolationSeverityMap: Map<string, number>` to `RosterModel`.

- `gantt/src/components/gantt/source/live-gantt-source.ts`
  Build a separate crew-level severity map from Live display violations; use it for panel rows only.

- `gantt/src/components/gantt/source/scenario-gantt-source.ts`
  Build a separate crew-level severity map from Scenario persisted violations; use it for panel rows only.

- `docs/modules/gantt/live-scenario-gantt-playbook.md`
  Record the 8002 effective-window behavior under the 8002 gotcha.

- `e2e/tests/gantt/crew-bell-click-popup.spec.ts`
  Add a deterministic mocked Scenario regression where a pairing-anchored 8002 has an anchor outside the visible assignment list but an effective window inside the visible Gantt range.

## Task 1: Add Effective-Window Columns

**Files:**

- Create: `sql/migration/2026-07-15-8002-visible-window-overlap.sql`
- Modify: none in code for this task
- Test: SQL syntax check through `psql` or migration runner in the target environment

**Interfaces:**

- Produces nullable columns on both persisted tables:
  - `window_start_dt timestamptz`
  - `window_end_dt timestamptz`
- Later tasks treat `coalesce(window_start_dt, start_dt)` and `coalesce(window_end_dt, end_dt)` as the effective span.

- [ ] **Step 1: Create the migration**

```sql
-- =============================================================================
-- 2026-07-15  rule_violation: effective violation window for rolling-window rules.
-- =============================================================================
-- Physical anchor fields remain pairing_id/start_dt/end_dt. For cumulative rules such
-- as 8002, window_start_dt/window_end_dt store the checked rolling window so a Gantt
-- range can include a row whose anchor pairing is outside the opened range.
--
-- Run the Live block with search_path set to the target live schema.
-- Run the Scenario block with search_path set to scenario.
-- =============================================================================

-- ───────────────────────── LIVE  (run with search_path = f8 or f8_sit_live) ─────────────────────────
alter table rule_violation
  add column if not exists window_start_dt timestamptz,
  add column if not exists window_end_dt timestamptz;

create index if not exists idx_rv_crew_ruleset_effective_window
  on rule_violation (
    crew_id,
    ruleset_id,
    coalesce(window_start_dt, start_dt),
    coalesce(window_end_dt, end_dt)
  );

comment on column rule_violation.window_start_dt is
  'Effective violation window start. Null means use physical anchor start_dt.';
comment on column rule_violation.window_end_dt is
  'Effective violation window end. Null means use physical anchor end_dt.';

-- ─────────────────────── SCENARIO  (run with search_path = scenario) ───────────────────────
set search_path to scenario;

alter table rule_violation
  add column if not exists window_start_dt timestamptz,
  add column if not exists window_end_dt timestamptz;

create index if not exists idx_srv_scenario_effective_window
  on rule_violation (
    scenario_id,
    crew_id,
    coalesce(window_start_dt, start_dt),
    coalesce(window_end_dt, end_dt)
  );

comment on column rule_violation.window_start_dt is
  'Effective violation window start. Null means use physical anchor start_dt.';
comment on column rule_violation.window_end_dt is
  'Effective violation window end. Null means use physical anchor end_dt.';
```

- [ ] **Step 2: Validate syntax locally without applying to remote data**

Run:

```bash
git diff --check -- sql/migration/2026-07-15-8002-visible-window-overlap.sql
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Commit**

```bash
git add sql/migration/2026-07-15-8002-visible-window-overlap.sql
git commit -m "chore(sql): add effective violation window columns"
```

Expected: commit contains only the migration file.

## Task 2: Persist 8002 Window Fields

**Files:**

- Modify: `live-server/scripts/legality-recheck-core.mjs`
- Modify: `live-server/scripts/live-legality.mjs`
- Modify: `live-server/scripts/scenario-legality.mjs`
- Test: `live-server/scripts/__tests__/legality-recheck-core.test.mjs`

**Interfaces:**

- Consumes existing Rust 8002 output fields `wStart` and `wEnd` inside `rule8002()`.
- Produces row fields:
  - `window_start_dt?: string | null`
  - `window_end_dt?: string | null`
- Live and Scenario persistence include these columns in `COLS`, chunk value order, and `UPDATE`.

- [ ] **Step 1: Run GitNexus impact analysis before editing symbols**

Run through the GitNexus MCP or CLI available in the implementation session:

```bash
gitnexus impact --target rule8002 --direction upstream
gitnexus impact --target buildBulkInsert --direction upstream
```

Expected: report direct callers and risk. If the tool is not installed in the session, record `GitNexus unavailable in this Codex toolset` in the implementation notes and continue with normal focused tests.

- [ ] **Step 2: Extend the 8002 unit test first**

In `live-server/scripts/__tests__/legality-recheck-core.test.mjs`, inside `rule8002 anchors to the latest pairing overlapping the violating window, not the first pairing`, add assertions after the existing `start_dt` assertion:

```js
  assert.equal(out[0].window_start_dt, '2026-06-25T00:00:00.000Z')
  assert.equal(out[0].window_end_dt, '2026-06-25T00:00:00.000Z')
```

Then add a dedicated cross-window case:

```js
test('rule8002 persists the effective rolling window separately from the anchor pairing', async () => {
  const first = new Map([['C1', { id: 1, startIso: '2026-06-01T00:00:00.000Z', endIso: '2026-06-01T12:00:00.000Z' }]])
  const all = new Map([['C1', [
    { id: 1, startIso: '2026-06-20T00:00:00.000Z', endIso: '2026-06-20T12:00:00.000Z' },
    { id: 2, startIso: '2026-07-13T00:00:00.000Z', endIso: '2026-07-13T12:00:00.000Z' },
  ]]])
  const source = {
    db: {},
    async blockByDay() {
      return [
        { crew_id: 'C1', day: '2026-06-16', blk: 30 * 60 },
        { crew_id: 'C1', day: '2026-07-13', blk: 31 * 60 },
      ]
    },
    async firstPairingSpanByCrew() { return first },
    async pairingSpansByCrew() { return all },
    async crewBaseTimezone() { return new Map([['C1', 'UTC']]) },
  }
  const ctx = {
    dateFrom: '2026-06-01',
    dateTo: '2026-07-13',
    log: () => {},
    instancesOf: (fn) => fn === 8002
      ? [{ instance: '001', header: HDR8002, rows: [['*', '*', '*', '*', '28', 'CD', 'Y', '60:00', '00:00', 'BH']] }]
      : [],
  }
  const out = await rule8002(source, ctx)
  assert.equal(out.length, 1)
  assert.equal(out[0].pairing_id, 2)
  assert.equal(out[0].start_dt, '2026-07-13T00:00:00.000Z')
  assert.equal(out[0].window_start_dt, '2026-06-16T00:00:00.000Z')
  assert.equal(out[0].window_end_dt, '2026-07-13T00:00:00.000Z')
})
```

- [ ] **Step 3: Run test and verify it fails**

Run:

```bash
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected before implementation: failure because `window_start_dt` and `window_end_dt` are `undefined`.

- [ ] **Step 4: Add window fields in `rule8002()`**

In `live-server/scripts/legality-recheck-core.mjs`, add a helper near `ordOfSecs`:

```js
const isoStartOfOrdSecs = (s) => new Date(Math.floor(Number(s) / 86_400) * DAY_MS).toISOString()
```

Then in the `out.push({ ... })` object inside `rule8002()`, add:

```js
      start_dt: sp.startIso, end_dt: sp.endIso,
      window_start_dt: isoStartOfOrdSecs(v.wStart),
      window_end_dt: isoStartOfOrdSecs(v.wEnd),
      severity: 3,
```

The resulting object must keep anchor `start_dt` / `end_dt` unchanged.

- [ ] **Step 5: Extend Live persistence columns**

In `live-server/scripts/live-legality.mjs`, change `COLS` to include window fields after `end_dt`:

```js
const COLS = ['crew_id', 'pairing_id', 'duty_seq', 'ruleset_id', 'rule_code', 'rule_instance', 'scope_key',
  'start_dt', 'end_dt', 'window_start_dt', 'window_end_dt', 'severity', 'actual_value', 'limit_value', 'unit', 'message', 'created_by', 'updated_by']
```

Change `UPDATE` to update the fields:

```js
const UPDATE = `end_dt=excluded.end_dt, window_start_dt=excluded.window_start_dt, window_end_dt=excluded.window_end_dt,
  severity=excluded.severity, actual_value=excluded.actual_value,
  limit_value=excluded.limit_value, unit=excluded.unit, message=excluded.message, computed_at=now(), updated_by='legality_recheck'`
```

Change the chunk mapper to include nullable values:

```js
      const chunk = all.slice(i, i + 2000).map((r) => [r.crew_id, r.pairing_id, r.duty_seq, RULESET_ID,
        r.rule_code, r.rule_instance, r.scope_key ?? '', r.start_dt, r.end_dt, r.window_start_dt ?? null, r.window_end_dt ?? null,
        r.severity, r.actual_value, r.limit_value, r.unit, r.message, 'legality_recheck', 'legality_recheck'])
```

- [ ] **Step 6: Extend Scenario persistence columns**

In `live-server/scripts/scenario-legality.mjs`, change `COLS` to include window fields after `end_dt`:

```js
const COLS = ['scenario_id', 'roster_version', 'crew_id', 'pairing_id', 'duty_seq', 'ruleset_id',
  'rule_code', 'rule_instance', 'scope_key', 'start_dt', 'end_dt', 'window_start_dt', 'window_end_dt',
  'severity', 'actual_value', 'limit_value', 'unit', 'message']
```

Change `UPDATE` to update the fields:

```js
const UPDATE = `roster_version=excluded.roster_version, start_dt=excluded.start_dt, end_dt=excluded.end_dt,
  window_start_dt=excluded.window_start_dt, window_end_dt=excluded.window_end_dt,
  severity=excluded.severity, actual_value=excluded.actual_value, limit_value=excluded.limit_value,
  unit=excluded.unit, message=excluded.message, computed_at=now()`
```

Change the chunk mapper to include nullable values:

```js
        const chunk = all.slice(i, i + 2000).map((r) => [SCENARIO_ID, rosterVersion, r.crew_id, r.pairing_id,
          r.duty_seq, ctx.rulesetId, r.rule_code, r.rule_instance, r.scope_key ?? '', r.start_dt, r.end_dt,
          r.window_start_dt ?? null, r.window_end_dt ?? null, r.severity,
          r.actual_value, r.limit_value, r.unit, r.message])
```

- [ ] **Step 7: Run focused script checks**

Run:

```bash
node --check live-server/scripts/legality-recheck-core.mjs
node --check live-server/scripts/live-legality.mjs
node --check live-server/scripts/scenario-legality.mjs
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
```

Expected: all commands exit `0`. If `node --test` hangs because `spawnSync` stdin is sandbox-blocked, rerun it outside the sandbox with approval.

- [ ] **Step 8: Commit**

```bash
git add live-server/scripts/legality-recheck-core.mjs live-server/scripts/live-legality.mjs live-server/scripts/scenario-legality.mjs live-server/scripts/__tests__/legality-recheck-core.test.mjs
git commit -m "fix(live-server): persist 8002 effective windows"
```

## Task 3: Query Live Violations By Effective-Window Overlap

**Files:**

- Modify: `live-server/src/routes/roster/roster-violations.ts`
- Create: `live-server/src/__tests__/routes/roster-violations-window-overlap.test.ts`

**Interfaces:**

- Consumes request query `{ crewIds, groupCode, start, end }`.
- Produces response rows whose effective window overlaps the requested calendar window.
- Response keeps existing shape and adds window fields inside `checkResults`:
  - `windowStartDt: string | null`
  - `windowEndDt: string | null`

- [ ] **Step 1: Run impact analysis**

```bash
gitnexus impact --target rosterViolationsRoutes --direction upstream
```

Expected: identify `/api/violations` consumers. If GitNexus is unavailable, record that and continue.

- [ ] **Step 2: Write the route test**

Create `live-server/src/__tests__/routes/roster-violations-window-overlap.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import rosterViolationsRoutes from '../../routes/roster/roster-violations.js'

const buildApp = (rows: unknown[]) => {
  const app = Fastify()
  const query = vi.fn().mockResolvedValue({ rows })
  app.decorate('pgPool', { query })
  app.register(rosterViolationsRoutes, { prefix: '/api' })
  return { app, query }
}

describe('GET /api/violations effective-window overlap', () => {
  it('uses coalesced effective-window overlap instead of contained anchor bounds', async () => {
    const { app, query } = buildApp([
      {
        crew_id: '2380',
        pairing_id: 9130713,
        rule_code: '8002',
        rule_instance: '001',
        ruleset_id: 103,
        severity: 3,
        actual_value: 3660,
        limit_value: 3600,
        unit: 'MINUTE',
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
        start_dt: new Date('2026-07-13T12:00:00.000Z'),
        end_dt: new Date('2026-07-13T18:00:00.000Z'),
        window_start_dt: new Date('2026-06-16T00:00:00.000Z'),
        window_end_dt: new Date('2026-07-13T00:00:00.000Z'),
      },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/api/violations?crewIds=2380&groupCode=103&start=2026-06-01T00%3A00%3A00.000Z&end=2026-06-30T23%3A59%3A59.000Z',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].crewId).toBe('2380')
    expect(body.data[0].pairingId).toBe(9130713)
    expect(body.data[0].checkResults[0]).toMatchObject({
      ruleCode: '8002',
      windowStartDt: '2026-06-16T00:00:00.000Z',
      windowEndDt: '2026-07-13T00:00:00.000Z',
    })

    const sql = String(query.mock.calls[0][0])
    expect(sql).toContain('coalesce(window_start_dt, start_dt)')
    expect(sql).toContain('coalesce(window_end_dt, end_dt)')
    expect(sql).toContain('($4::date + 1)::timestamptz')
    expect(sql).toContain('$3::date::timestamptz')
    expect(sql).not.toContain('start_dt >= $3')
    expect(sql).not.toContain('end_dt   <= $4')
    expect(query.mock.calls[0][1]).toEqual([['2380'], 103, '2026-06-01T00:00:00.000Z', '2026-06-30T23:59:59.000Z'])

    await app.close()
  })

  it('rejects non-numeric groupCode before querying', async () => {
    const { app, query } = buildApp([])
    const res = await app.inject({
      method: 'GET',
      url: '/api/violations?crewIds=2380&groupCode=pbs_solver_ruleset&start=2026-06-01&end=2026-06-30',
    })
    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
    await app.close()
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
npm --prefix live-server test -- src/__tests__/routes/roster-violations-window-overlap.test.ts
```

Expected before implementation: failure because response lacks window fields and SQL still uses contained anchor bounds.

- [ ] **Step 4: Update the route query and response**

In `live-server/src/routes/roster/roster-violations.ts`, extend `ViolationRow`:

```ts
  start_dt: Date
  end_dt: Date
  window_start_dt: Date | null
  window_end_dt: Date | null
```

Replace the SELECT and WHERE with:

```ts
      `SELECT crew_id, pairing_id, rule_code, rule_instance, ruleset_id, severity,
              actual_value, limit_value, unit, message,
              start_dt, end_dt, window_start_dt, window_end_dt
       FROM rule_violation
       WHERE crew_id = ANY($1)
         AND ruleset_id = $2
         AND coalesce(window_start_dt, start_dt) < (($4::date + 1)::timestamptz)
         AND coalesce(window_end_dt, end_dt) >= ($3::date::timestamptz)
       ORDER BY crew_id, pairing_id NULLS LAST, severity DESC`,
```

In the `entry` object, add:

```ts
        startDt:       row.start_dt.toISOString(),
        endDt:         row.end_dt.toISOString(),
        windowStartDt: row.window_start_dt?.toISOString() ?? null,
        windowEndDt:   row.window_end_dt?.toISOString() ?? null,
```

This overlap contract treats the caller's `start` and `end` as calendar-window bounds. The current frontend passes expanded month-edge timestamps, so casting to `::date` preserves the visible day window and includes any row whose effective span crosses that day.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm --prefix live-server test -- src/__tests__/routes/roster-violations-window-overlap.test.ts
npm --prefix live-server run build
```

Expected: route test passes; TypeScript build passes.

- [ ] **Step 6: Commit**

```bash
git add live-server/src/routes/roster/roster-violations.ts live-server/src/__tests__/routes/roster-violations-window-overlap.test.ts
git commit -m "fix(live-server): include violations by effective window"
```

## Task 4: Split Crew Bell Severity From Canvas Puck Severity

**Files:**

- Modify: `gantt/src/components/gantt/source/gantt-pane-source.ts`
- Modify: `gantt/src/services/rule-session-api.ts`
- Modify: `gantt/src/types/rule-check.ts`
- Modify: `gantt/src/stores/session-violation-store.ts`
- Modify: `gantt/src/hooks/use-persisted-violations.ts`
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts`
- Create: `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`

**Interfaces:**

- `RosterModel.violationMap`: task-id severity for canvas puck badges only.
- `RosterModel.crewViolationSeverityMap`: crew-id severity for left-panel crew bells.
- `RuleViolation` and `DisplayViolation` may carry owner crew and effective window metadata; this metadata never changes the canvas anchor.

- [ ] **Step 1: Run impact analysis**

```bash
gitnexus impact --target buildLiveViolationMap --direction upstream
gitnexus impact --target buildLiveAlertRows --direction upstream
gitnexus impact --target RosterModel --direction upstream
```

Expected: consumers are Live/Scenario source adapters and shared roster pane. If GitNexus is unavailable, record that and continue.

- [ ] **Step 2: Write helper tests first**

Create `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildLiveViolationMapForTest,
  buildLiveCrewViolationSeverityMapForTest,
} from '../live-gantt-source'
import type { RosterItem } from '@/types'
import type { DisplayViolation } from '@/stores/session-violation-store'

const item = (id: number, crewId: string, pairingId: number): RosterItem => ({
  id,
  crewId,
  pairingId,
  assignmentGroup: 'FLY',
  assignment: 'FLY',
  schStrDtUtc: '2026-06-20T00:00:00.000Z',
  schEndDtUtc: '2026-06-20T12:00:00.000Z',
  fltId: null,
  dutySeq: null,
  segSeq: null,
  flightActingRank: null,
  rosterActingRank: null,
  division: null,
  base: null,
  position: null,
  dutyActCreditedMinutes: null,
  ybh: null,
  mbh: null,
  yal: null,
  mal: null,
  ydo: null,
} as RosterItem)

describe('effective-window violation severity maps', () => {
  it('lights crew severity without creating a fake task badge when anchor pairing is not visible', () => {
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [item(1, '2380', 62001)]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[62001, [item(1, '2380', 62001)]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71301,
        ruleCode: '8002',
        ruleInstance: '001',
        ruleName: '8002',
        passed: false,
        severity: 3,
        actualValue: 3660,
        limitValue: 3600,
        unit: 'MINUTE',
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
        windowStartDt: '2026-06-16T00:00:00.000Z',
        windowEndDt: '2026-07-13T00:00:00.000Z',
      }],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.size).toBe(0)
    expect(crewMap.get('2380')).toBe(3)
  })

  it('still creates a task badge when the anchor pairing is visible', () => {
    const visible = item(7, '2380', 71301)
    const itemsByCrew = new Map<string, RosterItem[]>([['2380', [visible]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[71301, [visible]]])
    const displayViolations = new Map<number, DisplayViolation[]>([
      [71301, [{
        source: 'persisted',
        crewId: '2380',
        pairingId: 71301,
        ruleCode: '8002',
        ruleInstance: '001',
        ruleName: '8002',
        passed: false,
        severity: 3,
        actualValue: 3660,
        limitValue: 3600,
        unit: 'MINUTE',
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window.',
      }],
    ])

    const taskMap = buildLiveViolationMapForTest(new Map(), displayViolations, itemsByPairingId, itemsByCrew)
    const crewMap = buildLiveCrewViolationSeverityMapForTest(displayViolations)

    expect(taskMap.get(7)).toBe(3)
    expect(crewMap.get('2380')).toBe(3)
  })
})
```

- [ ] **Step 3: Run test and verify it fails**

Run:

```bash
npm --prefix gantt test -- src/components/gantt/source/__tests__/violation-window-severity.test.ts
```

Expected before implementation: failure because `buildLiveCrewViolationSeverityMapForTest` is not exported and `DisplayViolation` has no window fields.

- [ ] **Step 4: Extend frontend types**

In `gantt/src/types/rule-check.ts`, add optional metadata to `RuleViolation`:

```ts
  /** owner crew for persisted rows whose anchor target is outside the current visible item set */
  crewId?: string
  /** physical anchor pairing id, distinct from the effective violation window */
  anchorPairingId?: number | null
  windowStartDt?: string | null
  windowEndDt?: string | null
```

In `gantt/src/services/rule-session-api.ts`, extend `ViolationItem`:

```ts
  /** Physical anchor span from persisted rule_violation. */
  startDt?: string | null
  endDt?: string | null
  /** Effective checked window; null means use the anchor span. */
  windowStartDt?: string | null
  windowEndDt?: string | null
```

In `gantt/src/stores/session-violation-store.ts`, extend `DisplayViolation`:

```ts
  windowStartDt?: string | null
  windowEndDt?: string | null
  startDt?: string | null
  endDt?: string | null
```

- [ ] **Step 5: Preserve Live API fields in the persisted fetch mapper**

In `gantt/src/hooks/use-persisted-violations.ts`, extend `ViolationEntry`:

```ts
  startDt?: string | null
  endDt?: string | null
  windowStartDt?: string | null
  windowEndDt?: string | null
```

Extend `toViolationItem()`:

```ts
    startDt:       e.startDt ?? null,
    endDt:         e.endDt ?? null,
    windowStartDt: e.windowStartDt ?? null,
    windowEndDt:   e.windowEndDt ?? null,
```

Keep the current `if (item.pairingId !== null)` guard for Live task anchoring. The 8002 case has a real `pairingId`; roster-level null rows remain out of this task because they are not the reported bug.

- [ ] **Step 6: Add `crewViolationSeverityMap` to the roster model contract**

In `gantt/src/components/gantt/source/gantt-pane-source.ts`, add:

```ts
  /** crewId → max severity, for left-panel crew bells independent of task puck badges. */
  crewViolationSeverityMap: Map<string, number>
```

- [ ] **Step 7: Add Live crew severity helper**

In `gantt/src/components/gantt/source/live-gantt-source.ts`, add below `buildLiveViolationMap()`:

```ts
function buildLiveCrewViolationSeverityMap(
  displayViolations: ReturnType<typeof useSessionViolationStore.getState>['displayViolations'],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const [, viols] of displayViolations) {
    for (const v of viols) {
      if (v.passed || !v.crewId) continue
      const current = map.get(v.crewId) ?? 0
      if (v.severity > current) map.set(v.crewId, v.severity)
    }
  }
  return map
}
```

Export it for tests:

```ts
export const buildLiveCrewViolationSeverityMapForTest = buildLiveCrewViolationSeverityMap
```

- [ ] **Step 8: Use crew severity for Live panel rows only**

Change the Live `buildPanelRows()` signature to accept `crewViolationSeverityMap`:

```ts
    crewViolationSeverityMap: Map<string, number>,
```

Inside `buildPanelRows()`, after the task loop:

```ts
      maxSev = Math.max(maxSev, crewViolationSeverityMap.get(cid) ?? 0)
```

Inside Live `useRosterModel()`:

```ts
        const violationMap = buildLiveViolationMap(ruleViolations, displayViolations, itemsByPairingId, itemsByCrew)
        const crewViolationSeverityMap = buildLiveCrewViolationSeverityMap(displayViolations)
```

Pass it into `buildPanelRows()` and return it:

```ts
        const unsortedRows = buildPanelRows(
          selectedCrewIds, crewDetailMap, itemsByCrew, violationMap, crewViolationSeverityMap, crewStatsMap, viewportLeftDate, mandayDelta,
        )
        return { crewIds, items, itemsByCrew, panelRows, violationMap, crewViolationSeverityMap, frozenRowCount, taskById, itemsByPairingId }
```

Do not change `PaneCanvas` inputs. It must continue to receive `violationMap` only.

- [ ] **Step 9: Run focused Gantt tests**

Run:

```bash
npm --prefix gantt test -- src/components/gantt/source/__tests__/violation-window-severity.test.ts
npm --prefix gantt run build
```

Expected: test passes; TypeScript build passes. `build` may bump ignored runtime version state; do not commit ignored `version.tmp`.

- [ ] **Step 10: Commit**

```bash
git add gantt/src/components/gantt/source/gantt-pane-source.ts gantt/src/services/rule-session-api.ts gantt/src/types/rule-check.ts gantt/src/stores/session-violation-store.ts gantt/src/hooks/use-persisted-violations.ts gantt/src/components/gantt/source/live-gantt-source.ts gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts
git commit -m "fix(gantt): separate crew bell severity from task badges"
```

## Task 5: Carry Effective Windows Through Scenario

**Files:**

- Modify: `live-server/src/routes/scenario/legality.ts`
- Modify: `gantt/src/services/scenario-legality-api.ts`
- Modify: `gantt/src/stores/scenario-violation-store.ts`
- Modify: `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- Modify: `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`

**Interfaces:**

- Scenario API response rows include `window_start_dt` / `window_end_dt`.
- Scenario persisted `RuleViolation` carries owner crew and window fields.
- Scenario crew bell can show a pairing-anchored violation even if no visible task exists for the anchor pairing.

- [ ] **Step 1: Run impact analysis**

```bash
gitnexus impact --target scenarioLegalityRoutes --direction upstream
gitnexus impact --target buildViolationMap --direction upstream
```

Expected: identify Scenario legality consumers and roster model usage. If unavailable, record and continue.

- [ ] **Step 2: Extend the existing helper test for Scenario**

In `gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts`, extend imports:

```ts
import {
  buildScenarioViolationMapForTest,
  buildScenarioCrewViolationSeverityMapForTest,
} from '../scenario-gantt-source'
import type { RuleViolation } from '@/types/rule-check'
```

Add:

```ts
  it('lights Scenario crew severity without creating a fake task badge when anchor pairing is not visible', () => {
    const itemsByCrew = new Map<string, RosterItem[]>([['C0001', [item(1, 'C0001', 62001)]]])
    const itemsByPairingId = new Map<number, RosterItem[]>([[62001, [item(1, 'C0001', 62001)]]])
    const violations = new Map<string, RuleViolation[]>([
      ['pairing:71301', [{
        crewId: 'C0001',
        anchorPairingId: 71301,
        targetType: 'pairing',
        targetId: 71301,
        source: 'pairing',
        ruleCode: '8002',
        ruleName: '8002/001',
        severity: 3,
        canOverride: false,
        message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
        windowStartDt: '2026-06-16T00:00:00.000Z',
        windowEndDt: '2026-07-13T00:00:00.000Z',
      }],
    ])

    const taskMap = buildScenarioViolationMapForTest(violations, itemsByCrew, itemsByPairingId)
    const crewMap = buildScenarioCrewViolationSeverityMapForTest(violations)

    expect(taskMap.size).toBe(0)
    expect(crewMap.get('C0001')).toBe(3)
  })
```

- [ ] **Step 3: Run test and verify it fails**

Run:

```bash
npm --prefix gantt test -- src/components/gantt/source/__tests__/violation-window-severity.test.ts
```

Expected before implementation: missing Scenario helper exports.

- [ ] **Step 4: Extend Scenario legality API route**

In `live-server/src/routes/scenario/legality.ts`, extend `ScenarioViolationRow`:

```ts
  window_start_dt: Date | null
  window_end_dt: Date | null
```

Change the SELECT:

```ts
        `select crew_id, pairing_id, duty_seq, rule_code, rule_instance, severity,
                actual_value, limit_value, unit, message, start_dt, end_dt,
                window_start_dt, window_end_dt
           from ${scenarioSchema()}.rule_violation where scenario_id = $1
          order by severity desc, crew_id`,
```

- [ ] **Step 5: Extend frontend Scenario DTO**

In `gantt/src/services/scenario-legality-api.ts`, add:

```ts
  window_start_dt?: string | null
  window_end_dt?: string | null
```

- [ ] **Step 6: Preserve Scenario window fields and owner crew**

In `gantt/src/stores/scenario-violation-store.ts`, update `toPersistedViolation()`:

```ts
    crewId: r.crew_id,
    anchorPairingId: r.pairing_id,
    windowStartDt: r.window_start_dt ?? null,
    windowEndDt: r.window_end_dt ?? null,
```

Keep `targetType` as `pairing` when `pairing_id` is non-null; this preserves anchor-based canvas behavior.

- [ ] **Step 7: Add Scenario crew severity helper**

In `gantt/src/components/gantt/source/scenario-gantt-source.ts`, add below `buildViolationMap()`:

```ts
function buildScenarioCrewViolationSeverityMap(
  violationsByKey: Map<string, RuleViolation[]>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const [, viols] of violationsByKey) {
    for (const v of viols) {
      const crewId = v.crewId
      if (!crewId) continue
      const current = map.get(crewId) ?? 0
      if (v.severity > current) map.set(crewId, v.severity)
    }
  }
  return map
}

export const buildScenarioViolationMapForTest = buildViolationMap
export const buildScenarioCrewViolationSeverityMapForTest = buildScenarioCrewViolationSeverityMap
```

Inside Scenario `useRosterModel()`, compute and return it:

```ts
        const violationMap = buildViolationMap(violationsByKey, built.itemsByCrew, itemsByPairingId)
        const crewViolationSeverityMap = buildScenarioCrewViolationSeverityMap(violationsByKey)
```

In the panel row severity block, include:

```ts
            maxSev = Math.max(maxSev, crewViolationSeverityMap.get(c.crewId) ?? 0)
```

Return:

```ts
          panelRows, violationMap, crewViolationSeverityMap, frozenRowCount, taskById, itemsByPairingId,
```

- [ ] **Step 8: Run focused checks**

Run:

```bash
npm --prefix live-server test -- src/__tests__/routes/roster-violations-window-overlap.test.ts
npm --prefix live-server run build
npm --prefix gantt test -- src/components/gantt/source/__tests__/violation-window-severity.test.ts
npm --prefix gantt run build
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add live-server/src/routes/scenario/legality.ts gantt/src/services/scenario-legality-api.ts gantt/src/stores/scenario-violation-store.ts gantt/src/components/gantt/source/scenario-gantt-source.ts gantt/src/components/gantt/source/__tests__/violation-window-severity.test.ts
git commit -m "fix(gantt): show scenario cross-window crew violations"
```

## Task 6: Playwright Regression And Gantt Playbook

**Files:**

- Modify: `e2e/tests/gantt/crew-bell-click-popup.spec.ts`
- Modify: `docs/modules/gantt/live-scenario-gantt-playbook.md`

**Interfaces:**

- Adds a mocked Scenario regression that proves the shared roster pane can display a crew bell for a pairing-anchored row whose anchor pairing is not in the visible items.
- Documents the gotcha for future Gantt work.

- [ ] **Step 1: Add mocked Scenario cross-window fixture**

In `e2e/tests/gantt/crew-bell-click-popup.spec.ts`, extend `MOCK_LEGALITY.violations` with a non-visible pairing anchor for `C0001`:

```ts
    {
      crew_id: 'C0001', pairing_id: 71301, duty_seq: null, rule_code: '8002', rule_instance: '001',
      severity: 3, actual_value: 3660, limit_value: 3600, unit: 'MINUTE',
      message: 'Cumulative block 61.0h exceeds 60h in the 28-day window 2026-06-16..2026-07-13 (America/Edmonton).',
      start_dt: '2026-07-13T12:00:00.000Z',
      end_dt: '2026-07-13T18:00:00.000Z',
      window_start_dt: '2026-06-16T00:00:00.000Z',
      window_end_dt: '2026-07-13T00:00:00.000Z',
    },
```

Then adjust the C0001 expected row count from `2` to `3` and assert the cross-window row:

```ts
    await expect(rows).toHaveCount(3)
    await expect(dialog.locator('[data-rule-id="8002/001"]')).toHaveCount(1)
    await expect(dialog.locator('[data-rule-id="8002/001"]')).toContainText('2026-06-16..2026-07-13')
```

- [ ] **Step 2: Assert the cross-window row lights the crew hook**

After the scenario panel severity poll, add:

```ts
    const liveTaskSeverities = await page.evaluate(() => {
      const rows = window.__ganttTest?.scenarioCrewViolationSeverities?.() ?? []
      return rows.find((r) => r.crewId === 'C0001')?.severity ?? 0
    })
    expect(liveTaskSeverities).toBeGreaterThan(0)
```

This assertion proves the crew row lights. The pure Vitest helper test in Task 5 proves no task badge is created when the anchor pairing is not in `itemsByPairingId`.

- [ ] **Step 3: Update the Gantt playbook**

In `docs/modules/gantt/live-scenario-gantt-playbook.md`, under `### (a) Filters & stores`, replace the existing 8002 stale-anchor bullet with:

```md
- **8002 rolling-window anchor vs effective window** — Live and Scenario 8002 findings keep
  `pairing_id`/`start_dt`/`end_dt` as the physical anchor for canvas puck badges, but store
  `window_start_dt`/`window_end_dt` for the actual rolling window. `/api/violations` includes a
  row when the effective window overlaps the opened Gantt range, even if the anchor pairing is
  outside that range. The roster source builds a separate `crewViolationSeverityMap` for crew
  bells; `violationMap` remains task-id based so no fake puck is drawn in the earlier month.
  This is what makes crew 2380's YYC-local `2026-06-16..2026-07-13` 8002 visible in the June
  bell while keeping the July 13 pairing as the physical anchor.
```

- [ ] **Step 4: Run Playwright**

Run:

```bash
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/crew-bell-click-popup.spec.ts -g "Scen-2045" --reporter=list
```

Expected: the mocked Scenario test passes.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/gantt/crew-bell-click-popup.spec.ts docs/modules/gantt/live-scenario-gantt-playbook.md
git commit -m "test(gantt): cover 8002 cross-window crew bell"
```

## Task 7: Remote-Data Proof For Crew 2380

**Files:**

- Modify: none
- Test: remote SQL read and Gantt/API query against configured environment

**Interfaces:**

- Uses environment-provided database URL. Do not paste the password into shell history, docs, commits, or logs.

- [ ] **Step 1: Confirm migration applied in the target schema**

Run with the environment variable already configured:

```bash
psql "$DATABASE_URL_F8_SIT_LIVE" -c "select column_name, data_type from information_schema.columns where table_schema = current_schema() and table_name = 'rule_violation' and column_name in ('window_start_dt','window_end_dt') order by column_name"
```

Expected:

```text
 window_end_dt   | timestamp with time zone
 window_start_dt | timestamp with time zone
```

- [ ] **Step 2: Recompute or confirm existing 8002 row carries window fields**

After running the normal Live legality recheck for the target range/ruleset, run:

```bash
psql "$DATABASE_URL_F8_SIT_LIVE" -c "
select crew_id, pairing_id, rule_code, rule_instance,
       start_dt, end_dt, window_start_dt, window_end_dt, message
  from rule_violation
 where crew_id = '2380'
   and rule_code = '8002'
   and coalesce(window_start_dt, start_dt) < '2026-07-01'::timestamptz
   and coalesce(window_end_dt, end_dt) >= '2026-06-01'::timestamptz
 order by severity desc, start_dt;"
```

Expected: at least one row with `start_dt` / `end_dt` on the July 13 anchor and `window_start_dt` / `window_end_dt` covering `2026-06-16..2026-07-13`.

- [ ] **Step 3: Confirm `/api/violations` returns the row for June**

Use the app auth token flow already used by Gantt E2E helpers, or run through the UI. Query:

```text
GET /api/violations?crewIds=2380&groupCode=103&start=2026-06-01T00:00:00.000Z&end=2026-06-30T23:59:59.000Z
```

Expected response contains one grouped item for crew `2380`, rule `8002`, with `windowStartDt` and `windowEndDt` populated.

- [ ] **Step 4: Manual UI proof**

Open Live Gantt in YYC display timezone with date range `2026-06-01..2026-06-30`, loaded crew including `2380`.

Expected:

- Crew `2380` row has a bell.
- Clicking the bell opens a dialog containing the `8002` row and the message range `2026-06-16..2026-07-13`.
- No June task puck appears solely because of the July anchor. A puck appears on the July 13 anchored pairing when July is visible and the anchor task is loaded.

## Task 8: Final Verification And Push

**Files:**

- All files touched by prior tasks

**Interfaces:**

- Produces a pushable branch on `main` unless the user asks for a feature branch.
- Final response lists exact command results and any unrun checks.

- [ ] **Step 1: Run full focused verification**

Run:

```bash
node --check live-server/scripts/legality-recheck-core.mjs
node --check live-server/scripts/live-legality.mjs
node --check live-server/scripts/scenario-legality.mjs
node --test live-server/scripts/__tests__/legality-recheck-core.test.mjs
npm --prefix live-server test -- src/__tests__/routes/roster-violations-window-overlap.test.ts
npm --prefix live-server run build
npm --prefix gantt test -- src/components/gantt/source/__tests__/violation-window-severity.test.ts
npm --prefix gantt run build
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/crew-bell-click-popup.spec.ts -g "Scen-2045" --reporter=list
git diff --check
```

Expected: all pass. If `node --test` or Playwright needs network or server approval, rerun with the required approval and record the final output.

- [ ] **Step 2: Run UI standard gate if frontend styling changed**

This plan does not change styling. If implementation touches CSS classes or visible UI structure anyway, run:

```bash
npm run check:ui
```

Expected: `0 hard violations`.

- [ ] **Step 3: Run GitNexus change detection before the final commit or push**

Run through GitNexus MCP/CLI:

```bash
gitnexus detect_changes --scope compare --base-ref main
```

Expected: affected symbols are limited to the planned legality persistence, violation routes, source adapters, and tests. If unavailable, record `GitNexus unavailable in this Codex toolset` in the final notes.

- [ ] **Step 4: Inspect local changes**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected: only planned commits are ahead of `origin/main`; no unrelated user changes are staged.

- [ ] **Step 5: Push after the user confirms or if the active request still includes push**

Run:

```bash
git push
```

Expected: remote branch updates successfully.

## Self-Review Checklist

- Spec coverage: schema, core 8002 mapping, Live persistence, Scenario persistence, Live query, Live Gantt crew bell, Scenario Gantt crew bell, no fake pucks, Playwright coverage, docs update.
- Placeholder scan: this plan contains no reserved placeholder tokens and no unowned generic test steps.
- Type consistency: `window_start_dt` / `window_end_dt` are database/API snake_case; `windowStartDt` / `windowEndDt` are frontend camelCase display-store fields.
- Risk note: the plan introduces two new nullable columns and one new model field. Existing rules with null window fields fall back to anchor behavior.
