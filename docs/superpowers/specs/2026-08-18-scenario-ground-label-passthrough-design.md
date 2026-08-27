# Scenario ground-duty puck label passthrough

**Date:** 2026-08-18  
**Status:** Approved for implementation (user chose approach 1)  
**Scope:** Scenario Gantt DB loader only. Display codes such as PRAM/PRPM/GDO already render when `groundItems.label` is present.

## Problem

Live roster for crew `1485` stores reserve as a ground row (`pairing_id IS NULL`, `assignment_group='GRD'`, `assignment='RES'`) with the specific code on `roster_flight.label` (`PRAM` / `PRPM` / `PRMOD`). Shared puck text (`buildGroundTaskPuckLabel`, F314) prefers `label` over `assignment`, so Live shows PRAM/PRPM.

Scenario **743** already has the same labels on `f8_sit_scenario.roster_flight`. The Scenario Gantt still shows generic `RES` because `buildGanttDataFromDb` does not select or map `label` for pairing-less rows. The frontend then falls back to `assignment`.

Lead-in (`mapLeadinRows` / `loadLeadinFromLive`) and snapshot (`parseRosterGroundItems`) already copy `label`. `buildScenarioRosterItems` already sets roster `label` to `g.label || g.assignment`. Only the DB-backed Scenario Gantt path drops it.

## Decision

Pass `roster_flight.label` through the Scenario DB ground-item query, the same way Live and lead-in already do.

- Keep `assignment` as the generic code (`RES`, `DO`, …). Do not rewrite it to PRAM/PRPM.
- Map `label` onto existing `ScenarioGanttGroundItem.label`.
- Do not convert `GRD`+`RES` ground rows into SBY pairings. `injectSbyAssignments` still lifts only `assignmentGroup === 'SBY'`.
- No schema change, no data backfill, no solver rerun. Scenario 743 is already correct in the database.
- Renderer and Live Gantt stay unchanged.

Older scenarios whose stored `label` is null (example: scenario 705) keep showing `RES`. That is stored data, not this mapping bug.

## Change

`live-server/src/services/scenario/scenario-gantt-db-service.ts` ground-item load:

1. Add `label` to the SELECT next to `assignment`.
2. Add `label` to the execute row type.
3. Map `label: row.label ?? null` on each `ScenarioGanttGroundItem`.

## Tests

- Extend `live-server/src/services/scenario/__tests__/scenario-gantt-db-service.test.ts`: a mocked ground row with `assignment='RES'` and `label='PRPM'` must appear on `groundItems` as `assignment='RES'` and `label='PRPM'`. Existing SQL-text mocks that match the ground SELECT must include `label`.
- Existing coverage already proves the display contract:
  - Gantt `buildGroundTaskPuckLabel`: `RES` + `label='PRPM'` → `'PRPM'`
  - `buildScenarioRosterItems`: prefers `label` over generic `assignment` (GDO)
- No Playwright for this change: the UI already paints `label` when the payload has it; the bug is the DB mapper omitting the field. No Gantt/CSS files are touched, so `check:ui` is not required.

## Out of scope

- Backfilling null `label` on older scenarios
- Changing `assignment`, assignment-group, or SBY pairing injection
- Live Gantt, snapshot/gz loaders, lead-in loaders (already pass `label`)
- Export, legality, solver, or `roster_flight` schema
