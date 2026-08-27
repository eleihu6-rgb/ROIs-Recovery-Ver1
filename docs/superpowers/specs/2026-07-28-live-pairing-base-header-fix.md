# Live Pairing Pane Base Header Fix

## Problem

In the Live Gantt Pairing pane, the left header column `Base` is visible but its cells render blank. The same column in Scenario renders `pairing.base` correctly.

## Evidence

- Live legacy Pairing pane builds `PanelRowData.values` in `gantt/src/components/panes/pairing-pane.tsx`, but currently omits the `base` key.
- Scenario shared Pairing pane builds `PanelRowData.values.base` from `p.base ?? ''` in `gantt/src/components/panes/shared/pairing-pane.tsx`.
- The frontend `Pairing` type already requires `base: string`, and Live pairing sort/filter code already uses `pairing.base`, so this is a display mapping gap rather than a missing DTO field.

## Scope

- Add `base: p.base ?? ''` to the Live Pairing pane left-header row values.
- Keep Scenario behavior unchanged.
- Do not change backend queries, pairing filters, sorting, or column defaults.

## Verification Plan

- Add or update focused Gantt regression coverage that would fail when Live Pairing `Base` cells are blank.
- Run the smallest focused test for the touched mapping.
- Run `npm run check:ui` for the Gantt frontend if frontend gate dependencies are available.

## Risks

- Low. The change only populates an existing visible column from an already-used DTO field.
- The remaining legacy/shared Pairing pane divergence is pre-existing; this fix does not attempt broader unification.
