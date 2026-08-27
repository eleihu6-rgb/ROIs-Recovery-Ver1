# RES Pairing Planner Define Generate Merge Design

## Context

The RES Pairing Planner dialog currently separates reserve setup and generation across three tabs:

- `Define`
- `Review & Generate`
- `Manage existing`

The requested workflow is to merge the create/generate flow into one page. Users should define reserve cells and immediately choose the conflict policy and generate from the end of the `Define` page. `Manage existing` remains a separate page.

## Goals

- Remove the visible `Review & Generate` tab.
- Add the existing review/generate content to the end of the `Define` page.
- Preserve current generation behavior:
  - summary table when cells exist
  - "No cells defined. Go to the Define tab and apply a plan first." empty message when no cells exist
  - conflict policy options: `Skip`, `Overwrite`, `Add`
  - Generate button behavior, API call, filter refresh, dialog close, and last-result banner state
- Keep the implementation scoped to the RES Pairing Planner UI.

## Non-Goals

- No backend API changes.
- No database/schema changes.
- No changes to reserve generation semantics.
- No redesign of the calendar, entry panel, or Manage existing page.
- No rewrite of the planner store beyond what is necessary to avoid a stale `review` tab rendering path.

## Design

The dialog tab bar will contain two tabs:

- `Define`
- `Manage existing`

The `Define` tab body keeps its current layout:

1. Scope toolbar with base chips, division toggle, rank hint, and Clear all.
2. Calendar plus entry panel grid.
3. Review/generate section appended below the calendar grid.

The appended review/generate section reuses the existing `ReviewGenerate` behavior. This keeps generation logic in one place and avoids duplicating the API/filter/notification flow inside `DefineWorkspace`.

When no cells are defined, the section displays the existing empty text:

`No cells defined. Go to the Define tab and apply a plan first.`

Then it displays:

- `Conflict policy`
- `Skip` with `Leave existing pairings unchanged`
- `Overwrite` with `Replace existing pairing composition`
- `Add` with `Insert new pairings alongside existing`
- `Generate` aligned at the end of the section

When cells are defined, the existing summary table and pairing count remain above the conflict policy.

## Component Changes

### `res-pairing-planner-dialog.tsx`

- Remove the `Review & Generate` entry from the tab list.
- Remove the branch that renders `ReviewGenerate` as a standalone tab.
- Render `DefineWorkspace` for the default/create workflow.
- Keep `ManageExisting` for the management workflow.
- If a stale store value still has `tab === 'review'`, render `DefineWorkspace` so the dialog does not show a dead page.

### `define-workspace.tsx`

- Import `ReviewGenerate`.
- Render `<ReviewGenerate />` after the calendar and entry panel grid.
- Preserve the current scroll container behavior so the generate controls appear at the end of the Define page.

### `review-generate.tsx`

- Keep the existing generation logic.
- Update comments if needed so the file is no longer described only as a standalone tab body.

## Testing

- Run `cd gantt && npx tsc --noEmit`.
- If a Gantt dev server is available, visually verify:
  - RES Pairing Planner shows only `Define` and `Manage existing` tabs.
  - Define page contains the conflict policy and Generate controls at the bottom.
  - Empty state text is visible before any cells are defined.
  - Generate button remains disabled when there are no cells.

## Risks

- Existing tests or selectors may expect `res-tab-review`. If tests fail, update only the affected RES planner tests to assert the new two-tab workflow.
- If store state can persist a stale `review` tab, fallback rendering to `DefineWorkspace` avoids a blank or unreachable UI.
