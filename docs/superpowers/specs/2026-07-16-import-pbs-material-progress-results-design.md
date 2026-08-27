# Import PBS Material Progress and Result Detail Design

Date: 2026-07-16
Module: Gantt Scenario import dialog + live-server import orchestration
Status: Approved for implementation by user in chat

## Problem

The Scenario "Import PBS Material" dialog currently has three user-facing problems:

1. All material checkboxes are selected by default, so an admin can accidentally start a broad import.
2. Material order does not match the planner's expected workflow.
3. Completion closes the dialog and relies on a short toast. The user loses the import result detail.
4. In SIT, Crew-only import shows an effectively frozen progress bar for about 30 seconds, then closes with a success toast. The UI does not accurately show fetch, transform, or database write progress.

## Goals

- Default every material checkbox to unchecked.
- Display materials in this order:
  `Crew`, `Roster`, `RosterGround`, `Pairing`, `Flight`.
- Keep the dialog open after completion and show detailed per-material statistics in the dialog body.
- Make long-running imports visibly progress through:
  `Fetch data`, `Transform data`, `Write database`.
- Show meaningful progress even when an upstream source cannot provide a total row count.
- Return authoritative database write statistics from the backend, not frontend guesses.

## Non-Goals

- Do not change the business import dependency order just because the display order changes.
- Do not add a new database table for import history in this change.
- Do not introduce polling if the existing SSE import progress channel can carry the required events.
- Do not change NOC connector authentication or roster period selection rules.

## UX Design

### Initial State

- Roster Period keeps the existing current-period default.
- Material checkboxes all start unchecked.
- Confirm is disabled until at least one material is selected.
- If none is selected, show the existing validation message:
  `Select at least one material type.`

### Material Order

The checkbox row renders in display order:

1. Crew
2. Roster
3. RosterGround
4. Pairing
5. Flight

This is display order only. Backend execution can still preserve dependency-safe behavior.

### Running State

When the admin clicks Confirm:

- The dialog stays open and becomes non-dismissable while import is running.
- The footer shows Cancel disabled and Confirm as `Importing...`.
- A progress panel appears within one second.
- Each selected material gets a compact row with:
  - material label
  - current stage
  - status
  - processed / total when available
  - running write stats when available

If `total` is unavailable for a running stage, the row uses an indeterminate active progress style and text such as:

`Fetching Crew... 18,420 records received`

The progress bar must not sit visually static at 0% while work is happening.

### Completion State

On complete:

- Do not close the dialog automatically.
- Keep the progress bar at 100%.
- Replace or extend the progress panel with a result table.
- Footer changes to a primary `Done` button.
- The existing toast may remain, but it is secondary and short.

Recommended result table columns:

| Material | Status | Added | Updated | Deleted | Success | Failed | Skipped | Rejected | Duration |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|

Rows are shown only for selected materials.

Each row can expose extra detail:

- fetch / transform / enqueue / database timings
- records in / records out
- warnings count and first few warning messages
- failure count and first few `{ id, reason }` entries
- rejection file when present

### Failure State

If one material fails:

- The dialog remains open.
- The failed row is marked failed.
- Any available partial stats stay visible.
- The final message says which stage failed and after how long.

## Backend Contract

The frontend currently receives timings and the worker return value is not surfaced as structured per-material stats. The complete event should include authoritative stats from each queued write job.

Add a normalized per-material result shape:

```ts
interface ImportMaterialStats {
  material: 'crew' | 'roster' | 'rosterGround' | 'pairing' | 'flight'
  status: 'success' | 'partial' | 'failed'
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  rejected: number
  recordsIn: number
  recordsOut: number
  warnings: string[]
  errors: Array<{ id: string; reason: string }>
  timings: {
    fetchMs: number
    transformMs: number
    enqueueMs: number
    databaseMs: number
    totalMs: number
  }
}
```

`added`, `updated`, and `deleted` must come from live-server write logic. The frontend must not infer them from `imported`.

Recommended first implementation:

- Workers that already use upsert should determine whether a row existed before write and increment `added` or `updated`.
- Workers that physically replace a range should count deleted rows from the delete statement where feasible.
- If a material cannot distinguish add vs update in the first pass, return `success` accurately and keep `added/updated` at 0 only with a code comment and follow-up note. Do not fake counts.

## Progress Event Contract

Extend `stage` progress events to carry live counters:

```ts
{
  type: 'stage'
  importId: string
  material: ImportMaterial
  stage: 'fetch' | 'transform' | 'enqueue' | 'write'
  status: 'running' | 'done' | 'fail'
  processed?: number
  total?: number
  recordsIn?: number
  recordsOut?: number
  added?: number
  updated?: number
  deleted?: number
  success?: number
  failed?: number
  skipped?: number
  message?: string
  at: string
}
```

Frontend progress rules:

- `done` stages count as complete.
- `running` stages update row text and, when `processed/total` exists, row percent.
- If no `total` exists, show an active indeterminate state.
- Overall percent may combine weighted stages, but it must visibly advance or animate during long work.

Backend publishing rules:

- Publish `fetch running` before the external fetch starts.
- Publish `fetch done` with `recordsIn`.
- Publish `transform running` before transformation starts.
- Publish `transform done` with `recordsOut` and rejected count.
- Publish `write running` when BullMQ worker starts.
- During write loops, publish every N records or at a small time interval to avoid event spam.
- Publish `write done` with final write counters.

## Execution Order

Display order is:

`Crew`, `Roster`, `RosterGround`, `Pairing`, `Flight`

Execution order must remain dependency-safe:

- `Roster` depends on `Pairing`.
- `Pairing` may depend on or synthesize `Flight`.
- `RosterGround` can produce both ground tasks and single-leg flying duties.

If execution and display order differ, the UI should still show all selected materials in display order and update each row as its backend events arrive.

## Implementation Scope

Frontend:

- `gantt/src/components/scenario/import-pbs-dialog.tsx`
- `gantt/src/components/scenario/scenario-list-panel.tsx`
- `gantt/src/services/import-pbs-material-api.ts`
- `gantt/src/services/import-pbs-progress.ts`
- related component/service tests

Backend:

- `live-server/src/routes/scenario/import-pbs-material.ts`
- `live-server/src/types/import-progress.ts`
- `live-server/src/utils/import-progress-write.ts`
- `live-server/src/workers/crew-inbound-worker.ts`
- `live-server/src/workers/flight-inbound-worker.ts`
- `live-server/src/workers/pairing-inbound-worker.ts`
- `live-server/src/workers/roster-inbound-worker.ts`
- `live-server/src/workers/roster-ground-inbound-worker.ts`
- related unit/integration tests

Connector:

- `connector-server/src/services/sync/f8/f8-sync-orchestrator.ts`
- `connector-server/src/types/import-progress.ts`

## Tests

Required automated coverage:

- Frontend unit/component test:
  - material defaults are unchecked
  - material order is Crew, Roster, RosterGround, Pairing, Flight
  - Confirm disabled until at least one material is selected
  - complete result keeps dialog open and renders per-material stats
  - running event with no total shows non-static progress state
- Frontend service test:
  - progress events with counters update progress state
  - complete result validates the new stats payload
- Live-server test:
  - `/import-pbs-material` complete event includes material stats from queued job return values
  - worker write progress events include counters
- Gantt Playwright:
  - start import with a mocked or controlled progress stream
  - verify dialog does not auto-close on complete
  - verify result table is visible

Required verification commands will include at least:

- `npm run check:ui`
- focused `gantt` Vitest tests for the dialog/progress service
- focused `live-server` Vitest tests for import stats/progress
- focused Playwright spec for the import dialog result behavior

## Acceptance Criteria

- SIT Crew-only import shows immediate progress feedback within one second.
- Fetch, Transform, and Write DB stages are visible.
- Long stages do not appear frozen.
- Completion does not close the dialog.
- The dialog shows detailed per-selected-material stats.
- Crew import reports success and failure counts, and reports added/updated/deleted when the worker can authoritatively distinguish them.
- No hard UI-standard violations.
