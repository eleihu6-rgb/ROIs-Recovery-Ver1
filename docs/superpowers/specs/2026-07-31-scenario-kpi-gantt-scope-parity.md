# Scenario KPI Gantt Scope Parity

## Problem

Scenario KPI computation counted the optimizer input scope, while the DB-backed
Scenario Gantt rendered the loaded result scope. This made candidate crews and
unloaded FLY pairings appear in KPI totals.

## Behavior

- Crew, Credit, and Distribution crew counts use valid crews present in the
  loaded scenario roster and the live crew master.
- `Pairing Lines` includes only loaded FLY pairings resolvable in the same
  scenario roster/pairing scope used by Gantt.
- Reserve lines keep the source reserve-line count so uncovered reserve lines
  remain represented.
- If the loaded-result scope cannot be queried, KPI computation falls back to
  the optimizer input scope and logs a warning.

## Verification

- Add a regression fixture with an input-only FLY pairing.
- Run the focused scenario result-service Vitest suite.
- Run the live-server TypeScript build.
