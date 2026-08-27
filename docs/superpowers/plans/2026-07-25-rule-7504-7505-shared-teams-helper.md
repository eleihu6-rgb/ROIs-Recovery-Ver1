# Rule 7504/7505 Shared Teams Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rule 7504 and Rule 7505 structured PyO3 rows use one consistent crew-team scope helper.

**Architecture:** Add one private helper on `Engine` that evaluates `Teams` against `crew_teams[crew_idx]`. Route both 7504 `wocl_scope_matches` and 7505 `days_off_scope_matches` through it while leaving rule-specific base/rank/fleet and legality kernels unchanged.

**Tech Stack:** Rust, PyO3, pytest, cargo test.

## Global Constraints

- Empty `Teams` applies to all crews.
- `Teams` containing `*` applies to all crews.
- Explicit team values match case-insensitively against `crew_teams[crew_idx]`.
- Explicit team values without `crew_teams` context raise `ValueError` with the calling rule code.
- Keep edits limited to `rule-engine-rs/py/src/lib.rs`, focused PyO3 tests, and root planning/spec docs.

---

### Task 1: 7504 Regression Tests

**Files:**
- Modify: `rule-engine-rs/py/tests/test_engine_rest_wocl.py`

**Interfaces:**
- Consumes: existing `_structured_7504(...)` helper.
- Produces: failing tests that define 7504 Teams behavior.

- [ ] **Step 1: Add tests for 7504 Teams scope**

Add tests that construct close WOCL duties and structured 7504 rows with `teams=["TEAM1"]`, `teams=["TEAM2"]`, `teams=[]`, and no `crew_teams`.

- [ ] **Step 2: Run tests to verify RED**

Run: `/home/qianggong/.venv/bin/python -m pytest py/tests/test_engine_rest_wocl.py -q`

Expected before implementation: explicit matching team fails because 7504 currently raises on non-wildcard Teams.

### Task 2: Shared Helper Implementation

**Files:**
- Modify: `rule-engine-rs/py/src/lib.rs`

**Interfaces:**
- Produces: `fn crew_team_scope_matches(&self, rule_code: &str, row_teams: &[String], crew_idx: usize) -> PyResult<bool>`.
- Consumes: 7504 `wocl_scope_matches` and 7505 `days_off_scope_matches`.

- [ ] **Step 1: Add helper**

Add a private `Engine` helper that returns true for empty or wildcard Teams, errors for explicit Teams with empty `self.crew_teams`, and otherwise case-insensitively matches against the current crew's team list.

- [ ] **Step 2: Route 7504 and 7505 through helper**

Call `self.crew_team_scope_matches("7504", &row.teams, crew_idx)?` in `wocl_scope_matches` and `self.crew_team_scope_matches("7505", &row.teams, crew_idx)?` in `days_off_scope_matches`.

- [ ] **Step 3: Run GREEN tests**

Run:
- `python3 -m maturin develop --manifest-path py/Cargo.toml`
- `/home/qianggong/.venv/bin/python -m pytest py/tests/test_engine_rest_wocl.py -q`
- `/home/qianggong/.venv/bin/python -m pytest py/tests/test_engine_phase2_7505.py -q`

### Task 3: Verification and Delivery

**Files:**
- Verify all touched files.
- Commit in `rule-engine-rs`, update `pbs-engine` nested pointer, update root pointers/docs.

**Interfaces:**
- Produces pushed commits in `rule-engine-rs`, `pbs-engine`, and root `rois-ai`.

- [ ] **Step 1: Run Rust checks**

Run:
- `cargo fmt --check`
- `cargo test --test rule_7504_tests`
- `cargo test --test rule_7505_tests`
- `cargo test --package rois-rule-engine-py --manifest-path py/Cargo.toml`

- [ ] **Step 2: Commit and push**

Commit and push the `rule-engine-rs` behavior/test change, then bump and push `pbs-engine` and root submodule pointers plus docs.
