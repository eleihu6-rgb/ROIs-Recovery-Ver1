-- =============================================================================
-- 2026-06-15  Rule 7504/003 "Spacing Rule - WOCL" → add to workset 103 + Min Period 55→80
-- =============================================================================
-- Rule #8 of the C++→Rust→Gantt migration (after 8002, 8056, 7502, 8030, 8004, 7501+2014,
-- 7503+7500).
--
-- 7504/003 "Spacing Rule - WOCL" (source: rule/rule7504/CheckMinSpaceBetweenDutyForF8Rule.cpp;
-- oracle: RuleTest/rule7504_gtest.cpp) requires a minimum rest between two consecutive WOCL
-- flight duties. A WOCL duty is one whose FDP overlaps the WOCL window [02:00,05:59] in
-- crew-base-local time (the gtest's APPLY PRELABELLED ATTRIBUTES=N path). Prev=FLY, Next=FLY,
-- Prev/Next Attributes=WOCL, Level=D, Utilize Post Rest=Y, Unit=RH.
--   Header: [Bases,Ranks,Fleets,Teams,Prev Assignment Groups,Next Assignment Groups,
--            Prev Assignments,Next Assignments,Prev Attributes,Next Attributes,
--            Apply Prelabelled Attributes,Utilize Post Rest,Level,Min Period,Unit]
--   "Min Period" is column index 13.
--
-- This migration, idempotent, run per airline schema (search_path):
--   1. Add 7504003 to workset 103 "PBS Solver Ruleset" (it already lives in 433).
--   2. Raise Min Period 55 → 80 RH so more sub-80h gaps between WOCL flight duties surface as
--      warnings (at 55 RH ~120 crew fire; at 80 RH ~178). param_json is the param authority.
-- (The WOCL window itself comes from 7503/003, already in workset 103.)
-- =============================================================================

-- 1. Map 7504003 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 7504003
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7504003);

-- 2. Raise Min Period 55 → 80 (column index 13 of the single row of 7504/003).
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows,0,13}',
         '"80"'::jsonb,
         false
       )
 where function = 7504
   and instance = '003'
   and (param_json::jsonb #>> '{tables,0,rows,0,13}') = '55';
