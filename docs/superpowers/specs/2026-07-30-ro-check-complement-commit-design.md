# Design: ro_check PBS-style complement commit (8030/8072)

**Date:** 2026-07-30  
**Status:** Approved (user: ro_check补上commit_complement/commit_pairing_8030)  
**Goal:** Sequential `ro_check` rounds update mutable Engine COF like PBS, so second over-age assign can fail 8030.

## Behavior

After composition gate, before accepting an assign:

1. `checker.can_add_complement(crew, pairing)` — if non-empty → fail (print complement viols; no accept)
2. `engine.check_line(...)` as today (baseline diff in optimizer mode)
3. On check_line OK → `checker.commit_complement(crew, pairing)` then accept into `accepted` / `pairing_roster`

`RustRuleChecker.commit_complement` already dispatches `commit_pairing_8030` + `commit_pairing_8072` when gated.

Fallback if checker lacks complement methods (old wheel): warn once, skip gate/commit (legacy).

## Files

- `rule-engine-rs/ro-tests/ro_check.py`
- brief docstring update

## Verify

```bash
cd rule-engine-rs/ro-tests && python3 ro_check.py
# with 1442 then 2314 on 14256 (Age Define 50): round 2 should fail 8030
```
