# Reserve Duty DP Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive raw duty DP minutes for Reserve duties when `actualDutyMinutes` is blank.

**Architecture:** Keep the current PBS Python wrapper as the source that prepares raw duty DP for Rust. Rust continues to apply `Assignment.dpPct` and local-day allocation. The change is a narrow fallback helper in `pairing_details.py` plus focused regression coverage.

**Tech Stack:** Python 3.12, pytest, PBS Python wrapper, PyO3 Rust rule engine consumer.

## Global Constraints

- Do not change BH behavior.
- Do not change Rust DP weighting or local-day split logic.
- Do not use `creditedMinutes` as raw DP.
- Preserve existing module boundaries and tests.

---

### Task 1: Add Reserve Duty DP Fallback

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/test_pairing_details.py`
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/pairing_details.py`

**Interfaces:**
- Consumes: `build_pairing_detail_arrays(sections, pairing_ids, pairing_info)`
- Produces: `PairingDetailArrays.duty_dp_min` derived from duty span when direct DP fields are blank.

- [ ] **Step 1: Write the failing test**

Add `test_reserve_duty_dp_falls_back_to_duty_span_when_minutes_blank()` to `test_pairing_details.py`. It should build one PRAM duty with blank `actualDutyMinutes` and `actDpMin`, start `2026-07-07T08:00:00`, end `2026-07-07T20:00:00`, and assert `duty_dp_min == [720]` and `duty_dp_pct == [1.0]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.venv/bin/python -m pytest pbs-engine/ColumnModelSolver_python/rules/rust/test_pairing_details.py -q`

Expected: FAIL because current code returns `duty_dp_min == [0]`.

- [ ] **Step 3: Implement minimal fallback**

Add a small helper in `pairing_details.py` that returns direct minutes from `actualDutyMinutes`, then `actDpMin`, then derives positive rounded minutes from duty start/end timestamps. Use the existing `_minute_value` and `_required_epoch` style where possible.

- [ ] **Step 4: Run focused tests**

Run: `~/.venv/bin/python -m pytest pbs-engine/ColumnModelSolver_python/rules/rust/test_pairing_details.py -q`

Expected: PASS.

- [ ] **Step 5: Run ro_check smoke**

Run: `~/.venv/bin/python ro_check.py` from `rule-engine-rs/ro-tests`.

Expected: PASS, and direct engine check for pairing `167932` returns `{'2026-07-07': 720.0}` for `daily_dp`.
