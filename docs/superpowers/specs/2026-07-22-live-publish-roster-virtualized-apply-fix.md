# Live Publish Roster Virtualized Apply Fix

## Context

The Live `Publish Roster` dialog currently loads diff rows with server pagination and renders every row returned for the page. The user wants the dialog to behave like `Import Optimized Roster to Live`: no pagination UI, load the matched table data once, and render only visible DOM rows with virtual spacer rows above and below.

Publishing a selected crew can also fail with PostgreSQL `could not determine data type of parameter $2`. The apply path passes an unused second parameter into the ground-row insert SQL; PostgreSQL rejects an unreferenced placeholder because it cannot infer its type.

## Scope

- Frontend: `gantt/src/components/roster/roster-publish-dialog.tsx`
- Frontend unit test: `gantt/src/components/roster/__tests__/roster-publish-dialog.test.tsx`
- Backend service: `live-server/src/services/roster/roster-publish-service.ts`
- Backend unit test: `live-server/src/__tests__/services/roster/roster-publish-service.test.ts`

## Design

- Keep the existing filter/search flow and diff API contract.
- Request all matching rows by sending `pageSize: 0`, using the existing service semantics where `0` means no SQL limit.
- Remove page navigation from the dialog.
- Add fixed-height row virtualization modeled on the Scenario Import dialog:
  - track table scroll top,
  - compute visible range from fixed row height, viewport height, and overscan,
  - render top and bottom spacer rows,
  - render only the visible slice.
- Keep selection keyed by diff row key so selected rows may be anywhere in the loaded result.
- Reset table scroll to the top after a new result set loads.
- Fix ground apply by passing only parameters referenced by the ground insert SQL, eliminating unused `$2`.

## Verification

- Run focused Gantt Vitest for `RosterPublishDialog`.
- Run focused live-server Vitest for `roster-publish-service`.
- Run `npm run check:ui` if available because frontend structure/classes changed.
