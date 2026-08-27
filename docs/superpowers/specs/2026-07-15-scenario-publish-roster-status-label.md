# Scenario Publish Roster Status + Pairing Label

## Goal

Update the Scenario `Publish Roster` dialog so planners can see both `Pairing ID` and `Pairing Label`, and so the row `Status` only shows `Published` for assignments that were actually written back to Live by solver/scenario publish flow.

## Current Behavior

- `gantt/src/components/scenario/publish-roster-dialog.tsx` displays `Pairing ID`, but not `Pairing Label`.
- `live-server/src/routes/scenario/scenario.ts` enriches roster rows with `published`.
- The current published check treats any Live `roster_flight` row matching `(crew_id, pairing_id)` as published.
- This makes pre-assigned / lead-in duties look `Published` because those duties already exist in Live, even though they were not published from the scenario result.

## Proposed Change

- Add a `Pairing Label` column immediately after `Pairing ID` in the dialog table.
- Continue using the existing `pairingLabel` field already returned by `/api/scenario/:id/roster`.
- Change backend published detection to require a Live `roster_flight` row for the same `(crew_id, pairing_id)` whose source proves scenario/solver publication:
  - Treat `source = 'CR'` as published, matching the publish endpoint's current inserted rows.
  - When publishing new rows, also stamp `request_source = 'SCENARIO'` and `request_id = <scenarioId>` for future traceability.
- Do not mark Live `PA` pre-assignment rows as published.

## Affected Modules

- `live-server`: `/api/scenario/:id/roster` published derivation and `/api/scenario/:id/publish` inserted row metadata.
- `gantt`: Scenario `Publish Roster` dialog table.
- Tests:
  - Add/update focused live-server coverage for `published` derivation so `PA` is pending and `CR` is published.
  - Add/update focused frontend coverage if an existing component test harness exists; otherwise use Playwright/API-level verification as the UI regression proof.

## Risks

- Existing rows published by older code have `source = 'CR'`, so they remain visible as `Published`.
- If any non-publish workflow also writes Live roster rows with `source = 'CR'`, those rows would still show published. I have not found a more precise historical marker in the current schema. The new `request_source/request_id` stamp gives future rows better provenance without requiring schema changes.

## Verification Plan

- Focused live-server test for status derivation.
- Gantt/frontend targeted test for the new `Pairing Label` column if practical.
- `npm run check:ui` if frontend style changes trigger the UI gate.
- Report any tests that cannot be run and the exact blocker.
