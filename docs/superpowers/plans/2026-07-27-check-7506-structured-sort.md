# check-7506 structured sort (plan B) Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Make `check_single_daily_checkin_app` sort rosters chronologically so structured R/D/Q/T input order cannot hide same-day FLY|SIM violations.

**Architecture:** Single choke-point sort at the rule entry (spec approach B). Keep consecutive same-day walk and PA alignment via sorted indices.

**Tech Stack:** Rust `rule-engine-rs`, `check-7506` binary, `rule_7506_tests`.

## Global Constraints

- §Minimal-First: no feeder reorder, no bin-only sort duplicate unless needed.
- Preserve violation span / message semantics.
- Regression must fail before the sort fix and pass after.

---

### Task 1: Failing regression test

**Files:** `rule-engine-rs/tests/rule_7506_tests.rs`

- [x] Add structured test: D order `FLY(same day) → FLY(other day) → SIM(same day)` with `R * * * * FLY|SIM` → expect one violation line.
- [x] Run `cargo test --test rule_7506_tests structured_7506_unsorted -- --exact` → expect FAIL.

### Task 2: Sort in `check_single_daily_checkin_app`

**Files:** `rule-engine-rs/src/lib.rs`

- [x] Sort roster indices by `(start_utc, rest_start_utc)` before the consecutive walk; map `pre_assigned` through the same order.
- [x] Update doc comments: chronological input no longer required.
- [x] Run full `cargo test --test rule_7506_tests` → PASS.

### Task 3: Verify

- [x] Confirm structured unsorted case emits one 7506.
- [x] Existing structured / library tests still green.
