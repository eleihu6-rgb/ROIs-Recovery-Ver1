-- Migration: normalize the 14 base rules into instance='001' system templates.
--
-- Phase 2 of the Rule-tab→Legality migration introduces a template/copy model on the
-- Model-A `rule` table: each base rule becomes a read-only template at instance '001'
-- (owner='S', locked='1'); future airline-specific variants are copies (owner='C',
-- locked=null, instance '002'+).
--
-- This migration:
--   1) sets rule.instance='001' for every base rule (8002 has TWO base rules →
--      8002/006→'001' Max Flight Time, 8002/009→'002' Max Hours of Work);
--   2) populates rule.rule_id (was NULL) with the COMPOSITE code function||lpad(instance,3),
--      i.e. the same id rule_set.rule_id uses — making rule_id authoritative & NOT NULL;
--   3) remaps rule_set.rule_id AND rule_parameter.rule_id from the old composites
--      (8002006…) to the new ones (8002001…) so the joins still resolve;
--   4) marks the templates owner='S', locked='1'.
--
-- Composite consumers kept consistent (all join function||instance = rule_set.rule_id):
--   live-server routes/rule/legality.ts + services/rule/legality-recheck.ts,
--   engine-server F8/ro_input_builder/sections/rules.py (rule + rule_parameter),
--   ro-engine snapshot io/pg_ruleset_to_ro_input.py (lpad(instance,3) → workset 103 / RUST).
-- Re-verify after applying: the RUST solver e2e (scenario 538) + the Legality rulesets join.
--
-- Idempotent-ish: re-running is a no-op once instances are '001'/'002' and rule_id is set
-- (the rule_set/rule_parameter remaps match nothing on a second run).

set search_path = f8;

begin;

-- 1 + 2 + 4) rule: recode instance, then derive the composite rule_id, mark as template.
-- 8002/009 (id 20) is the second 8002 base rule → instance '002'.
update rule set instance = '002' where id = 20 and function = 8002 and instance = '009';
-- every other base rule → instance '001' (7272/001 is already '001'; no-op).
update rule set instance = '001'
 where id in (17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30);

-- populate the composite rule_id + set the template flag by instance:
--   instance '001' → read-only system TEMPLATE (owner='S', locked='1')
--   any other instance (e.g. 8002/002) → editable instance (owner='U', locked='0')
update rule
   set rule_id = (function::text || lpad(instance, 3, '0'))::bigint,
       owner   = case when instance = '001' then 'S' else 'U' end,
       locked  = case when instance = '001' then '1' else '0' end,
       updated_by = 'migration',
       updated_at = now()
 where id in (17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30);

-- 3) remap rule_set.rule_id old composite → new composite (every workset that references them).
update rule_set set rule_id = 2014001 where rule_id = 2014014;
update rule_set set rule_id = 7500001 where rule_id = 7500002;
update rule_set set rule_id = 7501001 where rule_id = 7501004;
update rule_set set rule_id = 7502001 where rule_id = 7502002;
update rule_set set rule_id = 7503001 where rule_id = 7503003;
update rule_set set rule_id = 7504001 where rule_id = 7504003;
update rule_set set rule_id = 7505001 where rule_id = 7505002;
update rule_set set rule_id = 7506001 where rule_id = 7506002;
update rule_set set rule_id = 8002001 where rule_id = 8002006;
update rule_set set rule_id = 8002002 where rule_id = 8002009;
update rule_set set rule_id = 8004001 where rule_id = 8004004;
update rule_set set rule_id = 8030001 where rule_id = 8030004;
update rule_set set rule_id = 8056001 where rule_id = 8056006;
-- 7272001 unchanged.

-- 3b) same remap for rule_parameter (keeps engine ro_input_builder's legacy RuleParameter
-- section consistent until Phase 3 drops the table). Only the 14 base composites are touched.
update rule_parameter set rule_id = 2014001 where rule_id = 2014014;
update rule_parameter set rule_id = 7500001 where rule_id = 7500002;
update rule_parameter set rule_id = 7501001 where rule_id = 7501004;
update rule_parameter set rule_id = 7502001 where rule_id = 7502002;
update rule_parameter set rule_id = 7503001 where rule_id = 7503003;
update rule_parameter set rule_id = 7504001 where rule_id = 7504003;
update rule_parameter set rule_id = 7505001 where rule_id = 7505002;
update rule_parameter set rule_id = 7506001 where rule_id = 7506002;
update rule_parameter set rule_id = 8002001 where rule_id = 8002006;
update rule_parameter set rule_id = 8002002 where rule_id = 8002009;
update rule_parameter set rule_id = 8004001 where rule_id = 8004004;
update rule_parameter set rule_id = 8030001 where rule_id = 8030004;
update rule_parameter set rule_id = 8056001 where rule_id = 8056006;

-- 4b) rule_id is now authoritative for every rule row → enforce NOT NULL.
alter table rule alter column rule_id set not null;

commit;
