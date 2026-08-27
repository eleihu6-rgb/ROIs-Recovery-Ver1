-- Rename scenario.rule_violation.rule_group_code -> ruleset_id (bigint = workset id),
-- completing the rule_group_code → ruleset_id migration. The f8 result tables and
-- scenario.legality_status were already renamed (2026-06-23-result-tables-* /
-- 2026-06-23-legality-status-*); scenario.rule_violation was the last holdout — it already
-- stored the numeric ruleset_id as a varchar tag, so this only aligns the column name + type.
-- The orchestrator (scenario-legality.mjs) feeds it the scenario's ruleset_id; the read path
-- (routes/scenario/legality.ts) never queries this column. The rename auto-updates the
-- unique constraint (…, rule_group_code, rule_code). Non-numeric legacy values map to 103.
-- Idempotent: skips if already renamed.
set search_path to scenario;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'scenario' and table_name = 'rule_violation'
       and column_name = 'rule_group_code'
  ) then
    update scenario.rule_violation
       set rule_group_code = '103'
     where rule_group_code is null or rule_group_code !~ '^\d+$';
    alter table scenario.rule_violation rename column rule_group_code to ruleset_id;
    alter table scenario.rule_violation
      alter column ruleset_id type bigint using ruleset_id::bigint;
  end if;
end $$;
