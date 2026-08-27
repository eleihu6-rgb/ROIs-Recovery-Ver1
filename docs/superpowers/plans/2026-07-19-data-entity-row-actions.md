# Data Entity Row Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Edit, Copy, and Delete for every Data entity row, in that order, and make Copy/Delete work for all exposed Data entities.

**Architecture:** Reuse the existing registry-driven Data grid and edit dialog. Add Copy as a create-mode path that reuses the edit dialog, and add a generic live-server fallback for Data entities not covered by bespoke save cases.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, Fastify, Drizzle ORM, PostgreSQL.

## Global Constraints

All Data entity row actions are unconditional.
The action column order is Edit, Copy, Delete.
Copy must not reuse the source row id.
Delete remains a physical delete and must surface database failures.
No new dependencies.

---

### Task 1: Frontend Row Action Tests

**Files:**
- Create: `gantt/src/components/data/__tests__/data-grid-actions.test.tsx`
- Test: `gantt/src/components/data/__tests__/data-grid-actions.test.tsx`

**Interfaces:**
- Consumes: `DataGrid` props `onEditRow`, `onCopyRow`, `onDeleteRow`
- Produces: tests proving action order and click callbacks

- [ ] Write tests that render `DataGrid` with one row and assert the action headers are `Edit`, `Copy`, `Del`.
- [ ] Assert clicking `data-copy-row-1` calls `onCopyRow` with the source row.
- [ ] Run `npm --prefix gantt run test -- src/components/data/__tests__/data-grid-actions.test.tsx --run` and verify the test fails before implementation.

### Task 2: Copy Dialog Tests

**Files:**
- Create: `gantt/src/components/data/__tests__/data-edit-dialog-copy.test.tsx`
- Modify: `gantt/src/components/data/data-edit-dialog.tsx`
- Test: `gantt/src/components/data/__tests__/data-edit-dialog-copy.test.tsx`

**Interfaces:**
- Consumes: `DataEditDialog` with `row={null}` and copied initial values
- Produces: create payload excludes readonly/id fields

- [ ] Mock `dataApi.save`.
- [ ] Render `DataEditDialog` for copied `base` values.
- [ ] Click Save and assert the submitted change is `action: 'create'` with no `rowId`.
- [ ] Run the focused Vitest file and verify it fails before implementation.

### Task 3: Frontend Implementation

**Files:**
- Modify: `gantt/src/components/data/data-grid.tsx`
- Modify: `gantt/src/components/data/basic-table-page.tsx`
- Modify: `gantt/src/components/data/crew-master-view.tsx`
- Modify: `gantt/src/components/data/data-edit-dialog.tsx`
- Modify: `gantt/src/config/data-entity-registry.ts`

**Interfaces:**
- Produces: `DataGridProps.onCopyRow?: (row: DataPageRow) => void`
- Produces: `DataEditDialog.initialValues?: Record<string, unknown>`

- [ ] Add Copy icon/button column between Edit and Del.
- [ ] Always pass Edit, Copy, and Delete handlers for Basic pages.
- [ ] Pass the same handlers for Crew Master grids where rows are rendered.
- [ ] Add `initialValues` support to create mode.
- [ ] Set every registry entry to deletable/creatable where needed for consistency.
- [ ] Re-run the focused frontend tests and verify PASS.

### Task 4: Backend Generic Data Save Tests

**Files:**
- Create: `live-server/src/__tests__/services/data/data-save-service-generic.test.ts`
- Modify: `live-server/src/services/data/data-save-service.ts`
- Test: `live-server/src/__tests__/services/data/data-save-service-generic.test.ts`

**Interfaces:**
- Consumes: `DataSaveService.save(fastify, changes, userId)`
- Produces: create/delete support for Data entities without bespoke switch cases

- [ ] Add a test proving `base` create no longer throws unsupported entity.
- [ ] Add a test proving `base` delete calls `tx.delete(...).where(...)`.
- [ ] Add a test proving a registry Data entity with only generic support can create/delete.
- [ ] Run `npm --prefix live-server run test -- src/__tests__/services/data/data-save-service-generic.test.ts --run` and verify failure before implementation.

### Task 5: Backend Implementation

**Files:**
- Modify: `live-server/src/services/data/data-save-service.ts`

**Interfaces:**
- Produces: generic `createGenericEntity` and `deleteGenericEntity` fallback inside `DataSaveService`

- [ ] Build a server-side entity metadata map for all Data entity ids exposed by the frontend page map.
- [ ] For create, map known camelCase fields to DB columns and apply audit create fields.
- [ ] For delete, require numeric `rowId` and delete by primary key.
- [ ] Keep bespoke cases for entities with special handling, such as assignment numeric fields and composition child deletion.
- [ ] Re-run focused backend tests and verify PASS.

### Task 6: Full Verification

**Files:**
- Test-only

**Interfaces:**
- Consumes: completed frontend and backend implementation
- Produces: verification receipt

- [ ] Run `npm --prefix gantt exec tsc -p tsconfig.json --noEmit`.
- [ ] Run `npm --prefix live-server exec tsc -p tsconfig.json --noEmit`.
- [ ] Run `npm run check:ui`.
- [ ] Run focused Data Playwright tests under `e2e/tests/gantt/data-*.spec.ts`.
- [ ] Report exact PASS/FAIL results.
