# Design: Align `ro_check` with F8 `ro_rust.sh` + wrapper Engine inputs

**Date:** 2026-07-12  
**Status:** Implemented (no pbs-engine changes)  
**Goal:** `ro_check` builds the same legality Engine as formal F8 scenario Rust RO.

---

## Authority

```
rust_checker base (pbs-engine, unchanged)
  ∪  shared extras (engine-server/F8/rust_legality_extras.py)
  →  Engine.check_line
```

Formal path: `ro_rust.sh` → `ro_solver_wrapper.py` → `set_next_engine_extras` → `RustRuleChecker.bind_problem`.  
`ro_check`: `f8_official_engine.bind_f8_rust_checker` (same order).

## Sequential replay (no Engine rebuild)

Per crew `accepted: list[pairing_id]`:

- Try P: `check_line(crew, accepted+[P])` vs PA-only baseline Counter
- On OK: `accepted.append(P)`
- Fixed flying PA = **Roster only** (not RosterFlight)

## Files

| File | Role |
|------|------|
| `engine-server/F8/rust_legality_extras.py` | Shared manday/duty/seg/`is_rest` builders |
| `engine-server/F8/ro_solver_wrapper.py` | Thin: `build_engine_extras` + inject + run_solver |
| `rule-engine-rs/ro-tests/f8_official_engine.py` | Bind helper for ro_check |
| `rule-engine-rs/ro-tests/ro_check.py` | Uses official bind + accepted candidates |
| `engine-server/tests/test_rust_legality_extras.py` | Extras unit tests |

**Not changed:** `pbs-engine` submodule.

## Alignment

| Concern | Result |
|---------|--------|
| Engine inputs vs F8 RO | Aligned (same base + same extras) |
| Final-line legality | Aligned via `check_line(accepted)` |
| Column-gen / MIP | Out of scope |
| Editor-mode full line / RuleSet gating / RosterFlight PA | Dropped by design |

## Verification

```bash
python3 -m py_compile engine-server/F8/rust_legality_extras.py \
  engine-server/F8/ro_solver_wrapper.py \
  rule-engine-rs/ro-tests/f8_official_engine.py \
  rule-engine-rs/ro-tests/ro_check.py

# with pandas+pytest available:
pytest engine-server/tests/test_rust_legality_extras.py -v
```
