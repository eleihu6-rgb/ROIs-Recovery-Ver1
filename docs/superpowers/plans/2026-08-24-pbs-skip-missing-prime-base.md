# PBS Skip Missing Prime-Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hard-failing when an active crew has no prime-base window; zero-fill that dense timezone slot and warn.

**Architecture:** Change only `build_crew_timezone_arrays` in `pbs-engine/.../crew_timezone.py`. Do not invent CrewBase data.

**Tech Stack:** Python 3, existing `pbs-engine` unit tests (`pytest`).

**Spec:** `docs/superpowers/specs/2026-08-24-pbs-skip-missing-prime-base-design.md`

## Global Constraints

- No invented / revived / expired CrewBase or airport data.
- All active crews (scenario + COF) use the same skip rule.
- Dense arrays must still pass `CrewTimezoneArrays.validate()`.

---

### Task 1: RED — unit test for missing prime base

**Files:**
- Modify: `pbs-engine/tests/unit/test_rust_crew_timezone.py`

- [ ] Add test: two crews; only one has prime CrewBase; call `build_crew_timezone_arrays`; assert no raise; missing crew has `crew_offset_min==0` and zero-filled segment/duty/ground rows of correct lengths; CrewBase section row count unchanged.
- [ ] Run test; confirm it fails on current `ValueError`.

### Task 2: GREEN — skip + zero-fill + warn

**Files:**
- Modify: `pbs-engine/ColumnModelSolver_python/rules/rust/crew_timezone.py`

- [ ] Replace raise with warning + zero-fill for empty windows; continue.
- [ ] Re-run unit tests for `test_rust_crew_timezone.py`; all pass.

### Task 3: Deploy note (SIT)

- [ ] Sync patched file to SIT `RO_SOLVER_DIR` (`/home/rois/PBS_column_based_algorithm-main/.../crew_timezone.py`) when user asks to deploy.
