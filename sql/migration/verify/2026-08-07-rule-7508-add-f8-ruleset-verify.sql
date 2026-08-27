-- Verify 2026-08-07-rule-7508-add-f8-ruleset.sql.
-- Run against the same target airline schema/search_path as the migration.

do $$
declare
  rule_count integer;
  missing_worksets bigint[];
begin
  select count(*)
    into rule_count
    from rule
   where rule_id = 7508001
     and function = 7508
     and instance = '001';

  if rule_count <> 1 then
    raise exception 'Expected exactly one 7508/001 rule row, found %', rule_count;
  end if;

  if not exists (
    select 1
      from rule
     where rule_id = 7501001
       and function = 7501
       and param_json is not null
  ) then
    raise exception 'Reference 7501/001 param_json is missing';
  end if;

  if exists (
    select 1
      from rule r7508
      join rule r7501
        on r7501.rule_id = 7501001
       and r7501.function = 7501
     where r7508.rule_id = 7508001
       and r7508.function = 7508
       and r7508.param_json is distinct from r7501.param_json
  ) then
    raise exception '7508/001 param_json does not match 7501/001';
  end if;

  select array_agg(src.workset_id order by src.workset_id)
    into missing_worksets
    from rule_set src
   where src.rule_id = 7501001
     and not exists (
       select 1
         from rule_set copied
        where copied.rule_id = 7508001
          and copied.workset_id = src.workset_id
     );

  if coalesce(array_length(missing_worksets, 1), 0) <> 0 then
    raise exception '7508/001 is missing from 7501 worksets: %', missing_worksets;
  end if;
end
$$;

select '7508_rule' as check_name, count(*) as rows
  from rule
 where rule_id = 7508001
   and function = 7508
   and instance = '001';

select '7508_memberships' as check_name, array_agg(workset_id order by workset_id) as worksets
  from rule_set
 where rule_id = 7508001;

select '7501_memberships' as check_name, array_agg(workset_id order by workset_id) as worksets
  from rule_set
 where rule_id = 7501001;

select '7508_params_match_7501' as check_name,
       bool_and(r7508.param_json is not distinct from r7501.param_json) as ok
  from rule r7508
  join rule r7501
    on r7501.rule_id = 7501001
   and r7501.function = 7501
 where r7508.rule_id = 7508001
   and r7508.function = 7508;
