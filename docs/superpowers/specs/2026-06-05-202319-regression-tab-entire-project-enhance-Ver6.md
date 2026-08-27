# Regression Tab Entire Project Catalog - enhance-Ver6

Timestamp: 2026-06-05 20:23:19 America/Vancouver

Status: Approved by user on 2026-06-05 and implemented in this pass.

## Request

Change the Gantt Regression tab so it shows the entire project regression catalog, not only top-level Gantt Playwright cases.

## Current Behavior

- UI reads `GET /fpqe/ai/regression/tests`.
- Backend store file is `ai-server/regression_tests.json`.
- Import endpoint is `POST /fpqe/ai/regression/import-specs`.
- `ai-server/src/regression/routes.py` currently points `_spec_dir()` at `e2e/tests/gantt`.
- `ai-server/src/regression/importer.py` currently scans only top-level `*.spec.ts`.
- Result: the Regression tab shows `107`, which is accurate for the current Gantt-only catalog but does not include PBS Portal cases.

## Target Behavior

The Regression tab should show all Playwright E2E specs under `e2e/tests/**`, including:

- `e2e/tests/gantt/**`
- `e2e/tests/pbs-portal/**`
- `e2e/tests/pbs-app/**`
- `e2e/tests/perf/**`

The catalog should store `spec_file` as a stable path relative to `e2e/tests`, for example:

- `gantt/query-filter.spec.ts`
- `gantt/help/help-navigation.spec.ts`
- `pbs-portal/auth.spec.ts`

## Non-Goals

- Do not add unit/component/Vitest/pytest tests to the Regression tab in this change.
- Do not change Playwright execution semantics beyond supporting relative spec paths.
- Do not delete existing `ai-server/regression_tests.json` entries.
- Do not change test behavior or product behavior.

## Implementation Plan

1. Replace `_spec_dir()` with an E2E tests root resolver that returns `repo/e2e/tests`.
2. Update `import_specs()` to recursively scan `**/*.spec.ts`, skip `auth.setup.ts`, and store relative paths from the E2E tests root.
3. Keep import idempotency by continuing to dedupe on `(spec_file, test_name)`.
4. Adjust category inference to work from the relative path:
   - paths beginning `gantt/` keep current Gantt categories where possible.
   - paths beginning `pbs-portal/` become `PBS Portal`.
   - paths beginning `pbs-app/` become `PBS App`.
   - paths beginning `perf/` become `Performance`.
5. Update AI server tests for recursive import and route import endpoint.
6. Run targeted AI server regression tests:
   - `ai-server/tests/test_importer.py`
   - `ai-server/tests/test_regression_routes.py::test_import_specs_endpoint`

## Expected Count After Import

Current filesystem scan using the same plain `test(...)` parser:

- all `e2e/tests/**`: 131 Playwright declarations
- `e2e/tests/gantt/**`: 116
- `e2e/tests/pbs-portal/**`: 11
- `e2e/tests/pbs-app/**`: 2
- `e2e/tests/perf/**`: 2

Because the catalog dedupes by `(spec_file, test_name)`, duplicate titles in the same spec file remain single catalog entries. Current Gantt top-level duplicates account for 3 duplicate declarations in `gantt/other-bindings.spec.ts`.

## Risks And Verification

| Risk | Mitigation |
|------|------------|
| Existing catalog entries use old Gantt-only `spec_file` names. | Keep existing entries intact; new imports use relative paths. Existing run behavior remains available for old entries. |
| Duplicate old/new Gantt entries after import. | Acceptable for the first migration unless a cleanup step is explicitly requested; cleanup can be planned separately to avoid destructive edits. |
| Runner may receive nested relative paths. | Verify runner accepts spec paths like `pbs-portal/auth.spec.ts`; if needed, adjust runner path resolution in the same change. |
| UI category grouping changes. | Verify Regression tab loads and category filters still work. |

## Implementation Notes

Implemented after user approval:

- `import-specs` now scans `e2e/tests/**/*.spec.ts`.
- Catalog `spec_file` values are stored relative to `e2e/tests`.
- Existing legacy Gantt-only `spec_file` values remain runnable through runner compatibility mapping.
- `pbs-portal`, `pbs-app`, and `perf` paths receive module-level categories.
