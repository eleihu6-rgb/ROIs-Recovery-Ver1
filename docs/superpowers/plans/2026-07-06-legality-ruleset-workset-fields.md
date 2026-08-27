# Legality Ruleset Workset Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Legality rule-set creation so new and existing Legality worksets use `category='RULE'` and `type='R'`.

**Architecture:** Keep the invariant at the API boundary in `live-server/src/routes/rule/legality.ts`, because callers should not be able to create misclassified Legality worksets by omitting optional fields. Repair existing bad rows with a conservative idempotent SQL migration. Guard the route with a focused Vitest test that inspects the actual INSERT parameters.

**Tech Stack:** Fastify, TypeScript, node-postgres query mock, Vitest, PostgreSQL SQL migration.

---

### Task 1: Add the Route Regression Test

**Files:**
- Modify: `live-server/src/__tests__/unit/legality-ruleset-crud.test.ts`

- [ ] **Step 1: Update the existing create test to capture INSERT parameters**

Add a local `insertParams` variable in `POST /rulesets creates a workset (admin)`, assign it when SQL contains `INSERT INTO workset`, and assert the expected defaults:

```ts
let insertParams: unknown[] | null = null
const app = await build((sql, params) => {
  if (sql.includes('INSERT INTO workset')) {
    insertParams = params
    return { rows: [{ id: 900, name: 'My Set', category: 'RULE' }] }
  }
  return { rows: [] }
})
const res = await app.inject({ method: 'POST', url: '/rulesets', payload: { name: 'My Set', division: 'P' } })
expect(res.statusCode).toBe(200)
expect(insertParams).toEqual(['My Set', 'P', 'RULE', 'R', 'admin'])
expect(res.json().data).toMatchObject({ id: 900, name: 'My Set', category: 'RULE', ruleCount: 0, isDefault: false })
```

- [ ] **Step 2: Run the single test and verify it fails red**

Run:

```bash
cd live-server
npm test -- --run src/__tests__/unit/legality-ruleset-crud.test.ts -t "POST /rulesets creates a workset"
```

Expected: FAIL because current params contain `null` and `'CU'` instead of `'RULE'` and `'R'`.

### Task 2: Fix Backend Defaults

**Files:**
- Modify: `live-server/src/routes/rule/legality.ts`

- [ ] **Step 1: Change create defaults**

In `POST /rulesets`, replace the INSERT params for `category` and `type` with trimmed caller values falling back to the legality invariant:

```ts
[b.name.trim(), b.division?.trim() || 'P', b.category?.trim() || 'RULE', b.type?.trim() || 'R', userOf(request)]
```

- [ ] **Step 2: Run the route test and verify green**

Run:

```bash
cd live-server
npm test -- --run src/__tests__/unit/legality-ruleset-crud.test.ts
```

Expected: PASS for all `legality-ruleset-crud` tests.

### Task 3: Add Existing Data Repair Migration

**Files:**
- Create: `sql/migration/2026-07-06-legality-ruleset-workset-fields.sql`

- [ ] **Step 1: Add an idempotent migration**

Create this SQL file:

```sql
-- Migration: repair Legality-page workset category/type values.
--
-- New Legality rule sets must be workset.category='RULE' and workset.type='R'.
-- A backend default bug created empty rule-set worksets as category null / type 'CU',
-- making them disappear after refresh. This migration repairs those rows without
-- touching optimizer worksets (PO/RO/TO).

set search_path = f8;

begin;

update workset w
   set category = 'RULE',
       type = 'R',
       updated_by = 'migration',
       updated_at = now()
 where coalesce(w.type, '') not in ('PO', 'RO', 'TO')
   and (
        exists (select 1 from rule_set rs where rs.workset_id = w.id)
        or (coalesce(w.type, '') = 'CU' and (w.category is null or w.category = ''))
       );

commit;
```

- [ ] **Step 2: Inspect the migration for syntax and scope**

Run:

```bash
Get-Content sql/migration/2026-07-06-legality-ruleset-workset-fields.sql
```

Expected: SQL exactly limits updates away from `PO/RO/TO` and sets `RULE/R`.

### Task 4: Bump Backend Version

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Increment `BACKEND_VERSION`**

Change:

```ts
export const BACKEND_VERSION = 214  // PBS dashboard real data summary
```

to:

```ts
export const BACKEND_VERSION = 215  // Legality ruleset workset field defaults
```

### Task 5: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused live-server test**

Run:

```bash
cd live-server
npm test -- --run src/__tests__/unit/legality-ruleset-crud.test.ts
```

Expected: PASS.

- [ ] **Step 2: Review changed files**

Run:

```bash
git diff -- live-server/src/routes/rule/legality.ts live-server/src/__tests__/unit/legality-ruleset-crud.test.ts sql/migration/2026-07-06-legality-ruleset-workset-fields.sql gantt/src/version.ts docs/superpowers/specs/2026-07-06-legality-ruleset-workset-fields-design.md docs/superpowers/plans/2026-07-06-legality-ruleset-workset-fields.md
```

Expected: Diff only contains the route default fix, regression test, SQL repair, version bump, and approved docs.
