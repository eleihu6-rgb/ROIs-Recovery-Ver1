-- =============================================================================
-- 2026-06-15  Rule 7505/002 "Min # GDOs in a RP" → add to workset 103
-- =============================================================================
-- Rule #9 of the C++→Rust→Gantt migration (after 8002, 8056, 7502, 8030, 8004,
-- 7501+2014, 7503+7500, 7504).
--
-- 7505/002 "Min # GDOs in a RP" (source: rule/rule7505/MinimumDaysOffForCARSRule.cpp;
-- oracle: RuleTest/rule7505_gtest.cpp) requires each crew to have at least MIN DO days
-- off in the rostering period. A "day off" = a crew-base-local calendar day that is blank
-- (Count Blank Day=Y), or covered only by DO-group assignments (live roster code 'DO') or
-- a LAYOVER. The applicable band row is chosen by RP length (June = 30 days → the 30-30
-- rows) AND the crew's leave-assignment (VAC) day-count — more leave ⇒ fewer required days
-- off. Violation ⇔ daysOff < MIN DO (strict), severity Soft.
--
-- PARAM CHANGE: NONE. Unlike every prior migrated rule, 7505 needs no artificial limit
-- bump — the REAL F8 band already flags 191 of 812 crew in live June 2026 (the over-worked
-- crew with < 12 days off). The 27 band rows were separately restored from the legacy 433
-- ruleset by `2026-06-15-rule-7505-002-restore-do-band-rows.sql` (the GUI had been showing
-- only 1 of 27 rows). param_json remains the param authority; the Rust engine reads all 27
-- rows verbatim. (Param-sensitivity is still proven — the harness `--bump N` raises the
-- floor in-memory: +1 ⇒ 246 crew fire, strictly ≥ 191. The DB is left at the real values.)
--
-- This migration is idempotent and run per airline schema (search_path):
--   Map 7505002 into workset 103 "PBS Solver Ruleset" (it already lives in 433).
-- =============================================================================

insert into rule_set (workset_id, rule_id)
select 103, 7505002
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7505002);
