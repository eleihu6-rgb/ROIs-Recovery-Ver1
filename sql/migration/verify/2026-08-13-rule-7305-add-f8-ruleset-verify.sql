-- Verify 2026-08-13-rule-7305-add-f8-ruleset.sql.
-- Run read-only against the same target airline schema/search_path.

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
   where rule_id = 7305001
     and function = 7305
     and instance = '001';

  if rule_count <> 1 then
    raise exception 'Expected exactly one 7305/001 rule row, found %', rule_count;
  end if;

  select
      table_data -> 'header',
      table_data -> 'rows' -> 0
    into header, row_data
    from rule
    cross join lateral jsonb_array_elements(
      coalesce(rule.param_json -> 'tables', '[]'::jsonb)
    ) as tables(table_data)
   where rule.rule_id = 7305001
     and rule.function = 7305
     and rule.instance = '001'
   order by rule.id
   limit 1;

  if jsonb_array_length(coalesce(header, '[]'::jsonb)) <> 12 then
    raise exception '7305/001 parameter header must contain exactly 12 cells: %', header;
  end if;

  if header ->> 4 <> 'CREW TEAMS' then
    raise exception '7305/001 parameter header position 5 must be CREW TEAMS: %', header;
  end if;

  if jsonb_array_length(coalesce(row_data, '[]'::jsonb)) <> 12 then
    raise exception '7305/001 parameter row must contain exactly 12 cells: %', row_data;
  end if;

  if row_data <> '["*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "0", "0"]'::jsonb then
    raise exception '7305/001 parameter row does not match the required defaults: %', row_data;
  end if;

  if exists (
    select 1
      from rule
     where rule_id = 7305001
       and (
         function <> 7305
         or instance <> '001'
         or filiale <> 'F8'
         or division <> 'P'
         or param_json is null
       )
  ) then
    raise exception '7305/001 metadata or parameters are inconsistent';
  end if;

  select count(*)
    into membership_count
    from rule_set
   where rule_id = 7305001
     and workset_id in (103, 433);

  if membership_count <> 2 then
    raise exception 'Expected 7305001 membership in worksets 103 and 433, found %', membership_count;
  end if;

  if exists (
    select 1
      from (values (103::bigint), (433::bigint)) as required(workset_id)
     where not exists (
       select 1
         from rule_set rs
        where rs.rule_id = 7305001
          and rs.workset_id = required.workset_id
     )
  ) then
    raise exception '7305001 is missing required workset membership';
  end if;
end
$$;

select
    '7305_rule' as check_name,
    count(*) as rows
  from rule
 where rule_id = 7305001
   and function = 7305
   and instance = '001';

select
    '7305_memberships' as check_name,
    array_agg(workset_id order by workset_id) as worksets
  from rule_set
 where rule_id = 7305001;

select
    '7305_header_and_row' as check_name,
    table_data -> 'header' as header,
    table_data -> 'rows' -> 0 as default_row
  from rule
  cross join lateral jsonb_array_elements(
    coalesce(rule.param_json -> 'tables', '[]'::jsonb)
  ) as tables(table_data)
 where rule.rule_id = 7305001
   and rule.function = 7305
   and rule.instance = '001'
 order by rule.id
 limit 1;
