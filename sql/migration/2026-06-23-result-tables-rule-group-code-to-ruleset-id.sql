-- Migration: rename the live rule-check RESULT-TABLE dimensional/partition key
-- rule_group_code (varchar) -> ruleset_id (bigint = workset id, 法规集合 id).
--
-- The live rule-check is RUST/code-driven; rule_group_code on these result tables is a
-- dimensional key that should now hold the workset id (default 103). This matches the
-- already-done scenario.ruleset_id rename. Model B (rule_group.group_code) is dropped
-- separately and is NOT touched here.
--
-- Tables affected (f8 schema):
--   1. rule_violation             (PARTITIONED parent + 24 monthly partitions; column in two
--                                   unique/normal indexes — PG 16 propagates the type change and
--                                   rebuilds the dependent indexes across partitions automatically)
--   2. rule_check_result_pairing  (unique + idx_rcr_pairing_group + idx_rcr_crew_group)
--   3. rule_check_result_roster   (unique + idx_rcrr_crew_group_month)
--   4. rule_check_batch_run       (plain column)
--   5. calc_result                (nullable, currently empty — renamed for consistency)
--
-- Non-numeric legacy values ('pbs_solver_ruleset', 'ccar121_gantt', …) are mapped to 103
-- (the legacy default GANTT workset) BEFORE the bigint retype.
--
-- Supersedes 2026-06-23-rule-violation-group-code-to-workset.sql (deleted): that interim
-- migration only re-keyed some rule_violation rows; its value-mapping is folded in here.
--
-- Idempotent: each table's rename/retype is guarded so re-running is a no-op (skip if
-- ruleset_id already exists). For a partitioned table the rename/type-change on the parent
-- cascades to all partitions automatically; partitions are NOT altered individually.

set search_path = f8;

begin;

do $$
declare
  t text;
  result_tables text[] := array[
    'rule_violation',
    'rule_check_result_pairing',
    'rule_check_result_roster',
    'rule_check_batch_run',
    'calc_result'
  ];
begin
  foreach t in array result_tables loop
    -- Only act while the legacy column still exists on this table.
    if exists (
      select 1
        from information_schema.columns
       where table_schema = 'f8'
         and table_name   = t
         and column_name  = 'rule_group_code'
    ) then
      -- 1. Map non-numeric legacy values -> 103 (cascades to partitions for rule_violation).
      execute format(
        'update %I set rule_group_code = ''103'' '
        || 'where rule_group_code is not null and rule_group_code !~ ''^\d+$''',
        t
      );

      -- 2. Rename rule_group_code -> ruleset_id on the parent (cascades to all partitions).
      execute format('alter table %I rename column rule_group_code to ruleset_id', t);

      -- 3. Retype to bigint (PG 16 propagates + rebuilds dependent indexes across partitions).
      execute format(
        'alter table %I alter column ruleset_id type bigint using ruleset_id::bigint',
        t
      );
    end if;
  end loop;
end
$$;

commit;
