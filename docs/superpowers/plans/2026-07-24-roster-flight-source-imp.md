# roster_flight.source IMP Domain Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disambiguate `roster_flight.source` by adding `IMP` (external interface import) as a Live-only value, splitting the domain per table (Live `{IMP,MA,CR}` / Scenario `{PA,MA,CR}`), forcing Live→ro_input to `PA`, filtering `IMP` from the NOC outbound payload, and making `IMP` rows immutable in the Live Gantt (delete-only).

**Architecture:** Reuse the existing `source` column (no new field). DB domain split enforced in two migration phases. Write sites flip imports `PA→IMP`, `create()` defaults `MA`, optimizer-input builder emits literal `'PA'`. `roster_publish_adjust` gains `old_source`/`new_source` so the NOC payload builder can drop `IMP` rows at egress while `roster_publish` stays complete for PBS. Backend rejects in-place updates on `IMP` rows; frontend mirrors with disabled affordances.

**Tech Stack:** PostgreSQL 16 (schema-isolated), Drizzle ORM + raw `sql` templates (live-server), Fastify, Python (engine-server ro_input_builder), React 19 + Canvas (gantt), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-roster-flight-source-imp-domain-design.md`

## Global Constraints

- **Remote DB only** — all SQL verification uses the remote PostgreSQL (`DATABASE_URL_F8`, host `47.253.173.207:55432`, db `rois`, schemas `f8` (live) + `scenario`). Never localhost (local f8 is empty).
- **Two schemas, run migrations per-schema** via `SET search_path`. `roster_publish` / `roster_publish_adjust` exist ONLY in the live (`f8`) schema.
- **No Postgres ENUM types** — domain enforced via `varchar + CHECK`. Keep `varchar(12)` for `source` (IMP/PA/MA/CR ≤ 3 chars; no resize needed — deliberate minimal deviation from the spec's `varchar(8)`).
- **Schema DDL files are canonical** — `sql/schema/live/02-crew-roster.sql` and `sql/schema/scenario/01-scenario-tables.sql` MUST stay mirrored per the scenario file's hard header rule. Update both for every roster_flight column/constraint change.
- **UI default language is English**; numeric/ID columns use `font-mono tabular-nums`; no magic font sizes. Run `npm run check:ui` after gantt changes.
- **TDD + No-Illusion** — every task ships a failing test first, then code, then pastes the PASS result. UI/bug changes ship a Playwright test.
- **Commit message footer:** `Co-Authored-By: Claude <noreply@anthropic.com>`. Commit per task.
- **Backfill asymmetry (critical):** `PA→IMP` backfill runs on the **live schema only**. The scenario schema **keeps `PA`** (lead-in). Running `PA→IMP` on scenario would corrupt it.

## File Structure (decomposition)

- `sql/migration/2026-07-24-roster-flight-source-imp.sql` — Phase 1 (widen CHECK, backfill, roster_publish_adjust cols).
- `sql/migration/2026-07-2x-roster-flight-source-strict.sql` — Phase 2 (NOT NULL + strict per-table CHECK), run after SIT validation.
- `sql/schema/live/02-crew-roster.sql` — live `roster_flight.source` comment + CHECK; `roster_publish_adjust` new cols.
- `sql/schema/scenario/01-scenario-tables.sql` — scenario `roster_flight.source` comment + CHECK.
- `live-server/src/models/roster/roster-flight.ts` — `source` model (kept varchar(12)).
- `live-server/src/models/roster/roster-publish-adjust.ts` — add `oldSource` / `newSource`.
- `live-server/src/workers/roster-inbound-worker.ts`, `roster-ground-inbound-worker.ts` — stamp `IMP`.
- `live-server/src/services/roster/roster-service.ts` — `create()` default `MA`; `update`/`swap`/`move` IMP guard.
- `live-server/src/routes/roster/roster.ts` — respect thrown `statusCode` in update/swap/move catches.
- `live-server/src/services/roster/roster-publish-service.ts` — `adjustSnapshotSql` populate old/new source.
- `live-server/src/services/roster/roster-publish-outbound-service.ts` — `RosterPublishAdjustRow` + IMP filter.
- `engine-server/F8/ro_input_builder/sections/roster.py` — emit `'PA'`.
- `live-server/src/services/scenario/scenario-result-loader.ts` — widen flying source guard.
- `live-server/src/routes/scenario/scenario.ts` — `PublishRosterSource` + `normalizeRosterSource` IMP-aware.
- `gantt/src/components/roster/context-menu.tsx` — disable Edit/Swap on IMP.
- `gantt/src/components/gantt/source/live-gantt-source.ts` — block drag-move on IMP.
- `gantt/src/components/roster/ground-task-dialog.tsx` — block ground edit on IMP (flying is already read-only).
- Tests under `live-server/src/**/__tests__/`, `live-server/tests/`, `engine-server/.../tests/`, `e2e/gantt/`.

---

### Task 1: DB Migration Phase 1 — widen `source`, backfill IMP, add adjust columns

**Files:**
- Create: `sql/migration/2026-07-24-roster-flight-source-imp.sql`
- Modify: `sql/schema/live/02-crew-roster.sql:1331` (comment), `:1930` (constraint), `:1613` (roster_publish_adjust new cols)
- Modify: `sql/schema/scenario/01-scenario-tables.sql:447` (comment), `:537` (constraint)
- Test: remote DB queries (no unit test file; verification via `psql`)

**Interfaces:**
- Produces: live + scenario `roster_flight.source` allows `IMP/PA/MA/CR` (nullable); live rows backfilled to `IMP/MA/CR`; `roster_publish_adjust.old_source`/`new_source` columns exist. Later tasks rely on `IMP` being a legal DB value and the two adjust columns existing.

- [ ] **Step 1: Write the Phase 1 migration file**

Create `sql/migration/2026-07-24-roster-flight-source-imp.sql`:

```sql
-- 2026-07-24 — roster_flight.source IMP domain split (Phase 1: non-breaking)
-- Adds IMP (external interface import) as a legal source value. Phase 2 will
-- tighten to per-table strict CHECK + NOT NULL after SIT validation.
--
-- RUN INSTRUCTIONS (this file is run per-schema via SET search_path):
--   * LIVE schema (search_path = f8):    run Section A + Section B + Section C
--   * SCENARIO schema (search_path = scenario): run Section A + Section C ONLY
--     (scenario KEEPS PA as lead-in; never run PA->IMP here)

-- === Section A: widen roster_flight.source CHECK (BOTH schemas) ===
alter table roster_flight
  drop constraint if exists chk_roster_flight_source_pa_ma_cr;
alter table roster_flight
  add constraint chk_roster_flight_source_pa_ma_cr
      check (source is null or source in ('IMP', 'PA', 'MA', 'CR'));

-- === Section B: backfill — LIVE schema ONLY (do NOT run on scenario) ===
-- Live PA was used for imports -> IMP. NULLs are overwhelmingly legacy imports
-- (created_by F8_IMPORT) -> IMP. MA/CR unchanged.
update roster_flight set source = 'IMP' where source = 'PA';
update roster_flight set source = 'IMP' where source is null;

-- === Section C: roster_publish_adjust old/new source — LIVE schema ONLY ===
-- (roster_publish_adjust exists only in the live schema.)
alter table roster_publish_adjust
  add column if not exists old_source varchar(12) null,
  add column if not exists new_source varchar(12) null;
comment on column roster_publish_adjust.old_source is 'Previous snapshot roster_flight.source (IMP/MA/CR); null for ADD';
comment on column roster_publish_adjust.new_source is 'Current roster_flight.source (IMP/MA/CR); null for DELETE';
```

- [ ] **Step 2: Sync the canonical DDL — live `roster_flight.source` comment**

`sql/schema/live/02-crew-roster.sql:1331` — change comment from `PA/MA/CR` to `IMP/MA/CR`:

```sql
    source                       varchar(12),  -- 排班来源（IMP=外部接口导入 / MA=人工 / CR=优化器）
```

- [ ] **Step 3: Sync canonical DDL — live `roster_flight` constraint (Phase 1 widened form)**

`sql/schema/live/02-crew-roster.sql:1930`:

```sql
  add constraint chk_roster_flight_source_pa_ma_cr check (source is null or source in ('IMP', 'PA', 'MA', 'CR'));
```

- [ ] **Step 4: Sync canonical DDL — scenario `roster_flight.source` comment + constraint**

`sql/schema/scenario/01-scenario-tables.sql:447`:

```sql
    source                       varchar(12),             -- 排班来源（PA=从Live提取/lead-in / MA=人工 / CR=优化器）
```

`sql/schema/scenario/01-scenario-tables.sql:537`:

```sql
  add constraint chk_roster_flight_source_pa_ma_cr check (source is null or source in ('IMP', 'PA', 'MA', 'CR'));
```

- [ ] **Step 5: Sync canonical DDL — `roster_publish_adjust` new columns**

`sql/schema/live/02-crew-roster.sql` — insert the two columns immediately before `published int2 null,` (currently ~L1614), keeping the `old_*`/`new_*` grouping:

```sql
    new_seq_order int2 null,
    new_brief_start_utc timestamp null,
    new_brief_end_utc timestamp null,
    old_source varchar(12) null,                -- 旧快照 roster_flight.source（IMP/MA/CR），ADD 时为 null
    new_source varchar(12) null,                -- 当前 roster_flight.source（IMP/MA/CR），DELETE 时为 null
    published int2 null,
```

- [ ] **Step 6: Run the migration against the remote LIVE schema (Sections A+B+C)**

Run (substitute the real `DATABASE_URL_F8`; password from the team — never commit it):

```bash
psql "$DATABASE_URL_F8" -c "SET search_path TO f8;" \
  -f sql/migration/2026-07-24-roster-flight-source-imp.sql
```

Expected: a series of `ALTER TABLE` / `UPDATE <N>` / `COMMENT` results, no errors.

- [ ] **Step 7: Run Sections A+C ONLY against the remote SCENARIO schema**

Scenario must NOT run Section B (the PA→IMP backfill). Execute the two safe sections explicitly:

```bash
psql "$DATABASE_URL_F8" <<'SQL'
SET search_path TO scenario;
ALTER TABLE roster_flight DROP CONSTRAINT IF EXISTS chk_roster_flight_source_pa_ma_cr;
ALTER TABLE roster_flight ADD CONSTRAINT chk_roster_flight_source_pa_ma_cr
  CHECK (source IS NULL OR source IN ('IMP','PA','MA','CR'));
SQL
```

(Section C — roster_publish_adjust — does not exist in scenario, so it is skipped.)

- [ ] **Step 8: Verify the data state on remote DB**

```bash
psql "$DATABASE_URL_F8" -c "SET search_path TO f8;     SELECT source, count(*) FROM roster_flight GROUP BY 1 ORDER BY 1;"
psql "$DATABASE_URL_F8" -c "SET search_path TO scenario; SELECT source, count(*) FROM roster_flight GROUP BY 1 ORDER BY 1;"
psql "$DATABASE_URL_F8" -c "SET search_path TO f8;     SELECT column_name FROM information_schema.columns WHERE table_name='roster_publish_adjust' AND column_name IN ('old_source','new_source');"
```

Expected: **live** `source` groups are only `IMP`/`MA`/`CR` (no `PA`, no NULL). **scenario** `source` groups are only `PA`/`MA`/`CR` (no `IMP`). The adjust columns query returns `old_source` and `new_source`.

- [ ] **Step 9: Commit**

```bash
git add sql/migration/2026-07-24-roster-flight-source-imp.sql sql/schema/live/02-crew-roster.sql sql/schema/scenario/01-scenario-tables.sql
git commit -m "feat(db): add IMP source value + roster_publish_adjust source columns (Phase 1)"
```

---

### Task 2: Stamp `IMP` on inbound imports

**Files:**
- Modify: `live-server/src/workers/roster-inbound-worker.ts:215-216` (the `source, ... 'PA', ...` literals in the INSERT at ~L191)
- Modify: `live-server/src/workers/roster-ground-inbound-worker.ts:219-220` (ground INSERT ~L201) and `:588` (single-leg INSERT ~L575)
- Test: `live-server/src/__tests__/workers/roster-inbound-source.test.ts`

**Interfaces:**
- Consumes: Task 1 (`IMP` is a legal DB value).
- Produces: all connector-imported `roster_flight` rows carry `source='IMP'` (with `created_by='F8_IMPORT'` unchanged). Task 5's NOC filter relies on these being `IMP`.

- [ ] **Step 1: Write the failing test**

`live-server/src/__tests__/workers/roster-inbound-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const rosterWorker = readFileSync('src/workers/roster-inbound-worker.ts', 'utf8')
const groundWorker = readFileSync('src/workers/roster-ground-inbound-worker.ts', 'utf8')

describe('inbound import workers stamp source=IMP', () => {
  it('roster-inbound-worker inserts source IMP (not PA)', () => {
    expect(rosterWorker).toMatch(/source[^_a-z]/)
    expect(rosterWorker).toContain("'IMP'")
    expect(rosterWorker).not.toContain("'PA'")
  })
  it('roster-ground-inbound-worker inserts source IMP (not PA)', () => {
    expect(groundWorker).toContain("'IMP'")
    expect(groundWorker).not.toContain("'PA'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd live-server && npx vitest run src/__tests__/workers/roster-inbound-source.test.ts
```

Expected: FAIL (workers still contain `'PA'`).

- [ ] **Step 3: Change `roster-inbound-worker.ts` — `PA` → `IMP`**

In the INSERT VALUES list (~L215), the literal `'PA'` for `source` becomes `'IMP'`. The line currently reads (within the `VALUES (...)`):

```ts
    'PA', 0, 0, 0,
    'F8_IMPORT', 'F8_IMPORT'
```

Change to:

```ts
    'IMP', 0, 0, 0,
    'F8_IMPORT', 'F8_IMPORT'
```

- [ ] **Step 4: Change `roster-ground-inbound-worker.ts` — both INSERTs `PA` → `IMP`**

Ground INSERT (~L219) and single-leg INSERT (~L588) each contain the literal `'PA'` in their VALUES. Change both `'PA'` → `'IMP'`. Each looks like:

```ts
    'PA', 0, 0, 0,
    'F8_IMPORT', 'F8_IMPORT'
```

→

```ts
    'IMP', 0, 0, 0,
    'F8_IMPORT', 'F8_IMPORT'
```

- [ ] **Step 5: Run test to verify it passes + typecheck**

```bash
cd live-server && npx vitest run src/__tests__/workers/roster-inbound-source.test.ts && npx tsc --noEmit
```

Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add live-server/src/workers/roster-inbound-worker.ts live-server/src/workers/roster-ground-inbound-worker.ts live-server/src/__tests__/workers/roster-inbound-source.test.ts
git commit -m "feat(live-server): stamp source=IMP on connector inbound imports"
```

---

### Task 3: `create()` defaults `MA` + IMP immutability guard (backend)

**Files:**
- Modify: `live-server/src/services/roster/roster-service.ts:248-255` (`create`), `:257-269` (`update`), `:284-324` (`swap`), `:326-362` (`move`)
- Modify: `live-server/src/routes/roster/roster.ts` — update/swap/move route `catch` blocks (L106 handler ~L114; swap handler ~L190; move handler ~L228) to respect thrown `statusCode`
- Test: `live-server/src/services/roster/__tests__/roster-source-guard.test.ts`

**Interfaces:**
- Consumes: Task 1 (`IMP` exists). The route layer's existing `error(reply, statusCode, msg)` helper (`src/utils/response.ts`).
- Produces: `create()` rows default to `MA`; `update`/`swap`/`move` on an `IMP` row throw `{ statusCode: 409 }`, surfaced as HTTP 409. `remove`/`removeByPairingAndCrew` remain allowed on IMP rows (unchanged). Task 7 (frontend) is the UX mirror; the 409 is the backstop.

- [ ] **Step 1: Write the failing test**

`live-server/src/services/roster/__tests__/roster-source-guard.test.ts` (mirrors the mock pattern in `src/services/res-pairing/__tests__/res-pairing-delete.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const IMP_ROW = { id: 1, source: 'IMP', crewId: 'C1' }
const MA_ROW = { id: 2, source: 'MA', crewId: 'C2' }

const selectReturning = (rows: Record<string, unknown>[]) => ({
  from: () => ({ where: () => Promise.resolve(rows) }),
})
const tx = (rowsByCall: Record<string, unknown>[][]) => {
  let n = 0
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rowsByCall[n++] ?? []) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([MA_ROW]) }) }) }),
  }
}

describe('rosterService IMP immutability + create default', () => {
  beforeEach(() => vi.resetModules())

  it('update on an IMP row throws statusCode 409', async () => {
    const fastify: any = {
      db: {
        update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([IMP_ROW]) }) }) }),
        select: () => selectReturning([IMP_ROW]),
      },
    }
    const { rosterService } = await import('../../roster-service')
    await expect(rosterService.update(fastify, 1, { comments: 'x' }, 'u'))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('remove on an IMP row succeeds (delete allowed)', async () => {
    const fastify: any = {
      db: { update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([IMP_ROW]) }) }) }) },
      redis: { del: () => Promise.resolve() },
    }
    const { rosterService } = await import('../../roster-service')
    const res = await rosterService.remove(fastify, 1, 'u')
    expect(res).toMatchObject({ source: 'IMP' })
  })
})
```

> The exact mock shape must match how `update` reads the row before updating (see Step 3 — `update` will SELECT the row first). Adjust the mock so the SELECT returns `IMP_ROW`. Run it red first to confirm the assertion path.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd live-server && npx vitest run src/services/roster/__tests__/roster-source-guard.test.ts
```

Expected: FAIL (update does not yet throw on IMP).

- [ ] **Step 3: `create()` defaults `source` to `MA`**

`roster-service.ts:248-255` — currently:

```ts
  async create(fastify: FastifyInstance, data: typeof rosterFlight.$inferInsert, username: string) {
    const [row] = await fastify.db
      .insert(rosterFlight)
      .values({ ...data, ...auditCreate(username) })
      .returning()
    await bumpCrewChunkVersions(fastify, [row?.crewId])
    return row
  },
```

Change the `.values(...)` to default `source`:

```ts
      .values({ ...data, source: data.source ?? 'MA', ...auditCreate(username) })
```

- [ ] **Step 4: Add the IMP guard to `update`**

`roster-service.ts:257` — `update` currently updates blindly. Add a pre-select + guard. Replace the method body start:

```ts
  async update(fastify: FastifyInstance, id: number, data: Partial<typeof rosterFlight.$inferInsert>, username: string) {
    const [existing] = await fastify.db
      .select({ source: rosterFlight.source })
      .from(rosterFlight)
      .where(eq(rosterFlight.id, id))
    if (existing?.source === 'IMP') {
      throw Object.assign(new Error('Imported (IMP) tasks cannot be edited; delete and re-create instead'), { statusCode: 409 })
    }
    const [row] = await fastify.db
      .update(rosterFlight)
      .set({ ...data, ...auditUpdate(username) })
      .where(eq(rosterFlight.id, id))
      .returning()
    await Promise.all([
      invalidate(fastify.redis, `${CACHE_PREFIX}:${id}`),
      data.crewId !== undefined ? invalidateAllChunks(fastify) : bumpCrewChunkVersions(fastify, [row?.crewId]),
    ])
    return row
  },
```

(Ensure `eq` is already imported — it is, used elsewhere in the file.)

- [ ] **Step 5: Add the IMP guard to `swap`**

`roster-service.ts` `swap` already fetches `taskA`/`taskB` (full rows incl. `source`). Add the guard right after the `if (!taskA || !taskB)` check:

```ts
      if (!taskA || !taskB) {
        throw new Error('One or both tasks not found')
      }
      if (taskA.source === 'IMP' || taskB.source === 'IMP') {
        throw Object.assign(new Error('Imported (IMP) tasks cannot be swapped'), { statusCode: 409 })
      }
```

- [ ] **Step 6: Add the IMP guard to `move`**

`roster-service.ts` `move` already fetches `task`. Add after `if (!task)`:

```ts
      if (!task) {
        throw new Error('Task not found')
      }
      if (task.source === 'IMP') {
        throw Object.assign(new Error('Imported (IMP) tasks cannot be moved'), { statusCode: 409 })
      }
```

- [ ] **Step 7: Make the route layer surface 409 (not 500)**

`roster.ts` — the `update`, `swap`, and `move` handlers currently do `catch (err) { return error(reply, 500, (err as Error).message) }`. Change each of those three catches to respect a thrown `statusCode`:

```ts
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500
      return error(reply, status, (err as Error).message)
    }
```

(Apply to the `PUT /:id`, `POST /swap`, and `POST /move` handlers only — minimal change, leaves other handlers untouched.)

- [ ] **Step 8: Run tests + typecheck**

```bash
cd live-server && npx vitest run src/services/roster/__tests__/roster-source-guard.test.ts && npx tsc --noEmit
```

Expected: PASS; tsc clean.

- [ ] **Step 9: Commit**

```bash
git add live-server/src/services/roster/roster-service.ts live-server/src/routes/roster/roster.ts live-server/src/services/roster/__tests__/roster-source-guard.test.ts
git commit -m "feat(live-server): default create() to MA + reject edits on IMP roster rows (409)"
```

---

### Task 4: ro_input forces `PA` + widen result-loader flying guard

**Files:**
- Modify: `engine-server/F8/ro_input_builder/sections/roster.py:19,68,121` (the three `Col("source", ...)`)
- Modify: `live-server/src/services/scenario/scenario-result-loader.ts:108` (flying source ternary)
- Test: `engine-server/F8/ro_input_builder/sections/test_roster_source.py`

**Interfaces:**
- Consumes: Task 1.
- Produces: every Live-sourced row in the ro_input snapshot (RosterFlight / RosterGround / reconstructed Roster) carries `source='PA'`; the optimizer result-loader preserves PA for carried flying rows (only true optimizer placements become CR).

- [ ] **Step 1: Write the failing test**

`engine-server/F8/ro_input_builder/sections/test_roster_source.py`:

```python
from roster import _RF_COLS, _RG_COLS, _ROSTER_COLS
import registry as _reg

def test_flying_section_emits_PA_for_source():
    sql = _reg.select_list(_RF_COLS)
    assert "'PA'" in sql
    # ensure we no longer read the raw source column for the source header
    assert "source" not in sql.split("'PA'")[0].split(",")[-1]

def test_ground_and_reconstructed_emit_PA_for_source():
    assert "'PA'" in _reg.select_list(_RG_COLS)
    assert "'PA'" in _reg.select_list(_ROSTER_COLS)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd engine-server && python -m pytest F8/ro_input_builder/sections/test_roster_source.py -q
```

Expected: FAIL (`'PA'` not yet in the select lists).

- [ ] **Step 3: Emit literal `'PA'` in the three Col declarations**

`roster.py:19` — change:

```python
    Col("tsFlag", "ts_flag"), Col("sendFlag", "send_flag"), Col("source", "source"),
```

to:

```python
    Col("tsFlag", "ts_flag"), Col("sendFlag", "send_flag"), Col("source", "'PA'"),
```

`roster.py:68` — change `Col("source", "source")` to `Col("source", "'PA'")`.

`roster.py:121` — change `Col("source", "MIN(source)")` to `Col("source", "'PA'")` (constant no longer needs `MIN`).

- [ ] **Step 4: Widen the result-loader flying guard**

`live-server/src/services/scenario/scenario-result-loader.ts:108` — change:

```ts
        source: a.source === 'PA' || a.source === 'leadin' ? 'PA' : 'CR',
```

to:

```ts
        source: a.source !== 'CR' ? 'PA' : 'CR',
```

(Comment above it can stay; semantics unchanged — carried rows become PA, optimizer-placed rows CR.)

- [ ] **Step 5: Run tests**

```bash
cd engine-server && python -m pytest F8/ro_input_builder/sections/test_roster_source.py -q
cd live-server && npx tsc --noEmit
```

Expected: pytest PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add engine-server/F8/ro_input_builder/sections/roster.py engine-server/F8/ro_input_builder/sections/test_roster_source.py live-server/src/services/scenario/scenario-result-loader.ts
git commit -m "feat(engines): force source=PA on ro_input Live rows; widen result-loader flying guard"
```

---

### Task 5: NOC outbound IMP filter via `roster_publish_adjust` old/new source

**Files:**
- Modify: `live-server/src/models/roster/roster-publish-adjust.ts` (add `oldSource`/`newSource`)
- Modify: `live-server/src/services/roster/roster-publish-service.ts` `adjustSnapshotSql` (4 touch points: INSERT col list, `old_rows` CTE, `new_rows` CTE, final SELECT)
- Modify: `live-server/src/services/roster/roster-publish-outbound-service.ts` — `RosterPublishAdjustRow` interface (L9-34) + `buildRosterPublishCallbackPayload` filter (L136+)
- Test: `live-server/src/services/roster/__tests__/roster-publish-outbound-source-filter.test.ts`

**Interfaces:**
- Consumes: Task 1 (adjust columns exist); `roster_publish.source` already populated by `applyInsertSql` (copies `rf.source`).
- Produces: NOC callback payload excludes any adjust row whose `old_source` or `new_source` is `IMP`. `roster_publish` remains complete (PBS unaffected).

- [ ] **Step 1: Write the failing test**

`live-server/src/services/roster/__tests__/roster-publish-outbound-source-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRosterPublishCallbackPayload } from '../../roster-publish-outbound-service'

const base = { id: 1, batch_id: 1, rp_start: null, rp_end: null, crew_id: 'C1' }

describe('buildRosterPublishCallbackPayload IMP filter', () => {
  it('drops rows where old_source or new_source is IMP', () => {
    const rows: any[] = [
      { ...base, action_type: 'ADD',    old_pairing_id: null, new_pairing_id: 10, new_pair_interface_id: 'P10', old_source: null,     new_source: 'IMP' },
      { ...base, action_type: 'DELETE', old_pairing_id: 20,   new_pairing_id: null, old_pair_interface_id: 'P20', old_source: 'IMP', new_source: null },
      { ...base, action_type: 'UPDATE', old_pairing_id: 30,   new_pairing_id: 30, old_pair_interface_id: 'P30', new_pair_interface_id: 'P30', old_source: 'MA', new_source: 'CR' },
    ]
    const payload = buildRosterPublishCallbackPayload(rows)
    expect(payload).not.toBeNull()
    expect(payload!.rosters).toHaveLength(1)
    expect(payload!.rosters[0].pairingId).toBe('P30')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd live-server && npx vitest run src/services/roster/__tests__/roster-publish-outbound-source-filter.test.ts
```

Expected: FAIL (filter not present; `old_source`/`new_source` not on the interface).

- [ ] **Step 3: Add columns to the Drizzle model**

`live-server/src/models/roster/roster-publish-adjust.ts` — add two fields next to the other `old_*`/`new_*` columns:

```ts
  oldSource: varchar('old_source', { length: 12 }),
  newSource: varchar('new_source', { length: 12 }),
```

- [ ] **Step 4: Add the fields to the `RosterPublishAdjustRow` interface**

`roster-publish-outbound-service.ts:9-34` — add (matching the other `string | null` fields):

```ts
  old_source: string | null
  new_source: string | null
```

- [ ] **Step 5: Populate old/new source in `adjustSnapshotSql` (4 touch points)**

`roster-publish-service.ts` `adjustSnapshotSql`:

(a) INSERT column list — after `old_brief_end_utc,` add `old_source,`; after `new_brief_end_utc,` add `new_source,`.

(b) `old_rows` CTE SELECT — after `rpbl.brief_end_utc` add a line:

```sql
        rpbl.source,
```

(c) `new_rows` CTE SELECT — after `ps.brief_end_utc` add:

```sql
        rf.source,
```

(d) final SELECT — in the old-block (after `o.brief_start_utc, o.brief_end_utc,`) add `o.source,`; in the new-block (after `n.brief_start_utc, n.brief_end_utc,`) add `n.source,`.

- [ ] **Step 6: Add the IMP filter to `buildRosterPublishCallbackPayload`**

`roster-publish-outbound-service.ts:136` — at the top of the `for (const row of rows)` loop body, after the existing `if (!action || !row.crew_id) continue`:

```ts
    if (row.old_source === 'IMP' || row.new_source === 'IMP') continue
```

(`claimNextRosterPublishAdjustBatch` uses `select *`/`returning *`, so the new columns flow through with no SELECT-list change.)

- [ ] **Step 7: Run tests + typecheck**

```bash
cd live-server && npx vitest run src/services/roster/__tests__/roster-publish-outbound-source-filter.test.ts && npx tsc --noEmit
```

Expected: PASS; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add live-server/src/models/roster/roster-publish-adjust.ts live-server/src/services/roster/roster-publish-service.ts live-server/src/services/roster/roster-publish-outbound-service.ts live-server/src/services/roster/__tests__/roster-publish-outbound-source-filter.test.ts
git commit -m "feat(live-server): carry source through roster_publish_adjust; filter IMP from NOC payload"
```

---

### Task 6: Scenario Gantt display rule + IMP-aware publish types

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts:22` (`PublishRosterSource`), `:41-42` (`normalizeRosterSource`)
- Verify (likely no code change): `live-server/src/services/scenario/scenario-gantt-db-service.ts:154,195`
- Test: `live-server/src/__tests__/services/scenario-gantt-source-display.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 (scenario rows are PA/MA/CR; lead-in already PA).
- Produces: post-optimization Scenario Gantt shows stored `PA/CR/MA` verbatim; `normalizeRosterSource` recognizes `IMP` (defensive — IMP should not appear in scenario, but won't be masked to CR if it ever does).

- [ ] **Step 1: Write the failing test**

`live-server/src/__tests__/services/scenario-gantt-source-display.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('scenario publish source normalization', () => {
  it('recognizes IMP without masking to CR', async () => {
    // normalizeRosterSource is not exported; assert via the module source contract.
    // (If the team prefers, export normalizeRosterSource and test it directly.)
    const mod = await import('../../routes/scenario/scenario')
    expect(mod).toBeDefined()
  })
})
```

> If `normalizeRosterSource` is not exported, export it (add `export` to the const) so it can be tested directly, then replace the body above with `expect(normalizeRosterSource('IMP')).toBe('IMP')` and `expect(normalizeRosterSource('PA')).toBe('PA')`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd live-server && npx vitest run src/__tests__/services/scenario-gantt-source-display.test.ts
```

Expected: FAIL (IMP not in the union / not exported).

- [ ] **Step 3: Widen `PublishRosterSource` and `normalizeRosterSource`**

`scenario.ts:22`:

```ts
type PublishRosterSource = 'IMP' | 'PA' | 'MA' | 'CR'
```

`scenario.ts:41-42` — export it and include IMP:

```ts
export const normalizeRosterSource = (value: string | null | undefined): PublishRosterSource =>
  value === 'IMP' || value === 'PA' || value === 'MA' || value === 'CR' ? value : 'CR'
```

- [ ] **Step 4: Verify (do not change unless needed) the stored-row display path**

Read `scenario-gantt-db-service.ts:154` and `:195`. Both currently:

```ts
const source = row.source === 'PA' || row.source === 'MA' || row.source === 'CR' ? row.source : 'CR'
```

Under the new model, stored scenario rows are `PA/MA/CR`, so this already returns them verbatim (the `: 'CR'` only catches NULL/legacy). **Leave as-is** unless a scenario row can legally be something else. If you want belt-and-suspenders, widen to include IMP:

```ts
const source = row.source === 'IMP' || row.source === 'PA' || row.source === 'MA' || row.source === 'CR' ? row.source : 'CR'
```

(Document the decision in the commit message either way.)

- [ ] **Step 5: Run tests + typecheck**

```bash
cd live-server && npx vitest run src/__tests__/services/scenario-gantt-source-display.test.ts && npx tsc --noEmit
```

Expected: PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add live-server/src/routes/scenario/scenario.ts live-server/src/services/scenario/scenario-gantt-db-service.ts live-server/src/__tests__/services/scenario-gantt-source-display.test.ts
git commit -m "feat(live-server): IMP-aware scenario source normalization; verify stored-row display"
```

---

### Task 7: Gantt frontend — IMP rows are immutable (delete only)

**Files:**
- Modify: `gantt/src/components/roster/context-menu.tsx:194-216` (disable Edit/Swap on IMP; leave Delete enabled)
- Modify: `gantt/src/components/gantt/source/live-gantt-source.ts:855-869` (block drag-move on IMP) and `:787-793` (block ground double-click edit on IMP)
- Modify: `gantt/src/components/roster/ground-task-dialog.tsx` (block edit submit on IMP — defensive; backend already 409s)
- Test: `e2e/gantt/roster-imp-immutability.spec.ts`

**Interfaces:**
- Consumes: `RosterItem.source` (`gantt/src/types/roster.ts:13`, already `string | null`) flows end-to-end; Tasks 1–3 ensure live rows carry `IMP` and the backend 409s.
- Produces: IMP rows cannot be edited/moved/swapped via the UI; delete remains available. (Backend 409 is the backstop if a path is missed.)

- [ ] **Step 1: Write the failing Playwright test**

`e2e/gantt/roster-imp-immutability.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('IMP roster row cannot be edited/moved/swap but can be deleted', async ({ page }) => {
  await page.goto('/?scenario=live')
  // Locate a roster bar whose underlying row has source=IMP (seed/assert via the roster API
  // or a known IMP row). Right-click it.
  const impBar = page.locator('[data-roster-source="IMP"]').first()
  await expect(impBar).toBeVisible()
  await impBar.click({ button: 'right' })

  const menu = page.locator('[role="menu"], [data-testid="roster-context-menu"]')
  await expect(menu.getByText(/Edit Task/i)).toBeDisabled()
  await expect(menu.getByText(/Swap/i)).toBeDisabled()
  await expect(menu.getByText(/Delete/i)).toBeEnabled()
})
```

> If the renderer does not already expose `data-roster-source`, add it in `roster-renderer.ts` when painting each bar (one attribute: `dataset.rosterSource = item.source ?? ''`) — small, and it makes the row's source testable/inspectable. Include that change in this task.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx playwright test e2e/gantt/roster-imp-immutability.spec.ts --reporter=list
```

Expected: FAIL (Edit/Swap not disabled; `data-roster-source` may not exist).

- [ ] **Step 3: Disable Edit/Swap in the context menu for IMP rows**

`gantt/src/components/roster/context-menu.tsx` — where the roster-branch items are pushed (~L194-216), compute `const isImp = task.source === 'IMP'` and set `disabled: isImp` on the Edit and Swap items. The Delete item stays unconditional:

```ts
const isImp = task.source === 'IMP'
items.push({ icon: Edit, label: 'Edit Task', onClick: handleEdit, disabled: isImp })
// ... Swap:
items.push({ icon: ..., label: 'Swap Task', onClick: handleSwap, disabled: isImp })
// Delete stays:
items.push({ icon: Trash, label: 'Delete', danger: true, onClick: handleDelete })
```

(The `disabled` flag is already honored by the render at L380-398.)

- [ ] **Step 4: Block drag-move on IMP rows**

`gantt/src/components/gantt/source/live-gantt-source.ts` `onDragStart` (~L855) — add a short-circuit at the top:

```ts
    onDragStart: (item) => {
      const task = taskById.get(item.id)
      if (task?.source === 'IMP') return
      // ...existing drag-start logic
    },
```

- [ ] **Step 5: Block ground-task double-click edit on IMP rows**

`live-gantt-source.ts` `onItemDoubleClick` (~L787) — for ground tasks, skip opening the editor when the row is IMP (flying is already read-only `openPairingInfo`):

```ts
    onItemDoubleClick: (item) => {
      const task = taskById.get(item.id)
      if (task?.pairingId == null && task?.source === 'IMP') return
      // ...existing logic (openGroundTaskEdit / openPairingInfo)
    },
```

- [ ] **Step 6: Expose `data-roster-source` on rendered bars (for testability + future visual cue)**

`gantt/src/components/gantt/renderers/roster-renderer.ts` — where each bar is painted, set the dataset attribute so the test (and an optional dashed outline) can key off it:

```ts
;(bar.dataset as Record<string, string>).rosterSource = item.source ?? ''
```

- [ ] **Step 7: Run the test + UI standard gate**

```bash
npx playwright test e2e/gantt/roster-imp-immutability.spec.ts --reporter=list
npm run check:ui
```

Expected: Playwright PASS; `check:ui` 0 hard violations.

- [ ] **Step 8: Commit**

```bash
git add gantt/src/components/roster/context-menu.tsx gantt/src/components/gantt/source/live-gantt-source.ts gantt/src/components/gantt/renderers/roster-renderer.ts gantt/src/components/roster/ground-task-dialog.tsx e2e/gantt/roster-imp-immutability.spec.ts
git commit -m "feat(gantt): make IMP roster rows immutable (delete only) in Live Gantt"
```

---

### Task 8: Conflict regression — round-trip immutability + data verification

**Files:**
- Test: `e2e/gantt/roster-source-round-trip.spec.ts` (or a Vitest integration test if an end-to-end optimizer run is not feasible in CI — then assert the constituent invariants instead)
- No production code changes (this task only verifies Tasks 1–7 hold together).

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Write the regression test**

`e2e/gantt/roster-source-round-trip.spec.ts` (asserts the structural invariants via the UI + API; if a live optimizer run is unavailable, drive the publish dialog and the NOC payload builder's unit path instead):

```ts
import { test, expect } from '@playwright/test'

test('IMP row survives the scenario round-trip without leaking to NOC', async ({ page, request }) => {
  // 1. Live has an IMP row (post Task 2 / backfill). Confirm via API.
  const roster = await request.get('/api/roster?...').then((r) => r.json())
  const imp = roster.data.find((r: any) => r.source === 'IMP')
  expect(imp).toBeTruthy()

  // 2. Build the ro_input for a scenario covering this crew — assert source emitted as PA
  //    (engine endpoint or fixture). If unavailable, assert via the Task 4 unit test.

  // 3. Open the scenario publish dialog — assert the IMP-origin (now PA in scenario) row is
  //    NOT publishable (checkbox disabled), so it cannot return to Live as CR/MA.
  await page.goto('/?scenario=<done-ro-scenario>')
  // ... select-all must exclude PA rows (existing behavior, regression-guarded).

  // 4. NOC payload: call the outbound payload builder path (or its unit test) and assert no
  //    row with old_source/new_source = IMP is present.
})
```

> The exact endpoint/fixture details depend on the test environment's ability to run an optimizer. At minimum, assert: (a) live IMP rows exist and are not editable (Task 7), (b) the publish dialog excludes PA (existing), (c) the NOC payload unit test (Task 5) drops IMP. Wire the assertions that the environment supports; document any skipped sub-assertion.

- [ ] **Step 2: Run it**

```bash
npx playwright test e2e/gantt/roster-source-round-trip.spec.ts --reporter=list
```

Expected: PASS.

- [ ] **Step 3: Remote DB data verification (paste the result)**

```bash
psql "$DATABASE_URL_F8" -c "SET search_path TO f8; SELECT source, count(*) FROM roster_flight GROUP BY 1 ORDER BY 1;"
```

Expected: only `IMP`/`MA`/`CR`.

- [ ] **Step 4: Commit**

```bash
git add e2e/gantt/roster-source-round-trip.spec.ts
git commit -m "test: regression for roster source IMP round-trip immutability"
```

---

### Task 9: DB Migration Phase 2 — NOT NULL + strict per-table CHECK (post-SIT)

> **Gate:** Run this ONLY after Tasks 1–8 are validated in SIT and a full re-import + publish cycle confirms no write path produces a wrong `source`. This is the hard lock that turns bad data into a DB error.

**Files:**
- Create: `sql/migration/2026-07-2x-roster-flight-source-strict.sql`
- Modify: `sql/schema/live/02-crew-roster.sql:1331,1930` (final strict form)
- Modify: `sql/schema/scenario/01-scenario-tables.sql:447,537` (final strict form)
- Test: remote DB queries.

**Interfaces:**
- Produces: the final domain — live `source NOT NULL in ('IMP','MA','CR')`; scenario `source NOT NULL in ('PA','MA','CR')`.

- [ ] **Step 1: Write the Phase 2 migration**

`sql/migration/2026-07-2x-roster-flight-source-strict.sql`:

```sql
-- 2026-07-2x — roster_flight.source Phase 2 lockdown.
-- Run on BOTH live (f8) and scenario schemas via SET search_path.
-- Precondition: Phase 1 backfill complete; no NULL/wrong-value rows remain.

-- LIVE (f8): IMP/MA/CR only, not null.
alter table roster_flight alter column source set not null;
alter table roster_flight drop constraint if exists chk_roster_flight_source_pa_ma_cr;
alter table roster_flight add constraint chk_roster_flight_source_live
  check (source in ('IMP', 'MA', 'CR'));
```

> Scenario gets the symmetric constraint. Because the same file runs on both schemas, split into two explicit runs (the constraint NAME and VALUE SET differ per schema):

Run on live:

```bash
psql "$DATABASE_URL_F8" -c "SET search_path TO f8;" -c "
ALTER TABLE roster_flight ALTER COLUMN source SET NOT NULL;
ALTER TABLE roster_flight DROP CONSTRAINT IF EXISTS chk_roster_flight_source_pa_ma_cr;
ALTER TABLE roster_flight ADD CONSTRAINT chk_roster_flight_source_live CHECK (source IN ('IMP','MA','CR'));"
```

Run on scenario:

```bash
psql "$DATABASE_URL_F8" -c "SET search_path TO scenario;" -c "
ALTER TABLE roster_flight ALTER COLUMN source SET NOT NULL;
ALTER TABLE roster_flight DROP CONSTRAINT IF EXISTS chk_roster_flight_source_pa_ma_cr;
ALTER TABLE roster_flight ADD CONSTRAINT chk_roster_flight_source_scenario CHECK (source IN ('PA','MA','CR'));"
```

- [ ] **Step 2: Update canonical DDL to the final strict form**

`sql/schema/live/02-crew-roster.sql:1331`:

```sql
    source                       varchar(12)   not null,  -- 排班来源（IMP=外部接口导入 / MA=人工 / CR=优化器）
```

`sql/schema/live/02-crew-roster.sql:1930` — replace the constraint line:

```sql
  add constraint chk_roster_flight_source_live check (source in ('IMP', 'MA', 'CR'));
```

`sql/schema/scenario/01-scenario-tables.sql:447`:

```sql
    source                       varchar(12)   not null,  -- 排班来源（PA=从Live提取/lead-in / MA=人工 / CR=优化器）
```

`sql/schema/scenario/01-scenario-tables.sql:537`:

```sql
  add constraint chk_roster_flight_source_scenario check (source in ('PA', 'MA', 'CR'));
```

- [ ] **Step 3: Run the migration on both schemas + verify**

```bash
# (the two psql commands from Step 1)
psql "$DATABASE_URL_F8" -c "SET search_path TO f8;       SELECT source, count(*) FROM roster_flight GROUP BY 1;"
psql "$DATABASE_URL_F8" -c "SET search_path TO scenario; SELECT source, count(*) FROM roster_flight GROUP BY 1;"
```

Expected: live only `IMP/MA/CR`; scenario only `PA/MA/CR`; both NOT NULL (a deliberate `INSERT ... source NULL` is rejected by the DB — optionally verify with a rolled-back probe).

- [ ] **Step 4: Commit**

```bash
git add sql/migration/2026-07-2x-roster-flight-source-strict.sql sql/schema/live/02-crew-roster.sql sql/schema/scenario/01-scenario-tables.sql
git commit -m "feat(db): lockdown roster_flight.source — NOT NULL + strict per-table CHECK (Phase 2)"
```

---

## Sequencing & Dependencies

- Task 1 (DB Phase 1) first — everything depends on `IMP` being legal.
- Tasks 2, 3, 4, 5 can proceed in parallel after Task 1 (independent write/read sites).
- Task 6 depends on Tasks 1–4 (scenario rows must be PA/MA/CR first).
- Task 7 (frontend) depends on Tasks 1–3 (live rows must carry IMP + backend 409s).
- Task 8 (regression) after Tasks 2–7.
- Task 9 (DB Phase 2) LAST, after SIT validation.

## Notes for the implementer

- The repo has BOTH canonical `sql/*.sql` DDL AND Drizzle models in `live-server/src/models/`. Touch both layers where relevant (schema files in DB tasks; Drizzle model in Task 5).
- `roster_publish.source` already exists and is populated by `applyInsertSql` (copies `rf.source`) — no change needed there; `old_source` reads it via `rpbl.source`.
- `claimNextRosterPublishAdjustBatch` uses `select *` / `returning *`, so the new adjust columns need no SELECT-list change — only the TS interface.
- Backend 409 is the source of truth for IMP immutability; the frontend changes (Task 7) are UX. If time-boxed, ship Tasks 1–6 + 8–9 (backend-complete) and follow up with Task 7.
- After any frontend style change, run `npm run check:ui` and paste the PASS result.
