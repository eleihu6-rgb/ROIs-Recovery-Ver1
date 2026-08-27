-- Verify 2026-08-23-rule-7509-add-f8-ruleset.sql.
-- Run read-only against the same target airline schema/search_path as the migration.

do $$
declare
  rule_count integer;
  membership_count integer;
  header jsonb;
  row_data jsonb;
begin
  select count(*)
    into rule_count
    from rule
   where rule_id = 7509001
     and function = 7509
     and instance = '001';

  if rule_count <> 1 then
    raise exception 'Expected exactly one 7509/001 rule row, found %', rule_count;
  end if;

  select table_data -> 'header', table_data -> 'rows'
    into header, row_data
    from rule
    cross join lateral jsonb_array_elements(coalesce(rule.param_json -> 'tables', '[]'::jsonb)) as tables(table_data)
   where rule.rule_id = 7509001
     and rule.function = 7509
     and rule.instance = '001'
   order by rule.id
   limit 1;

  if header <> '["Crew A", "Crew B", "Eff Date", "Exp Date"]'::jsonb then
    raise exception '7509/001 parameter header is not exact: %', header;
  end if;

  if jsonb_typeof(coalesce(row_data, 'null'::jsonb)) <> 'array' then
    raise exception '7509/001 parameter rows must be a JSON array: %', row_data;
  end if;

  if exists (
    select 1 from rule
     where rule_id = 7509001
       and (function <> 7509 or instance <> '001' or filiale <> 'F8' or division <> 'P' or param_json is null)
  ) then
    raise exception '7509/001 metadata or parameters are inconsistent';
  end if;

  select count(*) into membership_count
    from rule_set where rule_id = 7509001 and workset_id = 103;
  if membership_count <> 1 then
    raise exception 'Expected exactly one 7509001 membership in workset 103, found %', membership_count;
  end if;

  if exists (
    select 1 from rule_set where rule_id = 7509001 and workset_id = 103
    group by workset_id, rule_id having count(*) <> 1
  ) then
    raise exception '7509001 has duplicate workset 103 memberships';
  end if;
end
$$;

select '7509_rule' as check_name, count(*) as rows
  from rule where rule_id = 7509001 and function = 7509 and instance = '001';

select '7509_memberships' as check_name,
       array_agg(workset_id order by workset_id) as worksets
  from rule_set where rule_id = 7509001;

select '7509_header_and_rows' as check_name,
       table_data -> 'header' as header,
       jsonb_array_length(coalesce(table_data -> 'rows', '[]'::jsonb)) as parameter_rows
  from rule
  cross join lateral jsonb_array_elements(coalesce(rule.param_json -> 'tables', '[]'::jsonb)) as tables(table_data)
 where rule.rule_id = 7509001 and rule.function = 7509 and rule.instance = '001'
 order by rule.id
 limit 1;
