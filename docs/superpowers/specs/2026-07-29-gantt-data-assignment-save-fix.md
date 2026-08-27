# Gantt Data Table Editing And Validation Fix

## User Feedback Incorporated

The earlier backend-only normalization proposal is not the correct product direction. The Data tab must prevent bad input before save, explain valid values to the planner, and avoid resubmitting unrelated columns.

This design covers three linked issues:

1. Assignment edit currently allows invalid values such as `Credit % = 33` for a DB field defined as `numeric(3,2)`.
2. The Data toolbar shows Undo / Redo / Validate / Save / Close-style actions, but the current row edit dialog saves directly and bypasses that toolbar workflow.
3. The generic table should support direct cell editing so changing one cell only submits that one field.

## Current Evidence

- `assignment.credit_pct`, `bt_pct`, `fdp_pct`, `dp_pct`, `ft_pct`, and `wp_pct` are `numeric(3,2)` in `sql/schema/live/01-base.sql`.
- `DataEditDialog` renders every editable field as a plain text `Input`, with only `inputMode="decimal"` for number fields.
- `DataEditDialog` sends the whole row on update: `after: { ...values }`.
- `DataToolbar` has:
  - Undo / Redo wired to `data-maintenance-store`.
  - Validate disabled.
  - Save without an `onClick`.
  - X wired to `discardAll`.
- The dialog save path bypasses `applyChange`, so toolbar state does not reflect row edits.

## Design Goals

- Input controls must be schema-aware enough to stop obvious invalid values before save.
- Validation messages must tell the user exactly what to enter.
- Editing one field must not update other fields.
- The table component should stay generic: behavior comes from column metadata, not assignment-only branching in the grid.
- Toolbar controls must either be fully connected to the edit workflow or removed/simplified if they do not serve the chosen workflow.

## Column Metadata Extension

Extend `DataColumnConfig` to express input constraints:

- `inputKind`: `text | integer | decimal | percentRatio | boolean | date | datetime | time | select | colorHex`
- `min`, `max`, `step`
- `placeholder`
- `helpText`
- `pattern`
- `nullable`

Assignment-specific examples:

- `creditPct`, `btPct`, `fdpPct`, `dpPct`, `ftPct`, `wpPct`
  - `inputKind: "percentRatio"`
  - valid stored value: `0` to `1`
  - UI helper: "Enter a ratio from 0 to 1, e.g. 0.33 means 33%."
  - reject `33` with a friendly message instead of relying on PostgreSQL.
- `fixedStrTm`, `fixedEndTm`
  - `inputKind: "time"`
  - browser time input, `HH:mm`.
- `fixedDurationMin`, `fixedCreditMin`, `restTime`, `dpGap`, `beforePctDpGapMin`, `afterPctDpGapMin`
  - `inputKind: "integer"`
  - min `0` where business meaning requires non-negative.
- `colorHex`, `pairingLabelColorHex`, `segmentLabelColorHex`
  - `inputKind: "colorHex"`
  - accept/display six hex chars, optionally with a swatch.
- boolean fields
  - checkbox/toggle, not a text input.
- date fields in other Data entities
  - browser date input.
- datetime fields
  - browser datetime-local input, with server conversion kept explicit.

## Validation

Client-side validation:

- Reuse the registry metadata to validate required fields, max length, numeric min/max, integer-ness, `HH:mm`, date, datetime, and hex colors.
- Show field-level error text next to the edited cell/control.
- Disable commit/save for invalid edits.

Server-side validation:

- Add the same critical Assignment ratio guard in `data-validation-service` or `data-save-service` so API callers cannot bypass UI validation.
- Error message should be business-readable, e.g. `Credit % must be between 0 and 1. Use 0.33 for 33%.`
- Do not silently normalize `33` to `0.33` as the primary behavior.

## Editing Model

Replace the whole-row edit dialog as the primary edit path for normal table cells:

- Double-click an editable cell to enter edit mode.
- Commit with Enter or blur.
- Cancel with Escape.
- For a single-cell edit, create a `DataChange` with `after: { [fieldKey]: newValue }` and include `before: { [fieldKey]: oldValue }`.
- Do not send untouched columns.
- Keep row-level Add / Copy flows as a dialog if needed, because creating a row may require several required fields.

The generic table should render editors based on column metadata:

- text: text input
- integer / decimal: number input
- percentRatio: constrained number input with helper/error
- boolean: checkbox or toggle
- date: date input
- datetime: datetime-local input
- time: time input
- select: select control from reference/options
- colorHex: hex input plus swatch

## Toolbar Decision

Use immediate per-cell save. Remove the dead toolbar actions:

- Remove Undo / Redo / Validate / Save / Discard from the Data tab toolbar.
- Keep the compact title/count strip only.
- Each editable cell owns its validation, saving, and error state.

Rationale: inline single-cell editing does not need a page-level draft lifecycle. Keeping draft controls would reintroduce the confusing half-wired workflow that exists today.

## Implementation Plan

1. Extend Data column metadata with input constraints.
2. Add metadata-driven value parsing and validation helpers in `gantt/src/utils/data-validation.ts` or a new nearby utility.
3. Convert `DataGrid` to support double-click inline editing for editable cells.
4. On a valid cell commit, save immediately with a single-field `DataChange` payload.
5. Remove dead Data toolbar action buttons.
6. Keep dialog only for Add / Copy, with typed controls using the same metadata where practical.
7. Add server-side Assignment ratio validation as a final guard.
8. Update focused unit tests and Gantt Data Playwright coverage.

## Tests

Frontend unit tests:

- `DataGrid` enters edit mode on double-click and commits only one changed field.
- percentRatio fields reject `33` and explain `0.33 means 33%`.
- boolean/date/time fields render the correct input type.
- toolbar no longer renders dead Undo / Redo / Validate / Save / Discard controls.

Backend unit tests:

- Assignment save rejects or validation-flags `creditPct: 33`.
- Assignment save accepts `creditPct: 0.33`.
- Single-field update payload does not require other Assignment fields.

Playwright:

- Open Data -> Assignment.
- Double-click `Credit %`, enter `33`, see friendly validation, no SQL/backend error.
- Enter `0.33`, save, reload, confirm value persists, then revert.
- Verify the old dead toolbar buttons are absent.

Verification commands:

- `npm --prefix gantt run check:ui`
- focused Gantt unit tests for Data components
- `npm --prefix live-server test -- data-save-service-assignment.test.ts data-validation-service*.test.ts`
- focused Playwright Data-tab test

## Risks And Notes

- This is broader than a one-line backend fix because the current UI has a partial draft workflow and a separate immediate-save dialog workflow.
- The generic inline grid should be built incrementally, starting with Assignment, but the component and metadata must remain reusable.
- GitNexus `impact()` / `detect_changes()` tools are required by project rules but are not exposed in this Codex session. Local code tracing identifies the affected areas above.
