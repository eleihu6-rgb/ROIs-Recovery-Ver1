-- =============================================================================
-- 2026-06-15  Rules 7503/003 + 7500/002 → add to workset 103 + Max WOCLs 3→2
-- =============================================================================
-- A RELATED PAIR of the C++→Rust→Gantt migration (after 8002, 8056, 7502, 8030, 8004,
-- 7501+2014).
--
-- 7500/002 "Basic definition of Acc State" (source: rule/rule7500/AcclimatizationForCARSRule.cpp)
-- is a DEFINITION rule: it computes each crew's acclimatisation reference timezone and emits
-- NO violations. Multiple rules consume it (7503 WOCL, 7005/7025/6038/7482 in the C++). It
-- is added to 103 so the dependency is visible alongside the rule that uses it.
--
-- 7503/003 "Limits of Consecutive WOCLs" (source: rule/rule7503/LimitConsecutiveWoclForCARSRule.cpp)
-- caps consecutive WOCL duties. A WOCL duty's window is evaluated in the crew's
-- acclimatisation TZ (7500's output; the crew base TZ in the live port), and the
-- consecutive-run reset uses rule 2014's Local Night Definition (already in 103 from the
-- 7501 migration). Header: [Bases,Ranks,Fleets,Teams,WOCL Start,WOCL End,Max Consecutive WOCLs].
--
-- This migration, all idempotent, run per airline schema (search_path):
--   1. Add 7500002 to workset 103 (it already lives in 433 "F8 Full Ruleset").
--   2. Add 7503003 to workset 103.
--   3. Lower "Max Consecutive WOCLs" 3 → 2 in 7503/003 param_json so the cap fires on the
--      many crew with 3 consecutive WOCL-touching duties (at 3 only ~4 crew fire; at 2 ~14).
--      param_json is the param authority (Legality tab).
-- (2014/014 — the Local Night Definition 7503 also depends on — is already in workset 103.)
-- =============================================================================

-- 1. Map 7500002 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 7500002
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7500002);

-- 2. Map 7503003 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 7503003
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7503003);

-- 3. Lower Max Consecutive WOCLs 3 → 2 (column index 6 of the single row of 7503/003).
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows,0,6}',
         '"2"'::jsonb,
         false
       )
 where function = 7503
   and instance = '003'
   and (param_json::jsonb #>> '{tables,0,rows,0,6}') = '3';
