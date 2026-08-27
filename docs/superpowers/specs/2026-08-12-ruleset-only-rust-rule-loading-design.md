# Design: RuleSet-only Rust rule loading (remove division rank rewrite)

**Date:** 2026-08-12  
**Status:** Approved for implementation

## Problem

PBS Rust legality (`extract_rule_params`) rewrote each rule row’s Ranks filter through `_division_scoped_ranks` using `Rule.division` and problem-crew ranks by division. Cabin scenarios (`active_ranks = {C: FA/IFD}`) dropped Pilot-tagged RuleSet members (e.g. `7507001` with `division=P`) → empty `days_off_rules_7507` → Engine never ran 7507 even though the instance was in the RuleSet.

A related cabin override forced `min_do = 0` when `Rule.division == "C"`, also mutating table Min DO.

## Decision

1. **Sole gate:** active RuleSet membership via `_sections_for_active_plan` (unchanged).
2. **Load table as written:** Bases/Ranks/Fleets/Crew Teams and Min DO come from RuleParameter rows; do not rewrite or drop rows based on `Rule.division`.
3. **Remove** `_division_scoped_ranks`, `active_ranks_by_division` plumbing, and the cabin `min_do = 0` overrides on 7505/7507.
4. **Keep** `_rule_division_map` only for legacy scalar fallbacks (e.g. 7505 `min_days_off` / 7501 `sdfd_rows` when division is empty) — those do not drop structured rows.

## Out of scope

- Live `check-7507` / legality-recheck paths
- Changing DB `Rule.division` or adding cabin-specific rule instances
