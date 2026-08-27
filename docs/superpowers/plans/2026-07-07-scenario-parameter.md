# Scenario Parameter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add template-driven Scenario optimization parameters that planners edit in Scenario detail and that are exported to the optimizer as effective parameter values.

**Architecture:** `scenario_id = 0` rows in `scenario_parameter` are the template authority. Live-server owns merge, validation, persistence, duplicate-copy, and ro_input export. Gantt loads parameters lazily from the Scenario detail panel and saves only scenario-specific `{ value }` rows.

**Tech Stack:** PostgreSQL 16, Drizzle ORM, Fastify, Zod, React 19, Zustand-style service calls, `@rois/ui` `AppDialog`, Vitest, Playwright.

---

## File Structure

- Create `sql/migration/2026-07-07-scenario-parameter.sql`: idempotent table, unique constraint, index, and initial template seed rows.
- Modify `sql/schema/live/02-crew-roster.sql`: add canonical table definition near `scenario_kpi`.
- Create `live-server/src/models/scenario/scenario-parameter.ts`: Drizzle model for the table.
- Modify `live-server/src/models/index.ts`: export the new model.
- Create `live-server/src/services/scenario/scenario-parameter-service.ts`: merge template/defaults, validate value shape, save values, copy on duplicate, export effective rows.
- Modify `live-server/src/routes/scenario/scenario.ts`: add `GET` and `PUT` scenario parameter endpoints.
- Modify `live-server/src/services/scenario/scenario-service.ts`: call copy-on-duplicate after new scenario creation.
- Modify `live-server/src/services/scenario/scenario-export-service.ts`: append `scenario_parameter` effective section.
- Create `live-server/src/__tests__/services/scenario-parameter-service.test.ts`: service tests for merge, save, reject unknown code, duplicate copy, export rows.
- Modify `live-server/src/__tests__/services/scenario/scenario-export-service.test.ts`: verify export includes `scenario_parameter`.
- Modify `gantt/src/types/scenario.ts`: add scenario parameter DTO types.
- Modify `gantt/src/services/scenario-api.ts`: add `getParameters` and `saveParameters`.
- Create `gantt/src/components/scenario/scenario-parameters-dialog.tsx`: AppDialog editor for OBJ and LIST values.
- Modify `gantt/src/components/scenario/scenario-basic-info.tsx`: add summary row above Comment and open dialog.
- Modify `gantt/src/version.ts`: increment `FRONTEND_VERSION` and `BACKEND_VERSION`.
- Create `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`: render/edit/save tests.
- Create `e2e/tests/gantt/scenario-parameters.spec.ts`: real UI regression test.

## Task 1: Database And Model

**Files:**
- Create: `sql/migration/2026-07-07-scenario-parameter.sql`
- Modify: `sql/schema/live/02-crew-roster.sql`
- Create: `live-server/src/models/scenario/scenario-parameter.ts`
- Modify: `live-server/src/models/index.ts`

- [ ] **Step 1: Run impact checks for touched symbols**

Run:

```powershell
node .gitnexus\run.cjs impact --target scenario --direction upstream
node .gitnexus\run.cjs impact --target scenarioKpi --direction upstream
```

Expected: command completes or reports no indexed symbol for the new model. If risk is HIGH or CRITICAL, stop and report the blast radius before editing.

- [ ] **Step 2: Write the migration**

Create `sql/migration/2026-07-07-scenario-parameter.sql`:

```sql
create table if not exists scenario_parameter (
  id bigint generated always as identity primary key,
  created_by varchar(30) default 'system' not null,
  created_at timestamp default now() not null,
  updated_by varchar(30) default 'system' not null,
  updated_at timestamp default now() not null,
  scenario_id bigint default 0 not null,
  code varchar(200) not null,
  param_val jsonb default '{}'::jsonb not null,
  description varchar(300),
  idx int,
  type varchar(50),
  constraint uq_scenario_parameter_code unique (scenario_id, code)
);

create index if not exists ix_scenario_parameter_list
  on scenario_parameter (scenario_id, idx, code);

insert into scenario_parameter (scenario_id, code, param_val, description, idx, type)
values
  (
    0,
    'solver_limits',
    '{
      "schema": {
        "maxIterations": {"type": "number", "label": "Max Iterations", "min": 1},
        "enableReserve": {"type": "boolean", "label": "Enable Reserve"}
      },
      "defaultValue": {"maxIterations": 100, "enableReserve": true}
    }'::jsonb,
    'Limits used by optimization',
    10,
    'OBJ'
  ),
  (
    0,
    'solver_csv_overrides',
    '{
      "schema": {"format": "csv", "label": "CSV Overrides"},
      "defaultValue": {"csv": ""}
    }'::jsonb,
    'CSV-style solver override data',
    20,
    'LIST'
  )
on conflict (scenario_id, code) do nothing;
```

- [ ] **Step 3: Mirror the table in the canonical live schema**

Add the same `create table scenario_parameter` block near `scenario_kpi` in `sql/schema/live/02-crew-roster.sql`, followed by:

```sql
create unique index uq_scenario_parameter_code on scenario_parameter (scenario_id, code);
create index ix_scenario_parameter_list on scenario_parameter (scenario_id, idx, code);
comment on table scenario_parameter is 'Scenario optimization parameter templates and per-scenario values';
comment on column scenario_parameter.scenario_id is '0 = template row; >0 = scenario-specific value row';
comment on column scenario_parameter.type is 'UI editor type: OBJ structured object, LIST list/table/CSV value';
```

- [ ] **Step 4: Add the Drizzle model**

Create `live-server/src/models/scenario/scenario-parameter.ts`:

```typescript
import { pgTable, bigint, varchar, integer, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const scenarioParameter = pgTable('scenario_parameter', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  scenarioId: bigint('scenario_id', { mode: 'number' }).notNull().default(0),
  code: varchar('code', { length: 200 }).notNull(),
  paramVal: jsonb('param_val').notNull().default({}),
  description: varchar('description', { length: 300 }),
  idx: integer('idx'),
  type: varchar('type', { length: 50 }),
}, (table) => [
  uniqueIndex('uq_scenario_parameter_code').on(table.scenarioId, table.code),
  index('ix_scenario_parameter_list').on(table.scenarioId, table.idx, table.code),
])
```

- [ ] **Step 5: Export the model**

In `live-server/src/models/index.ts`, add:

```typescript
export { scenarioParameter } from './scenario/scenario-parameter'
```

- [ ] **Step 6: Commit database/model changes**

Run:

```powershell
git diff --check
git add sql/migration/2026-07-07-scenario-parameter.sql sql/schema/live/02-crew-roster.sql live-server/src/models/scenario/scenario-parameter.ts live-server/src/models/index.ts
git commit -m "feat: add scenario parameter model"
```

Expected: commit succeeds.

## Task 2: Backend Service And API

**Files:**
- Create: `live-server/src/services/scenario/scenario-parameter-service.ts`
- Create: `live-server/src/__tests__/services/scenario-parameter-service.test.ts`
- Modify: `live-server/src/routes/scenario/scenario.ts`

- [ ] **Step 1: Run impact checks**

Run:

```powershell
node .gitnexus\run.cjs impact --target scenarioRoutes --direction upstream
node .gitnexus\run.cjs impact --target scenarioService --direction upstream
```

Expected: command completes. If risk is HIGH or CRITICAL, report the blast radius before editing.

- [ ] **Step 2: Write failing service tests**

Create `live-server/src/__tests__/services/scenario-parameter-service.test.ts` with tests named exactly:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { scenarioParameterService } from '../../services/scenario/scenario-parameter-service'

describe('scenarioParameterService', () => {
  it('merges template defaults without inserting scenario rows', async () => {
    const fastify = makeFastify([
      templateRow('solver_limits', 'OBJ', { defaultValue: { maxIterations: 100 }, schema: { maxIterations: { type: 'number' } } }),
    ], [])

    const result = await scenarioParameterService.getMerged(fastify as never, 42)

    expect(result.summary).toEqual({ templateCount: 1, configuredCount: 0 })
    expect(result.items[0]).toMatchObject({ code: 'solver_limits', value: { maxIterations: 100 }, hasScenarioValue: false })
    expect(fastify.db.insert).not.toHaveBeenCalled()
  })

  it('rejects an unknown code on save', async () => {
    const fastify = makeFastify([templateRow('solver_limits', 'OBJ', { defaultValue: {}, schema: {} })], [])

    await expect(scenarioParameterService.saveValues(fastify as never, 42, [{ code: 'bad_code', value: {} }], 'Ryan'))
      .rejects.toThrow('Unsupported scenario parameter code: bad_code')
  })

  it('stores only value JSON when saving scenario rows', async () => {
    const fastify = makeFastify([templateRow('solver_limits', 'OBJ', { defaultValue: { maxIterations: 100 }, schema: { maxIterations: { type: 'number' } } })], [])

    await scenarioParameterService.saveValues(fastify as never, 42, [{ code: 'solver_limits', value: { maxIterations: 120 } }], 'Ryan')

    expect(fastify.db.insert).toHaveBeenCalled()
    expect(fastify.lastInsertValues[0].paramVal).toEqual({ value: { maxIterations: 120 } })
  })
})
```

Include helper factories in the same test file:

```typescript
function templateRow(code: string, type: string, paramVal: Record<string, unknown>) {
  return { id: 1, scenarioId: 0, code, type, description: null, idx: 10, paramVal }
}

function makeFastify(templateRows: unknown[], scenarioRows: unknown[]) {
  const fastify: Record<string, unknown> = { lastInsertValues: [] }
  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => Promise.resolve(templateRows)),
    orderBy: vi.fn(() => Promise.resolve(templateRows)),
  }
  fastify.db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => ({
      values: vi.fn((values) => {
        fastify.lastInsertValues = Array.isArray(values) ? values : [values]
        return { onConflictDoUpdate: vi.fn(() => Promise.resolve()) }
      }),
    })),
  }
  fastify.pgPool = {
    query: vi.fn(async (sqlText: string) => {
      if (sqlText.includes('scenario_id = 0')) return { rows: templateRows }
      return { rows: scenarioRows }
    }),
  }
  return fastify
}
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```powershell
cd live-server
npm test -- src/__tests__/services/scenario-parameter-service.test.ts
```

Expected: FAIL because `scenario-parameter-service` does not exist.

- [ ] **Step 4: Implement the service**

Create `live-server/src/services/scenario/scenario-parameter-service.ts` with exported methods:

```typescript
export interface ScenarioParameterItem {
  code: string
  type: 'OBJ' | 'LIST'
  description: string | null
  idx: number | null
  schema: Record<string, unknown>
  defaultValue: unknown
  value: unknown
  hasScenarioValue: boolean
}

export interface ScenarioParameterSaveItem {
  code: string
  value: unknown
}

export const scenarioParameterService = {
  async getMerged(fastify: FastifyInstance, scenarioId: number): Promise<{ items: ScenarioParameterItem[]; summary: { templateCount: number; configuredCount: number } }> {
    const templates = await readRows(fastify, 0)
    const scenarioRows = scenarioId > 0 ? await readRows(fastify, scenarioId) : []
    const scenarioByCode = new Map(scenarioRows.map((row) => [row.code, row]))
    const items = templates.map((template) => mergeRow(template, scenarioByCode.get(template.code)))
    return {
      items,
      summary: {
        templateCount: items.length,
        configuredCount: items.filter((item) => item.hasScenarioValue).length,
      },
    }
  },

  async saveValues(fastify: FastifyInstance, scenarioId: number, items: ScenarioParameterSaveItem[], username: string): Promise<void> {
    if (scenarioId <= 0) throw new Error('Scenario parameter templates cannot be edited here')
    const templates = await readRows(fastify, 0)
    const templateByCode = new Map(templates.map((row) => [row.code, row]))
    const rows = items.map((item) => {
      const template = templateByCode.get(item.code)
      if (!template) throw new Error(`Unsupported scenario parameter code: ${item.code}`)
      validateValue(template, item.value)
      return {
        scenarioId,
        code: template.code,
        paramVal: { value: item.value },
        description: template.description,
        idx: template.idx,
        type: template.type,
        createdBy: username,
        updatedBy: username,
      }
    })
    if (rows.length === 0) return
    await fastify.db.insert(scenarioParameter).values(rows).onConflictDoUpdate({
      target: [scenarioParameter.scenarioId, scenarioParameter.code],
      set: {
        paramVal: sql`excluded.param_val`,
        description: sql`excluded.description`,
        idx: sql`excluded.idx`,
        type: sql`excluded.type`,
        updatedBy: username,
        updatedAt: new Date(),
      },
    })
  },
}
```

Add these helpers in the same file:

```typescript
interface ScenarioParameterRow {
  id: number
  scenarioId: number
  code: string
  paramVal: Record<string, unknown>
  description: string | null
  idx: number | null
  type: string | null
}

const readRows = async (fastify: FastifyInstance, scenarioId: number): Promise<ScenarioParameterRow[]> => {
  const rows = await fastify.db
    .select()
    .from(scenarioParameter)
    .where(eq(scenarioParameter.scenarioId, scenarioId))
    .orderBy(asc(scenarioParameter.idx), asc(scenarioParameter.code))
  return rows as ScenarioParameterRow[]
}

const mergeRow = (template: ScenarioParameterRow, scenarioRow?: ScenarioParameterRow): ScenarioParameterItem => {
  const schema = (template.paramVal.schema ?? {}) as Record<string, unknown>
  const defaultValue = template.paramVal.defaultValue ?? {}
  const scenarioValue = (scenarioRow?.paramVal.value ?? undefined) as unknown
  return {
    code: template.code,
    type: template.type === 'LIST' ? 'LIST' : 'OBJ',
    description: template.description,
    idx: template.idx,
    schema,
    defaultValue,
    value: scenarioValue ?? defaultValue,
    hasScenarioValue: Boolean(scenarioRow),
  }
}

const validateValue = (template: ScenarioParameterRow, value: unknown): void => {
  if (template.type === 'LIST') {
    const obj = value as { csv?: unknown; rows?: unknown }
    const format = (template.paramVal.schema as { format?: string } | undefined)?.format
    if (format === 'csv' && typeof obj?.csv === 'string') return
    if (format === 'rows' && Array.isArray(obj?.rows)) return
    throw new Error(`Invalid LIST value for scenario parameter code: ${template.code}`)
  }
  const schema = (template.paramVal.schema ?? {}) as Record<string, { type?: string; optional?: boolean }>
  const obj = value as Record<string, unknown>
  for (const [field, def] of Object.entries(schema)) {
    const fieldValue = obj[field]
    if (fieldValue == null && def.optional !== true) throw new Error(`Missing parameter field: ${template.code}.${field}`)
    if (fieldValue == null) continue
    if (def.type === 'number' && typeof fieldValue !== 'number') throw new Error(`Invalid number field: ${template.code}.${field}`)
    if (def.type === 'boolean' && typeof fieldValue !== 'boolean') throw new Error(`Invalid boolean field: ${template.code}.${field}`)
    if ((def.type === 'string' || def.type === 'select') && typeof fieldValue !== 'string') throw new Error(`Invalid string field: ${template.code}.${field}`)
  }
  for (const key of Object.keys(obj)) {
    if (!(key in schema)) throw new Error(`Unknown parameter field: ${template.code}.${key}`)
  }
}
```

- [ ] **Step 5: Add routes**

In `live-server/src/routes/scenario/scenario.ts`, import the service and add routes before `/:id` generic routes:

```typescript
import { scenarioParameterService } from '../../services/scenario/scenario-parameter-service.js'

fastify.get('/:id/parameters', async (request, reply) => {
  const { id } = request.params as { id: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  const sc = await scenarioService.getById(fastify, numId)
  if (!sc) return fail(reply, 404, 'Scenario not found')
  const result = await scenarioParameterService.getMerged(fastify, numId)
  return success(reply, result)
})

fastify.put('/:id/parameters', async (request, reply) => {
  const { id } = request.params as { id: string }
  const numId = Number(id)
  if (Number.isNaN(numId)) return fail(reply, 400, 'Invalid id')
  const sc = await scenarioService.getById(fastify, numId)
  if (!sc) return fail(reply, 404, 'Scenario not found')
  if (sc.status === 'RUNNING') return fail(reply, 409, 'Scenario parameters cannot be changed while optimization is running')
  const parsed = z.object({
    items: z.array(z.object({ code: z.string().min(1), value: z.unknown() })),
  }).safeParse(request.body)
  if (!parsed.success) return fail(reply, 400, parsed.error.message)
  await scenarioParameterService.saveValues(fastify, numId, parsed.data.items, getAuthUsername(request))
  return success(reply, await scenarioParameterService.getMerged(fastify, numId))
})
```

- [ ] **Step 6: Run focused backend tests**

Run:

```powershell
cd live-server
npm test -- src/__tests__/services/scenario-parameter-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit backend API changes**

Run:

```powershell
git diff --check
git add live-server/src/services/scenario/scenario-parameter-service.ts live-server/src/__tests__/services/scenario-parameter-service.test.ts live-server/src/routes/scenario/scenario.ts
git commit -m "feat: add scenario parameter api"
```

Expected: commit succeeds.

## Task 3: Duplicate And Export

**Files:**
- Modify: `live-server/src/services/scenario/scenario-service.ts`
- Modify: `live-server/src/services/scenario/scenario-export-service.ts`
- Modify: `live-server/src/__tests__/services/scenario/scenario-service.test.ts`
- Modify: `live-server/src/__tests__/services/scenario-parameter-service.test.ts`

- [ ] **Step 1: Add duplicate-copy test**

In `live-server/src/__tests__/services/scenario/scenario-service.test.ts`, add a test that stubs `scenarioParameterService.copyValues` and asserts it is called with source id and created id:

```typescript
it('copies scenario parameter values when duplicating a scenario', async () => {
  const copySpy = vi.spyOn(scenarioParameterService, 'copyValues').mockResolvedValue(undefined)
  const result = await scenarioService.duplicate(fastify as never, 10, 'Ryan')
  expect(result.id).toBe(11)
  expect(copySpy).toHaveBeenCalledWith(fastify, 10, 11, 'Ryan')
})
```

- [ ] **Step 2: Implement copyValues**

Add to `scenarioParameterService`:

```typescript
async copyValues(fastify: FastifyInstance, sourceScenarioId: number, targetScenarioId: number, username: string): Promise<void> {
  const sourceRows = await readRows(fastify, sourceScenarioId)
  if (sourceRows.length === 0) return
  await fastify.db.insert(scenarioParameter).values(sourceRows.map((row) => ({
    scenarioId: targetScenarioId,
    code: row.code,
    paramVal: row.paramVal,
    description: row.description,
    idx: row.idx,
    type: row.type,
    createdBy: username,
    updatedBy: username,
  })))
}
```

- [ ] **Step 3: Call copyValues from duplicate**

In `scenarioService.duplicate`, after `const created = await this.create(...)`, call:

```typescript
await scenarioParameterService.copyValues(fastify, id, created.id, username)
return created
```

- [ ] **Step 4: Add export effective rows helper**

Add to `scenarioParameterService`:

```typescript
async getEffectiveExportRows(fastify: FastifyInstance, scenarioId: number): Promise<Record<string, unknown>[]> {
  const merged = await this.getMerged(fastify, scenarioId)
  return merged.items.map((item) => ({
    scenario_id: scenarioId,
    code: item.code,
    param_val: JSON.stringify({ value: item.value }),
    description: item.description,
    idx: item.idx,
    type: item.type,
  }))
}
```

- [ ] **Step 5: Export scenario_parameter section**

In `scenario-export-service.ts`, import `scenarioParameterService` and append a non-SQL section after `Promise.all(SPECS...)`:

```typescript
const parameterRows = await scenarioParameterService.getEffectiveExportRows(fastify, scenario.id)
sections.push(toCsvSection('scenario_parameter', parameterRows))
```

- [ ] **Step 6: Run focused export and duplicate tests**

Run:

```powershell
cd live-server
npm test -- src/__tests__/services/scenario/scenario-service.test.ts src/__tests__/services/scenario-parameter-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit duplicate/export changes**

Run:

```powershell
git diff --check
git add live-server/src/services/scenario/scenario-service.ts live-server/src/services/scenario/scenario-export-service.ts live-server/src/services/scenario/scenario-parameter-service.ts live-server/src/__tests__/services/scenario/scenario-service.test.ts live-server/src/__tests__/services/scenario-parameter-service.test.ts
git commit -m "feat: export scenario parameters"
```

Expected: commit succeeds.

## Task 4: Frontend Types, API, And Dialog

**Files:**
- Modify: `gantt/src/types/scenario.ts`
- Modify: `gantt/src/services/scenario-api.ts`
- Create: `gantt/src/components/scenario/scenario-parameters-dialog.tsx`
- Modify: `gantt/src/components/scenario/scenario-basic-info.tsx`
- Create: `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`

- [ ] **Step 1: Write frontend dialog test**

Create `gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`:

```typescript
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioParametersDialog } from '../scenario-parameters-dialog'
import { scenarioApi } from '@/services/scenario-api'

vi.mock('@/services/scenario-api', () => ({
  scenarioApi: {
    getParameters: vi.fn(),
    saveParameters: vi.fn(),
  },
}))

describe('ScenarioParametersDialog', () => {
  it('edits OBJ and LIST values and saves them', async () => {
    vi.mocked(scenarioApi.getParameters).mockResolvedValue({
      items: [
        {
          code: 'solver_limits',
          type: 'OBJ',
          description: 'Limits',
          idx: 10,
          schema: { maxIterations: { type: 'number', label: 'Max Iterations' } },
          defaultValue: { maxIterations: 100 },
          value: { maxIterations: 100 },
          hasScenarioValue: false,
        },
        {
          code: 'solver_csv_overrides',
          type: 'LIST',
          description: 'CSV',
          idx: 20,
          schema: { format: 'csv', label: 'CSV Overrides' },
          defaultValue: { csv: '' },
          value: { csv: 'a,b' },
          hasScenarioValue: false,
        },
      ],
      summary: { templateCount: 2, configuredCount: 0 },
    })
    vi.mocked(scenarioApi.saveParameters).mockResolvedValue({
      items: [],
      summary: { templateCount: 2, configuredCount: 2 },
    })

    render(<ScenarioParametersDialog scenarioId={42} open onOpenChange={() => undefined} disabled={false} />)

    const numberInput = await screen.findByLabelText('Max Iterations')
    fireEvent.change(numberInput, { target: { value: '120' } })
    fireEvent.change(screen.getByLabelText('CSV Overrides'), { target: { value: 'x,y' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(scenarioApi.saveParameters).toHaveBeenCalledWith(42, {
        items: [
          { code: 'solver_limits', value: { maxIterations: 120 } },
          { code: 'solver_csv_overrides', value: { csv: 'x,y' } },
        ],
      })
    })
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
cd gantt
npm test -- src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```

Expected: FAIL because `ScenarioParametersDialog` does not exist.

- [ ] **Step 3: Add DTO types**

In `gantt/src/types/scenario.ts`, add:

```typescript
export type ScenarioParameterType = 'OBJ' | 'LIST'

export interface ScenarioParameterItem {
  code: string
  type: ScenarioParameterType
  description: string | null
  idx: number | null
  schema: Record<string, unknown>
  defaultValue: unknown
  value: unknown
  hasScenarioValue: boolean
}

export interface ScenarioParameterResponse {
  items: ScenarioParameterItem[]
  summary: {
    templateCount: number
    configuredCount: number
  }
}

export interface ScenarioParameterSaveRequest {
  items: {
    code: string
    value: unknown
  }[]
}
```

- [ ] **Step 4: Add API methods**

In `gantt/src/services/scenario-api.ts`, import the new types and add:

```typescript
async getParameters(id: number): Promise<ScenarioParameterResponse> {
  return api.get(`/api/scenario/${id}/parameters`) as Promise<ScenarioParameterResponse>
},

async saveParameters(id: number, data: ScenarioParameterSaveRequest): Promise<ScenarioParameterResponse> {
  return api.put(`/api/scenario/${id}/parameters`, data) as Promise<ScenarioParameterResponse>
},
```

- [ ] **Step 5: Implement the dialog**

Create `scenario-parameters-dialog.tsx`. It must use:

```typescript
import { AppDialog, Button, Input } from '@rois/ui'
import { SlidersHorizontal } from 'lucide-react'
```

Use this state and update logic:

```typescript
const [items, setItems] = useState<ScenarioParameterItem[]>([])
const [loading, setLoading] = useState(false)
const [saving, setSaving] = useState(false)

const updateObjField = (code: string, field: string, rawValue: string | boolean, fieldType: string): void => {
  setItems((current) => current.map((item) => {
    if (item.code !== code) return item
    const currentValue = item.value as Record<string, unknown>
    const nextValue =
      fieldType === 'number' ? Number(rawValue) :
      fieldType === 'boolean' ? Boolean(rawValue) :
      String(rawValue)
    return { ...item, value: { ...currentValue, [field]: nextValue } }
  }))
}

const updateListCsv = (code: string, csv: string): void => {
  setItems((current) => current.map((item) => (
    item.code === code ? { ...item, value: { csv } } : item
  )))
}

const handleSave = async (): Promise<void> => {
  setSaving(true)
  try {
    const result = await scenarioApi.saveParameters(scenarioId, {
      items: items.map((item) => ({ code: item.code, value: item.value })),
    })
    onSaved?.(result.summary)
    onOpenChange(false)
  } finally {
    setSaving(false)
  }
}
```

Use labels from `schema[field].label` for OBJ controls and `schema.label` for LIST textarea. Footer buttons must be `Cancel` and `Save`.

- [ ] **Step 6: Add summary row to Basic Info**

In `scenario-basic-info.tsx`, add state:

```typescript
const [parametersOpen, setParametersOpen] = useState(false)
const [parameterSummary, setParameterSummary] = useState('Using defaults')
```

Render above Comment:

```tsx
<button
  type="button"
  data-testid="scenario-parameters-open"
  className="flex h-7 w-full items-center justify-between rounded border border-border bg-background px-2 text-xs text-foreground hover:bg-accent/60 disabled:opacity-50"
  disabled={disabled}
  onClick={() => setParametersOpen(true)}
>
  <span>Optimization Parameters</span>
  <span className="text-muted-foreground">{parameterSummary}</span>
</button>
<ScenarioParametersDialog
  scenarioId={detail.id}
  open={parametersOpen}
  disabled={disabled}
  onOpenChange={setParametersOpen}
  onSaved={(summary) => setParameterSummary(summary.configuredCount > 0 ? `${summary.configuredCount} configured / ${summary.templateCount} templates` : 'Using defaults')}
/>
```

- [ ] **Step 7: Run frontend test**

Run:

```powershell
cd gantt
npm test -- src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit frontend dialog changes**

Run:

```powershell
git diff --check
git add gantt/src/types/scenario.ts gantt/src/services/scenario-api.ts gantt/src/components/scenario/scenario-parameters-dialog.tsx gantt/src/components/scenario/scenario-basic-info.tsx gantt/src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
git commit -m "feat: add scenario parameter dialog"
```

Expected: commit succeeds.

## Task 5: Version, UI Gate, And E2E

**Files:**
- Modify: `gantt/src/version.ts`
- Create: `e2e/tests/gantt/scenario-parameters.spec.ts`

- [ ] **Step 1: Bump versions**

In `gantt/src/version.ts`, increment both exported version numbers because this is cross-stack frontend and backend runtime work.

- [ ] **Step 2: Write Playwright test**

Create `e2e/tests/gantt/scenario-parameters.spec.ts` with a test that:

```typescript
import { expect, test } from '@playwright/test'
import { seedGanttAuth } from '../../utils/gantt-hook'

test('Scenario parameters can be edited and reopened', async ({ page }) => {
  await seedGanttAuth(page, page.request)
  await page.goto('/altair/')
  await page.getByTestId('module-nav-scenario').click()
  await page.getByTestId('scenario-list-item').first().click()
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeVisible()
  await page.getByLabel('Max Iterations').fill('120')
  await page.getByLabel('CSV Overrides').fill('x,y')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('scenario-parameters-dialog')).toBeHidden()
  await expect(page.getByTestId('scenario-parameters-open')).toContainText('configured')
  await page.getByTestId('scenario-parameters-open').click()
  await expect(page.getByLabel('Max Iterations')).toHaveValue('120')
  await expect(page.getByLabel('CSV Overrides')).toHaveValue('x,y')
})
```

- [ ] **Step 3: Run UI standard gate**

Run from repo root:

```powershell
npm run check:ui
```

Expected: PASS with zero hard violations.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
cd live-server
npm test -- src/__tests__/services/scenario-parameter-service.test.ts src/__tests__/services/scenario/scenario-service.test.ts
```

Expected: PASS.

Run:

```powershell
cd gantt
npm test -- src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx
```

Expected: PASS.

Run:

```powershell
cd e2e
npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-parameters.spec.ts --reporter=list
```

Expected: PASS.

- [ ] **Step 5: Run GitNexus change detection**

Run from repo root:

```powershell
node .gitnexus\run.cjs detect_changes --scope compare --base_ref main
```

Expected: reports only scenario parameter service/API/export/UI/test flows. If unavailable or timed out, record the exact failure in final delivery.

- [ ] **Step 6: Final commit**

Run:

```powershell
git diff --check
git add gantt/src/version.ts e2e/tests/gantt/scenario-parameters.spec.ts
git commit -m "test: cover scenario parameter editing"
```

Expected: commit succeeds.

## Final Verification Receipt

Final delivery must list exact results for:

- `cd live-server; npm test -- src/__tests__/services/scenario-parameter-service.test.ts src/__tests__/services/scenario/scenario-service.test.ts`
- `cd gantt; npm test -- src/components/scenario/__tests__/scenario-parameters-dialog.test.tsx`
- `npm run check:ui`
- `cd e2e; npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-parameters.spec.ts --reporter=list`
- `node .gitnexus\run.cjs detect_changes --scope compare --base_ref main`
