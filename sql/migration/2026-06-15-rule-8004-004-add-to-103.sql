-- =============================================================================
-- 2026-06-15  Rule 8004/004 "Basic Competency" → add to workset 103
-- =============================================================================
-- Rule #5 of the C++→Rust→Gantt migration (after 8002, 8056, 7502, 8030).
--
-- 8004/004 "Basic Competency" (source: crewrule-dev/RuleEngine/RuleEngine.cpp,
-- checkBasicCompetency) verifies a crew holds the qualification required by each roster.
-- It has three Type rows; only BASE has Enable Check=Y (RANK, FLEET = N), Grace Period=0:
--   for each roster, the pairing's BASE must be a valid crew_base during the roster span.
--
-- This migration maps 8004004 into workset 103 "PBS Solver Ruleset" (it already lives in
-- 433 "F8 Full Ruleset"). 103 is the gantt's active group (slug 'pbs_solver_ruleset'), so
-- the gantt only sees rules mapped here. No param value is changed — the enabled BASE
-- check already fires on the live roster (crew based elsewhere flying a based pairing).
--
-- Idempotent; run per airline schema (search_path).
-- =============================================================================

insert into rule_set (workset_id, rule_id)
select 103, 8004004
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 8004004);
