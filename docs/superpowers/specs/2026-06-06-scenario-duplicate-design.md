# Scenario Duplicate — Design Spec

**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** `live-server` (backend) + `gantt` (frontend)

---

## Problem

The Scenario list item already shows a "Duplicate" menu entry but it is disabled and wired to a no-op handler. Users need to clone an existing scenario (config + filters) as a DRAFT, rename it, and run a new optimization without re-entering all parameters.

---

## Approach

Backend `/duplicate` endpoint (Option A). A single `POST /api/scenario/:id/duplicate` route reads the source, deep-copies all configuration fields, resets all optimization-state fields to their zero values, auto-creates a fresh workset (required by the `uq_scenario_workset` unique constraint), and returns the new scenario row. The frontend calls one URL, then auto-selects the new scenario so the user can immediately rename it.

---

## Backend (`live-server`)

### New route

```
POST /api/scenario/:id/duplicate
```

- Validates `:id` is a valid integer
- Delegates to `scenarioService.duplicate(fastify, id, username)`
- Returns `success(reply, newScenario)` or `fail(reply, 404, ...)` if source not found

### New service method — `scenarioService.duplicate`

```
duplicate(fastify, id, username) → ScenarioDetail
```

Steps:
1. `getById(id)` — throw 404 if not found
2. Build insert payload copying these fields from the source:
   - `fileType`, `strDtLoc`, `endDtLoc`, `leadinLive`
   - `ruleGroupCode`, `cqfsetId`
   - `pairingScenarioId`, `flightScenarioId`, `rankCross`
   - `filterParams`, `comments`
   - `isPublic`, `isFavorite`
3. `name` → `"Copy of <source.name>"`, truncated to 200 chars
4. **Omit** (reset to defaults): `worksetId` (auto-created), `taskId`, `filePath`, `fileSize`, `checksum`, `processId`, `status`, `version`, `optimizedCount`, `action`
5. Calls `this.create(fastify, payload, username)` — reuses workset auto-creation and cache invalidation
6. Returns the new scenario row

No DB migration required. Pure application logic layered on the existing `create` path.

---

## Frontend

### `gantt/src/services/scenario-api.ts`

Add one method:

```ts
async duplicate(id: number): Promise<ScenarioDetail> {
  return api.post(`/api/scenario/${id}/duplicate`, {}) as Promise<ScenarioDetail>
}
```

### `gantt/src/stores/scenario-store.ts`

Add `duplicateScenario(id: number)` action:

1. `set({ saving: true })`
2. `await scenarioApi.duplicate(id)` → `newScenario`
3. `set({ focusNameField: true })` — signals the name input to focus
4. `await fetchList()` — refresh sidebar count + order
5. `await selectScenario(newScenario.id)` — open detail panel
6. `set({ saving: false })`
7. `notify.success('Scenario duplicated')`

Add `focusNameField: boolean` to store state (default `false`). Consumer clears it after reading.

### `gantt/src/components/scenario/scenario-detail-panel.tsx`

The name input (`data-testid="scenario-name-input"`) lives in the detail panel header. Add a `useRef<HTMLInputElement>` to it, subscribe to `focusNameField` via `useEffect`, call `inputRef.current?.select()` once, then `store.clearFocusNameField()`.

### `gantt/src/components/scenario/scenario-list-panel.tsx`

`handleDuplicate(id)` → `void store.duplicateScenario(id)` (remove the stub body)

### `gantt/src/components/scenario/scenario-list-item.tsx`

Remove `disabled` prop from the Duplicate `DropdownMenuItem`.

---

## UX Flow

```
User clicks ⋯ → Duplicate
  → saving spinner starts
  → POST /api/scenario/:id/duplicate
  → list refreshes (new item "Copy of …" appears)
  → detail panel opens for new scenario
  → name input is selected (user can type immediately)
  → toast: "Scenario duplicated"
```

---

## Testing

**E2E** — `e2e/tests/gantt/scenario-duplicate.spec.ts`

| Step | Assertion |
|------|-----------|
| Create source scenario via API | — |
| Navigate to its list item, open ⋯ menu, click Duplicate | Menu item is enabled and clickable |
| List refreshes | New item with name `"Copy of <source>"` is visible |
| Detail panel | Opens automatically for the new scenario |
| Name field | Has value `"Copy of <source>"` and is selected |
| Cleanup (`afterEach`) | Delete both scenarios via API |

**Regression guard:** the test would have failed before the fix (button was disabled).

---

## Out of scope

- Copying KPIs (belong to optimization results, not config)
- Copying optimization artifacts (`taskId`, file data)
- Bulk duplicate
- Rename dialog before creation (user edits via existing name field in detail panel)
