# Fix 1001 Pairing Rest Window (duty_act_rest_min)

## Problem

Rule 1001 can include the earlier task’s **post-duty rest** in the Before overlap window when `Assignment Rest Before=N` (since 2026-07-23; previously this was `Y`). Live/Scenario legality currently set:

```text
end_rest_secs = pairing.sch_end_dt_utc  (= duty end)
```

So rest never extends past duty. Gantt paints REST from `pairing_segment.duty_act_rest_min` (fallback `duty_sch_rest_min`), so planners see FLY rest overlapping RES while 1001 stays silent.

Example (SIT scenario 683 / crew 1462 / pairing 15117): duty ends `08:30Z`, rest `720` min → rest end `20:30Z` overlaps RES `15:00Z`; engine saw a 6.5h gap and emitted nothing.

## Design

1. For **pairing** timeline rows in `assignmentOverlapRosters` (Live + Scenario + seed source):

   ```text
   end_rest_secs = end_duty_secs + rest_min * 60
   ```

   `rest_min` resolution (first non-null):

   - `roster_flight.act_rest_min` on the last segment of the pairing (by `sch_end_dt_utc`)
   - else last `pairing_segment.duty_act_rest_min` / `duty_sch_rest_min` (same order as Gantt)
   - Scenario path: try `scenario.pairing_segment`, then fall back to live `f8.pairing_segment` (RO often keeps live segment ids / empty scenario segments)
   - else `0`

2. **Ground** rows unchanged (`end_rest = end_duty`) — After-side rest is out of 1001 design; this bug is FLY pairing rest.

3. Shared SQL helper in `live-server/scripts/` so the three sources stay §Gantt-Unify aligned.

4. No change to Rust `check-1001` kernel — it already consumes `end_rest_secs`.

## Out of scope

- Recomputing stored `scenario.rule_violation` (needs legality recheck after deploy)
- Solver / pbs-engine rest wiring (separate path)

## Verification

- Unit test: rest helper / SQL fragment includes duty rest minutes
- Unit or script-level assertion: `end_duty + 720*60` for the known shape
- Manual/optional: recheck scenario 683 → 1001 FLY vs RES for 1462
