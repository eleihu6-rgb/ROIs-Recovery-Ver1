# Import PBS Material RosterGround Progress And Write Performance

## Problem

Import PBS Material with only `RosterGround` selected can take several minutes for a full roster period. The UI currently shows only a blocking `Importing...` button and then a success toast when the connector trigger returns. For May 2026, connector fetch completed successfully but the live-server inbound worker stalled on the idempotency DELETE before committing any `roster_flight` rows, so the user saw no database updates after the apparent import.

## Scope

- Gantt Scenario Import PBS Material dialog.
- `live-server` `roster-ground-inbound-worker`.
- Local service logging/start behavior already adjusted in `/home/yuan.z/rois/rois.sh`; no further script changes are part of this spec.

## Design

1. Keep the existing connector flow and response contract. Do not redesign this into a full async job dashboard in this pass.
2. Add friendly long-running UI feedback while the current request is pending:
   - show a compact progress bar inside the existing `AppDialog`;
   - show elapsed time in `mm:ss`;
   - show current operation copy that tells the user the import fetches connector data and then queues database writes;
   - keep controls disabled while importing;
   - include total elapsed time in success/failure notifications.
3. Fix the live-server worker bottleneck without changing import semantics:
   - retain the range purge for F8-owned ground rows;
   - replace the huge row-value `IN (...)` exact-key delete with a temporary-table join delete inside the same transaction;
   - keep source scoping to `source='F8'` and `pairing_id IS NULL` so user-created manual ground tasks are never removed.
4. Improve worker observability:
   - log record counts at job start;
   - log import result at completion.

## Non-goals

- No new persistent import job table.
- No schema migration in this pass.
- No change to F8 raw fetch chunking.
- No change to roster-ground business mapping.

## Verification

- Unit test the worker idempotency path with a mocked transaction to prove it uses temp-table join delete and does not emit a massive row-value `IN`.
- Unit test the Import PBS dialog progress/elapsed-time state.
- Build targeted modules where feasible:
  - `npm --prefix live-server test -- roster-ground`
  - `npm --prefix gantt test -- import-pbs-dialog`
  - `npm --prefix live-server run build` if existing repository test TS errors allow it; otherwise report pre-existing blockers.
  - `npm run check:ui` after frontend UI changes.

