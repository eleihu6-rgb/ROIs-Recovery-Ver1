-- Verify 2026-08-06-remove-legacy-8002-009.sql.
-- Run against the same target airline schema/search_path as the migration.

do $$
begin
  if exists (select 1 from rule_set where rule_id = 8002009) then
    raise exception 'Legacy rule_set membership for 8002009 still exists';
  end if;

  if exists (select 1 from rule where rule_id = 8002009) then
    raise exception 'Legacy rule definition 8002009 still exists';
  end if;

  if not exists (
    select 1
      from rule r
     cross join lateral jsonb_array_elements(
       coalesce(r.param_json -> 'tables', '[]'::jsonb)
     ) as t(table_json)
     cross join lateral jsonb_array_elements(
       coalesce(t.table_json -> 'rows', '[]'::jsonb)
     ) as row_data
     where r.rule_id = 8002002
       and r.function = 8002
       and upper(coalesce(row_data ->> 9, '')) = 'DP'
  ) then
    raise exception 'Current 8002002 Type=DP configuration is missing';
  end if;
end
$$;

select '8002009_removed' as check_name, count(*) as remaining_rows
  from rule
 where rule_id = 8002009;

select '8002002_dp_rows' as check_name, count(*) as dp_rows
  from rule r
 cross join lateral jsonb_array_elements(
   coalesce(r.param_json -> 'tables', '[]'::jsonb)
 ) as t(table_json)
 cross join lateral jsonb_array_elements(
   coalesce(t.table_json -> 'rows', '[]'::jsonb)
 ) as row_data
 where r.rule_id = 8002002
   and r.function = 8002
   and upper(coalesce(row_data ->> 9, '')) = 'DP';
