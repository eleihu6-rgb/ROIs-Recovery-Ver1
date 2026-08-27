# SIT Live Pairing Composition Fill Repair Design

## Problem

In SIT live, pairing `11714` (`C4148`) is assigned to two crew in `roster_flight`:

- crew `568` as `CA`
- crew `2496` as `FO`

However `pairing_composition` still stores `CA fill=0` and `FO fill=0`, so the Live Gantt Pairing pane displays `CA(1:0) FO(1:0)`.

This is not a Gantt rendering bug. The pane reads the persisted coverage fields returned by the live-server pairing list. The SIT database has stale persisted fill values.

## Evidence

SIT live schema `f8_sit_live` shows:

- `pairing_composition` for `pairing_id=11714`: `CA plan=1 fill=0`, `FO plan=1 fill=0`
- `roster_flight` for `pairing_id=11714`: crew `568` has `roster_acting_rank='CA'`, crew `2496` has `roster_acting_rank='FO'`
- A broader mismatch check found many `pairing_composition` rows whose `fill` differs from `count(distinct roster_flight.crew_id)` by pairing and acting rank.

Current repo code has post-import recompute helpers, but import workers can swallow recompute failures and do not clearly invalidate pairing list caches after recomputing fill. That can leave the Pairing pane serving stale composition values.

## Goal

Restore SIT live composition fill consistency immediately and prevent the same stale coverage display from recurring after roster/pairing imports.

The canonical fill formula is:

```sql
pairing_composition.fill =
  count(distinct roster_flight.crew_id)
  where roster_flight.pairing_id = pairing_composition.pairing_id
    and roster_flight.roster_acting_rank = pairing_composition.acting_rank
    and roster_flight.is_deleted = 0
```

Only non-deleted `pairing_composition` rows are updated.

## Scope

1. Run a one-time SIT live data repair against `f8_sit_live`.
2. Clear or invalidate pairing caches so repaired values are visible to the Pairing pane.
3. Patch live-server import/admin recompute behavior so fill recompute failures are not hidden and pairing list caches are invalidated.
4. Add focused tests around the changed live-server behavior.

Out of scope:

- Changing Gantt to calculate coverage from roster rows.
- Changing the data model.
- Rewriting import orchestration.
- Broad unrelated cache or Redis refactors.

## Approach

### SIT Data Repair

Run one transaction against `f8_sit_live` to recompute `pairing_composition.fill` for all non-deleted rows from current non-deleted `roster_flight` rows.

After the repair, verify:

- `pairing_id=11714` reports `CA fill=1`, `FO fill=1`
- the global mismatch count is zero or any residual mismatches are explained by missing/deleted composition rows

### Cache Invalidation

Invalidate pairing caches after fill repair/recompute:

- `pairing:list:*`
- affected `pairing:<id>` detail keys when the affected id set is known

If the deploy Redis is not directly reachable, use the live-server admin route once patched so the application performs both recompute and cache invalidation.

### Code Fix

Update live-server import paths that call `refreshPairingCompositionFillBulk`:

- Do not swallow recompute errors with `.catch(console.error)`.
- Let the worker job fail if the recompute fails, so the import progress reports a real failure instead of silently leaving stale Pairing pane data.
- Invalidate pairing list caches after successful recompute.

Update the admin pairing composition refresh route:

- Invalidate `pairing:list:*` after recompute.
- Keep response shape compatible, optionally adding the updated row count already returned today.

## Testing

Run focused live-server tests for:

- roster import calls bulk fill recompute for touched pairings
- roster import fails when fill recompute fails
- pairing import recompute behavior if the same silent failure pattern exists there
- admin refresh invalidates pairing list cache after recompute

Run TypeScript compile or the smallest relevant test command for changed live-server files.

## Acceptance

- SIT live pairing `11714` displays `CA(1:1) FO(1:1)` through the pairing API / Gantt data path after cache invalidation.
- A mismatch SQL check for `pairing_composition.fill` versus actual `roster_flight` counts no longer reports this pairing as stale.
- Import workers no longer hide fill recompute failures.
- Pairing list cache is invalidated after recompute paths that change displayed composition fill.
