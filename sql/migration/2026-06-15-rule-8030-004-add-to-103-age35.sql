-- =============================================================================
-- 2026-06-15  Rule 8030/004 "Age Restriction" → add to workset 103 + age 65→35
-- =============================================================================
-- Rule #4 of the C++→Rust→Gantt migration (after 8002, 8056, 7502).
--
-- 8030/004 "Age Restriction" (source: crewrule-dev/RuleEngine/rule8030.cpp,
-- checkPilotAge) caps how many crew of a DIVISION aged ≥ AGE DEFINE may share a flight:
--   DIVISION=P, AIRPORT=*, AGE DEFINE, MAX NUMBER=1.
-- A flight (live: a shared pairing) carrying MORE THAN MAX NUMBER such crew is a
-- violation for each over-age crew on it.
--
-- This migration does two things, both idempotent, run per airline schema (search_path):
--   1. Add 8030004 to workset 103 "PBS Solver Ruleset" (it already lives in 433
--      "F8 Full Ruleset"). 103 is the gantt's active group (slug 'pbs_solver_ruleset'),
--      so the gantt only sees rules mapped here.
--   2. Lower AGE DEFINE from 65 → 35 in rule.param_json so the check fires on the many
--      flights crewed by two pilots over 35 (at 65 almost nothing fires; at 35 hundreds
--      of flights surface real warnings). param_json is the param authority (Legality tab).
--
-- The header column order for 8030/004 (verified from the live row):
--   ["Division"(0),"Airport"(1),"Age Define"(2),"Max Number"(3)]
-- =============================================================================

-- 1. Map 8030004 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 8030004
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 8030004);

-- 2. Lower AGE DEFINE 65 → 35 in the "Age Define" column (index 2) of 8030/004.
--    jsonb path: tables[0].rows[0][2]. Single-row table.
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows,0,2}',
         '"35"'::jsonb,
         false
       )
 where function = 8030
   and instance = '004'
   and (param_json::jsonb #>> '{tables,0,rows,0,2}') = '65';
