-- Verify 2026-09-04-rule-7508-add-count-layover-column.sql.
-- Run read-only against the same target live schema/search_path.

do $$
declare
  r record;
  rule_count integer;
  hdr jsonb;
  rows_in jsonb;
  unit_idx integer;
  layover_count integer;
  layover_idx integer;
  header_len integer;
  malformed_row_count integer;
begin
  select count(*)
    into rule_count
    from rule
   where rule_id = 7508001;

  if rule_count = 0 then
    raise exception 'Rule 7508001 not found in current search_path';
  end if;

  for r in
    select id, rule_id, param_json
      from rule
     where rule_id = 7508001
     order by id
  loop
    if r.param_json is null
       or jsonb_typeof(r.param_json -> 'tables') <> 'array'
       or jsonb_array_length(r.param_json -> 'tables') < 1 then
      raise exception 'Rule 7508001 id % has missing or malformed param_json.tables', r.id;
    end if;

    hdr := r.param_json #> '{tables,0,header}';
    rows_in := coalesce(r.param_json #> '{tables,0,rows}', '[]'::jsonb);

    if jsonb_typeof(hdr) <> 'array' then
      raise exception 'Rule 7508001 id % has missing or malformed table 0 header', r.id;
    end if;

    if jsonb_typeof(rows_in) <> 'array' then
      raise exception 'Rule 7508001 id % has missing or malformed table 0 rows', r.id;
    end if;

    select min(ord)::integer - 1
      into unit_idx
      from jsonb_array_elements_text(hdr) with ordinality h(label, ord)
     where lower(h.label) = 'unit';

    if unit_idx is null then
      raise exception 'Rule 7508001 id % header lacks Unit', r.id;
    end if;

    select count(*), min(ord)::integer - 1
      into layover_count, layover_idx
      from jsonb_array_elements_text(hdr) with ordinality h(label, ord)
     where lower(h.label) = 'count layover';

    if layover_count <> 1 then
      raise exception 'Rule 7508001 id % expected exactly one Count Layover column, found %', r.id, layover_count;
    end if;

    if layover_idx <> unit_idx + 1 then
      raise exception 'Rule 7508001 id % Count Layover column is not immediately after Unit', r.id;
    end if;

    if lower(coalesce(hdr ->> (layover_idx + 1), '')) not in ('duty report', 'duty end buffer') then
      raise exception 'Rule 7508001 id % expected Duty Report or Duty End Buffer immediately after Count Layover, found %',
        r.id, hdr ->> (layover_idx + 1);
    end if;

    header_len := jsonb_array_length(hdr);

    select count(*)
      into malformed_row_count
      from jsonb_array_elements(rows_in) row_el(row_json)
     where case
             when jsonb_typeof(row_el.row_json) = 'array'
               then jsonb_array_length(row_el.row_json) <> header_len
             else true
           end;

    if malformed_row_count <> 0 then
      raise exception 'Rule 7508001 id % has % row(s) whose length differs from header length %',
        r.id, malformed_row_count, header_len;
    end if;
  end loop;
end
$$;

with rule_tables as (
  select r.id,
         r.rule_id,
         r.param_json #> '{tables,0,header}' as header,
         coalesce(r.param_json #> '{tables,0,rows}', '[]'::jsonb) as rows_json
    from rule r
   where r.rule_id = 7508001
),
positions as (
  select rt.*,
         (
           select min(ord)::integer - 1
             from jsonb_array_elements_text(rt.header) with ordinality h(label, ord)
            where lower(h.label) = 'unit'
         ) as unit_idx
    from rule_tables rt
)
select current_schema() as schema_name,
       id as rule_pk,
       rule_id,
       jsonb_array_length(header) as header_len,
       jsonb_array_length(rows_json) as row_count,
       header ->> unit_idx as unit_header,
       header ->> (unit_idx + 1) as count_layover_header,
       header ->> (unit_idx + 2) as duty_report_header
  from positions
 order by id;
