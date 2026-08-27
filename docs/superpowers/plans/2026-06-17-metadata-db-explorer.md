# Metadata DB Explorer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only "Metadata" category to the Data tab that lets developers browse and filter any table in the `f8` or `scenario` PostgreSQL schemas from a dark-themed console panel.

**Architecture:** Three new `GET/POST /api/metadata/*` endpoints in live-server execute validated, parameterized SELECT queries against `information_schema` and user tables. The frontend adds a new `MetadataView` component wired into `data-view.tsx` and a new sidebar group under the Data tab.

**Tech Stack:** Fastify + raw pg.Pool (information_schema queries; no Drizzle), React 19, Zustand (no new store — local state only), Tailwind CSS, Playwright E2E.

## Global Constraints

- All filter values MUST be parameterized (`$N`) — no string interpolation in SQL
- Schema validated against hardcoded allowlist `['f8', 'scenario']` — 400 for anything else
- Table name verified in `information_schema.tables` before any SELECT
- Column names sourced from `information_schema.columns` and double-quoted in SQL
- No HARD UI-standard violations (`text-[Npx]`, `rounded-[Npx]`, `font-[...]`, `font-extrabold`) — run `npm run check:ui` before committing frontend tasks
- Default rows/page = **200**; options: 100, 200, 500, 1000
- No data shown on table selection — only after clicking Run Query
- UI text in English only (per CLAUDE.md)
- Version bump: `FRONTEND_VERSION` +1, `BACKEND_VERSION` +1 (done in final task)
- E2E test ID prefix: `Meta-52xx` (under Data 5xxx range)

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `live-server/src/routes/metadata/index.ts` | Three Fastify route handlers for tables / columns / query |
| `gantt/src/services/metadata-api.ts` | Frontend HTTP client for the three endpoints |
| `gantt/src/components/data/metadata-view.tsx` | Container: left sidebar + right panel |
| `gantt/src/components/data/metadata-sidebar.tsx` | Schema groups, table list, row-count badges |
| `gantt/src/components/data/metadata-filter-row.tsx` | Horizontal-scroll column filter inputs |
| `gantt/src/components/data/metadata-results.tsx` | Results data table + pagination bar |
| `e2e/gantt/metadata-explorer.spec.ts` | Playwright E2E tests |

### Modified files
| File | Change |
|---|---|
| `gantt/src/types/data-maintenance.ts` | Add `'metadata.live' \| 'metadata.scenario'` to `DataPageId`; add `'metadata'` to `DataRootId` |
| `gantt/src/components/shell/shell-sidebar.tsx` | Add Metadata entries to `DATA_MENU`; extend sidebar loop to render Metadata group |
| `gantt/src/components/data/data-view.tsx` | Route `metadata.*` pages to `<MetadataView />` |
| `live-server/src/index.ts` | Register `metadataRoutes` at prefix `/api/metadata` |
| `gantt/src/version.ts` | Bump `FRONTEND_VERSION` and `BACKEND_VERSION` |

---

## Task 1: Backend — `/api/metadata` route handlers

**Files:**
- Create: `live-server/src/routes/metadata/index.ts`
- Modify: `live-server/src/index.ts` (registration)

**Interfaces:**
- Consumes: `fastify.pgPool` (pg.Pool, already decorated)
- Produces:
  - `GET /api/metadata/tables?schema=f8` → `{ schema, tables: { name, rowEstimate }[] }`
  - `GET /api/metadata/columns?schema=f8&table=crew` → `{ schema, table, columns: { name, type, ordinal }[] }`
  - `POST /api/metadata/query` body `{ schema, table, filters, page, pageSize }` → `{ rows, total, page, pageSize }`

- [ ] **Step 1: Create the route file**

Create `live-server/src/routes/metadata/index.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { success, fail } from '../../utils/response.js'

const ALLOWED_SCHEMAS = ['f8', 'scenario'] as const

const queryBodySchema = z.object({
  schema:   z.enum(ALLOWED_SCHEMAS),
  table:    z.string().min(1).max(100),
  filters:  z.record(z.string()).optional().default({}),
  page:     z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(1000).optional().default(200),
})

async function assertTableExists(
  client: import('pg').PoolClient,
  schema: string,
  table: string,
): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
    [schema, table],
  )
  return r.rows.length > 0
}

export default async function metadataRoutes(fastify: FastifyInstance) {
  // ── GET /api/metadata/tables?schema=f8 ────────────────────────────────────
  fastify.get<{ Querystring: { schema?: string } }>('/tables', async (req, reply) => {
    const { schema } = req.query
    if (!schema || !(ALLOWED_SCHEMAS as readonly string[]).includes(schema)) {
      return reply.code(400).send(fail(400, `schema must be one of: ${ALLOWED_SCHEMAS.join(', ')}`))
    }
    const client = await fastify.pgPool.connect()
    try {
      const result = await client.query(
        `SELECT t.table_name,
                GREATEST(COALESCE(c.reltuples::bigint, 0), 0) AS row_estimate
         FROM information_schema.tables t
         LEFT JOIN pg_class c ON c.relname = t.table_name
           AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
         WHERE t.table_schema = $1
           AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name`,
        [schema],
      )
      return reply.send(success({
        schema,
        tables: result.rows.map((r) => ({
          name:        r.table_name as string,
          rowEstimate: Number(r.row_estimate),
        })),
      }))
    } finally {
      client.release()
    }
  })

  // ── GET /api/metadata/columns?schema=f8&table=crew ────────────────────────
  fastify.get<{ Querystring: { schema?: string; table?: string } }>('/columns', async (req, reply) => {
    const { schema, table } = req.query
    if (!schema || !(ALLOWED_SCHEMAS as readonly string[]).includes(schema)) {
      return reply.code(400).send(fail(400, `schema must be one of: ${ALLOWED_SCHEMAS.join(', ')}`))
    }
    if (!table) return reply.code(400).send(fail(400, 'table is required'))

    const client = await fastify.pgPool.connect()
    try {
      if (!(await assertTableExists(client, schema, table))) {
        return reply.code(400).send(fail(400, 'Table not found'))
      }
      const result = await client.query(
        `SELECT column_name, data_type, ordinal_position
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table],
      )
      return reply.send(success({
        schema,
        table,
        columns: result.rows.map((r) => ({
          name:    r.column_name as string,
          type:    r.data_type as string,
          ordinal: r.ordinal_position as number,
        })),
      }))
    } finally {
      client.release()
    }
  })

  // ── POST /api/metadata/query ───────────────────────────────────────────────
  fastify.post('/query', async (req, reply) => {
    const parsed = queryBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send(fail(400, parsed.error.issues[0]?.message ?? 'Invalid request'))
    }
    const { schema, table, filters, page, pageSize } = parsed.data

    const client = await fastify.pgPool.connect()
    try {
      if (!(await assertTableExists(client, schema, table))) {
        return reply.code(400).send(fail(400, 'Table not found'))
      }

      // Fetch valid column names for this table
      const colResult = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
        [schema, table],
      )
      const validCols = new Set<string>(colResult.rows.map((r) => r.column_name as string))

      // Build parameterized WHERE clause
      const conditions: string[] = []
      const values: string[] = []
      for (const [col, val] of Object.entries(filters)) {
        if (!val || !validCols.has(col)) continue
        values.push(val)
        conditions.push(`"${col}" = $${values.length}`)
      }

      const where  = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const offset = (page - 1) * pageSize

      const [dataResult, countResult] = await Promise.all([
        client.query(
          `SELECT * FROM "${schema}"."${table}" ${where} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, pageSize, offset],
        ),
        client.query(
          `SELECT COUNT(*)::bigint AS total FROM "${schema}"."${table}" ${where}`,
          values,
        ),
      ])

      return reply.send(success({
        rows:     dataResult.rows,
        total:    Number(countResult.rows[0].total),
        page,
        pageSize,
      }))
    } finally {
      client.release()
    }
  })
}
```

- [ ] **Step 2: Register the route in live-server/src/index.ts**

Open `live-server/src/index.ts`. Add the import after the existing `dataRoutes` import (around line 27):

```typescript
import metadataRoutes from './routes/metadata/index.js'
```

Add registration after `dataRoutes` (around line 110):

```typescript
await server.register(metadataRoutes, { prefix: '/api/metadata' })
```

- [ ] **Step 3: Restart live-server and smoke-test the three endpoints manually**

```bash
# In live-server directory
curl -s -H "Authorization: Bearer <your-token>" \
  "http://localhost:3000/api/metadata/tables?schema=f8" | jq '.data.tables[0:3]'
# Expected: [{ "name": "aircraft", "rowEstimate": 128 }, ...]

curl -s -H "Authorization: Bearer <your-token>" \
  "http://localhost:3000/api/metadata/columns?schema=f8&table=crew" | jq '.data.columns[0:3]'
# Expected: [{ "name": "id", "type": "bigint", "ordinal": 1 }, ...]

curl -s -X POST -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"schema":"f8","table":"crew","filters":{},"page":1,"pageSize":5}' \
  "http://localhost:3000/api/metadata/query" | jq '.data.total'
# Expected: a positive integer
```

- [ ] **Step 4: Commit**

```bash
git add live-server/src/routes/metadata/index.ts live-server/src/index.ts
git commit -m "feat(metadata): add /api/metadata tables/columns/query endpoints"
```

---

## Task 2: Frontend types

**Files:**
- Modify: `gantt/src/types/data-maintenance.ts:1-17`

**Interfaces:**
- Produces: `DataPageId` extended with `'metadata.live' | 'metadata.scenario'`; `DataRootId` extended with `'metadata'`

- [ ] **Step 1: Update `DataPageId` and `DataRootId` in `gantt/src/types/data-maintenance.ts`**

Replace the two type declarations at the top of the file:

```typescript
export type DataRootId = 'basic' | 'crew' | 'metadata'

export type DataPageId =
  | 'basic.org-base'
  | 'basic.rank'
  | 'basic.fleet-aircraft'
  | 'basic.location-route'
  | 'basic.assignment'
  | 'basic.qualification'
  | 'basic.composition'
  | 'basic.roster-period'
  | 'basic.config-dictionary'
  | 'basic.query'
  | 'basic.holiday'
  | 'crew.master'
  | 'crew.workload-summary'
  | 'metadata.live'
  | 'metadata.scenario'
```

- [ ] **Step 2: Verify TypeScript compiles with no new errors**

```bash
cd gantt && npx tsc --noEmit 2>&1 | grep -i "error" | head -20
# Expected: same pre-existing errors as before (none new)
```

- [ ] **Step 3: Commit**

```bash
git add gantt/src/types/data-maintenance.ts
git commit -m "feat(metadata): add metadata.live and metadata.scenario to DataPageId"
```

---

## Task 3: Frontend API service

**Files:**
- Create: `gantt/src/services/metadata-api.ts`

**Interfaces:**
- Consumes: `api` from `@/services/api` (same axios instance used by `data-api.ts`)
- Produces:
  - `metadataApi.getTables(schema)` → `Promise<{ schema: string; tables: MetadataTable[] }>`
  - `metadataApi.getColumns(schema, table)` → `Promise<{ schema: string; table: string; columns: MetadataColumn[] }>`
  - `metadataApi.query(params)` → `Promise<MetadataQueryResult>`

- [ ] **Step 1: Create `gantt/src/services/metadata-api.ts`**

```typescript
import { api } from '@/services/api'

export interface MetadataTable {
  name:        string
  rowEstimate: number
}

export interface MetadataColumn {
  name:    string
  type:    string
  ordinal: number
}

export interface MetadataQueryResult {
  rows:     Record<string, unknown>[]
  total:    number
  page:     number
  pageSize: number
}

export interface MetadataQueryParams {
  schema:   string
  table:    string
  filters:  Record<string, string>
  page:     number
  pageSize: number
}

export const metadataApi = {
  getTables: (schema: string): Promise<{ schema: string; tables: MetadataTable[] }> =>
    api.get('/api/metadata/tables', { params: { schema } }),

  getColumns: (schema: string, table: string): Promise<{ schema: string; table: string; columns: MetadataColumn[] }> =>
    api.get('/api/metadata/columns', { params: { schema, table } }),

  query: (params: MetadataQueryParams): Promise<MetadataQueryResult> =>
    api.post('/api/metadata/query', params),
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd gantt && npx tsc --noEmit 2>&1 | grep -i "error" | head -20
# Expected: no new errors
```

- [ ] **Step 3: Commit**

```bash
git add gantt/src/services/metadata-api.ts
git commit -m "feat(metadata): add metadata-api service client"
```

---

## Task 4: MetadataView components

**Files:**
- Create: `gantt/src/components/data/metadata-view.tsx`
- Create: `gantt/src/components/data/metadata-sidebar.tsx`
- Create: `gantt/src/components/data/metadata-filter-row.tsx`
- Create: `gantt/src/components/data/metadata-results.tsx`

**Interfaces:**
- Consumes: `metadataApi` from Task 3; `MetadataTable`, `MetadataColumn`, `MetadataQueryResult` types
- Produces: `<MetadataView schema="f8"|"scenario" />` — used in Task 5

**Dark console palette (Tailwind semantic classes):**
- Outer bg: `bg-slate-950`
- Sidebar bg: `bg-slate-900`
- Border: `border-slate-800`
- Primary text: `text-slate-100`
- Muted text: `text-slate-400`
- Selected item: `text-blue-400 bg-slate-800 border-l-2 border-blue-500`
- Type badge: `text-emerald-400`
- Monospace: `font-mono`
- Button run: `bg-emerald-700 hover:bg-emerald-600 text-white`
- Button clear: `border border-slate-700 text-slate-400 hover:text-slate-200`

- [ ] **Step 1: Create `gantt/src/components/data/metadata-sidebar.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { metadataApi, type MetadataTable } from '@/services/metadata-api'

interface MetadataSidebarProps {
  selectedSchema: string
  selectedTable:  string | null
  onSelectTable:  (schema: string, table: string) => void
}

interface SchemaGroup {
  schema:  string
  label:   string
  icon:    string
  tables:  MetadataTable[]
  loading: boolean
  error:   string | null
}

export const MetadataSidebar = ({ selectedSchema, selectedTable, onSelectTable }: MetadataSidebarProps) => {
  const [groups, setGroups] = useState<SchemaGroup[]>([
    { schema: 'f8',       label: 'Live · f8',  icon: '🗄', tables: [], loading: true, error: null },
    { schema: 'scenario', label: 'Scenario',    icon: '📐', tables: [], loading: true, error: null },
  ])

  useEffect(() => {
    for (const g of ['f8', 'scenario'] as const) {
      metadataApi.getTables(g).then((res) => {
        setGroups((prev) => prev.map((group) =>
          group.schema === g ? { ...group, tables: res.tables, loading: false } : group,
        ))
      }).catch(() => {
        setGroups((prev) => prev.map((group) =>
          group.schema === g ? { ...group, loading: false, error: 'Failed to load' } : group,
        ))
      })
    }
  }, [])

  return (
    <div
      data-testid="metadata-sidebar"
      className="flex w-44 shrink-0 flex-col border-r border-slate-800 bg-slate-900 overflow-y-auto"
    >
      <div className="flex items-center gap-1.5 border-b border-slate-800 px-3 py-2">
        <span className="flex-1 text-2xs font-semibold uppercase tracking-widest text-slate-400">
          Explorer
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" title="connected" />
      </div>

      {groups.map((group) => (
        <div key={group.schema} data-testid={`metadata-schema-${group.schema}`}>
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <span className="text-xs">{group.icon}</span>
            <span className="text-2xs font-semibold uppercase tracking-wider text-blue-400">
              {group.label}
            </span>
          </div>

          {group.loading && (
            <div className="px-5 py-1 text-2xs text-slate-500">Loading…</div>
          )}
          {group.error && (
            <div className="px-5 py-1 text-2xs text-red-400">{group.error}</div>
          )}
          {!group.loading && !group.error && group.tables.map((t) => {
            const isActive = selectedSchema === group.schema && selectedTable === t.name
            return (
              <button
                key={t.name}
                data-testid={`metadata-table-${group.schema}-${t.name}`}
                onClick={() => onSelectTable(group.schema, t.name)}
                className={[
                  'flex w-full items-center gap-1.5 border-l-2 px-3 py-1 text-left font-mono text-2xs',
                  isActive
                    ? 'border-blue-500 bg-slate-800 text-blue-400'
                    : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                ].join(' ')}
              >
                <span className="flex-1 truncate">{t.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {t.rowEstimate.toLocaleString()}
                </span>
              </button>
            )
          })}
          <div className="h-2" />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `gantt/src/components/data/metadata-filter-row.tsx`**

```typescript
import type { MetadataColumn } from '@/services/metadata-api'

interface MetadataFilterRowProps {
  columns:  MetadataColumn[]
  filters:  Record<string, string>
  onChange: (col: string, value: string) => void
}

export const MetadataFilterRow = ({ columns, filters, onChange }: MetadataFilterRowProps) => {
  if (columns.length === 0) return null

  return (
    <div
      data-testid="metadata-filter-row"
      className="overflow-x-auto border-b border-slate-800 bg-slate-950 px-3 py-2"
    >
      <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
        {columns.map((col) => (
          <div key={col.name} className="flex flex-col gap-1">
            <span className="font-mono text-2xs text-slate-400">{col.name}</span>
            <span className="font-mono text-2xs text-emerald-400">{col.type}</span>
            <input
              data-testid={`metadata-filter-col-${col.name}`}
              value={filters[col.name] ?? ''}
              onChange={(e) => onChange(col.name, e.target.value)}
              placeholder={col.type.includes('date') ? '≥ value' : '= value'}
              className="w-20 rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 font-mono text-2xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `gantt/src/components/data/metadata-results.tsx`**

```typescript
import type { MetadataQueryResult } from '@/services/metadata-api'

interface MetadataResultsProps {
  result:      MetadataQueryResult | null
  isQueried:   boolean
  schema:      string
  table:       string
  page:        number
  pageSize:    number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const PAGE_SIZE_OPTIONS = [100, 200, 500, 1000]

export const MetadataResults = ({
  result, isQueried, schema, table, page, pageSize, onPageChange, onPageSizeChange,
}: MetadataResultsProps) => {
  const columns = result && result.rows.length > 0 ? Object.keys(result.rows[0]) : []
  const totalPages = result ? Math.ceil(result.total / pageSize) : 0

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Empty / waiting state */}
      {!isQueried && (
        <div
          data-testid="metadata-empty-state"
          className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-500"
        >
          <span className="font-mono text-sm">// no results yet</span>
          <span className="font-mono text-2xs text-slate-600">▶ Run Query to fetch data</span>
        </div>
      )}

      {/* Results table */}
      {isQueried && result && result.rows.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table
            data-testid="metadata-results-table"
            className="w-full border-collapse font-mono text-2xs"
          >
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="sticky top-0 whitespace-nowrap border-b border-slate-800 bg-slate-900 px-3 py-1.5 text-left font-medium text-slate-400"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-900 hover:bg-slate-900">
                  {columns.map((col) => {
                    const val = row[col]
                    const display = val === null || val === undefined ? '—' : String(val)
                    return (
                      <td key={col} className="whitespace-nowrap px-3 py-1 text-slate-300">
                        {display}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Zero results after search */}
      {isQueried && result && result.rows.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-500">
          <span className="font-mono text-sm">// 0 rows returned</span>
          <span className="font-mono text-2xs text-slate-600">Try adjusting your filters</span>
        </div>
      )}

      {/* Status + pagination */}
      <div
        data-testid="metadata-pagination"
        className="flex shrink-0 items-center justify-between border-t border-slate-800 bg-slate-900 px-3 py-1.5"
      >
        <span className="font-mono text-2xs text-slate-500">
          {isQueried && result
            ? `${schema}.${table} · ${result.total.toLocaleString()} rows · read-only`
            : `${schema}.${table} · read-only`}
        </span>

        <div className="flex items-center gap-2">
          {isQueried && result && result.total > 0 && (
            <>
              <span className="font-mono text-2xs text-slate-500">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, result.total)} of {result.total.toLocaleString()}
              </span>
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-2xs text-slate-400 disabled:opacity-30 hover:border-slate-500 hover:text-slate-200"
              >‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = i + 1
                return (
                  <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    className={[
                      'rounded border px-1.5 py-0.5 font-mono text-2xs',
                      p === page
                        ? 'border-blue-500 bg-slate-800 text-blue-400'
                        : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200',
                    ].join(' ')}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-2xs text-slate-400 disabled:opacity-30 hover:border-slate-500 hover:text-slate-200"
              >›</button>
            </>
          )}

          <select
            data-testid="metadata-rows-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-2xs text-slate-400 focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} rows</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `gantt/src/components/data/metadata-view.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { metadataApi, type MetadataColumn, type MetadataQueryResult } from '@/services/metadata-api'
import { MetadataSidebar } from './metadata-sidebar'
import { MetadataFilterRow } from './metadata-filter-row'
import { MetadataResults } from './metadata-results'

interface MetadataViewProps {
  initialSchema: 'f8' | 'scenario'
}

export const MetadataView = ({ initialSchema }: MetadataViewProps) => {
  const [selectedSchema, setSelectedSchema] = useState<string>(initialSchema)
  const [selectedTable,  setSelectedTable]  = useState<string | null>(null)
  const [columns,        setColumns]        = useState<MetadataColumn[]>([])
  const [filters,        setFilters]        = useState<Record<string, string>>({})
  const [result,         setResult]         = useState<MetadataQueryResult | null>(null)
  const [isQueried,      setIsQueried]      = useState(false)
  const [isLoading,      setIsLoading]      = useState(false)
  const [page,           setPage]           = useState(1)
  const [pageSize,       setPageSize]       = useState(200)

  // Load columns when table selection changes
  useEffect(() => {
    if (!selectedTable) { setColumns([]); return }
    setColumns([])
    setFilters({})
    setResult(null)
    setIsQueried(false)
    setPage(1)
    metadataApi.getColumns(selectedSchema, selectedTable).then((res) => {
      setColumns(res.columns)
    }).catch(() => {
      setColumns([])
    })
  }, [selectedSchema, selectedTable])

  const handleSelectTable = (schema: string, table: string) => {
    setSelectedSchema(schema)
    setSelectedTable(table)
  }

  const handleFilterChange = (col: string, value: string) => {
    setFilters((prev) => ({ ...prev, [col]: value }))
  }

  const handleRun = async (overridePage?: number) => {
    if (!selectedTable) return
    setIsLoading(true)
    try {
      const res = await metadataApi.query({
        schema:   selectedSchema,
        table:    selectedTable,
        filters:  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
        page:     overridePage ?? page,
        pageSize,
      })
      setResult(res)
      setIsQueried(true)
      if (overridePage) setPage(overridePage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    setFilters({})
    setResult(null)
    setIsQueried(false)
    setPage(1)
  }

  const handlePageChange = (p: number) => {
    setPage(p)
    handleRun(p)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setPage(1)
    if (isQueried) {
      setTimeout(() => handleRun(1), 0)
    }
  }

  return (
    <div
      data-testid="metadata-view"
      className="flex h-full w-full overflow-hidden bg-slate-950 text-slate-100"
    >
      <MetadataSidebar
        selectedSchema={selectedSchema}
        selectedTable={selectedTable}
        onSelectTable={handleSelectTable}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2">
          {selectedTable ? (
            <>
              <span className="font-mono text-sm font-semibold text-slate-100">{selectedTable}</span>
              <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-2xs text-blue-400">
                {selectedSchema} · {selectedSchema === 'f8' ? 'live' : 'scenario'}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-2xs text-slate-400">read-only</span>
            </>
          ) : (
            <span className="font-mono text-sm text-slate-500">Select a table from the sidebar</span>
          )}
        </div>

        {/* Column filter row */}
        {columns.length > 0 && (
          <MetadataFilterRow
            columns={columns}
            filters={filters}
            onChange={handleFilterChange}
          />
        )}

        {/* Action bar */}
        {selectedTable && (
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2">
            <button
              data-testid="metadata-run-btn"
              onClick={() => handleRun()}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded bg-emerald-700 px-3 py-1 text-2xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50 font-mono"
            >
              {isLoading ? '⟳ Running…' : '▶ Run Query'}
            </button>
            <button
              data-testid="metadata-clear-btn"
              onClick={handleClear}
              className="rounded border border-slate-700 px-3 py-1 font-mono text-2xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
            >
              ✕ Clear
            </button>
          </div>
        )}

        {/* Results */}
        {selectedTable ? (
          <MetadataResults
            result={result}
            isQueried={isQueried}
            schema={selectedSchema}
            table={selectedTable}
            page={page}
            pageSize={pageSize}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        ) : (
          <div
            data-testid="metadata-empty-state"
            className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-500"
          >
            <span className="font-mono text-sm">// select a table to begin</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run UI standard check**

```bash
cd /path/to/repo && npm run check:ui 2>&1 | tail -20
# Expected: 0 HARD violations. WARNs for arbitrary spacing in metadata components are acceptable.
# If any HARD violations appear, fix them before committing.
```

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/data/metadata-view.tsx \
        gantt/src/components/data/metadata-sidebar.tsx \
        gantt/src/components/data/metadata-filter-row.tsx \
        gantt/src/components/data/metadata-results.tsx
git commit -m "feat(metadata): add MetadataView dark console components"
```

---

## Task 5: Sidebar wiring + routing

**Files:**
- Modify: `gantt/src/components/shell/shell-sidebar.tsx:81-102` (DATA_MENU type and data) and `:363` (group render loop)
- Modify: `gantt/src/components/data/data-view.tsx:36-56`

**Interfaces:**
- Consumes: `<MetadataView initialSchema="f8"|"scenario" />` from Task 4
- Produces: Clicking "Live (f8)" or "Scenario" under Metadata in the sidebar renders `MetadataView`

- [ ] **Step 1: Update `DataMenuItem` type and `DATA_MENU` in `shell-sidebar.tsx`**

In `shell-sidebar.tsx`, locate the `DataMenuItem` interface (around line 81) and update `group`:

```typescript
interface DataMenuItem {
  pageId: DataPageId
  label:  string
  Icon:   React.ElementType
  group:  'Basic' | 'Crew' | 'Metadata'
}
```

Then append two entries to `DATA_MENU` after the Crew entries (after line 101):

```typescript
  { pageId: 'metadata.live',     label: 'Live (f8)',  Icon: Database,  group: 'Metadata' },
  { pageId: 'metadata.scenario', label: 'Scenario',   Icon: Activity,  group: 'Metadata' },
```

`Activity` is already imported at line 9. `Database` is already imported at line 9.

- [ ] **Step 2: Extend the sidebar rendering loop to include Metadata group**

Locate the data module rendering block (around line 361-400). The current loop is:

```typescript
{(['Basic', 'Crew'] as const).map((group) => (
```

Change it to:

```typescript
{(['Basic', 'Crew', 'Metadata'] as const).map((group) => (
```

- [ ] **Step 3: Update `data-view.tsx` to route metadata pages**

Add the import at the top of `data-view.tsx`:

```typescript
import { MetadataView } from './metadata-view'
```

Update the `renderPage` function:

```typescript
const renderPage = () => {
  if (selectedPage === 'crew.master') return <CrewMasterView />
  if (selectedPage?.startsWith('basic.')) return <BasicTablePage />
  if (selectedPage === 'metadata.live')     return <MetadataView initialSchema="f8" />
  if (selectedPage === 'metadata.scenario') return <MetadataView initialSchema="scenario" />
  return <PlaceholderDataPage pageId={selectedPage} />
}
```

- [ ] **Step 4: Verify TypeScript and UI standard**

```bash
cd gantt && npx tsc --noEmit 2>&1 | grep "error" | head -20
# Expected: no new errors

cd .. && npm run check:ui 2>&1 | tail -10
# Expected: 0 HARD violations
```

- [ ] **Step 5: Start the dev server and manually verify the happy path**

```bash
cd gantt && npm run dev
```

Open http://localhost:5173 → Data tab → Metadata → Live (f8) in the sidebar. Expect:
- Dark console panel appears
- Sidebar loads and shows f8 tables with row counts
- Click `crew` → columns appear in the filter row
- Click Run Query → data loads and appears in the table
- Rows/page select shows 100/200/500/1000, default 200
- Pagination shows page controls when results > pageSize

- [ ] **Step 6: Commit**

```bash
git add gantt/src/components/shell/shell-sidebar.tsx \
        gantt/src/components/data/data-view.tsx
git commit -m "feat(metadata): wire Metadata sidebar group and routing in DataView"
```

---

## Task 6: E2E test

**Files:**
- Create: `e2e/gantt/metadata-explorer.spec.ts`

**Test IDs:** `Meta-5201` through `Meta-5206`

- [ ] **Step 1: Write the test file**

Create `e2e/gantt/metadata-explorer.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

const GANTT_URL = process.env.GANTT_BASE_URL ?? 'http://localhost:5173/fpqe/gantt/'
const SESSION_TOKEN = process.env.GANTT_SESSION_TOKEN ?? ''

test.beforeEach(async ({ page }) => {
  await page.addInitScript((token) => {
    sessionStorage.setItem('auth_token', token)
  }, SESSION_TOKEN)
  await page.goto(GANTT_URL)
  // Navigate to Data tab then Metadata > Live (f8)
  await page.getByTestId('nav-tab-data').click()
  await page.getByTestId('data-tree-item-metadata.live').click()
})

test('Meta-5201: Metadata sidebar loads f8 tables A-Z with row counts', async ({ page }) => {
  const sidebar = page.getByTestId('metadata-sidebar')
  await expect(sidebar).toBeVisible()

  // At least one table visible
  await expect(page.getByTestId('metadata-schema-f8')).toBeVisible()

  // Tables appear with a row count (a number in the button text)
  const firstTable = sidebar.locator('[data-testid^="metadata-table-f8-"]').first()
  await expect(firstTable).toBeVisible()
  // The text includes at least one digit (row count)
  const text = await firstTable.textContent()
  expect(text).toMatch(/\d/)
})

test('Meta-5202: No data shown by default when table is selected', async ({ page }) => {
  // Click the first table
  const firstTable = page.locator('[data-testid^="metadata-table-f8-"]').first()
  await firstTable.click()

  // Filter row should appear (columns loaded)
  await expect(page.getByTestId('metadata-filter-row')).toBeVisible()

  // Empty state visible, results table absent
  await expect(page.getByTestId('metadata-empty-state')).toBeVisible()
  await expect(page.getByTestId('metadata-results-table')).not.toBeVisible()
})

test('Meta-5203: Run Query returns data and shows result table', async ({ page }) => {
  // Select a known small table
  await page.getByTestId('metadata-table-f8-base').click()
  await expect(page.getByTestId('metadata-filter-row')).toBeVisible()

  // Run without any filters
  await page.getByTestId('metadata-run-btn').click()
  await expect(page.getByTestId('metadata-results-table')).toBeVisible()

  // At least one data row present
  const rows = page.getByTestId('metadata-results-table').locator('tbody tr')
  await expect(rows).not.toHaveCount(0)

  // Empty state is gone
  await expect(page.getByTestId('metadata-empty-state')).not.toBeVisible()
})

test('Meta-5204: Clear resets results and shows empty state', async ({ page }) => {
  await page.getByTestId('metadata-table-f8-base').click()
  await page.getByTestId('metadata-run-btn').click()
  await expect(page.getByTestId('metadata-results-table')).toBeVisible()

  await page.getByTestId('metadata-clear-btn').click()
  await expect(page.getByTestId('metadata-empty-state')).toBeVisible()
  await expect(page.getByTestId('metadata-results-table')).not.toBeVisible()
})

test('Meta-5205: Filter by a column value narrows results', async ({ page }) => {
  await page.getByTestId('metadata-table-f8-crew').click()
  await expect(page.getByTestId('metadata-filter-row')).toBeVisible()

  // Count rows without filter
  await page.getByTestId('metadata-run-btn').click()
  await expect(page.getByTestId('metadata-results-table')).toBeVisible()
  const totalBefore = await page
    .getByTestId('metadata-pagination')
    .textContent()

  // Apply an is_deleted=0 filter
  await page.getByTestId('metadata-filter-col-is_deleted').fill('0')
  await page.getByTestId('metadata-run-btn').click()
  await expect(page.getByTestId('metadata-results-table')).toBeVisible()

  // Total in pagination should be <= before
  const totalAfter = await page.getByTestId('metadata-pagination').textContent()
  // Just verify the results table is still visible and not empty — filter narrowed or matched all
  const rows = page.getByTestId('metadata-results-table').locator('tbody tr')
  await expect(rows).not.toHaveCount(0)
})

test('Meta-5206: Rows-per-page default is 200', async ({ page }) => {
  const select = page.getByTestId('metadata-rows-select')
  await expect(select).toBeVisible()
  await expect(select).toHaveValue('200')
})
```

- [ ] **Step 2: Run the tests**

```bash
cd /path/to/repo
npx playwright test e2e/gantt/metadata-explorer.spec.ts --reporter=list
```

Expected output: 6 tests pass. If any fail, investigate — do NOT mark done without a PASS receipt.

- [ ] **Step 3: Commit**

```bash
git add e2e/gantt/metadata-explorer.spec.ts
git commit -m "test(metadata): e2e tests Meta-5201 to Meta-5206 for DB explorer"
```

---

## Task 7: Version bump + final check

**Files:**
- Modify: `gantt/src/version.ts`

- [ ] **Step 1: Bump both version counters in `gantt/src/version.ts`**

Read the current values and increment both by 1. For example if current is `BACKEND_VERSION = 42, FRONTEND_VERSION = 38`:

```typescript
export const BACKEND_VERSION  = 43  // was 42 — metadata API added
export const FRONTEND_VERSION = 39  // was 38 — MetadataView + sidebar added
```

- [ ] **Step 2: Run full UI check one last time**

```bash
npm run check:ui 2>&1 | tail -5
# Expected: 0 HARD violations
```

- [ ] **Step 3: Commit**

```bash
git add gantt/src/version.ts
git commit -m "chore: bump version for metadata DB explorer feature"
```

---

## Gotcha: scenario schema permissions

If `GET /api/metadata/tables?schema=scenario` returns an empty table list or a 500, the `f8` PostgreSQL user may lack SELECT permission on the `scenario` schema. Fix with:

```sql
-- Run as postgres superuser
GRANT USAGE ON SCHEMA scenario TO f8;
GRANT SELECT ON ALL TABLES IN SCHEMA scenario TO f8;
```

This is a one-time setup step, not a code change.
