# Import PBS Material Full Cleanup Boundary Design

## Context

SIT `f8_sit_live` RP8 (`2026-08-01` to `2026-08-31`) was re-imported through Import PBS Material on `2026-07-21`, but live Gantt still shows optimizer result rows (`source='CR'`). Read-only SIT checks found:

- active `roster_flight.source='CR'`: 138 rows
- active `PA/F8_IMPORT` roster rows: 25,843 rows
- `roster_flight` to `pairing_segment` `flt_id` mismatch: 6 rows, all `CR/system`
- active `pairing_segment` rows referencing `flight.is_deleted=1`: 746 rows

Current worker behavior is provenance-scoped:

- `roster-inbound-worker` deletes only `source='PA' AND created_by='F8_IMPORT'`.
- `roster-ground-inbound-worker` deletes only import-owned ground rows.
- `flight-inbound-worker` soft-deletes only `created_by='F8_IMPORT'`, without protecting active `pairing_segment` references.
- roster rebuild from `pairing_segment` only affects newly imported roster rows; old CR rows remain stale.

## User-Confirmed Direction

For full Import PBS Material cleanup:

1. Roster / RosterGround cleanup should not depend on `source='PA'` or `created_by='F8_IMPORT'`.
2. Flight stale cleanup should not depend on `created_by='F8_IMPORT'`.
3. Flight stale cleanup should use date range plus active `pairing_segment` reference protection.
4. `pairing_segment.flt_id` change reconciliation should not be limited to `PA/F8_IMPORT`.

## Proposed Behavior

### Roster flying cleanup

Before inserting fetched roster flying rows for the period, delete all live `roster_flight` rows in scope whose paired `pairing` is in the import period, regardless of `source` / `created_by`.

Scope guard:

- live rows only: `pairing.scenario_id = 0 OR pairing.scenario_id IS NULL`
- date window based on `pairing.sch_str_dt_utc`
- flying only: `roster_flight.pairing_id = pairing.id`

Expected effect:

- stale CR rows for the imported roster period are removed.
- imported PA rows are rebuilt from the latest `pairing_segment`.
- manual/source rows assigned to in-period pairings are also removed, per confirmed full-cleanup direction.

### RosterGround cleanup

Before inserting fetched ground rows, delete all ground `roster_flight` rows in the sync date window, regardless of `source` / `created_by`.

Scope guard:

- ground only: `pairing_id IS NULL`
- date window based on `roster_flight.sch_str_dt_utc`

The existing exact-key boundary cleanup for records outside the UTC range should also drop the provenance filters, because it is an idempotency guard for the same import payload.

### Flight cleanup

Before upserting fetched flights, mark stale flight rows in the date window as deleted regardless of `created_by`, but only when no active `pairing_segment` references the flight.

Scope guard:

- live rows only: `flight.scenario_id = 0 OR flight.scenario_id IS NULL`
- date window based on `flight.sch_dep_dt_utc`
- only rows not present in the incoming payload should remain deleted after the upsert cycle
- protect any flight with an active segment reference:
  - `pairing_segment.flt_id = flight.id`
  - `pairing_segment.is_deleted = 0`
  - its parent `pairing` is active live data

Expected effect:

- flights not returned by NOC and not used by current pairings become `is_deleted=1`.
- flights still used by current pairings remain active, avoiding active segments pointing to deleted flights.

### Pairing / roster alignment

When pairing import rebuilds `pairing_segment`, active roster rows on that pairing should not keep stale `flt_id` values.

The smallest behavioral fix is to avoid preserving any active roster rows for the imported period before roster import runs. That means the flying roster cleanup above removes old PA/MA/CR rows first, and roster import recreates rows from current `pairing_segment`.

If pairing-only import is allowed without roster import, add a focused reconciliation step after segment rebuild:

```sql
UPDATE roster_flight rf
SET flt_id = ps.flt_id,
    flt_dt = ps.flt_dt,
    sch_str_dt_utc = ps.sch_str_dt_utc,
    sch_end_dt_utc = ps.sch_end_dt_utc,
    act_str_dt_utc = ps.act_str_dt_utc,
    act_end_dt_utc = ps.act_end_dt_utc,
    updated_by = 'F8_IMPORT',
    updated_at = now()
FROM pairing_segment ps
WHERE rf.pairing_id = ps.pairing_id
  AND rf.duty_seq = ps.duty_seq
  AND rf.seg_seq = ps.seg_seq
  AND coalesce(rf.is_deleted, 0) = 0
  AND coalesce(ps.is_deleted, 0) = 0
  AND rf.flt_id IS DISTINCT FROM ps.flt_id;
```

## Import Ordering

The current Gantt route creates connector trigger promises in material order (`crew` → `flight` → `pairing` → `roster` → `rosterGround`) and then waits with `Promise.allSettled`. SIT logs show requests are started in that order. The issue is that promise construction starts the work immediately, so after request start the selected materials can still fetch/enqueue/write concurrently. The failure mode is specifically the write phase: roster can read old `pairing_segment` rows while pairing import is still rebuilding them.

The target behavior should split the pipeline into two phases:

1. Fetch and transform selected material concurrently.
2. Persist the completed material JSON payloads in dependency order.

This keeps the slow upstream API calls parallel while making database state deterministic.

Write order:

1. crew
2. flight
3. pairing
4. roster
5. rosterGround

Dependency notes:

- `crew` can write before or alongside the chain, but writing it first is safest because roster validates crew ids during transform/fetch orchestration.
- `flight` must write before `pairing`, because pairing resolves `pairing_segment.flt_id`.
- `pairing` must write before `roster`, because roster expands imported assignments from current `pairing_segment`.
- `rosterGround` single-leg synthetic pairings depend on flight lookup, and should run after regular roster to keep the final write stage predictable.

Implementation shape:

- Move full Import PBS Material orchestration toward a single connector-side scoped run, or an equivalent live-server background orchestrator that starts all selected fetches concurrently and delays queue enqueue / `waitUntilFinished` until the dependency predecessor has completed.
- Do not enqueue `roster` until the selected `pairing` write job has finished successfully.
- Do not enqueue `pairing` until the selected `flight` write job has finished successfully.
- If a predecessor material is not selected, use the current database state for that dependency and continue. Example: roster-only import can still run against existing pairings.
- Progress events should still show fetch/transform stages independently, but write stages should reflect the ordered DB writes.

## Tests

Required focused tests:

- `roster-inbound-worker.test.ts`: stale delete removes CR/MA/PA rows for in-period pairings without provenance filters.
- `roster-ground-inbound-worker.test.ts`: ground range cleanup and exact-key cleanup do not require `PA/F8_IMPORT`.
- `flight-inbound-worker.test.ts`: stale flight soft-delete excludes flights referenced by active `pairing_segment`.
- `pairing-inbound-worker.test.ts`: if reconciliation is implemented, active roster rows get new `flt_id` after segment rebuild regardless of source.
- `scenario-import-pbs-material-route.test.ts`: full material import fetches selected materials concurrently but enqueues/waits DB writes in dependency order.

## Manual Verification

After deployment to SIT and rerunning RP8 Import PBS Material:

```sql
select source, created_by, is_deleted, count(*)
from roster_flight
where sch_str_dt_utc >= date '2026-08-01'
  and sch_str_dt_utc < date '2026-09-01'
group by source, created_by, is_deleted;
```

Expected: no active stale `CR` rows for the fully imported RP8 window.

```sql
select count(*)
from roster_flight rf
join pairing_segment ps
  on ps.pairing_id = rf.pairing_id
 and ps.duty_seq = rf.duty_seq
 and ps.seg_seq = rf.seg_seq
where coalesce(rf.is_deleted, 0) = 0
  and coalesce(ps.is_deleted, 0) = 0
  and rf.flt_id is distinct from ps.flt_id;
```

Expected: zero mismatches for the imported period.

```sql
select count(*)
from pairing_segment ps
join pairing p on p.id = ps.pairing_id
join flight f on f.id = ps.flt_id
where coalesce(ps.is_deleted, 0) = 0
  and coalesce(p.is_deleted, 0) = 0
  and coalesce(f.is_deleted, 0) = 1;
```

Expected: no active segment points to a deleted flight.

## Open Decision

Whether pairing-only import should reconcile existing live roster rows in place, or whether the UI should require roster import whenever pairing import is selected for a full material refresh.
