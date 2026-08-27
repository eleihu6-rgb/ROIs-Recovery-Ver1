-- Phase 3: drop Model B (the rule_template / rule_instance / rule_group /
-- rule_group_instance / rule_parameter model) now that Model A (workset / rule_set /
-- rule + rule.param_json) is the single rule model. Every consumer has been re-pointed:
--   - live rule-check selector + default → workset (category RULE), result tables → ruleset_id
--   - /rulesets isDefault + legality-recheck default → workset 103
--   - engine ro_input RuleParameter section → rule.param_json
--   - Rule-tab UI + live-server rule-config backend deleted
-- FK order: rule_group_instance (child of rule_group + rule_instance) first.
-- Idempotent.

set search_path = f8;

begin;
drop table if exists rule_group_instance;
drop table if exists rule_group;
drop table if exists rule_instance;
drop table if exists rule_template;
drop table if exists rule_parameter;
commit;
