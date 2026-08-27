-- =============================================================================
-- 2026-06-15  Rule 7501/004 "Single Day Free from Duty (rolling RH)" + its dependency
--             2014/014 "Local Night Definition"  →  add to workset 103,
--             and raise 7501/004 row-1 Min Limits 1 → 3
-- =============================================================================
-- Rule #6 of the C++→Rust→Gantt migration (after 8002, 8056, 7502, 8004, 8030).
--
-- 7501/004 "Single Day Free from Duty in Rolling Hours"
--   (source: crewrule-dev/RuleEngine/rule/rule7501/LimitSingleDayFreeFromDutyForCARSRule.cpp)
--   requires at least MIN LIMITS "single days free from duty" (SDFD) in every rolling
--   PERIOD-hour window. An SDFD = a True Rest that fully covers TWO CONSECUTIVE local
--   nights (a valid min-rest placement in each, no duty in the daytime gap between).
--   Live param rows: [168 RH / buffer 00:30 / MinLimits 1] and [672 RH / 00:30 / 4].
--
-- 2014/014 "Local Night Definition" (category Definition, class B) is the PARAMETER
--   SOURCE 7501 depends on — it defines the local-night band the SDFD test uses
--   (rule7501.cpp cites 法规 2014014 via getLocalNightDefinition()). Live value:
--   [Local Night Start 22:00, Local Night End 08:00, Min Interval 08:00]. It is a
--   definition, not a checker — it emits NO violations; the Rust 7501 engine is driven
--   from these values (no hardcoded 22:00/08:00/8h), so config and engine never drift.
--
-- This migration does three things, all idempotent, run per airline schema (search_path):
--   1. Map 7501004 into workset 103 "PBS Solver Ruleset" (the gantt's active group, slug
--      'pbs_solver_ruleset') so 7501 violations + params show in the gantt.
--   2. Map 2014014 into workset 103 so the Local Night Definition is visible alongside it
--      in the Legality (config) tab.
--   3. Raise 7501/004 row-1 (the 168 RH row) Min Limits 1 → 3, so the SDFD check fires
--      readily: "3 days free per rolling 7 days" is far stricter than 1 and surfaces real
--      warnings on the live roster. param_json is the param authority (Legality tab).
--
-- 7501/004 header column order (verified from the live row):
--   ["Bases"(0),"Ranks"(1),"Fleets"(2),"Teams"(3),"Period"(4),"Unit"(5),
--    "Duty End Buffer"(6),"Min Limits"(7)]
-- Row 0 = "168 RH" → Min Limits at tables[0].rows[0][7].
-- =============================================================================

-- 1. Map 7501004 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 7501004
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7501004);

-- 2. Map 2014014 (Local Night Definition dependency) into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 2014014
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 2014014);

-- 3. Raise Min Limits 1 → 3 in row 0 (168 RH) of 7501/004.
--    jsonb path: tables[0].rows[0][7].
update rule
   set param_json = jsonb_set(
         param_json::jsonb,
         '{tables,0,rows,0,7}',
         '"3"'::jsonb,
         false
       )
 where function = 7501
   and instance = '004'
   and (param_json::jsonb #>> '{tables,0,rows,0,7}') = '1';
