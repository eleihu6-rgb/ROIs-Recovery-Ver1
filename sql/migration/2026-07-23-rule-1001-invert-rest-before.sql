-- =============================================================================
-- 2026-07-23 rule 1001: Rest Before cells for prohibition + window mapping
-- Kernel Rest Before: Y → duty_end, N → rest_end.
-- Prohibition model: filter match + window ∩ After duty → 1001; filter match
-- without window hit → Allow; empty / unmatched filters → fail-closed.
-- Default FLY/SBY → DO / L|O rows must be Rest Before=Y so rest-only into
-- DO/leave is Allowed while duty∩duty still alarms.
-- Idempotent: only N → Y on the Assignment Rest Before column.
-- =============================================================================

set search_path = f8;

begin;

do $$
declare
  r record;
  hdr jsonb;
  rows_in jsonb;
  rb_idx int;
  new_rows jsonb;
  row_el jsonb;
  new_row jsonb;
  cell text;
  i int;
  j int;
  changed boolean;
begin
  for r in
    select rule_id, param_json
      from rule
     where rule_id = 1001001
        or (function = 1001 and instance = '001')
  loop
    if r.param_json is null
       or jsonb_typeof(r.param_json -> 'tables') <> 'array'
       or jsonb_array_length(r.param_json -> 'tables') < 1 then
      continue;
    end if;

    hdr := r.param_json #> '{tables,0,header}';
    rows_in := coalesce(r.param_json #> '{tables,0,rows}', '[]'::jsonb);
    if jsonb_typeof(hdr) <> 'array' then
      continue;
    end if;

    rb_idx := null;
    for i in 0 .. jsonb_array_length(hdr) - 1 loop
      if lower(hdr ->> i) = 'assignment rest before' then
        rb_idx := i;
        exit;
      end if;
    end loop;
    if rb_idx is null then
      continue;
    end if;

    new_rows := '[]'::jsonb;
    changed := false;
    for i in 0 .. jsonb_array_length(rows_in) - 1 loop
      row_el := rows_in -> i;
      if jsonb_typeof(row_el) <> 'array' then
        new_rows := new_rows || jsonb_build_array(row_el);
        continue;
      end if;

      new_row := '[]'::jsonb;
      for j in 0 .. jsonb_array_length(row_el) - 1 loop
        if j = rb_idx then
          cell := upper(trim(coalesce(row_el ->> j, '')));
          if cell = 'N' then
            new_row := new_row || to_jsonb('Y'::text);
            changed := true;
          else
            new_row := new_row || jsonb_build_array(row_el -> j);
          end if;
        else
          new_row := new_row || jsonb_build_array(row_el -> j);
        end if;
      end loop;
      new_rows := new_rows || jsonb_build_array(new_row);
    end loop;

    if changed then
      update rule
         set param_json = jsonb_set(r.param_json, '{tables,0,rows}', new_rows),
             updated_by = 'migration',
             updated_at = now()
       where rule_id = r.rule_id;
    end if;
  end loop;
end $$;

commit;
