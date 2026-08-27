-- =============================================================================
-- 2026-06-14  New "F8 Full Ruleset" workset (next available id) + strip 103 to 8002
-- =============================================================================
--  - Create a NEW workset (auto-assigned next id) named "F8 Full Ruleset" holding ALL
--    14 F8 rules — preserves the complete set before 103 is slimmed.
--  - workset 103 ("PBS Solver Ruleset") → stripped to rule 8002 only (8002006 BH, 8002009 DP).
-- Idempotent (keyed on the workset name). F8 schema.
-- =============================================================================

-- Create the full-ruleset workset once (IDENTITY assigns the next available id).
insert into workset (name, category, type, filiale, division)
select 'F8 Full Ruleset', 'PBS', 'CU', 'F8', 'P'
where not exists (select 1 from workset where name = 'F8 Full Ruleset' and filiale = 'F8');

-- Map all 14 F8 rules into it.
insert into rule_set (workset_id, rule_id)
select w.id, v.rule_id
from (select id from workset where name = 'F8 Full Ruleset' and filiale = 'F8' order by id limit 1) w
cross join (values
  (2014014),(7272001),(7500002),(7501004),(7502002),(7503003),(7504003),
  (7505002),(7506002),(8002006),(8002009),(8004004),(8030004),(8056006)
) as v(rule_id)
where not exists (select 1 from rule_set rs where rs.workset_id = w.id and rs.rule_id = v.rule_id);

-- 103 = 8002 only (keep BH 8002006 + DP 8002009, drop the other 12).
delete from rule_set where workset_id = 103 and rule_id not in (8002006, 8002009);
