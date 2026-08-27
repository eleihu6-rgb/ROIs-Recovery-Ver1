-- =============================================================================
-- 2026-06-15  Rule 8056/006 "Roster Spacing" → add to workset 103 + 13h→24h
-- =============================================================================
-- Rule #2 of the C++→Rust→Gantt migration (after 8002 MAX_CUM_BLOCK).
--
-- 8056/006 "Roster Spacing" (source: crewrule-dev/RuleEngine/rule8056.cpp) requires a
-- minimum SPACE between two consecutive matching rosters:
--   Assignment A = FLY  →  Assignment B = FLY|SBY|SIM,  Directional=Y, UtilizePostRest=Y,
--   SPACE = 13 RH (hours).
--
-- This migration does two things, both idempotent, run per airline schema (search_path):
--   1. Add 8056006 to workset 103 "PBS Solver Ruleset" (it already lives in 433
--      "F8 Full Ruleset"). 103 is the gantt's active group (slug 'pbs_solver_ruleset'),
--      so the gantt only sees rules mapped here.
--   2. Raise the SPACE from 13 → 24 RH in rule.param_json so the spacing check fires on
--      the many sub-24h turnarounds in the live roster (13h was nearly always satisfied;
--      24h surfaces real warnings). param_json is the param authority (Legality tab).
--
-- The header column order for 8056/006 (verified from the live row):
--   [...,"Space"(idx18),"Unit"(idx19),"Directional"(idx20),...]
-- =============================================================================

-- 1. Map 8056006 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 8056006
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 8056006);

-- 2. Raise SPACE 13 → 24 in the Space column (index 18) of every row of 8056/006.
--    jsonb path: tables[0].rows[*][18]. Single-row table, so target rows->0->0->18.
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows,0,18}',
         '"24"'::jsonb,
         false
       )
 where function = 8056
   and instance = '006'
   and (param_json::jsonb #>> '{tables,0,rows,0,18}') = '13';
