# Design: fix check-7508 D-line column gate

**Date:** 2026-08-10  
**Status:** Approved (chat) — implement immediately  
**Scope:** `rule-engine-rs` `check-7508` stdin parser only

## Problem

`check_7508.rs` requires `cols.len() >= 11` for duty (`D`) rows, but the documented and Node-emitted format is **10** columns:

`D crew pairing_id start_utc end_utc base_offset start_ref end_ref is_rest is_pa`

All duty lines are silently skipped (`N skipped`), so 7508 never emits violations. Preview still shows other rules (e.g. 8002). Reproduced on SIT for scenario 718 / crew 568 / pairing 15759.

## Decision

1. Change the gate to `cols.len() >= 10` (match comment + `rule7508` emitter).
2. Do **not** pad a dummy 11th column in JS.
3. Add bin-local unit tests: 10-col `D` accepted (`skipped == 0`); 9-col `D` still skipped.

## Out of scope

- Node loud-fail when all `D` lines skipped (optional follow-up)
- Frontend dialog related-filter changes
- SIT deploy (ops after merge / local binary rebuild)

## Success

`cargo test` covers the parser; feeding real 10-col stdin no longer reports every `D` as skipped.
