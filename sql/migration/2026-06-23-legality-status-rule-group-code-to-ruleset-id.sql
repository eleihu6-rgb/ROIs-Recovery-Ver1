-- Rename scenario.legality_status.rule_group_code -> ruleset_id (bigint = workset id),
-- matching the scenario.ruleset_id rename + the result-table ruleset_id rename. This is a
-- write-only snapshot column (no index); the orchestrator now feeds it the scenario's
-- ruleset_id. Non-numeric legacy snapshots (e.g. 'pbs_solver_ruleset') map to 103.
-- Idempotent: skips if already renamed.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'scenario' and table_name = 'legality_status'
       and column_name = 'rule_group_code'
  ) then
    update scenario.legality_status
       set rule_group_code = '103'
     where rule_group_code is null or rule_group_code !~ '^\d+$';
    alter table scenario.legality_status rename column rule_group_code to ruleset_id;
    alter table scenario.legality_status
      alter column ruleset_id type bigint using ruleset_id::bigint;
  end if;
end $$;
