-- =============================================================================
-- 2026-06-15  Rule 7502/002 "The Calculation of Credit Hours" → add to workset 103
-- =============================================================================
-- Rule #3 of the C++→Rust→Gantt migration (after 8002 MAX_CUM_BLOCK and 8056 ROSTER
-- SPACING). 7502/002 is a CALCULATOR, not a checker — it computes credit hours per
-- activity and emits NO violations:
--   credit = max(MinimumCH_floor, flightTime × FT-ratio, dutyPeriod × DP-ratio)
--   (CalculateCreditHoursForCARSRule.cpp:611-647; F8 params: FLY→FT 1.0, GND→DP 0.5,
--    DO|LO|LEA|SBY→MinimumCH 04:00, plus a hardcoded 240-min default floor).
--
-- This migration only maps 7502002 into workset 103 "PBS Solver Ruleset" (it already
-- lives in 433 "F8 Full Ruleset"). 103 is the gantt's active group (slug
-- 'pbs_solver_ruleset'), so adding it here makes the rule + its credit param table show
-- in the gantt LEGALITY (config) tab. No param change: a pure-calc rule has no threshold
-- to "trigger", and it writes no rule_violation rows.
--
-- Idempotent, run per airline schema (search_path).
-- =============================================================================

insert into rule_set (workset_id, rule_id)
select 103, 7502002
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7502002);
