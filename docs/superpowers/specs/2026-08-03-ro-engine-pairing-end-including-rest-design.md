# Wire RO Engine pairing_end_including_rest — Design

**Date:** 2026-08-03  
**Status:** Approved (user: 需要改)  
**Problem:** `ro_check` assign pairing 16040 → crew 2071 does not emit rule 1001 vs same-day SIM, even though post-duty rest (720 min) overlaps SIM.

## Root cause

Rust `Engine` accepts `pairing_end_including_rest_utc`, but `engine_builder.py` never passes it. PyO3 falls back to `pairing_end_utc` (duty/sch end only). Rule 1001’s actual-overlap gate therefore never sees rest∩SIM.

## Decision

1. Parse `actualRestMinutes` / `minimalRestMinutes` from `PairingDuty` into pairing detail arrays.
2. Per pairing: `end_including_rest_utc = last_duty.end_utc + max(0, rest_min) * 60` (last duty by end time). No duties → fall back to pairing sch/end already used as `pairing_end_utc`.
3. Pass `pairing_end_including_rest_utc` into `rois_rule_engine_rs.Engine(...)`.
4. Do **not** change `pairing_end_utc` / other rules’ duty bounds in this change (surgical).

## Success

`ro_check` / `Engine.check_line` for crew 2071 + pairing 16040 reports a `1001|...` violation involving the SIM ground task. Unit test covers rest minutes → end_including_rest.
