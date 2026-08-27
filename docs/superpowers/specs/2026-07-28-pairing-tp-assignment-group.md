# Pairing Pane Tp Column Assignment Group

## Problem

The Pairing pane `Tp` column currently displays `pairing.assignment` truncated to three characters. Planners need this column to show the pairing assignment group instead.

## Current Behavior

- Live legacy Pairing pane maps `type` to `p.assignment?.substring(0, 3) || 'DOM'`.
- Shared Pairing pane used by Scenario maps `type` the same way.
- The visible column label remains `Tp`; the row value behind it is keyed as `type`.

## Scope

- Change the `type`/`Tp` cell value to use frontend `pairing.assignmentGroup`, which maps from backend `pairing.assignment_group`.
- Apply the same mapping in Live and Scenario paths.
- Do not change backend DTOs, column keys, column order, sorting, or filters.

## Verification

- Add focused rendered-header assertions that fail when `Tp` still reads `assignment` instead of `assignmentGroup`.
- Run the focused Gantt Pairing Base/Type column spec.
- Run `npm run check:ui`.
