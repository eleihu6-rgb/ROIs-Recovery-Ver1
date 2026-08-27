# Data Tab Assignment Fixed Credit and Table Actions

## Background

URL: `https://crew-f8-usva-sit.roiscloud.com/altair/data`

The Data tab Basic -> Assignment table is editable, but changing `Fixed Credit (min)` and saving does not persist the expected value. Wide Data tables are also hard to operate because action buttons scroll away horizontally and each table does not make good use of the available viewport.

## Findings

- Frontend registry maps Assignment `fixedCreditMin` to DB field `fixed_credit_min`, and the edit dialog submits camel-case keys.
- Backend `DataSaveService` has a dedicated `assignment` create/update path. It persists many Assignment fields, but `fixedCreditMin` / `fixed_credit_min` is missing from both create and update payloads.
- `DataGrid` renders Edit / Copy / Delete as separate trailing table columns. They are normal columns, so users must horizontally scroll to the far right before clicking row actions.
- Data sections are stacked in a vertical scroll container, while each grid only has horizontal scrolling. Large tables do not get a bounded viewport-height table body with sticky header/action affordances.

## Proposed Change

1. Persist Assignment Fixed Credit
   - Add `fixedCreditMin: toNum(after.fixedCreditMin ?? after.fixed_credit_min)` to Assignment create.
   - Add update support for `fixedCreditMin` when either camel-case or snake-case payload keys are present.
   - Extend the existing `data-save-service-assignment.test.ts` regression tests so Fixed Credit create/update would fail without this fix.

2. Make Data grids viewport-adaptive
   - Give each expanded Data section a bounded height based on viewport height, while still allowing stacked sections.
   - Keep the grid header sticky at the top of the scroll area.
   - Put row actions into a single sticky action column pinned to the right.
   - Preserve row-level Edit / Copy / Delete order and existing test IDs.

3. Keep scope surgical
   - Touch only Data tab grid/layout code and `DataSaveService` Assignment save logic.
   - Do not change DB schema, Assignment registry semantics, or unrelated Data entities.

## Verification

- `npm --prefix live-server test -- src/__tests__/services/data/data-save-service-assignment.test.ts --run`
- `npm --prefix gantt test -- src/components/data/__tests__/data-grid-actions.test.tsx src/components/data/__tests__/data-edit-dialog-copy.test.tsx --run`
- `npm --prefix gantt run build`
- `npm run check:ui` if available at the repository root; otherwise report that the command is unavailable.
- Real UI Playwright/manual receipt for `/altair/data`: verify Assignment `Fixed Credit (min)` save/refetch and sticky action column during horizontal scroll.

## Risks

- GitNexus `impact` / `detect_changes` tooling is not available in this Codex session, so impact analysis will be approximated from local code search and focused tests.
- The current worktree already has unrelated user changes; implementation must avoid touching or reverting those files.
