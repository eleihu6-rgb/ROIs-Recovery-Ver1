-- Verify 2026-08-13-rule-7305-convert-to-12-params.sql.
-- Run read-only against the target airline schema/search_path.

do $$
declare
  header jsonb;
  row_data jsonb;
begin
  select table_data -> 'header',
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

  if jsonb_array_length(coalesce(row_data, '[]'::jsonb)) <> 12 then
    raise exception '7305/001 parameter row must contain exactly 12 cells: %', row_data;
  end if;

  if header <> '[
    "Bases",
    "Ranks",
    "Positions",
    "Fleets",
    "CREW TEAMS",
    "Assignment Groups",
    "Assignments",
    "Labels",
    "Attributes",
    "Consecutive Type (T/D)",
    "Max Consecutive Times",
    "Severity"
  ]'::jsonb then
    raise exception '7305/001 parameter header mismatch: %', header;
  end if;

  if row_data <> '["*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "0", "0"]'::jsonb then
    raise exception '7305/001 parameter row mismatch: %', row_data;
  end if;
end
$$;

select
    '7305_12_param_layout' as check_name,
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
