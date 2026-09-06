-- 2026-09-04 rule 7508 Count Layover parameter
--
-- Insert "Count Layover" immediately after "Unit" in rule 7508's first
-- param_json table. Existing rows receive "N" (the new default: each pairing
-- counts as one solid block, so only rest between pairings can satisfy the
-- single-day-free-from-duty requirement). Y preserves the historical duty-level
-- behaviour where a layover inside a pairing may satisfy the free day.
--
-- Run under the target live schema search_path. Do not hard-code schema names.

begin;

select pg_advisory_xact_lock(7508001);

do $$
declare
  r record;
  rule_count integer;
  hdr jsonb;
  rows_in jsonb;
  unit_idx integer;
  layover_count integer;
  layover_idx integer;
  next_after_unit text;
  header_len integer;
  malformed_row_count integer;
  new_header jsonb;
  new_rows jsonb;
begin
  select count(*)
    into rule_count
    from rule
   where rule_id = 7508001;

  if rule_count = 0 then
    raise exception 'Rule 7508001 not found in current search_path';
  end if;

  for r in
    select id, param_json
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

    if layover_count > 1 then
      raise exception 'Rule 7508001 id % header has duplicate Count Layover columns', r.id;
    end if;

    if layover_count = 1 then
      if layover_idx <> unit_idx + 1 then
        raise exception 'Rule 7508001 id % Count Layover column is not immediately after Unit', r.id;
      end if;
      continue;
    end if;

    next_after_unit := lower(coalesce(hdr ->> (unit_idx + 1), ''));
    if next_after_unit not in ('duty report', 'duty end buffer') then
      raise exception 'Rule 7508001 id % cannot insert Count Layover: unexpected column after Unit (%), expected Duty Report or Duty End Buffer',
        r.id, next_after_unit;
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
      raise exception 'Rule 7508001 id % has % malformed row(s) before migration', r.id, malformed_row_count;
    end if;

    new_header := jsonb_insert(
      hdr,
      array[(unit_idx + 1)::text],
      to_jsonb('Count Layover'::text)
    );

    new_rows := (
      select coalesce(
        jsonb_agg(
          jsonb_insert(row_el.row_json, array[(unit_idx + 1)::text], to_jsonb('N'::text))
          order by row_el.row_ord
        ),
        '[]'::jsonb
      )
        from jsonb_array_elements(rows_in) with ordinality row_el(row_json, row_ord)
    );

    update rule
       set param_json = jsonb_set(
                          jsonb_set(
                            r.param_json,
                            '{tables,0,header}',
                            new_header
                          ),
                          '{tables,0,rows}',
                          new_rows
                        ),
           updated_by = 'migration',
           updated_at = now()
     where id = r.id;
  end loop;
end
$$;

commit;
