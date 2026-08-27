# Metadata DB Explorer — Design Spec

**Date:** 2026-06-17  
**Status:** Approved  
**Module:** gantt / live-server  

---

## Overview

A read-only database browser embedded in the gantt Data tab. Lets developers and admins inspect any table in the `f8` or `scenario` PostgreSQL schemas directly from the UI — no psql, no external tool. Styled as a dark developer console (Option C) consistent with the mockup selection.

---

## Navigation

A new **Metadata** group is added at the bottom of the Data tab sidebar, after the existing Crew group:

```
Data (module)
  ├── Basic    (existing)
  ├── Crew     (existing)
  └── Metadata (new)
        ├── metadata.live      → "Live (f8)"
        └── metadata.scenario  → "Scenario"
```

- New entries in `DATA_MENU` in `shell-sidebar.tsx` under a `"Metadata"` group heading.
- New `DataPageId` values: `'metadata.live'` and `'metadata.scenario'`.
- `data-view.tsx` routes these `pageId` values to a new `MetadataView` component.

---

## Layout — Dark Console Panel

`MetadataView` is a self-contained dark-themed panel that fills the right content area. The outer gantt shell retains its normal light theme.

### Left sidebar (schema → tables)

- Two fixed schema groups: **Live · f8** (top) and **Scenario** (bottom).
- Each group lists all tables in that schema, sorted A → Z.
- Table row count shown right-aligned using `pg_class.reltuples` (Postgres statistics estimate — instantaneous, no table scan).
- Selected table is highlighted with a blue left border and accent colour.
- Counts load once when the schema group first renders.

```
🗄 Live · f8          [● connected]
  aircraft          128
  airport           312
  crew            1 204
  crew_base         987
► roster_flight  48 391
  ...

📐 Scenario
  crew_manday_fd  2 100
  scenario            6
```

### Right panel — filter + results

**Header bar:** table name, schema badge (`f8 · live` or `scenario`), `read-only` badge.

**Column filter row:**
- Horizontally scrollable — accommodates wide tables without wrapping.
- One column box per table column, showing:
  - Column name (monospace)
  - Postgres data type in small green text (e.g. `bigint`, `varchar`, `date`)
  - Text input for filter value
- Date columns show `≥` / `≤` as placeholder hints; all others show `=`.
- Empty filter inputs are ignored (not sent as WHERE conditions).

**Action bar (below filters):**
- `▶ Run Query` button — executes the query with current filters.
- `✕ Clear` button — resets all filter inputs to empty.
- `rows/page` select: options `100 / 200 / 500 / 1000`, **default 200**.

**Results area:**
- Default state: empty — shows `// no results yet — click Run Query`. No data is fetched on table selection.
- After search: renders a data table with column headers and rows.
- For wide tables: results table is horizontally scrollable.
- Boolean values render as `true` / `false`; null renders as `—`.

**Pagination bar:**
- `‹  1  2  3  ›` page buttons plus `N–M of total` count.
- Only shown after a query has run.

---

## Backend API

Three new endpoints added to `live-server/src/routes/metadata/index.ts`, registered at prefix `/api/metadata`.

### `GET /api/metadata/tables?schema=f8`

Returns all user tables in the schema with row count estimates.

**Response:**
```json
{
  "schema": "f8",
  "tables": [
    { "name": "aircraft", "rowEstimate": 128 },
    { "name": "airport",  "rowEstimate": 312 }
  ]
}
```

**Implementation:** queries `information_schema.tables` joined with `pg_class` for `reltuples`.  
Tables sorted ascending by name.

---

### `GET /api/metadata/columns?schema=f8&table=roster_flight`

Returns all columns for a table with their Postgres data types.

**Response:**
```json
{
  "schema": "f8",
  "table": "roster_flight",
  "columns": [
    { "name": "id",        "type": "bigint",                   "ordinal": 1 },
    { "name": "crew_id",   "type": "bigint",                   "ordinal": 2 },
    { "name": "pairing_id","type": "bigint",                   "ordinal": 3 },
    { "name": "start_date","type": "date",                     "ordinal": 4 }
  ]
}
```

**Implementation:** queries `information_schema.columns` ordered by `ordinal_position`.

---

### `POST /api/metadata/query`

Executes a filtered SELECT with pagination.

**Request body:**
```json
{
  "schema": "f8",
  "table": "roster_flight",
  "filters": {
    "crew_id": "227",
    "start_date": "2026-06-01"
  },
  "page": 1,
  "pageSize": 200
}
```

**Response:**
```json
{
  "rows": [ { "id": 1, "crew_id": 227, "pairing_id": null, ... } ],
  "total": 847,
  "page": 1,
  "pageSize": 200
}
```

**Implementation notes:**
- Schema and table names validated against a hardcoded allowlist (`['f8', 'scenario']` for schema; table name verified to exist in `information_schema.tables` before query).
- Column names come from a prior `GET /columns` call and are double-quoted in SQL.
- Filter values passed as numbered parameters (`$1`, `$2`, …) — no string interpolation.
- Date columns use `>=` for filter; all others use `=`.
- `LIMIT` / `OFFSET` applied for pagination.
- Total count fetched via a separate `SELECT COUNT(*)` with same WHERE clause.
- Connection uses the existing `f8` db pool for `f8` schema and a `scenario`-schema connection for `scenario`.

---

## Security

| Concern | Mitigation |
|---|---|
| Schema injection | Schema validated against `['f8', 'scenario']` allowlist — any other value returns 400 |
| Table injection | Table name verified in `information_schema.tables` before use; double-quoted in SQL |
| Column injection | Column names sourced from `information_schema.columns`; double-quoted in SQL |
| Value injection | All filter values passed as parameterized query params (`$N`) |
| Write operations | Route handler executes only `SELECT` — no INSERT/UPDATE/DELETE possible |
| Auth | Endpoint sits behind the same session auth as all other `/api/*` routes |

---

## Frontend Components

| File | Purpose |
|---|---|
| `gantt/src/components/data/metadata-view.tsx` | Top-level layout: sidebar + right panel |
| `gantt/src/components/data/metadata-sidebar.tsx` | Schema group + table list + row counts |
| `gantt/src/components/data/metadata-filter-row.tsx` | Horizontal-scroll column filter inputs |
| `gantt/src/components/data/metadata-results.tsx` | Data table + pagination bar |
| `gantt/src/services/metadata-api.ts` | HTTP client for the three endpoints |
| `live-server/src/routes/metadata/index.ts` | Fastify route handlers |

State is local to `MetadataView` (no Zustand store needed — the data is ephemeral and per-session).

---

## Rows-Per-Page

| Option | Value |
|---|---|
| Default | **200** |
| Available | 100, 200, 500, 1000 |

---

## Out of Scope

- Write / edit operations (this is read-only by design).
- Export to CSV or clipboard.
- Dynamic schema discovery (only `f8` and `scenario` are supported).
- tg or other airline schemas.
- Column sorting in results (user can add filters instead).
- Saved filter presets.
