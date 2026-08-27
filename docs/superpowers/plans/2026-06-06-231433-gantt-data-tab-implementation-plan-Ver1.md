# Gantt Data Tab Implementation Plan

Date: 2026-06-07
Spec: `docs/superpowers/specs/2026-06-07-gantt-data-tab-design.md`
Mock: `docs/assets/mockups/gantt-data-tab-mock.html`
Status: Draft, implementation gated by user approval

## Objective

Implement the Gantt `Data` module as a professional master-data maintenance workspace for Basic setup data and Crew HR data, with strong integrity validation, undo/redo before save, grouped single-page crew/composition views, expiry-based crew queries, and Playwright coverage that proves behavior using real data assertions.

## Non-Scope

- Do not maintain flight, pairing, roster, scenario, rule-authoring, security, or operational tag-assignment tables from this module.
- Do not build a free-form SQL/table editor.
- Do not rely on front-end-only integrity checks.
- Do not introduce a new grid dependency unless license/security review is completed first.

## Phase 0 - Preflight Audit

Deliverables:

- Confirm current routes/services for `base`, `rank`, `fleet`, `composition`, and crew sub-resources.
- Confirm current data conventions for comma-separated fields in `crew_qualification.bases`, `ranks`, `fleets`, `teams`.
- Confirm which Basic/Crew tables have existing services and which need the new `/api/data/*` layer first.
- Confirm no production credentials, PII, or sensitive document numbers are added to docs, mocks, logs, or tests.

Exit gate:

- Short implementation note added to PR/working log with confirmed table-service coverage and any deferred tables.

## Phase 1 - Frontend Read-Only Shell

Files:

- `gantt/src/components/data/data-view.tsx`
- `gantt/src/components/data/data-tree.tsx`
- `gantt/src/components/data/data-toolbar.tsx`
- `gantt/src/components/data/data-filter-bar.tsx`
- `gantt/src/components/data/data-section.tsx`
- `gantt/src/components/data/data-grid.tsx`
- `gantt/src/components/data/crew-master-view.tsx`
- `gantt/src/components/data/composition-view.tsx`
- `gantt/src/components/data/validation-panel.tsx`
- `gantt/src/config/data-entity-registry.ts`
- `gantt/src/types/data-maintenance.ts`
- `gantt/src/services/data-api.ts`

Tasks:

- Wire `AppShell` module `data` to `DataView`.
- Implement Basic/Crew tree with stable `DataPageId` values.
- Implement grouped `Crew Master` read-only page.
- Implement grouped `Composition` page with `composition`, `composition_rank`, `composition_load`.
- Add stable `data-testid` values listed in the spec.
- Use lucide icons in app code, not inline SVG.

Exit gate:

- `npm --prefix gantt run typecheck` or `npx tsc --noEmit` from `gantt` passes.
- Data tab opens and displays tree/page shells without console errors.

## Phase 2 - Backend Read APIs and Registry

Files:

- `live-server/src/routes/data/index.ts`
- `live-server/src/services/data/data-entity-registry.ts`
- `live-server/src/services/data/data-query-service.ts`
- `live-server/src/services/data/data-reference-service.ts`
- `live-server/src/services/data/data-filter-parser.ts`

Tasks:

- Register `/api/data/catalog`.
- Register `/api/data/reference-options`.
- Register `/api/data/table/:entity`.
- Implement server-side pagination and filtering.
- Implement crew expiry filter:
  - `current`
  - `expired`
  - `expiring_in_days`
  - `range`
- Keep query scope limited to approved Basic/Crew entities.

Exit gate:

- Backend unit/integration tests prove unknown/disallowed entities are rejected.
- Expiry query tests prove `exp_dt` windows are applied server-side.

## Phase 3 - Draft Store, Undo/Redo, and Client Validation

Files:

- `gantt/src/stores/data-maintenance-store.ts`
- `gantt/src/utils/data-validation.ts`
- `gantt/src/utils/data-change-history.ts`

Tasks:

- Add per-page draft state.
- Add command stack for create/update/expire/delete.
- Add undo/redo behavior for unsaved changes only.
- Add dirty-row and dirty-section indicators.
- Add client-side validation for required fields, duplicate draft keys, invalid effective-date ranges, and missing reference options.

Exit gate:

- Frontend tests prove undo/redo reverts and reapplies cell edits.
- Save remains disabled while blocking client validation errors exist.

## Phase 4 - Server Validation

Files:

- `live-server/src/services/data/data-validation-service.ts`
- `live-server/src/services/data/data-reference-validator.ts`
- `live-server/src/services/data/data-effective-date-validator.ts`

Tasks:

- Implement parent-key validation.
- Implement duplicate key validation.
- Implement effective-date validation.
- Implement delete/expire parent-in-use validation.
- Return structured `DataValidationIssue[]`.
- Never log sensitive crew fields.

Exit gate:

- Tests reject missing parent base/rank/fleet/qualification/team.
- Tests reject overlapping effective windows where not allowed.
- Tests reject parent deactivation when active children exist.

## Phase 5 - Transactional Save

Files:

- `live-server/src/services/data/data-save-service.ts`
- `live-server/src/routes/data/index.ts`

Tasks:

- Add `POST /api/data/save`.
- Validate entire batch before writing.
- Save in one transaction.
- Apply audit fields from authenticated user.
- Invalidate relevant Redis caches.
- Return revision metadata and committed rows.

Exit gate:

- Transaction rollback test proves one failing change commits none.
- Cache invalidation test covers changed entity families.

## Phase 6 - Playwright and Regression Catalog

Files:

- `e2e/tests/gantt/data-tab-navigation.spec.ts`
- `e2e/tests/gantt/data-tab-crew-expiry.spec.ts`
- `e2e/tests/gantt/data-tab-integrity.spec.ts`
- `e2e/tests/gantt/data-tab-undo-redo.spec.ts`
- Optional helper: `e2e/utils/data-tab.ts`

Required scenarios:

- Data tab opens; tree roots and page IDs exist.
- Basic > Composition shows Composition, Composition Rank, Composition Load together.
- Crew Master shows grouped sections together.
- Crew filter composes at least two criteria and proves every returned row/section matches.
- Expired query proves all returned rows have `exp_dt < referenceDate`.
- Expiring-in-X-days query proves all returned rows have `referenceDate <= exp_dt <= referenceDate + X days`.
- Invalid parent selection is not offered by normal UI controls.
- Forced invalid parent save returns `missing_parent` and does not commit.
- Undo/redo works before save.
- Dirty changes warn before navigation/close.

Exit gate:

- All new Data tab Playwright specs pass with `--reporter=list`.
- Final response/PR includes the exact commands and PASS/FAIL summary.

## Phase 7 - Expansion and Hardening

Tasks:

- Add remaining scoped Basic pages after the core flows pass.
- Add view-only Crew Workload Summary.
- Add import/paste only after transactional validation is stable.
- Add performance checks for large crew result sets.

Exit gate:

- Read and edit paths remain under agreed performance budgets.
- No new anti-illusion exceptions are introduced.

## Mandatory Commands

Frontend:

```bash
cd gantt && npx tsc --noEmit
```

Backend:

```bash
cd live-server && npx tsc --noEmit
```

Playwright:

```bash
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-navigation.spec.ts --project=gantt --reporter=list
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-crew-expiry.spec.ts --project=gantt --reporter=list
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-integrity.spec.ts --project=gantt --reporter=list
npx playwright test --config=config/playwright.config.ts tests/gantt/data-tab-undo-redo.spec.ts --project=gantt --reporter=list
```

## Completion Standard

The feature is not complete until:

- Spec scope is implemented or explicitly deferred in the plan.
- TypeScript checks pass for touched TypeScript packages.
- Backend validation tests pass.
- Playwright tests pass with object-level assertions.
- No required evidence relies only on visibility, screenshots, or non-empty pixels.
- Final report includes command output summaries.

