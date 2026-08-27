# Import PBS Material RosterGround Progress, Stats, and Composition Fill Fix

Date: 2026-07-17
Module: Gantt Scenario import dialog + live-server import workers
Status: Approved for implementation by user in chat; implemented 2026-07-17

## Problem

When an admin runs Scenario `Import PBS Material` for RP July with `Roster`, `RosterGround`, `Pairing`, and `Flight` selected:

1. `RosterGround` can remain visually stuck at `Waiting` while other materials show `Fetching data...`.
2. The completion result table is misleading: `Added`, `Updated`, and `Deleted` show `0` for non-Crew materials.
3. The latest import failed during `pairing_composition.fill` refresh with SQL like:

```sql
WHERE pc.pairing_id = ANY(($2, $3, ...))
```

PostgreSQL receives `($2, $3, ...)` as a row expression, not an array, so the bulk refresh can fail once many pairing ids are passed.

## Evidence

- `live-server/src/utils/composition-fill.ts` uses `ANY(${pairingIds})` in `refreshPairingCompositionFillBulk`.
- Drizzle expands that array into positional parameters inside a row expression, matching the reported failed SQL.
- The same helper is called by:
  - `processPairingImportJob`
  - `processRosterImportJob`
- `RosterGround` fetch/transform/enqueue events are emitted by `connector-server/src/services/sync/f8/f8-sync-orchestrator.ts`, but the frontend row text only shows `Waiting` until it sees an event for that material.
- `normalizeMaterialStats` already consumes worker return fields, but most workers return only `imported` / `errors`; only Crew currently returns authoritative `added`, `updated`, `deleted`, `success`, `failed`, and `skipped`.

GitNexus impact analysis after refreshing the index:

- `refreshPairingCompositionFillBulk`: LOW risk; direct callers are `processPairingImportJob` and `processRosterImportJob`.
- `processRosterImportJob`, `processRosterGroundImportJob`, `processFlightImportJob`, `processPairingImportJob`: LOW risk; each is called by its inbound worker.
- `stageText`: HIGH impact because it is inside `ImportPbsDialog`, which flows up through the Scenario view. UI changes need focused component and Playwright coverage.
- `normalizeMaterialStats`: LOW risk; used by Import PBS Material complete result only.

## Goals

- Fix the bulk `pairing_composition.fill` refresh SQL so it uses a real PostgreSQL array.
- Make selected materials, including `RosterGround`, visibly enter the fetch pipeline instead of lingering at `Waiting` when the run starts.
- Return truthful per-material `added`, `updated`, `deleted`, `success`, `failed`, and `skipped` values where the worker can determine them.
- Keep the result table open after completion and keep the existing result contract additive.

## Non-Goals

- Do not change NOC/F8 transform business rules.
- Do not add an import history table.
- Do not change material scope semantics. `Roster`, `RosterGround`, `Pairing`, and `Flight` remain independently selectable.
- Do not fake add/update/delete counts in the frontend.

## Design

### 1. Bulk composition fill SQL

Change `refreshPairingCompositionFillBulk` to build an explicit array expression:

```ts
const pairingIdArray = sql`ARRAY[${sql.join(pairingIds.map((id) => sql`${id}`), sql`, `)}]::bigint[]`
```

Then use:

```sql
WHERE pc.pairing_id = ANY(${pairingIdArray})
```

This keeps one SQL statement while producing `ANY(ARRAY[$2, $3, ...]::bigint[])`, which PostgreSQL handles correctly.

Apply the same array pattern to `refreshFlightCompositionFill` for consistency, because it currently uses `ANY(${fltIds})` with the same Drizzle expansion risk.

### 2. Initial selected material progress

The `started` event already includes `materials`. The frontend should render each selected material row immediately.

For materials with no stage event yet:

- If the overall import is running, show `Fetching data...` instead of `Waiting`.
- Keep `Waiting` only for non-running/idle historical states, if needed.

This is display-only. It does not mark any backend stage as complete.

### 3. Worker stats contract

Keep `ImportMaterialStats` as currently defined. Improve worker return values so `normalizeMaterialStats` can surface real counts.

Recommended minimal stats shape:

```ts
interface ImportWriteStats {
  imported: number
  added: number
  updated: number
  deleted: number
  success: number
  failed: number
  skipped: number
  warnings: string[]
  errors: Array<{ id: string; reason: string }>
}
```

Worker-specific counting:

- Crew: keep existing behavior.
- Flight:
  - Preload existing `interface_flt_id` values for incoming records.
  - Count one `success` per successfully upserted flight record.
  - `added` if the incoming `interfaceFltId` did not exist before write; `updated` otherwise.
  - `failed` from errors.
- Pairing:
  - Preload existing `pairing.interface_id` values for incoming pairings.
  - Count one `success` per successfully upserted pairing header.
  - `added` if the incoming `interfaceId` did not exist before write; `updated` otherwise.
  - `failed` from errors.
- Roster:
  - Preload existing import-owned assignments by `(pairing_id, crew_id)` after resolving incoming `pairingInterfaceId`.
  - Count `success` as inserted `roster_flight` segment rows, preserving current `imported`.
  - Count logical assignment `added` / `updated` once per successful `(pairing_id, crew_id)` assignment, not once per segment row.
  - `skipped` includes missing pairing / missing segment warnings.
  - `failed` from errors.
- RosterGround:
  - Count range/key DELETE affected rows as `deleted`, using the row count returned by node-postgres/Drizzle where available.
  - Count inserted ground rows and single-leg roster rows as `success` / `added`.
  - Keep `updated = 0` unless the code can distinguish a replacement from a net-new row cheaply.
  - `skipped` includes warnings.
  - `failed` from errors.

This follows the approved 2026-07-16 design: if a material cannot distinguish add vs update in the first pass, keep that field at 0 with a code comment rather than inventing counts.

### 4. Progress terminal counters

When each worker publishes `write done`, include final counters:

- `processed`
- `total`
- `added`
- `updated`
- `deleted`
- `success`
- `failed`
- `skipped`

This makes the running row and final result table agree.

## Tests

Required focused coverage:

- `live-server` unit test for `composition-fill` SQL rendering:
  - bulk pairing fill uses `ANY(ARRAY[...]::bigint[])`, not `ANY(($...))`
  - bulk flight fill uses `ANY(ARRAY[...]::bigint[])`
- `live-server` worker tests:
  - Flight import reports added vs updated.
  - Pairing import reports added vs updated and still calls fill refresh.
  - Roster import reports logical assignment added/updated plus segment success.
  - RosterGround import reports added/success and delete counts where available.
  - Worker `write done` events include final counters.
- `gantt` component/progress tests:
  - selected `RosterGround` shows `Fetching data...` after `started` while no material stage has arrived.
  - completed stats still render in the table.
- Playwright:
  - Extend `scenario-import-pbs-material-progress.spec.ts` with a multi-material run including `RosterGround`, asserting it does not stay `Waiting` after the `started` event and that final stats display non-zero counters from the complete event.

Verification commands:

```bash
npm --prefix live-server test -- composition-fill roster-inbound-worker roster-ground-inbound-worker flight-inbound-worker pairing-inbound-worker import-pbs-material
npm --prefix gantt test -- import-pbs-dialog import-pbs-material-api
cd e2e && npx playwright test --config=config/playwright.config.ts --project=gantt --no-deps tests/gantt/scenario-import-pbs-material-progress.spec.ts --reporter=list
npm run check:ui
```

## Acceptance Criteria

- RP July import with `Roster`, `RosterGround`, `Pairing`, and `Flight` no longer fails on `pairing_composition.fill` refresh.
- `RosterGround` appears in the running material list and shows `Fetching data...` once the import starts.
- Final result rows show authoritative non-zero stats when workers actually inserted, updated, deleted, skipped, or failed records.
- The frontend does not infer add/update/delete counts from `imported`.
- Focused backend, frontend, Playwright, and UI-standard checks are run and reported.
