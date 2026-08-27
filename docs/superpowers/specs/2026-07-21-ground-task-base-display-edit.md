# Ground Task Base Display and Edit

Date: 2026-07-21

## Goal

For roster tasks with `pairingId = null`, show the task `base` consistently in
Live and Scenario Gantt, and allow planners to edit the base for Live ground
tasks from the Edit Ground Task dialog.

## Current State

- `RosterItem` already has a `base` field.
- Live roster rows from `/api/roster` include `roster_flight.base`.
- Live ground-task create resolves `base` from `crew_base` at the task start date,
  but the create/edit dialog does not display it.
- Live ground-task edit sends assignment/time/comment only; `base` is not included
  in `UpdateRosterInput`.
- Live and Scenario hover status text for pairing-less roster tasks omits `base`.
- Scenario `Ground Task` dialog is intentionally view-only because Scenario has no
  ground-task write API.
- Scenario ground items currently lose base in two places:
  - parsed optimizer/result `ROSTER` ground items do not carry a `base` property;
  - lead-in live ground rows also drop base when mapped into Scenario ground items.

## Decisions

1. **Status bar**

   For any roster task where `pairingId = null`, include the base immediately
   after the pairing-id slot:

   ```text
   CrewId #TaskId  ·  Pairing #—  ·  Base YVR  ·  GRD  ·  DO  ·  ...
   ```

   This keeps the requested placement relative to PairingId while making the
   missing pairing explicit.

2. **Live Edit Ground Task**

   Add a `Base` row to the edit dialog:

   - Live edit mode: editable select populated from `/api/base`.
   - The select defaults to the current crew base for the edited task (`editItem.base`),
     so the crew's existing base is already selected when the dialog opens.
   - Scenario view-only mode: read-only display.
   - Create mode: no manual base field. Creation continues to resolve base from
     effective `crew_base` on the backend, preserving existing business logic.

3. **Save behavior**

   Add `base?: string` to `UpdateRosterInput` and include `base` when saving a
   Live ground-task edit. The existing live-server `rosterService.update` already
   passes partial fields through to `roster_flight`, so no new backend route is
   required.

4. **Scenario data**

   Add `base?: string` to `ScenarioGanttGroundItem` on both server and client.

   - Optimizer/result ground rows use the `base` value when present in the
     parsed ROSTER row; otherwise empty string.
   - Lead-in live ground rows preserve `roster_flight.base`.
   - `buildScenarioRosterItems` maps `g.base` into the resulting `RosterItem`.

5. **Scope boundary**

   Scenario remains view-only for ground-task editing. Enabling Scenario ground
   task writes would require a separate Scenario patch/write contract and is out
   of scope for this UI consistency fix.

## Files

- `gantt/src/components/gantt/source/live-gantt-source.ts`
- `gantt/src/components/gantt/source/scenario-gantt-source.ts`
- `gantt/src/components/roster/ground-task-dialog.tsx`
- `gantt/src/types/roster.ts`
- `gantt/src/types/scenario-gantt.ts`
- `gantt/src/components/scenario-gantt/build-scenario-roster-items.ts`
- `live-server/src/services/scenario/scenario-gantt-service.ts`

## Tests

- Extend `e2e/tests/gantt/ground-task-dialog.spec.ts`:
  - injected pairing-less ground task with base `YVR`;
  - Edit Ground Task shows Base;
  - changing Base and saving sends `base` in the update payload;
  - hover status bar includes `Pairing #— · Base YVR` for a pairing-less task.
- Extend focused unit coverage:
  - `live-server/src/__tests__/services/scenario-gantt-service.test.ts` preserves
    lead-in ground row base;
  - `gantt/src/components/scenario-gantt/__tests__/build-scenario-roster-items.test.ts`
    maps Scenario ground item base into `RosterItem`.

## Verification

- `cd gantt && npx tsc --noEmit`
- `cd gantt && npm test -- --run <focused gantt tests>`
- `cd live-server && npm test -- --run <focused live-server tests>`
- `cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/ground-task-dialog.spec.ts --reporter=list`
- `npm run check:ui`
- `node .gitnexus/run.cjs detect_changes --scope compare --base-ref main`
