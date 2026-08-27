# Live Publish Roster Filter Layout Fix

## Goal

Adjust the Live `Publish Roster` dialog filter row so the `Division` control sits immediately to the right of `Status` and immediately to the left of the `Search` button. The `Search` and `Reset` buttons should be visually narrower, while the remaining filter controls keep a consistent aligned grid.

## Scope

- File: `gantt/src/components/roster/roster-publish-dialog.tsx`
- Tests:
  - `gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx`
  - `e2e/tests/gantt/roster-publish-dialog.spec.ts`

## Intended UI change

1. Keep the existing first filter row structure.
2. Move `Division` into the second filter row so the order becomes:
   `Crew ID` → `Pairing ID` → `Pairing Label` → `Status` → `Division` → `Search` → `Reset`.
3. Reduce the width of `Search` and `Reset` so they no longer dominate the right side of the row.
4. Preserve equal heights and baseline alignment across all filter controls.
5. Keep the other inputs/selects aligned to a consistent grid so the row reads as one coherent form.

## Non-goals

- No query behavior changes.
- No API changes.
- No data-model changes.
- No change to the Scenario publish dialog.

## Verification

- Update the unit test to assert the new control order / presence.
- Update the Playwright spec to verify the new layout still exposes all controls and keeps the dialog usable.
- Run the smallest relevant UI test set after implementation.

