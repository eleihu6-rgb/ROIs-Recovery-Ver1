# Composition Management — Design Spec

**Date:** 2026-05-08  
**Module:** Gantt → Rule tab  
**Reference mockup:** `docs/modules/gantt/composition-management-mockup.html`  
**Reference screenshots:** `docs/assets/screenshots/old-javafx-system/配比定义管理.png`, `docs/assets/screenshots/old-javafx-system/配比方案管理.png`

---

## 1. Overview

Add two new sub-pages under the Gantt **Rule** module:

| Sub-page | Chinese name | DB tables |
|---|---|---|
| **Composition Load** | 配比定义管理 | `composition_load` |
| **Composition** | 配比方案管理 | `composition` + `composition_rank` |

The Rule module sidebar gains three items (replacing the current content-level panel):

1. **Rule Manager** — existing rule set management (unchanged logic)
2. **Composition Load** — load-rule search table with CRUD
3. **Composition** — tree of composition templates + dynamic rank × option matrix

---

## 2. Navigation Changes

### 2.1 Shell Store (`shell-store.ts`)

Add a new sub-navigation type for the Rule module:

```typescript
export type ActiveRuleItem = 'rule-manager' | 'comp-load' | 'comp'
```

Add to `ShellStore`:
- `activeRuleItem: ActiveRuleItem` (default `'rule-manager'`)
- `setRuleItem(item: ActiveRuleItem): void`
- Persist to `localStorage` under key `rois-shell-rule-item`

### 2.2 Sidebar (`shell-sidebar.tsx`)

Add a `rule` branch alongside the existing `live` and `scenario` branches. Items:

| Item | Label | Icon (lucide) |
|---|---|---|
| `rule-manager` | Rule Manager | `ClipboardCheck` |
| `comp-load` | Composition Load | `AlignJustify` |
| `comp` | Composition | `Users` |

Section header: `Configuration`

All three items are always active (no `todo` flag). Active item highlighted with left border + accent background, same pattern as Live/Scenario.

### 2.3 Rule View (`rule-view.tsx`)

Replace the current single-layout render with a switch on `activeRuleItem`:

```tsx
if (activeRuleItem === 'rule-manager') return <RuleManagerView />
if (activeRuleItem === 'comp-load')    return <CompositionLoadView />
if (activeRuleItem === 'comp')         return <CompositionView />
```

`RuleManagerView` = the current `RuleView` content (move `RuleGroupList` + right panel into it, rename the inner component).

---

## 3. Composition Load Page

### 3.1 Layout

```
┌─────────────────────────────────────────────────────┐
│ Filter Bar (2 rows)                                 │
├─────────────────────────────────────────────────────┤
│ Table Toolbar: total count | Refresh Log | Refresh  │
│                Comp | [Add] | column-config | export│
├─────────────────────────────────────────────────────┤
│ Scrollable Table                                    │
├─────────────────────────────────────────────────────┤
│ Pagination                                          │
└─────────────────────────────────────────────────────┘
```

### 3.2 Filter Bar

**Row 1:** Division | Priority | Fleet | Flight No. | [More ▾] [Reset] [Search]  
**Row 2 (always visible):** Sub Fleet | Flight Flag | Flight Assignment

`More` expands to show: Service Type, Segment Type, Route, Effective Date range.

All filters are frontend-side on the loaded dataset (no server-side pagination for now — total records expected < 500).

### 3.3 Table Columns

Fixed columns (non-hidable): Filiale, Division, Priority, Action.  
All others are togglable via column-config dialog (reuse existing `ColumnConfigDialog`).

| Column | Field | Notes |
|---|---|---|
| Filiale | `filiale` | |
| Division | `division` | |
| Priority | `sequence` | sortable |
| Fleet | `fleet` | `*` when null |
| Flight No. | `flt_num` | `*` when null |
| Sub Fleet | `sub_fleet` | |
| Flight Flag | `flight_flag` | badge |
| Flight Assign. | `flight_assignment` | badge |
| Svc Type | `service_type` | |
| Seg Type | `seg_type` | |
| Load Factor% | `load_factor` | |
| Pax Num | `pax_num` | |
| Route | `route_id` | resolved to route label |
| Rest Facility | `rest_facility` | |
| DEP Time | `departure_time` | |
| ARR Time | `arrival_time` | |
| Effective Date | `eff_dt` | date only |
| Expiry Date | `exp_dt` | `—` when null |
| Day of Week | `dow` | `1234567` = every day |
| Description | `description` | truncate 120px |
| BLH | `blh_low`–`blh_upper` | formatted as `low–upper` |
| Composition | resolved name from `comp_id` | blue text |
| Option | `option_id` | |
| Action | — | Edit / Delete links |

**Refresh Comp** button: re-fetches compositions and re-maps `comp_id` → name in the table.  
**Refresh Log** button: placeholder for now (reserved for future audit log feature).

### 3.4 Add / Edit Dialog

Modal form with all `composition_load` fields. Fields:
- Division (select, required)
- Sequence/Priority (number, required)
- Effective Date (date picker, required)
- Expiry Date (date picker, optional)
- Fleet, Flight No., Sub Fleet, Flight Flag, Flight Assignment, Service Type, Segment Type (text/select)
- Load Factor, Pax Num (text)
- Route (select from routes list)
- DEP Time, ARR Time (text, format `HH:mm–HH:mm`)
- Day of Week (checkbox group Mon–Sun)
- Rest Facility (number)
- BLH Low / BLH Upper (text)
- Description (textarea)
- Composition (select from composition list)
- Option (number)

### 3.5 Delete

Inline "Del" link triggers a confirm dialog, then `DELETE /api/composition/load/:id`.

---

## 4. Composition Page

### 4.1 Layout

```
┌──────────────┬─────────────────────────────────────┐
│ Tree panel   │ Detail: header info grid             │
│ 220px        ├─────────────────────────────────────┤
│              │ Rank × Option matrix                 │
│              │ (fills remaining height)             │
└──────────────┴─────────────────────────────────────┘
```

### 4.2 Tree Panel

- Header: search input + `+` button (create new composition)
- Tree structure: **Airline** (root, from `filiale`) → **Division** (group by `division`) → **Composition name** (leaf, sorted by `display_order`)
- Leaf items show a `SBY` badge when `name` contains the substring `"SBY"` (case-insensitive); `composition` table has no dedicated flag field
- Clicking a leaf selects it and loads its detail on the right

### 4.3 Composition Header Info

Non-editable display grid (2 rows × 4 cols) showing:

| Field | DB column |
|---|---|
| Name | `name` |
| Division | `division` |
| Priority | `display_order` |
| Hierarchy | `hierarchy` (1=Standard, 2=Enhanced) |
| Description | `name_desc` (span 2 cols) |

**Edit** button opens a modal to update these fields.  
**Delete** button deletes the composition (with 409 guard if any `composition_load` references it).

### 4.4 Rank × Option Matrix

The grid visualises `composition_rank` rows where:
- **Columns** = distinct `rank` values for this composition's `comp_id` (dynamic, not fixed)
- **Rows** = distinct `options` values (the `options` smallint field, 1-based index)
- **Cell value** = `plan_value` (integer or null — null means rank is not required for this option)

#### Cell rendering

- **Has value:** large bold number, clickable to inline-edit
- **Null/empty:** dashed square placeholder, clickable to set a value

#### Inline editing

Click a cell → renders a `<input type="number">` in place. Commit on Enter or blur. Clearing the input and committing sets the value to null (deletes the rank row for that option, or sets it to null — see data model note below).

#### Add Rank

Prompts for a rank code (e.g. `CA`, `FO`, `FA`). Creates `composition_rank` rows for all existing options with `plan_value = null`. Adds the column to the matrix.

#### Delete Rank

Hover on column header → ✕ appears. Clicking ✕ deletes all `composition_rank` rows for that rank.  
Also: select column header checkbox → Del Rank button (batch).

#### Add Option

Appends a new row with all cells null. Creates no DB records until a cell is given a value.

#### Delete Option

Hover on option label → ✕. Clicking deletes all `composition_rank` rows for that option index.  
Also: row checkbox + Del Option button (batch).

#### Data Model Note

`composition_rank` stores one row per `(comp_id, rank, options)` combination. A null cell means **no such row exists**. Frontend store `setCell` maps to:

- `value !== null` → `POST /api/composition/rank` (create) or `PUT /api/composition/rank/:id` (update) — store must track existing row IDs
- `value === null` → `DELETE /api/composition/rank/:id` if row existed, otherwise no-op

---

## 5. API Integration

All endpoints are already implemented in `live-server`. No backend changes required.

| Operation | Endpoint |
|---|---|
| List compositions | `GET /api/composition` |
| Get composition + ranks | `GET /api/composition/:id/detail` |
| Create composition | `POST /api/composition` |
| Update composition | `PUT /api/composition/:id` |
| Delete composition | `DELETE /api/composition/:id` |
| List loads | `GET /api/composition/load` |
| Create load | `POST /api/composition/load` |
| Update load | `PUT /api/composition/load/:id` |
| Delete load | `DELETE /api/composition/load/:id` |
| Get ranks for comp | `GET /api/composition/rank/comp/:id` |
| Create rank | `POST /api/composition/rank` |
| Update rank | `PUT /api/composition/rank/:id` |
| Delete rank | `DELETE /api/composition/rank/:id` |

---

## 6. Frontend File Structure

New files to create:

```
gantt/src/
├── types/
│   └── composition.ts            # CompositionLoad, Composition, CompositionRank types
├── services/
│   └── composition-api.ts        # API calls for all three tables
├── stores/
│   ├── composition-load-store.ts # list, filters, CRUD state
│   └── composition-store.ts      # tree, selected comp, rank matrix state
└── components/
    ├── shell/
    │   └── shell-sidebar.tsx     # add rule menu items (modify existing)
    ├── rule/
    │   └── rule-view.tsx         # switch on activeRuleItem (modify existing)
    └── composition/
        ├── composition-load-view.tsx    # full page: filter + table
        ├── composition-load-dialog.tsx  # add/edit modal
        ├── composition-view.tsx         # full page: tree + detail
        ├── composition-tree.tsx         # left tree panel
        ├── composition-detail.tsx       # right detail panel
        └── rank-option-matrix.tsx       # interactive grid
```

Modified files:

```
gantt/src/stores/shell-store.ts   # add ActiveRuleItem + setRuleItem
gantt/src/components/shell/shell-sidebar.tsx  # add rule nav items
gantt/src/components/rule/rule-view.tsx       # sub-view switch
```

---

## 7. State Design

### `composition-load-store.ts`

```typescript
interface CompositionLoadStore {
  items: CompositionLoad[]
  loading: boolean
  filters: CompositionLoadFilters
  fetchAll(): Promise<void>
  setFilter(patch: Partial<CompositionLoadFilters>): void
  filtered(): CompositionLoad[]   // derived, apply filters
  create(data: CreateLoadData): Promise<void>
  update(id: number, data: Partial<CreateLoadData>): Promise<void>
  remove(id: number): Promise<void>
}
```

### `composition-store.ts`

```typescript
interface CompositionStore {
  compositions: Composition[]         // all, for tree
  selectedId: number | null
  ranks: CompositionRank[]            // ranks for selectedId
  loading: boolean
  rankLoading: boolean

  fetchAll(): Promise<void>
  selectComposition(id: number): Promise<void>   // also fetches ranks
  createComposition(data: CreateCompositionData): Promise<void>
  updateComposition(id: number, data: Partial<CreateCompositionData>): Promise<void>
  removeComposition(id: number): Promise<void>

  // Rank matrix mutations (each auto-calls API)
  setCell(rank: string, options: number, value: number | null): Promise<void>
  addRank(rank: string): Promise<void>
  deleteRank(rank: string): Promise<void>
  addOption(): Promise<void>          // appends new option index
  deleteOption(options: number): Promise<void>
}
```

The matrix is derived from `ranks`: group by `options` for rows, group by `rank` for columns. Null cells = no matching row.

---

## 8. Out of Scope

- Audit log (Refresh Log button = placeholder)
- Server-side pagination (dataset is small, client filter is sufficient)
- Import/export of composition load rules
- Real-time sync of composition changes across sessions
