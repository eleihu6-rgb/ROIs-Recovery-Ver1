# Legality Parameter Table Editor — Design Spec

**Date:** 2026-06-17  
**Scope:** `gantt/` frontend + `live-server/` backend  
**Status:** Approved for implementation

---

## 1. Overview

The Legality tab's parameter table is currently read-only. This spec adds full editing capability: inline cell editing, copy/delete/reorder rows, a persistent change log with undo, format validation, add empty row, and column header tooltips.

### Chosen design direction (from visual brainstorm)

| Decision | Choice |
|---|---|
| Edit mode | **Inline** for rules with ≤12 columns; **AppDialog** for >12 columns (e.g. 8056 with 24 cols) |
| Row action icons | **Always-visible** Actions column on the right (✏️ copy ⧉ delete 🗑 move ↑ ↓) |
| Undo | **Side Change Log Panel** — persistent right-side panel, EDIT/DEL/ADD entries, ⟲ Undo, Save All |
| Validation | **Red ring + inline error hint** — red outline on empty required cells, orange outline + hint on format mismatch |
| Add Row | **Dashed "+ Add Row" button** below the table |
| Delete confirm | **Inline row** — row turns red, action column replaced with "Delete? / Yes, delete / Cancel" |

---

## 2. Architecture

### 2.1 New components

All new files go under `gantt/src/components/legality/`.

#### `LegalityParamTableEditor`
The main new component. Replaces `LegalityParamTable` in read-write contexts (`LegalityRuleRow` inline expand and `LegalityParamDialog`).

Props:
```typescript
interface Props {
  ruleId: number
  paramJson: LegalityParamJson
  fn: number
  inst: string | null
  onSaved: (updated: LegalityParamJson) => void
}
```

Responsibilities:
- Owns all editor state (local `useReducer`)
- Determines mode: `table.header.length > 12` → dialog edit, else inline
- Renders table(s) + side change log panel
- Passes edit callbacks to `ParamTableBody`

#### `ParamTableBody`
Renders one `<table>` with editable rows. Props include the working-copy table, editor state, and dispatch.

#### `ParamCellInput`
Single editable cell. Detects empty (red ring) and format mismatch (orange ring). Shows error hint text below.

#### `ParamChangeLogPanel`
Right-side panel showing the change history. Fixed width `w-44`. Entries are tagged EDIT / DEL / ADD / MOVE / COPY. ⟲ Undo pops the last entry and reverses it. Save All calls the backend.

#### `ParamRowDialog`
AppDialog for >12-column rules. Shows all columns as a 2-column form grid. Same validation as inline.

### 2.2 Local state (useReducer)

State lives entirely in `LegalityParamTableEditor` — not in the global legality store. Each expanded rule has its own independent editor instance.

```typescript
interface EditorState {
  tables: LegalityParamTable[]          // working copy (mutable)
  history: ChangeEntry[]                // stack, newest at end
  editingCell: EditingCell | null       // null = no inline edit active
  editingRowDialog: EditingRowDialog | null  // for >12-col rules
  deletingRow: { tableIdx: number; rowIdx: number } | null
  saving: boolean
  saveError: string | null
}

type ChangeEntry =
  | { type: 'EDIT'; tableIdx: number; rowIdx: number; colIdx: number; before: string; after: string }
  | { type: 'DEL';  tableIdx: number; rowIdx: number; row: string[] }
  | { type: 'ADD';  tableIdx: number; rowIdx: number }
  | { type: 'COPY'; tableIdx: number; rowIdx: number }
  | { type: 'MOVE'; tableIdx: number; fromIdx: number; toIdx: number }
```

Undo reverses the last `ChangeEntry` by mutating `tables` back and removing the entry from `history`. There is no redo — undo means "step back toward last saved", matching the user's mental model.

The `dirty` flag is derived: `history.length > 0`.

### 2.3 Data flow

```
LegalityRuleRow (existing)
  └── LegalityParamTableEditor (new — replaces LegalityParamTable)
        ├── ParamChangeLogPanel (right side)
        └── ParamTableBody × N tables
              ├── ParamCellInput per editable cell (inline mode)
              └── ParamRowDialog (>12-col mode, triggered by ✏️)
```

On **Save All**:
1. `LegalityParamTableEditor` calls `legalityApi.updateRuleParams(ruleId, workingTables)`
2. On success: clears history, calls `onSaved(updatedParamJson)` to update the store
3. On failure: shows `saveError` in the panel

### 2.4 Store change

Add one mutation to `useLegalityStore`:

```typescript
updateRuleParamJson: (ruleId: number, paramJson: LegalityParamJson) => void
```

This patches the `rules` array in place so the expanded row reflects the saved state without a full reload.

---

## 3. Feature Details

### 3.1 Row action icons (always-visible Actions column)

Appended as the last column. Header: `ACTIONS` (no data).

| Icon | Label | Behavior |
|---|---|---|
| ✏️ | Edit | ≤12 cols: enter inline edit mode for this row. >12 cols: open `ParamRowDialog` |
| ⧉ | Copy | Duplicate this row, append at bottom; add COPY to history |
| 🗑 | Delete | Set `deletingRow` → row turns red inline confirm (see §3.6) |
| ↑ | Move up | Swap row with row above; add MOVE to history. Disabled on first row. |
| ↓ | Move down | Swap row with row below; add MOVE to history. Disabled on last row. |

Icon component: `className="h-3.5 w-3.5 shrink-0"`, `gap-1.5` between icons, icons use Lucide (`Pencil`, `Copy`, `Trash2`, `ChevronUp`, `ChevronDown`).

### 3.2 Inline cell editing (≤12 columns)

Clicking ✏️ sets `editingCell` to the row's first data cell. The entire row highlights `bg-amber-50`. Each editable cell becomes a `ParamCellInput`. The Actions column is replaced with ✓ / ✕ buttons.

- ✓ (confirm): validates all cells in row → if valid, commits the diff as EDIT entries to history, clears `editingCell`
- ✕ (cancel): restores the row to its pre-edit values, clears `editingCell`
- Pressing `Enter` on last cell = confirm; `Escape` = cancel

Only one row can be in inline-edit mode at a time.

### 3.3 Undo (Side Change Log Panel)

**Panel** is always visible once any change has been made (appears alongside the table, width `w-44`, `shrink-0`). Before any changes it shows "No changes yet" in muted text.

**Entries** are color-tagged:
- `EDIT` → blue badge
- `DEL` → red badge
- `ADD` → green badge
- `COPY` → purple badge
- `MOVE` → gray badge

**⟲ Undo** (top-right of panel): pops `history[history.length - 1]`, applies the inverse operation to `tables`.

**Save All** button (bottom of panel): sends `PATCH /api/legality/rule/:ruleId/params`. Disabled while saving. Shows spinner during save.

### 3.4 Format validation

On each cell, the column's expected format is inferred at mount from existing row values:

| Inference rule | Format enforced | Error message |
|---|---|---|
| All existing values match `^\d+:\d{2}$` | HH:MM | "Use HH:MM (e.g. 08:30)" |
| All existing values are digits only | Integer | "Must be a number" |
| All existing values match `^\d+(\.\d+)?%?$` | Numeric | "Must be a number" |
| Applicability column (BASE/RANK/FLEET/TEAM) | Non-empty string | "Required" |
| Anything else | Non-empty string | "Required" |

`*` is always valid in applicability columns (wildcard).

**Edge case — 0 existing rows (brand-new table):** Format cannot be inferred. All columns fall back to "non-empty string required". The header name is still checked for the HH:MM hint (e.g. a header containing "HH:MM" enforces that format even with no rows).

Visual states:
- **Empty required cell**: `border-2 border-destructive bg-destructive/5` + `<span className="text-3xs text-destructive">Required</span>` below input
- **Format mismatch**: `border-2 border-orange-400 bg-orange-50` + `<span className="text-3xs text-orange-600">{hint}</span>` below input
- **Valid**: `border border-border focus:border-primary`

The ✓ confirm button is disabled if any cell in the row has a validation error.

### 3.5 Add empty row

A dashed button below each table:

```tsx
<button className="mt-1.5 flex items-center gap-1.5 rounded border border-dashed border-primary/40 px-3 py-1 text-xs text-primary hover:border-primary hover:bg-primary/5">
  <Plus className="h-3.5 w-3.5 shrink-0" />
  Add Row
</button>
```

Clicking appends a row of empty strings (one per column) to `tables[ti].rows`, adds an ADD entry to history, and immediately enters inline-edit mode on that row (all cells empty → all show red ring).

### 3.6 Delete row (inline confirm)

When `deletingRow` is set:
- That row gets `className="bg-destructive/5"`
- All data cells render their value normally (read-only, dimmed)
- Actions column is replaced with:
  ```
  Delete this row?   [Yes, delete]   [Cancel]
  ```
- "Yes, delete": removes the row from `tables`, pushes DEL entry, clears `deletingRow`
- "Cancel": clears `deletingRow`, row returns to normal

### 3.7 Column header tooltips

Each `<th>` gets a Radix `Tooltip` with a descriptive sentence. Applicability columns use fixed descriptions; rule-specific columns derive the tooltip from the header text and detected format.

Applicability column tooltips (hardcoded):

| Column | Tooltip |
|---|---|
| BASE | Airport base code (e.g. YEG). Use * to match all bases. |
| RANK | Crew rank (e.g. CA, FO). Use * to match all ranks. |
| FLEET | Aircraft fleet type (e.g. B737). Use * to match all fleets. |
| TEAM / CREW TEAM | Crew team group. Use * to match all teams. |

Other columns: tooltip = `{header} — {detectedFormat hint}`, e.g. "MAX HOURS — Format: HH:MM".

---

## 4. Backend Changes

### New endpoint

```
PATCH /api/legality/rule/:ruleId/params
Auth: required (admin only — isAdmin check)
Body: { paramJson: LegalityParamJson }
Response: { code: 200, data: { paramJson: LegalityParamJson }, message: 'ok' }
```

In `live-server/src/routes/rule/legality.ts`:

```typescript
fastify.patch('/rule/:ruleId/params', async (request, reply) => {
  if (!request.authUser?.isAdmin) {
    return reply.status(403).send({ code: 403, data: null, message: 'Admin access required' })
  }
  const { ruleId } = request.params as { ruleId: string }
  const { paramJson } = request.body as { paramJson: unknown }
  // 1. Validate ruleId exists
  // 2. Validate paramJson shape (tables array, header/rows strings)
  // 3. UPDATE rule SET param_json = $1, updated_by = $2, updated_at = NOW() WHERE id = $3
  // 4. Return updated paramJson
})
```

The route is registered under the existing `/rule/` prefix in `routes/rule/index.ts`.

Cache TTL for legality config is 1h (per live-server CLAUDE.md). After a successful write, no cache key needs busting — the legality routes do not use Redis caching currently.

### Type update (`types/legality.ts`)

Add request type:
```typescript
export interface UpdateRuleParamsRequest {
  paramJson: LegalityParamJson
}
```

### API client update (`services/legality-api.ts`)

```typescript
updateRuleParams: (ruleId: number, paramJson: LegalityParamJson): Promise<{ paramJson: LegalityParamJson }> =>
  api.patch(`/api/legality/rule/${ruleId}/params`, { paramJson }),
```

---

## 5. Integration with `LegalityRuleRow`

`LegalityRuleRow` currently shows `LegalityParamTable` when expanded. Change: render `LegalityParamTableEditor` instead, passing `onSaved` to call `useLegalityStore.updateRuleParamJson`.

`LegalityParamDialog` (pop-out): same swap, same `onSaved` wire-up.

`LegalityParamTable` is kept as-is for read-only contexts (if any remain).

---

## 6. Admin guard

The Edit/Copy/Delete/Add Row/Move buttons are only rendered when `request.authUser.isAdmin === 1`. Non-admin users see the table in read-only mode (existing `LegalityParamTable` behavior).

Frontend: read `isAdmin` from the auth store and conditionally render the editor vs. the read-only table.

---

## 7. Testing

### E2E (Playwright) — `e2e/gantt/legality-param-editor.spec.ts`

| Test ID | Coverage |
|---|---|
| Legal-6020 | Edit a cell inline (≤12-col rule), confirm, verify change log shows EDIT entry |
| Legal-6021 | Edit triggers format error (wrong format), confirm disabled until fixed |
| Legal-6022 | Empty cell on new row shows red ring; fill all cells, confirm enabled |
| Legal-6023 | Copy row — new row appears at bottom with same values |
| Legal-6024 | Delete row — inline confirm → row removed, DEL in change log |
| Legal-6025 | Delete row — cancel → row stays |
| Legal-6026 | Move up / move down — row order changes, MOVE in log |
| Legal-6027 | Undo EDIT — cell value reverts |
| Legal-6028 | Undo DEL — row reappears |
| Legal-6029 | Save All → success toast, change log clears |
| Legal-6030 | Column header tooltip visible on hover (BASE column) |
| Legal-6031 | >12-col rule (8056) opens ParamRowDialog on ✏️ click |

### Vitest integration — `live-server/src/__tests__/integration/api/legality-params.test.ts`

- PATCH with valid paramJson → 200, DB updated
- PATCH with malformed paramJson → 400
- PATCH by non-admin → 403
- PATCH with non-existent ruleId → 404
