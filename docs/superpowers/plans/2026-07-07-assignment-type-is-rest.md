# Assignment Type is_rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `assignment.is_rest`, normalize `assignment.type` to `L/O/W/T/S`, and expose both through the existing live-server and Gantt Data tab surfaces.

**Architecture:** Keep `assignment.type` as a compact semantic taxonomy and leave `assignment_group` / `assignment_group_map` untouched as operational grouping tables. Use an idempotent SQL migration for existing schemas, update base DDL and seeds for new schemas, then expose the new field through the existing Drizzle model, Assignment CRUD route, data-maintenance save path, and Data tab config.

**Tech Stack:** PostgreSQL SQL migrations/seeds, Fastify + Drizzle + Zod in `live-server`, React/Vite TypeScript config in `gantt`, Vitest, root `npm run check:ui`.

---

## File Structure

- Modify `sql/schema/live/01-base.sql`: add `assignment.is_rest` to the base DDL and update comments for `assignment.type` and `assignment.is_rest`.
- Create `sql/migration/2026-07-07-assignment-type-is-rest.sql`: idempotently add/backfill `is_rest` and rewrite `assignment.type` values.
- Modify `sql/seed/01-dictionary.sql`: replace `ASSIGN_TYPE` dictionary rows with `L/O/W/T/S`.
- Modify `sql/seed/03-assignment.sql`: include `is_rest` in the seeded assignment insert and change seed `type` values to one-letter values.
- Modify `sql/migration/2026-06-15-assignment-add-fixed-credit.sql`: change inserted placeholder `type='OTH'` values to one-letter values so replayed migrations do not reintroduce invalid types.
- Modify `live-server/src/models/base/assignment.ts`: add `isRest`.
- Modify `live-server/src/routes/base/assignment.ts`: validate `isRest` on create/update.
- Modify `live-server/src/services/data/data-save-service.ts`: persist `isRest` from the Data tab save flow.
- Modify `gantt/src/config/data-entity-registry.ts`: update Assignment Type filter options and add/edit the `isRest` column.
- Add tests under `live-server/src/__tests__/services/data/` and/or update `live-server/src/__tests__/services/base/assignment-service.test.ts`.
- Add/update a focused Gantt config test if one already exists near `gantt/src/config`; otherwise rely on `npm run build` for type coverage and root `npm run check:ui`.

## Classification Constants

Use these SQL arrays consistently in the migration and when updating the fixed-credit migration values:

```sql
-- O = Off, rest
ARRAY['DO','GDO','TGDO','VGDO','BO','OBDO']::text[]

-- L = Leave, rest
ARRAY['AL','ALS','SL','ML','CL','PH','VAC','RVAC','ILL','ILADJ','LEAVE','MLOA','PATL','RCO','RSGN','UAV','UFF','UILL','UNMCS','UNS','UPD','WCB','WCNW']::text[]

-- T = Training, non-rest
ARRAY['TRN','SIM','CRE','TRNG','CBT','CRM','BMT','UBMT','FTG','UFTG','ACPG','EPTP','TDG','TGS','TTT']::text[]

-- S = Reserve, non-rest
ARRAY['SBY','ASBY','RES','PRAM','PRMM','PRPM','PRMOD','RESNQ']::text[]
```

Everything not matched by those arrays should become `W` with `is_rest = 0`.

### Task 1: Add Live-Server Persistence Tests

**Files:**
- Modify: `live-server/src/__tests__/services/data/data-save-service.test.ts` if it exists.
- Create: `live-server/src/__tests__/services/data/data-save-service-assignment.test.ts` if no focused data-save test exists.

- [ ] **Step 1: Locate the data-save test file**

Run:

```powershell
rg -n "DataSaveService|dataSaveService|entityId: 'assignment'" live-server\src\__tests__ live-server\tests -g "*.ts"
```

Expected: either an existing data-save test file appears, or no focused test exists and the new file above should be created.

- [ ] **Step 2: Write failing tests for `isRest` create/update persistence**

Add this focused Vitest coverage, adjusting only import paths if the chosen file location differs:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DataSaveService } from '../../../services/data/data-save-service.js'

vi.mock('../../../services/data/data-validation-service.js', () => ({
  dataValidationService: { validate: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../../../utils/audit.js', () => ({
  auditCreate: vi.fn((u: string) => ({ createdBy: u, createdAt: new Date('2026-07-07T00:00:00Z'), updatedBy: u, updatedAt: new Date('2026-07-07T00:00:00Z') })),
  auditUpdate: vi.fn((u: string) => ({ updatedBy: u, updatedAt: new Date('2026-07-07T00:00:00Z') })),
}))

vi.mock('../../../utils/cache.js', () => ({
  invalidatePattern: vi.fn(),
}))

const createFastify = () => {
  const insertValues = vi.fn().mockResolvedValue(undefined)
  const updateSet = vi.fn().mockReturnThis()
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const tx = {
    insert: vi.fn(() => ({ values: insertValues })),
    update: vi.fn(() => ({ set: updateSet, where: updateWhere })),
  }
  const fastify = {
    db: { transaction: vi.fn(async (cb: (txArg: typeof tx) => Promise<void>) => cb(tx)) },
    redis: {},
  } as any
  return { fastify, tx, insertValues, updateSet }
}

describe('DataSaveService assignment isRest', () => {
  it('persists isRest when creating an assignment', async () => {
    const { fastify, insertValues } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      entityId: 'assignment',
      action: 'create',
      after: {
        assignment: 'TESTOFF',
        description: 'Test Off',
        type: 'O',
        colorHex: 'CCCCCC',
        isRest: 1,
      },
    } as any], 'admin')

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      assignment: 'TESTOFF',
      type: 'O',
      isRest: 1,
    }))
  })

  it('persists isRest when updating an assignment', async () => {
    const { fastify, updateSet } = createFastify()
    const service = new DataSaveService()

    await service.save(fastify, [{
      entityId: 'assignment',
      action: 'update',
      rowId: 42,
      after: { isRest: 0, type: 'W' },
    } as any], 'admin')

    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({
      isRest: 0,
      type: 'W',
    }))
  })
})
```

- [ ] **Step 3: Run the new test and confirm it fails**

Run:

```powershell
cd live-server; npm test -- --run src/__tests__/services/data/data-save-service-assignment.test.ts
```

Expected: FAIL because `isRest` is not mapped in `DataSaveService` and/or the model yet.

### Task 2: Update SQL Schema, Seeds, and Migration

**Files:**
- Modify: `sql/schema/live/01-base.sql`
- Create: `sql/migration/2026-07-07-assignment-type-is-rest.sql`
- Modify: `sql/seed/01-dictionary.sql`
- Modify: `sql/seed/03-assignment.sql`
- Modify: `sql/migration/2026-06-15-assignment-add-fixed-credit.sql`

- [ ] **Step 1: Update base schema**

In `sql/schema/live/01-base.sql`, add the column after `type`:

```sql
    type                            varchar(3)      not null,
    is_rest                         smallint        not null default 0,
    color_hex                       varchar(6)      not null,
```

Replace the old `assignment.type` comment and add the new comment:

```sql
comment on column assignment.type              is '任务大类：L=Leave O=Off W=Work T=Training S=Reserve';
comment on column assignment.is_rest           is '休息标记：1=休息/非工作任务（type=L或O），0=非休息任务';
```

- [ ] **Step 2: Create the idempotent migration**

Create `sql/migration/2026-07-07-assignment-type-is-rest.sql` with this content:

```sql
-- =============================================================================
-- 2026-07-07 assignment: one-letter type taxonomy + is_rest
-- =============================================================================
-- Type taxonomy:
--   L = Leave, O = Off, W = Work, T = Training, S = Reserve
-- is_rest = 1 only for L/O. Reserve remains non-rest.
-- =============================================================================

ALTER TABLE assignment ADD COLUMN IF NOT EXISTS is_rest smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN assignment.type IS '任务大类：L=Leave O=Off W=Work T=Training S=Reserve';
COMMENT ON COLUMN assignment.is_rest IS '休息标记：1=休息/非工作任务（type=L或O），0=非休息任务';

WITH classified AS (
  SELECT
    id,
    CASE
      WHEN upper(assignment) = ANY (ARRAY['DO','GDO','TGDO','VGDO','BO','OBDO']::text[]) THEN 'O'
      WHEN upper(assignment) = ANY (ARRAY['AL','ALS','SL','ML','CL','PH','VAC','RVAC','ILL','ILADJ','LEAVE','MLOA','PATL','RCO','RSGN','UAV','UFF','UILL','UNMCS','UNS','UPD','WCB','WCNW']::text[]) THEN 'L'
      WHEN upper(assignment) = ANY (ARRAY['TRN','SIM','CRE','TRNG','CBT','CRM','BMT','UBMT','FTG','UFTG','ACPG','EPTP','TDG','TGS','TTT']::text[]) THEN 'T'
      WHEN upper(assignment) = ANY (ARRAY['SBY','ASBY','RES','PRAM','PRMM','PRPM','PRMOD','RESNQ']::text[]) THEN 'S'
      WHEN upper(type) IN ('L','O','W','T','S') THEN upper(type)
      WHEN upper(type) = 'LVE' THEN 'L'
      WHEN upper(type) = 'TRN' THEN 'T'
      WHEN upper(type) IN ('SBY','RES') THEN 'S'
      ELSE 'W'
    END AS next_type
  FROM assignment
)
UPDATE assignment a
SET
  type = c.next_type,
  is_rest = CASE WHEN c.next_type IN ('L','O') THEN 1 ELSE 0 END,
  updated_at = now(),
  updated_by = 'assignment_type_migration'
FROM classified c
WHERE a.id = c.id
  AND (
    a.type IS DISTINCT FROM c.next_type
    OR a.is_rest IS DISTINCT FROM CASE WHEN c.next_type IN ('L','O') THEN 1 ELSE 0 END
  );
```

- [ ] **Step 3: Update dictionary seed**

In `sql/seed/01-dictionary.sql`, replace the five `ASSIGN_TYPE` child rows with:

```sql
    ('ASSIGN_TYPE', 'L', 'Leave',    1, 'L'),
    ('ASSIGN_TYPE', 'O', 'Off',      2, 'O'),
    ('ASSIGN_TYPE', 'W', 'Work',     3, 'W'),
    ('ASSIGN_TYPE', 'T', 'Training', 4, 'T'),
    ('ASSIGN_TYPE', 'S', 'Reserve',  5, 'S')
```

- [ ] **Step 4: Update assignment seed insert shape**

In `sql/seed/03-assignment.sql`, change:

```sql
INSERT INTO assignment (assignment, description, type, color_hex, label, standalone, bt_pct, credit_pct, fdp_pct, dp_pct, is_adhoc, default_location, is_recency, ft_pct, is_qualifier, wp_pct, divide_crew_manday, reca_label, default_assignment_group, dp_gap) VALUES
```

to:

```sql
INSERT INTO assignment (assignment, description, type, is_rest, color_hex, label, standalone, bt_pct, credit_pct, fdp_pct, dp_pct, is_adhoc, default_location, is_recency, ft_pct, is_qualifier, wp_pct, divide_crew_manday, reca_label, default_assignment_group, dp_gap) VALUES
```

Then update every row to include the fourth value. Examples:

```sql
('FLT',  'Flight',       'W', 0, '4A90D9', 'F',   'N', 1.00, 1.00, 1.00, 1.00, 0, null, 1, 1.00, 0, 1.00, 'E', 'Y', 'FLT', 0),
('TRN',  'Training',     'T', 0, '7B68EE', 'T',   'Y', 0.00, 1.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'TRN', 0),
('SBY',  'Standby',      'S', 0, '66CDAA', 'SBY', 'Y', 0.00, 0.50, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'SBY', 0),
('DO',   'Day Off',      'O', 1, 'E6E6E6', 'DO',  'Y', 0.00, 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE', 0),
('AL',   'Annual Leave', 'L', 1, '90EE90', 'AL',  'Y', 0.00, 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE', 0)
```

Use `W` for `FLT`, `IOE`, `DH`, `PAX`, `OFC`, `BRF`, `MTG`, `MED`; use `T` for `TRN`, `SIM`, `CRE`; use `S` for `SBY`, `ASBY`, `RES`; use `O` only for `DO`; use `L` for `AL`, `SL`, `ML`, `CL`, `PH`.

- [ ] **Step 5: Update the fixed-credit migration insert values**

In `sql/migration/2026-06-15-assignment-add-fixed-credit.sql`, replace each `type` literal in the inserted rows using the classification constants. For example:

```sql
('ACPG', 'ACPG', 'T', 'CCCCCC', 240),
('ADM', 'ADM', 'W', 'CCCCCC', 240),
('AL', 'AL', 'L', 'CCCCCC', 0),
('BO', 'BO', 'O', 'CCCCCC', 0),
('PRAM', 'PRAM', 'S', 'CCCCCC', 240),
('VAC', 'VAC', 'L', 'CCCCCC', 240),
('VGDO', 'VGDO', 'O', 'CCCCCC', 0)
```

Do not add `is_rest` to this old migration insert. Existing and newly inserted rows are normalized by `2026-07-07-assignment-type-is-rest.sql`, which runs after this migration.

- [ ] **Step 6: Static-check SQL for invalid type literals**

Run:

```powershell
rg -n "'(FLY|GRD|LVE|SBY|TRN|RES|OTH)'[,)]" sql\seed\01-dictionary.sql sql\seed\03-assignment.sql sql\migration\2026-06-15-assignment-add-fixed-credit.sql sql\migration\2026-07-07-assignment-type-is-rest.sql
```

Expected: no results for assignment `type` values. Results inside rule JSON or assignment groups are not part of this command's file scope except `SBY`/`RES` assignment codes in fixed-credit rows; inspect any hit and confirm it is not a `type` literal.

### Task 3: Update Live-Server Model, Route, and Data Save

**Files:**
- Modify: `live-server/src/models/base/assignment.ts`
- Modify: `live-server/src/routes/base/assignment.ts`
- Modify: `live-server/src/services/data/data-save-service.ts`

- [ ] **Step 1: Run model/API tests before implementation**

Run:

```powershell
cd live-server; npm test -- --run src/__tests__/services/data/data-save-service-assignment.test.ts
```

Expected: FAIL from Task 1.

- [ ] **Step 2: Add `isRest` to Drizzle model**

In `live-server/src/models/base/assignment.ts`, add after `type`:

```ts
  type: varchar('type', { length: 3 }).notNull(),
  isRest: smallint('is_rest').notNull().default(0),
  colorHex: varchar('color_hex', { length: 6 }).notNull(),
```

- [ ] **Step 3: Add `isRest` route validation**

In `live-server/src/routes/base/assignment.ts`, add after `type`:

```ts
  type: z.enum(['L', 'O', 'W', 'T', 'S']),
  isRest: z.number().int().min(0).max(1).default(0),
  colorHex: z.string().max(6),
```

Keep `updateAssignmentSchema = createAssignmentSchema.partial()` so partial updates work.

- [ ] **Step 4: Persist `isRest` in DataSaveService create**

In the `assignment` create block in `live-server/src/services/data/data-save-service.ts`, add:

```ts
            isRest: (toNum(after.isRest ?? after.is_rest) ?? 0) as number,
```

Place it immediately after `type`.

- [ ] **Step 5: Persist `isRest` in DataSaveService update**

In the `assignment` update block, add:

```ts
              isRest: after.isRest != null || after.is_rest != null ? (toNum(after.isRest ?? after.is_rest) as number | undefined) : undefined,
```

Place it immediately after `type`.

- [ ] **Step 6: Re-run the focused test**

Run:

```powershell
cd live-server; npm test -- --run src/__tests__/services/data/data-save-service-assignment.test.ts
```

Expected: PASS.

### Task 4: Update Gantt Data Tab Config

**Files:**
- Modify: `gantt/src/config/data-entity-registry.ts`

- [ ] **Step 1: Update Assignment Type filter options**

In `assignmentEntity.filterFields`, replace the old options with:

```ts
        { label: 'L - Leave', value: 'L' },
        { label: 'O - Off', value: 'O' },
        { label: 'W - Work', value: 'W' },
        { label: 'T - Training', value: 'T' },
        { label: 'S - Reserve', value: 'S' },
```

- [ ] **Step 2: Make the `type` column a select**

Replace the existing `type` column with:

```ts
    {
      key: 'type',
      dbField: 'type',
      label: 'Type',
      type: 'select',
      required: true,
      maxLength: 1,
      options: [
        { label: 'L - Leave', value: 'L' },
        { label: 'O - Off', value: 'O' },
        { label: 'W - Work', value: 'W' },
        { label: 'T - Training', value: 'T' },
        { label: 'S - Reserve', value: 'S' },
      ],
    },
```

- [ ] **Step 3: Add `isRest` boolean column**

Add immediately after the `type` column:

```ts
    { key: 'isRest', dbField: 'is_rest', label: 'Rest', type: 'boolean' },
```

- [ ] **Step 4: Run Gantt type/build check**

Run:

```powershell
cd gantt; npm run build
```

Expected: PASS.

### Task 5: Version Bump and Verification

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump backend and frontend versions**

Because this change touches backend/schema and Gantt frontend config, increment both exported counters in `gantt/src/version.ts` by 1. Example shape:

```ts
export const BACKEND_VERSION = <previous + 1>
export const FRONTEND_VERSION = <previous + 1>
```

- [ ] **Step 2: Run focused live-server tests**

Run:

```powershell
cd live-server; npm test -- --run src/__tests__/services/data/data-save-service-assignment.test.ts src/__tests__/services/base/assignment-service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run live-server build**

Run:

```powershell
cd live-server; npm run build
```

Expected: PASS.

- [ ] **Step 4: Run Gantt build**

Run:

```powershell
cd gantt; npm run build
```

Expected: PASS.

- [ ] **Step 5: Run UI standard gate**

Run:

```powershell
npm run check:ui
```

Expected: PASS with hard violations equal to 0.

- [ ] **Step 6: Run final scope checks**

Run:

```powershell
git diff --stat
git status --short
```

Expected: only the planned files are modified/created.

If GitNexus tools are available in the execution session, run `detect_changes({scope: "compare", base_ref: "main"})` before committing. If they are still unavailable, note the fallback explicitly in the final response.

### Task 6: Commit Implementation

**Files:**
- All files modified by Tasks 1-5.

- [ ] **Step 1: Review full diff**

Run:

```powershell
git diff -- sql live-server gantt docs/superpowers/plans/2026-07-07-assignment-type-is-rest.md
```

Expected: diff matches this plan; no unrelated refactors.

- [ ] **Step 2: Stage implementation files**

Run:

```powershell
git add sql/schema/live/01-base.sql sql/migration/2026-07-07-assignment-type-is-rest.sql sql/seed/01-dictionary.sql sql/seed/03-assignment.sql sql/migration/2026-06-15-assignment-add-fixed-credit.sql live-server/src/models/base/assignment.ts live-server/src/routes/base/assignment.ts live-server/src/services/data/data-save-service.ts live-server/src/__tests__/services/data/data-save-service-assignment.test.ts gantt/src/config/data-entity-registry.ts gantt/src/version.ts docs/superpowers/plans/2026-07-07-assignment-type-is-rest.md
```

Expected: files stage successfully. If the test file was added to a different existing path, stage that exact path instead.

- [ ] **Step 3: Commit**

Run:

```powershell
git commit -m "feat: add assignment rest taxonomy"
```

Expected: commit succeeds.

## Self-Review Notes

- Spec coverage: schema column, type comment, migration, dictionary seed, assignment seed, fixed-credit migration, Drizzle model, route validation, Data tab config, tests, and verification are covered.
- Scope: `assignment_group`, `assignment_group_map`, `roster_flight.assignment`, and `roster_flight.assignment_group` are explicitly untouched.
- Risk: ambiguous fixed-credit assignment codes default to `W`; this avoids incorrectly marking work as rest.
- GitNexus: MCP tools were not exposed during plan creation and `.gitnexus/run.cjs` was absent. Execution should retry if tools become available; otherwise use `rg`/diff/build/test evidence and report the fallback.
