# KPI 合并至 scenario_result（drop scenario_kpi）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `scenario_result` type=`kpi` the single source of scenario KPI data (JSON array), remove the `scenario_kpi` table and all its read/write paths.

**Architecture:** `scenario_kpi` (structured) is a duplicate of the `scenario_result` `'kpi'` JSON already written by `computeAndPersistKpis`/`syncScenarioPairingKpisFromDb`. Gantt already prefers `results.kpi` (scenario_result). We stop writing `scenario_kpi`, switch remaining readers (`compareGroup`) to `scenario_result`, remove dead CRUD routes, backfill+drop the table, and remove the frontend `kpis` fallback.

**Tech Stack:** Fastify + TypeScript (live-server), React 19 + Vitest (gantt), Playwright (e2e), PostgreSQL.

## Global Constraints

- **§No-Auto-Commit:** Do NOT run `git commit`/`git push` without an explicit user command. Tasks end by staging changes; the final task presents the diff for review.
- **§Surgical:** Touch only files named in the spec; no drive-by refactors. The `scenarioKpiRecomputeQueue` (worker queue) is unrelated to the table — leave it.
- **§Stale-Test:** Update the tests that assert the old source; do not leave them red. Add the migration-gate regression (new source wins).
- **Deploy ordering:** Run the migration **before** deploying the new live-server code, so the backfill reads `scenario_kpi` while it still holds data.
- **KPI computation口径 unchanged:** only the storage location moves.
- Reference spec: `docs/superpowers/specs/2026-08-14-kpi-merge-to-scenario-result-design.md` (committed `8f5308ec`).

---

### Task 1: Backend writers — `scenario-result-service.ts`

**Files:**
- Modify: `live-server/src/services/scenario/scenario-result-service.ts`

**Interfaces:**
- Produces: `computeAndPersistKpis` and `syncScenarioPairingKpisFromDb` write KPI only to `scenario_result` type=`kpi` (JSON array of `{id, scenarioId, kpiNames, kpiValues, description, idx, type}`).

- [ ] **Step 1: Remove the `scenarioKpi` import** (`scenario-result-service.ts:5`)

```ts
import { scenarioKpi } from '../../models/scenario/scenario-kpi.js'
```
Delete this line.

- [ ] **Step 2: Remove `upsertCurrentLineKpi`** (lines 413-450) — no longer called after Step 4. Delete the whole `const upsertCurrentLineKpi = async (...) => {...}` block.

- [ ] **Step 3: Change `KpiInsert` type** (`scenario-result-service.ts:1498`)

Replace `type KpiInsert = typeof scenarioKpi.$inferInsert` with a self-contained shape (matches the `base` + pushes at 1500-1542):

```ts
  type KpiInsert = {
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
    scenarioId: number
    kpiNames: string
    kpiValues: string
    description: string
    idx: number
    type: string
  }
```

- [ ] **Step 4: `computeAndPersistKpis` — stop writing `scenario_kpi`** (`scenario-result-service.ts:1544-1563`)

Delete this block entirely (keep the `upsertScenarioResultJson` block at 1565-1579 that writes `raw_result`/`kpi`/`credit_hours`/`uncovered`/`distribution`):

```ts
  // ── 4. Replace all KPIs for this scenario then UPSERT new rows ────────────
  // Delete first so renamed KPIs from old runs don't accumulate.
  await fastify.db.delete(scenarioKpi).where(eq(scenarioKpi.scenarioId, scenarioId))

  for (const row of rows) {
    await fastify.db
      .insert(scenarioKpi)
      .values(row)
      .onConflictDoUpdate({
        target: [scenarioKpi.scenarioId, scenarioKpi.kpiNames],
        set: {
          kpiValues:   sql`EXCLUDED.kpi_values`,
          description: sql`EXCLUDED.description`,
          idx:         sql`EXCLUDED.idx`,
          type:        sql`EXCLUDED.type`,
          updatedBy:   sql`EXCLUDED.updated_by`,
          updatedAt:   sql`EXCLUDED.updated_at`,
        },
      })
  }
```

- [ ] **Step 5: `syncScenarioPairingKpisFromDb` — merge line/coverage into scenario_result** (replace lines 550-578, the tail from `const fly = summarizeCurrent('FLY')` to the end of the function)

Current tail writes 4 line/coverage KPIs via `upsertCurrentLineKpi`, reads `scenario_kpi`, denormalizes. Replace with read-merge-write on `scenario_result`:

```ts
  const fly = summarizeCurrent('FLY')
  const res = summarizeCurrent('RES')
  const lineRows = [
    { kpiNames: 'Pairing Lines', kpiValues: String(fly.total), description: `Pre-Assignment: ${fly.preassigned} / Optimize: ${fly.optimized}`, idx: KpiOrder.pairingLines, type: 'UTILIZATION' },
    { kpiNames: 'Reserve Lines', kpiValues: String(res.total), description: `Pre-Assignment: ${res.preassigned} / Optimize: ${res.optimized}`, idx: KpiOrder.reserveLines, type: 'UTILIZATION' },
    { kpiNames: 'Pairing Coverage', kpiValues: `${(fly.averageCoverage * 100).toFixed(1)}%`, description: `${fly.coveredSlots} / ${fly.plannedSlots} planned slots`, idx: KpiOrder.pairingCoverage, type: 'UTILIZATION' },
    { kpiNames: 'Reserve Coverage', kpiValues: `${(res.averageCoverage * 100).toFixed(1)}%`, description: `${res.coveredSlots} / ${res.plannedSlots} planned slots`, idx: KpiOrder.reserveCoverage, type: 'UTILIZATION' },
  ]
  const current = (await getScenarioResults(fastify, scenarioId)).kpi as Array<Record<string, unknown>>
  const lineNames = new Set(lineRows.map((row) => row.kpiNames))
  const merged = [...current.filter((row) => !lineNames.has(String(row.kpiNames))), ...lineRows]
    .map((row, index) => ({ ...row, id: index + 1, scenarioId }))
  await upsertScenarioResultJson(fastify, scenarioId, 'kpi', merged, updatedBy)
```

(`upsertScenarioResultJson` already invalidates the `scenario:result` cache internally; the old `scenario:kpi` invalidate is gone with the table.)

- [ ] **Step 6: Update the doc comment** (`scenario-result-service.ts:1297-1310`): change "persist them to scenario_kpi." → "persist them to scenario_result type='kpi'."

- [ ] **Step 7: Verify build** — `cd live-server && npx tsc --noEmit` (or `npm run build`) compiles without `scenarioKpi` references.

- [ ] **Step 8: Stage for review (no auto-commit — §No-Auto-Commit)**

---

### Task 2: Backend readers + CRUD — `scenario-service.ts`

**Files:**
- Modify: `live-server/src/services/scenario/scenario-service.ts`

- [ ] **Step 1: Remove the `scenarioKpi` import** (line 4)

- [ ] **Step 2: Remove the scenario_kpi delete on scenario removal** (line 162)

```ts
  await pool.query(`delete from scenario_kpi where scenario_id = $1`, [scenarioId])
```
Delete this line (scenario_result cleanup is already handled by `deleteScenarioResultJson` above it).

- [ ] **Step 3: `compareGroup` — read KPIs from scenario_result** (replace lines 639-649)

Current:
```ts
      // Get all KPIs for these scenarios
      const kpis = await fastify.db
        .select()
        .from(scenarioKpi)
        .where(sql`${scenarioKpi.scenarioId} = ANY(${scenarioIds})`)

      // Build comparison: each scenario with its KPIs
      return scenarios.map((sc) => ({
        scenario: sc,
        kpis: kpis.filter((k) => k.scenarioId === sc.id),
      }))
```

Replace with a batch read of `scenario_result` type=`kpi` (ensure the table exists first, mirroring `getScenarioResults`):

```ts
      // Get all KPIs for these scenarios from scenario_result type='kpi'
      const { ensureScenarioResultTable } = await import('./scenario-result-store.js')
      await ensureScenarioResultTable(fastify)
      const kpiRows = await fastify.pgPool.query<{ scenario_id: number; json: unknown }>(
        `select scenario_id, json from scenario_result where scenario_id = ANY($1::bigint[]) and type = 'kpi'`,
        [scenarioIds],
      )
      const kpisByScenario = new Map(kpiRows.rows.map((row) => [row.scenario_id, row.json as unknown[]]))

      // Build comparison: each scenario with its KPIs
      return scenarios.map((sc) => ({
        scenario: sc,
        kpis: kpisByScenario.get(sc.id) ?? [],
      }))
```

- [ ] **Step 4: Remove `getKpis`, `createKpi`, `updateKpi`, `removeKpi`** (lines 653-697, the whole `// --- Scenario KPI ---` section)

Delete the `getKpis`, `getResults`-adjacent `createKpi`/`updateKpi`/`removeKpi` methods. Keep `getResults` (line 665) — it is still used by `GET /:id/results`.

> Careful: the `getResults` method (665-667) sits between `getKpis` and `createKpi`. Remove only `getKpis` (655-663), `createKpi` (669-676), `updateKpi` (678-688), `removeKpi` (690-697). Keep `getResults`.

- [ ] **Step 5: Verify build** — `cd live-server && npx tsc --noEmit` compiles.

- [ ] **Step 6: Stage for review (no auto-commit)**

---

### Task 3: Routes removal — `scenario.ts`

**Files:**
- Modify: `live-server/src/routes/scenario/scenario.ts`

- [ ] **Step 1: Remove the `/kpi` routes, keep `/results`**

Delete:
- `GET /:id/kpi` (comment at 1028 + route 1029-1039)
- `POST /:id/kpi` (comment 1052 + route 1053-1074)
- `PUT /kpi/:kpiId` (comment 1075 + route 1076-1096)
- `DELETE /kpi/:kpiId` (comment 1097 + route 1098-…end of block)

Keep `GET /:id/results` (comment 1040 + route 1041-1051).

- [ ] **Step 2: Verify no remaining `/kpi` route** — `grep -n "/kpi" live-server/src/routes/scenario/scenario.ts` → empty.

- [ ] **Step 3: Stage for review (no auto-commit)**

---

### Task 4: Model removal

**Files:**
- Delete: `live-server/src/models/scenario/scenario-kpi.ts`
- Modify: `live-server/src/models/index.ts:101`

- [ ] **Step 1: Delete the model file** — `rm live-server/src/models/scenario/scenario-kpi.ts`

- [ ] **Step 2: Remove the export** (`models/index.ts:101`)

```ts
export { scenarioKpi } from './scenario/scenario-kpi'
```
Delete this line.

- [ ] **Step 3: Grep for orphan `scenarioKpi` imports** — `grep -rn "scenarioKpi" live-server/src --include="*.ts"` should only hit `scenarioKpiRecomputeQueue` (worker, unrelated). Fix any stray imports.

- [ ] **Step 4: Stage for review (no auto-commit)**

---

### Task 5: DB migration + schema + seed

**Files:**
- Create: `sql/migration/2026-08-14-drop-scenario-kpi.sql`
- Modify: `sql/schema/live/02-crew-roster.sql`（1775-1790, 1815-1816）
- Modify: `sql/seed/95-scenario-mock.sql`（157-183）

- [ ] **Step 1: Create the migration**

```sql
-- 2026-08-14-drop-scenario-kpi.sql
-- Merge scenario_kpi into scenario_result type='kpi' (JSON array), then drop scenario_kpi.
-- Idempotent: re-running backfills into the existing scenario_result row and no-ops the drop.

insert into scenario_result (scenario_id, type, json, created_by, updated_by)
select scenario_id, 'kpi',
       jsonb_agg(jsonb_build_object(
         'id', row_number() over (partition by scenario_id order by idx, kpi_names),
         'scenarioId', scenario_id,
         'kpiNames', kpi_names,
         'kpiValues', kpi_values,
         'description', description,
         'idx', idx,
         'type', type
       ) order by idx, kpi_names) as json,
       'system', 'system'
  from scenario_kpi
 group by scenario_id
on conflict (scenario_id, type) do update set
  json = excluded.json, updated_by = excluded.updated_by, updated_at = now();

drop table if exists scenario_kpi;
```

- [ ] **Step 2: Remove scenario_kpi from the schema script** — delete the `-- scenario_kpi — 场景 KPI 指标结果` block (`02-crew-roster.sql:1775-1790` create table + unique index) and the comments at 1815-1816.

- [ ] **Step 3: Remove scenario_kpi from the seed** — delete the `INSERT INTO scenario_kpi (...)` statements in `95-scenario-mock.sql` (157-183).

- [ ] **Step 4: Verify migration SQL on dev DB (dry-run read-only first)** — `psql "$DATABASE_URL" -c "begin; \i sql/migration/2026-08-14-drop-scenario-kpi.sql; rollback;"` (dev `f8_dev_live`). Confirm the backfill produces 8-row arrays and the drop is valid.

- [ ] **Step 5: Stage for review (no auto-commit)**

> **Deploy ordering (important):** this migration must run **before** the new live-server code is deployed, so `scenario_kpi` still holds the data to backfill. After migration + code deploy, `scenario_kpi` is gone and all KPI reads/writes use `scenario_result`.

---

### Task 6: gantt frontend

**Files:**
- Modify: `gantt/src/services/scenario-api.ts`（126-128）
- Modify: `gantt/src/stores/scenario-store.ts`
- Modify: `gantt/src/components/scenario/scenario-detail-panel.tsx`（40, 128）
- Modify: `gantt/src/components/scenario/scenario-kpi-section.tsx`（27, 1569, 1584）

- [ ] **Step 1: Remove `getKpis`** (`scenario-api.ts:126-128`)

```ts
  async getKpis(id: number): Promise<ScenarioKpi[]> {
    return api.get(`/api/scenario/${id}/kpi`) as Promise<ScenarioKpi[]>
  },
```
Delete. Remove `ScenarioKpi` from the import if it becomes unused.

- [ ] **Step 2: Remove `kpis` from `scenario-store.ts`**

Delete `kpis` from:
- state type + `kpis: []` initial value (line 178) and reset values (236, 285)
- the 3 `Promise.all([... scenarioApi.getKpis(id) ...])` fetches (151-158, 243-249, 269-276): drop the `getKpis` element, the `kpis` destructure, and the `kpis:` in the `set(...)` calls. Keep `results`.

- [ ] **Step 3: Remove `kpis` prop in `scenario-detail-panel.tsx`** — delete `const kpis = useScenarioStore((s) => s.kpis)` (40) and `kpis={kpis}` (128).

- [ ] **Step 4: Remove `kpis` fallback in `scenario-kpi-section.tsx`**
- Remove `kpis` from `ScenarioKpiSectionProps` (27) and the destructure (1569).
- Change line 1584 `const kpiRows = results?.kpi.length ? results.kpi : kpis` → `const kpiRows = results?.kpi ?? []`.

- [ ] **Step 5: Run gantt typecheck / build** — `cd gantt && npx tsc -b --noEmit` (or `npm run build`) compiles.

- [ ] **Step 6: Stage for review (no auto-commit)**

---

### Task 7: e2e mock cleanup

**Files:**
- Modify: 7 specs in `e2e/tests/gantt/`

- [ ] **Step 1: Remove `/api/scenario/:id/kpi` route mocks** in:
  - `scenario-toolbar-buttons.spec.ts:267`
  - `scenario-run-status-dot.spec.ts:81-82`
  - `scenario-kpi-results-canonical.spec.ts:153,194`
  - `scenario-pairing-info-follow-toolbar-tz.spec.ts:143`
  - `scenario-pairing-info-zless-timestamp.spec.ts:170`
  - `scenario-roster-edit.spec.ts:304`
  - `scenario-ground-task-open.spec.ts:112`

Delete the `page.route(...'/kpi'...)` lines and any now-unused `ok`/`wrap` helpers if they become orphaned.

- [ ] **Step 2: Grep to confirm** — `grep -rn "scenario/\$\\{.*\\}/kpi\|/api/scenario/\\d\\+/kpi" e2e/tests/gantt` → empty.

- [ ] **Step 3: Stage for review (no auto-commit)**

---

### Task 8: Tests update

**Files:**
- Modify: `live-server/src/__tests__/services/scenario/scenario-result-service.test.ts`（computeAndPersistKpis test at 396-541）
- Modify: `gantt/src/components/scenario/__tests__/scenario-kpi-section.test.tsx`

- [ ] **Step 1: Update the `computeAndPersistKpis` test (migration-gate regression)**

The test (`scenario-result-service.test.ts:396-541`) currently captures KPI rows via `fastify.db.insert(...).values(row)` into an `inserted` array (lines 442-489) and asserts on it. After the merge, `computeAndPersistKpis` writes via `scenario-result-store.upsertScenarioResultJson` instead. Concretely:

- Add a mock for the store module at the top of the file (next to the other `vi.mock` blocks):

```ts
const upsertScenarioResultJson = vi.fn(async () => undefined)
vi.mock('../../../services/scenario/scenario-result-store.js', () => ({
  upsertScenarioResultJson: (...args: unknown[]) => upsertScenarioResultJson(...args),
  ensureScenarioResultTable: vi.fn(async () => undefined),
  getScenarioResults: vi.fn(async () => ({ kpi: [], creditHours: [], uncovered: [], distribution: [], rawResult: null })),
}))
```

- In the `computeAndPersistKpis` test, capture the `'kpi'` payload:
```ts
    const inserted: Record<string, unknown>[] = upsertScenarioResultJson.mock.calls
      .filter(([, type]) => type === 'kpi')
      .map(([, , rows]) => (rows as Record<string, unknown>[])[0])
```
  (adjust the extraction to the exact call shape: `upsertScenarioResultJson(fastify, scenarioId, type, rows, username)` → `mock.calls[i]` is `[fastify, scenarioId, type, rows, username]`). If `mandayQuery` still feeds the mock, keep it — the store mock replaces the `fastify.db.insert` path entirely.
- Keep the existing 8-name/`idx`/value/description assertions (`Crew Utilized` `'4'`/`FO:3 / IFD:1`, `Pairing Coverage` `'100.0%'`/`3 / 3 planned slots`, etc.) against the captured payload. Remove the now-unused `fastify.db.insert` mock if nothing else uses it.

- The **syncScenarioPairingKpisFromDb test** (544-607) uses the same `inserted` capture and additionally relies on reading existing KPIs. Update it to:
  - Have `getScenarioResults` mock return the credit 4 rows (Crew Utilized/Assigned/Highest Credit/Avg Credit Hours).
  - Capture the `upsertScenarioResultJson` `'kpi'` payload.
  - Assert the merged payload still contains the credit 4 and the recomputed line/coverage 4 with updated values.

This updated test is the **migration-gate conflict regression**: it fails if a future change writes KPI back to `scenario_kpi` (which no longer has a model).

- [ ] **Step 2: Update `scenario-kpi-section.test.tsx`**

The `render(kpis, results, division)` helper passes `kpis` as a prop that no longer exists. Change the helper to build the results from the kpis arg so existing assertions keep meaning:
```tsx
const render = (kpis: ScenarioKpi[], results?: ScenarioResults, division?: string): HTMLDivElement => {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(<ScenarioKpiSection
      scenarioId={1}
      fileType="RO"
      results={results ?? { kpi: kpis, creditHours: [], uncovered: [], distribution: [], rawResult: null }}
      status="DONE"
      division={division}
    />)
  })
  return container
}
```
(Existing call sites pass kpis first — this keeps them valid while asserting the results-driven path.)

- [ ] **Step 3: Run the two test files**

Run: `cd live-server && npx vitest run src/__tests__/services/scenario/scenario-result-service.test.ts`
Run: `cd gantt && npx vitest run src/components/scenario/__tests__/scenario-kpi-section.test.tsx`
Expected: all PASS.

- [ ] **Step 4: Stage for review (no auto-commit)**

---

### Task 9: Full validation + stage for review

- [ ] **Step 1: Backend tests** — `cd live-server && npx vitest run src/__tests__/services/scenario/` → all PASS.
- [ ] **Step 2: Backend build** — `cd live-server && npm run build` → tsc clean.
- [ ] **Step 3: gantt tests** — `cd gantt && npx vitest run src/components/scenario/` → all PASS.
- [ ] **Step 4: gantt build/typecheck** — `cd gantt && npx tsc -b --noEmit`.
- [ ] **Step 5: UI gate** — `npm run check:ui` → 0 hard violations.
- [ ] **Step 6: Migration dry-run** — `psql "$DATABASE_URL" -c "begin; \\i sql/migration/2026-08-14-drop-scenario-kpi.sql; rollback;"` on dev `f8_dev_live`.
- [ ] **Step 7: Present the diff and await commit command** — list changed/created files, paste all PASS/FAIL receipts (§No-Illusion). Do NOT `git commit`/`git push` until commanded.
