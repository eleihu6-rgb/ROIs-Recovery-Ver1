-- =============================================================================
-- 2026-06-15  Rule 7506/002 "One Checkin Per Day." → add to workset 103
-- =============================================================================
-- Rule #10 of the C++→Rust→Gantt migration (after 8002, 8056, 7502, 8030, 8004,
-- 7501+2014, 7503+7500, 7504, 7505). The LAST of the 14-rule "F8 Full Ruleset" (433)
-- to be ported (7272/001 is a CALC/Definition handled separately).
--
-- 7506/002 "One Checkin Per Day." (source: rule/rule7506/SingleDailyCheckinForCARSRule.cpp
-- `CheckRuleForCrew`; oracle: RuleTest/rule7506_gtest.cpp) — a crew may CHECK IN at most
-- once per crew-LOCAL calendar day for the checked assignment groups (F8 = "FLY"). Two FLY
-- pairings (check-ins) whose START local-days are equal → violation (severity 1, ROSTER).
-- Message (verbatim C++): "Only one roster allowed (FLY) in one local day."
--
-- PARAM CHANGE: NONE. Like 7505, the real F8 config already flags honest live cases —
-- 79 violations / 74 crew in June 2026 (crew assigned two separate FLY pairings starting
-- the same local day). param_json (Bases/Ranks/Fleets/Teams/Assignments = */*/*/*/FLY)
-- stays the param authority; the Rust engine reads the checked groups from it.
--
-- This migration is idempotent and run per airline schema (search_path):
--   Map 7506002 into workset 103 "PBS Solver Ruleset" (it already lives in 433).
-- =============================================================================

insert into rule_set (workset_id, rule_id)
select 103, 7506002
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7506002);
