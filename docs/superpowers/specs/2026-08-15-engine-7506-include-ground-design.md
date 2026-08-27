# Design: PyO3 Engine 7506 must include ground check-ins

**Status:** Approved  
**Date:** 2026-08-15  
**Scope:** PyO3 `Engine::check_7506` only (approach A / implementation option 1)  
**Anchor case:** `ro_check` crew `1010` ← pairing `18871` with existing PA SIM on the same YYC local day

## Problem

Rule 7506 (One Checkin Per Day) with `Assignments = FLY|SIM` should flag two check-ins that start on the same crew-local calendar day.

Live legality already does this: `live-server/scripts/check-7506-checkin.mjs` feeds **FLY pairings** plus **non-pairing ground rows** with `duty = assignment` (e.g. `SIM`).

RO / `ro_check` use PyO3 `Engine::check_7506`, which builds `CheckinRoster` rows **only** from `fixed ∪ candidate` pairing indices. `crew_ground` (SIM/RES/…) is never appended. Result: SIM + new FLY on the same local day is silent even though the kernel fires when both rows are supplied.

Confirmed on the anchor case:

| Duty | UTC start | YYC local |
|------|-----------|-----------|
| SIM (PA ground) | 2026-08-17 17:00Z | 2026-08-17 11:00 |
| FLY 18871 | 2026-08-18 01:15Z | 2026-08-17 19:15 |

`check-7506` with both rows → violation; FLY-only → empty. `ro_check` → Full line OK.

## Goal

Make PyO3 Engine 7506 check-in set match Live feeder semantics for the same params: **FLY (and other flying pairings as today) + ground duties labeled by assignment code**.

## Non-goals

- Pure-Rust `rule-engine-rs/src/engine.rs` `check_7506` (not on the RO / `ro_check` path).
- Switching 7506 to Optimizer `_app` / in-engine PA-ignore (keep Editor kernel + existing Python baseline-diff).
- Changing `check_single_daily_checkin` kernel, Live feeder, or `check-7506` binary.
- Per-ground airport timezone for 7506 (Live and current Engine pairing path both use **crew base offset**).

## Approaches (decided)

| # | Approach | Decision |
|---|----------|----------|
| 1 | Append `crew_ground` inside `check_7506` | **Chosen** |
| 2 | Extract shared check-in roster builder | Rejected — one caller; over-design |
| 3 | Switch to Optimizer `_app` + `pre_assigned` | Rejected — contract change not needed for this bug |

## Design

### 1. Roster construction in `check_7506`

Keep existing pairing → `CheckinRoster` mapping (structured assignment / group / `is_fly` fallback unchanged).

Then, for each `GroundDuty` in `self.crew_ground[crew_idx]`:

| Field | Value |
|-------|--------|
| `duty` | `ground.assignment` uppercased; if assignment empty, fall back to `ground.group` uppercased (same spirit as pairing path) |
| `start_utc` | `ground.start_utc` |
| `rest_start_utc` | `ground.end_utc` |
| `end_offset_min` | crew base `crew_offset_min[crew_idx]` (unchanged pairing convention) |

Do **not** pre-filter ground by the Assignments list — the kernel already skips non-checked duties. Empty assignment+group ground rows can be skipped as useless.

Chronological order: append then rely on existing sort inside `check_single_daily_checkin` (or sort the combined vec by `(start_utc, rest_start_utc)` before call — either is fine; kernel sort is sufficient).

### 2. Application / PA-ignore

Keep calling `check_single_daily_checkin` (Editor). Optimizer “new vs PA” continues via Python baseline-diff in `RustRuleChecker` / `ro_check`. No `pre_assigned` slice for 7506 in this change.

### 3. Enablement / params

No change to `one_checkin_rules` / `one_checkin_groups` loading or `structured_scope_matches`.

### 4. Tests / verification

1. **Rust/Py regression (preferred):** unit or PyO3 test that builds a minimal Engine (or calls the roster-build logic) with one FLY candidate + one SIM ground same local day under `FLY|SIM` → emits a `7506|…` violation; FLY-only control → none.
2. **Manual / harness:** `cd rule-engine-rs/ro-tests && python3 ro_check.py` with current `assignments.txt` (`crew: 1010` / `pairing: 18871`) → must report 7506 (not Full line OK solely from missing SIM).
3. Existing `rule_7506_tests` / kernel tests remain green (kernel unchanged).
4. After Rust change: `cd rule-engine-rs/py && maturin develop --release` before re-running `ro_check`.

## Success criteria

- Anchor `ro_check` case fires **7506** for crew 1010 when SIM PA and pairing 18871 share a local day.
- Live `check-7506` behavior unchanged (out of scope).
- No new speculative abstractions; touch only PyO3 `check_7506` (+ focused test).

## Risks

- More true 7506 hits in RO / PBS when `Assignments` includes ground codes (SIM, etc.) — **intended**, aligns with Live.
- Ground with blank assignment falling back to `GRD` will not match `FLY|SIM` — correct.
- Baseline-diff may still suppress pure-PA same-day pairs in optimizer mode — unchanged contract; anchor case has a **new** FLY candidate so it must surface.
