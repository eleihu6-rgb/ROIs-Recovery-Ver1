# Design: Align ro_check / F8 extras with `rules.rust` package

**Date:** 2026-07-30  
**Status:** Approved (user: 帮我修好)  
**Goal:** Restore `python3 ro_check.py` so it writes `results_ro.svg` after `pbs-engine` moved `rules/rust_checker.py` → `rules/rust/`.

## Problem

`f8_official_engine.bind_f8_rust_checker` and `engine-server/F8/*` still import `ColumnModelSolver_python.rules.rust_checker`. That module was deleted in pbs-engine refactor `482e106`. `ro_check` crashes before SVG write:

`ModuleNotFoundError: No module named 'ColumnModelSolver_python.rules.rust_checker'`

## Approach (chosen)

**Import-path sync only** — no Engine / extras logic change.

| Old | New |
|-----|-----|
| `rules.rust_checker.RustRuleChecker` | `rules.rust.RustRuleChecker` |
| `rules import rust_checker` (wrapper) | `rules import rust` |
| `_extract_assignment_types` / `_extract_pairing_data` | `engine_builder.extract_assignment_types` / `extract_pairing_data` |
| `_extract_crew_info` / `_extract_rosters` / `_parse_ro_input` | `engine_builder._extract_*` + `rust.checker.parse_ro_input` |

**Not chosen:** rewrite `align_store_for_rust_checker` from scratch; pin pbs-engine to pre-refactor commit.

## Files

- `rule-engine-rs/ro-tests/f8_official_engine.py`
- `engine-server/F8/ro_solver_wrapper.py`
- `engine-server/F8/rust_legality_extras.py`

## Verification

```bash
cd rule-engine-rs/ro-tests && python3 ro_check.py
# expect: SVG report → .../results_ro.svg
ls -la results_ro.svg
python3 -m py_compile engine-server/F8/*.py rule-engine-rs/ro-tests/f8_official_engine.py
```

## Out of scope

Fixing mismatched `assignments.txt` IDs vs `ro_input.txt` (user data).
