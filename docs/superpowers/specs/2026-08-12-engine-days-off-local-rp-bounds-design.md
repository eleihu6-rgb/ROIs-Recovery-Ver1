# Design: Engine 7505/7507 RP bounds in crew-local midnight UTC

**Date:** 2026-08-12  
**Status:** Approved for implementation  
**Approach:** A — fix `Engine.check_days_off_structured` RP window only

## Problem

`ro_check.py` / PBS PyO3 `Engine.check_line` loads 7507 correctly (`days_off_rules_7507` non-empty, `n_rules` includes 7507) but still accepts lines that should fail Min DO (e.g. scenario 740 crew `13645`, 21 CRAM → 9 blank days &lt; Min DO 10).

Scenario Gantt draft preview already reports 7507 (Live/TSV path uses crew-local RP bounds). The Engine path does not.

Root cause: `check_days_off_structured` builds the RP window as **UTC midnights** from ordinals:

```text
rp_start_utc = rp_start_ord * 86400
rp_end_utc   = (rp_end_ord + 1) * 86400
```

`count_days_off` paints activities onto keys from `local_day_start_utc(..., crew_offset_min)`. For YYZ (≈ UTC−4) those keys are **04:00 UTC**, not `00:00 UTC`. Keys miss → every day stays blank → Count Blank=Y yields **full RP as DO** (e.g. 30) → `30 >= Min DO 10` → no violation.

Unit tests in `rule_7505_tests` / `rule_7507_tests` already pass RP as **base-local midnight expressed as UTC** (e.g. YEG `2026-06-01 06:00:00Z`). Live `check-7507` matches that contract. Only the Engine ordinal→UTC conversion is wrong.

## Decision

In `rule-engine-rs/py/src/lib.rs` → `Engine::check_days_off_structured` (shared by structured **7505** and **7507**):

1. Read `offset = self.crew_offset(crew_idx)` (minutes east of UTC; empty → 0).
2. Convert RP ordinals to **crew-base local midnights as UTC**:

```text
rp_start_utc = rp_start_ord * SECONDS_PER_DAY - offset * 60
rp_end_utc   = (rp_end_ord + 1) * SECONDS_PER_DAY - offset * 60
```

3. Pass those bounds into `days_off_scope_matches` and `check_min_days_off_app` (unchanged kernel).
4. Keep violation message `rp_days` as calendar length `(rp_end_ord - rp_start_ord) + 1` (unchanged).

No change to `count_days_off` / `count_assignment_days` kernels, rule_params loading, or Live TSV builders.

## Why not other approaches

- **B — retarget day_map keys inside `count_days_off`:** higher blast radius; would break callers that already pass local-midnight RP (unit tests, Live).
- **C — ro_check-only workaround:** leaves PBS solver / formal RO on the same Engine path broken.

## Verification

1. **Rust regression:** Engine (or thin wrapper) test — UTC-ordinal RP + non-zero `crew_offset_min` + activities that leave DO &lt; Min DO must emit 7507/7505; same case with old UTC-midnight window would have been silent (document in test comment). Prefer extending existing PyO3 / `engine_check_line` style if present; otherwise a focused unit that calls the same conversion + `check_min_days_off`.
2. **Python:** after `maturin develop --release`, from `rule-engine-rs/ro-tests` with current `ro_input.txt` + `assignments.txt` (crew `13645`, 21 CRAM ids): `python3 ro_check.py` must **fail** an assign once blank days fall below Min DO 10 (not accept all 21).
3. **Non-regression:** existing `cargo test --test rule_7505_tests` / `rule_7507_tests` still pass (kernel unchanged).

## Out of scope

- Changing Live `check-7507` TSV builders (already local-correct).
- Optimizer PA-ignore semantics inside `check_min_days_off_app` (unchanged; ro_check still passes new pairings as candidates so shortfall remains reportable).
- DST / mid-RP offset changes (still one `crew_offset_min` snapshot per crew, same as today).
