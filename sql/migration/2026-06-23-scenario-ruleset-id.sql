-- Migration (additive): add scenario.ruleset_id (bigint = workset.id, default 103),
-- backfilled from the old rule_group_code via the SAME name-match the engine used
-- (scenario.rule_group_code → rule_group.name → workset.name → workset.id), else 103.
--
-- rule_group_code is KEPT for now and dropped in a later cleanup step
-- (2026-06-23-scenario-drop-rule-group-code.sql) once all consumers are re-pointed,
-- so the running live-server never breaks mid-migration.
--
-- NOTE: there is no scenario.legality_status table in this schema — not touched.
-- Idempotent.

set search_path = f8;

begin;

alter table scenario add column if not exists ruleset_id bigint;

update scenario sc
   set ruleset_id = coalesce((
         select w.id
           from rule_group rg
           join workset w on w.name = rg.name
          where rg.group_code = sc.rule_group_code and rg.is_deleted = 0
          order by w.id limit 1), 103)
 where ruleset_id is null;

alter table scenario alter column ruleset_id set not null;
alter table scenario alter column ruleset_id set default 103;

commit;
