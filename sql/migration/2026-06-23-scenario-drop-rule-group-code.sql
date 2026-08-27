-- Final step of the scenario.rule_group_code → ruleset_id rename: drop the vestigial
-- varchar column now that ruleset_id (bigint workset.id) is the source of truth and every
-- consumer reads it. Idempotent. (scenario.legality_status keeps its own snapshot column,
-- now fed from ruleset_id — see legality-status.ts.)
set search_path = f8;
begin;
alter table scenario drop column if exists rule_group_code;
commit;
