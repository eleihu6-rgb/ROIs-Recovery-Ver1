-- =============================================================================
-- 2026-06-15  Rule 7272/001 "Calculate DP of the Reserves" → add to workset 103
-- =============================================================================
-- Rule #11 of the C++→Rust→Gantt migration. 7272/001 is a DEFINITION / CALC rule
-- (category=Definition, like 7502/2014/7500): it computes the standby/reserve duty-period
-- (DP = rate × offset-adjusted standby duration; F8 rate 0.33) consumed by other duty rules,
-- and emits NO violations.
--
-- Source: rule/rule7272/CalculateStandbyDPForTGRule.cpp; oracle: RuleTest/rule7272_gtest.cpp
-- (12h standby @0.33 → 14256 s; unlisted qualifier → -1; offset reduces it; callout adds the
-- notify period within the limit). Its params were populated earlier
-- (2026-06-15-rule-7272-001-param-json.sql) and it was categorised Definition
-- (2026-06-15-rule-category-definition-7500-7502-7272.sql).
--
-- PARAM CHANGE: NONE (a CALC rule has no threshold to "trigger"; it writes no rule_violation
-- rows). This migration only maps 7272001 into workset 103 "PBS Solver Ruleset" so the gantt's
-- Legality tab surfaces it alongside the other migrated rules. param_json stays the authority;
-- the Rust engine reads Assignments/Standby Offset/Rate/SBY Limit/Notification Limit verbatim.
--
-- Live (June 2026): 1475 reserve rosters / 212 crew / ~5480 reserve DP-hours computed, 0
-- violations (the CALC "end goal" is the Legality config tab + the DP report, not an alarm).
--
-- This migration is idempotent and run per airline schema (search_path):
--   Map 7272001 into workset 103 (it already lives in 433).
-- =============================================================================

insert into rule_set (workset_id, rule_id)
select 103, 7272001
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7272001);
