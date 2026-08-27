# Scenario Import to Live Roster Design

## Context

The Scenario detail toolbar action currently shown as `Publish roster` opens a dialog that loads optimized roster assignments and writes selected rows back into Live `roster_flight`.

In SIT, opening the dialog can fail with:

```text
Failed to load result: r.sch_str_dt_utc?.toISOString is not a function
```

The backend route assumes scenario timestamp fields are `Date` objects. SIT can return timestamp values as strings, so the response mapper must normalize both shapes.

The current wording also overstates the operation as "publish". This action is an internal Scenario-to-Live import, not final publication to NOC or the `roster_publish` workflow.

## Proposed Product Name

Use **Import to Live Roster** for the toolbar action.

Use **Import Optimized Roster to Live** for the dialog title.

Use **Import {n} Selected** for the primary action.

Use success wording like:

```text
Imported {n} assignment(s) to Live roster in {elapsed}
```

## Scope

1. Fix the SIT result-load crash.
2. Rename user-facing Scenario import-to-live UI text away from `Publish roster`.
3. Add a lightweight progress and result summary inside the dialog:
   - progress bar during import,
   - current step label,
   - live elapsed timer while importing,
   - imported assignment count after completion,
   - total elapsed time after completion.
4. Keep the existing synchronous backend operation for now.

## Non-Goals

- Do not add a background job or SSE stream for this internal import.
- Do not change the Live `RosterPublishDialog` workflow, which still uses `Publish Roster`.
- Do not change database schema.
- Do not change the scenario import-to-live business behavior beyond timestamp normalization and UI feedback.

## Backend Design

File: `live-server/src/routes/scenario/scenario.ts`

Add a local timestamp serialization helper for `GET /api/scenario/:id/roster` mapping:

```ts
const toIsoOrNull = (value: unknown): string | null => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
```

Use it for `schStrDtUtc` and `schEndDtUtc`.

This keeps the frontend contract unchanged: `RosterAssignment.schStrDtUtc` and `schEndDtUtc` remain ISO strings or null.

## Frontend Design

Files:

- `gantt/src/components/scenario/scenario-toolbar.tsx`
- `gantt/src/components/scenario/publish-roster-dialog.tsx`
- `gantt/src/services/scenario-api.ts`
- `gantt/src/stores/scenario-store.ts`
- related tests/help text where touched wording is asserted

Implementation approach:

- Keep the route path `/api/scenario/:id/publish` initially to avoid contract churn.
- Rename visible UI text to Import-to-Live wording.
- Prefer narrow internal renames only where they reduce confusion. Avoid broad mechanical renames if they increase risk.
- Track dialog-local import lifecycle:
  - `idle`
  - `importing`
  - `complete`
  - `error` via existing toast and state reset
- When the user clicks import:
  - store `startedAt = performance.now()`,
  - start a 250-500 ms interval to refresh elapsed display,
  - show progress bar with steps:
    1. Preparing selected rows
    2. Writing to Live roster
    3. Refreshing scenario status
    4. Complete
  - on success, keep the dialog open long enough to show imported count and elapsed time, instead of immediately closing.

Recommended first implementation:

- Progress is UI-estimated because the backend is synchronous.
- During the POST, hold progress below 90%.
- On success, set progress to 100% and show the backend returned `published` count as `Imported`.
- Allow the user to close the dialog after completion.

## UX Details

- Toolbar tooltip: `Import to Live Roster`
- Dialog title: `Import Optimized Roster to Live`
- Loading text while reading scenario result: `Loading optimization result...`
- All-complete notice: `All assignments have been imported to the Live roster.`
- Primary button while idle: `Import {selectedCount} Selected`
- Primary button while running: `Importing...`
- Result summary:
  - `Imported: {count}`
  - `Elapsed: {duration}`

## Tests

Backend:

- Update `live-server/src/__tests__/unit/scenario-publish-roster-route.test.ts`.
- Add regression coverage where `sch_str_dt_utc` and `sch_end_dt_utc` are strings instead of `Date` objects.
- Assert `GET /:id/roster` returns ISO strings and does not 502.

Frontend:

- Update `gantt/src/components/scenario/__tests__/publish-roster-dialog.test.tsx`.
- Assert renamed title/button text.
- Assert import progress/result summary appears after import completes.

UI gate:

- Run `npm run check:ui` after frontend UI changes.

Suggested verification:

```bash
cd live-server && npm test -- --run src/__tests__/unit/scenario-publish-roster-route.test.ts
cd gantt && npm test -- --run src/components/scenario/__tests__/publish-roster-dialog.test.tsx
npm run check:ui
```

If a real UI verification is needed for final delivery, run a focused Gantt Playwright path that opens the Scenario detail action and confirms the dialog text/progress states.

## Risks

- A UI-estimated progress bar is not true server progress. This is acceptable for the first version because the operation is an internal synchronous import and the requested statistics are simple.
- Keeping the backend route named `/publish` preserves compatibility but leaves an internal naming mismatch. A future cleanup can add `/import-to-live` as an alias and deprecate `/publish`.
- Keeping the dialog open after success changes the prior close-on-success behavior. This is intentional so users can see imported count and elapsed time.
