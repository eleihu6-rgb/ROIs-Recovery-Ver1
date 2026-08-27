# Rule 2015 Assignment Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development.

**Goal:** Replace hardcoded DO in 1001 grace with rule 2015 Assignments / Assignment Groups columns; empty-or-* lists disable 1001 grace.

**Architecture:** Rust `DoStartGrace1001` struct threaded through `check_assignment_overlap`, `check-1001` CLI, live-server `doStartGrace1001(ctx)`, PyO3 extras. DB migration updates F8 `2015001` param_json.

**Tech Stack:** rule-engine-rs (Rust), live-server (Vitest), sql migration

## Global Constraints

- 7505/7507 ignore new columns; only `doStartMin(ctx)` unchanged.
- Both filter lists empty after parse → 1001 `do_start_min` effective 0.
- `*` tokens stripped; not wildcards in match lists.

---

### Task 1: Rust kernel + check-1001 + tests

**Files:** `rule-engine-rs/src/lib.rs`, `src/bin/check_1001.rs`, `tests/rule_1001_tests.rs`, `src/rules/rule1001.rs`

- Add `DoStartGrace1001`, update `fly_do_2015_grace_applies`, `check_assignment_overlap`.
- CLI: `--do-start-assignments`, `--do-start-groups`.
- Tests: GRD/DO with filters; empty lists disable grace.

### Task 2: Live-server wiring + Vitest

**Files:** `legality-recheck-core.mjs`, `legality-recheck-core-param.spec.ts`

- `doStartGrace1001(ctx)`, `parse2015PipeCodes`.
- Pass new CLI args from `rule1001`.

### Task 3: PyO3 + Python test

**Files:** `py/src/lib.rs`, `py/tests/test_engine_1001_fly_do_grace.py`

- Extras fields for assignment/group filters.

### Task 4: Seed + migration + help

**Files:** `sql/seed/07-rule.sql`, `sql/migration/2026-08-19-rule-2015-assignment-filters.sql`, `_rule-doc.tsx`, cross-link specs.
