# PBS solver: skip crews with no prime-base window

## Status

Design approved in chat 2026-08-24 (option A: all active crews; zero-fill skip; no invented CrewBase).

## Problem

SIT scenario 746 failed at `load_scenario` with:

`CrewBase has no prime-base window for active crewId=1450`

Root cause: COF (and potentially scenario) crews can appear in the dense `crew_ids` list while dated `CrewBase` export correctly omits expired or missing prime bases. `build_crew_timezone_arrays` currently hard-fails in that case.

Hard constraint from product: **when running the solver, do not invent, revive, or otherwise supplement expired or non-existent CrewBase / airport data.**

## Change

File (source of truth in repo):

`pbs-engine/ColumnModelSolver_python/rules/rust/crew_timezone.py`

Function: `build_crew_timezone_arrays`.

For every active `crew_id` (scenario and COF, same rule):

1. If `_prime_base_windows` returns at least one window → existing path unchanged.
2. If empty → **do not raise**. Emit `logger.warning` with `crewId`. Leave that dense index with:
   - `crew_offset_min[i] = 0`
   - segment start/end, duty start, and ground offset rows filled with **zeros of the lengths required by `CrewTimezoneArrays.validate()`**
3. Never inject CrewBase rows, never extend expired windows, never invent airport/timezone master data for this path.

Rationale for zero-fill (vs deleting the crew): timezone arrays are dense by `crew_ids` index; `validate()` requires each inner list length to match segment/duty/ground counts. Zeros are shape placeholders only, not fabricated business base records.

## Out of scope

- `engine-server` `ro_input_builder` / Airport union (already shipped separately)
- Softening other CrewBase errors (blank prime base, expires-before-effective, unknown timezone when a window *does* exist)
- Changing who is included in `crew_ids` / COF set
- DB backfill of `crew_base`

## Deploy note

SIT/UAT solver runtime currently uses `/home/rois/PBS_column_based_algorithm-main/...`. After merging `pbs-engine`, sync or copy the patched `crew_timezone.py` into that tree (or whatever `RO_SOLVER_DIR` points at) and restart engine/solver as needed.

## Verification

- Unit test: crew in `crew_ids` with no prime CrewBase → no `ValueError`; arrays validate; sections unchanged (no new base rows).
- Unit test: crew with valid prime window still gets non-trivial offsets as before (smoke).
- Manual: SIT scenario 746 re-run past the previous `1450` prime-base failure (further failures unrelated to this change are out of scope).
