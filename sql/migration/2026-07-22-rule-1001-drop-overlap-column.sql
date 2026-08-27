-- =============================================================================
-- 2026-07-22 rule 1001: drop Overlap parameter column
-- Remaining rows are Before/After filter + Rest Before allowances (no Overlap flag).
-- Historical Overlap=N rows are dropped so they do not become allowances.
-- Idempotent when header already has no Overlap.
-- =============================================================================

set search_path = f8;

begin;

do $$
declare
  r record;
  hdr jsonb;
  rows_in jsonb;
  ov_idx int;
  new_hdr jsonb;
  new_rows jsonb := '[]'::jsonb;
  row_el jsonb;
  cell text;
  keep boolean;
  trimmed jsonb;
  i int;
  j int;
begin
  for r in
    select rule_id, param_json
      from rule
     where rule_id = 1001001
        or function = 1001
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

    ov_idx := null;
    for i in 0 .. jsonb_array_length(hdr) - 1 loop
      if lower(hdr ->> i) = 'overlap' then
        ov_idx := i;
        exit;
      end if;
    end loop;

    -- Already migrated: no Overlap column.
    if ov_idx is null then
      continue;
    end if;

    new_hdr := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(hdr) - 1 loop
      if i <> ov_idx then
        new_hdr := new_hdr || jsonb_build_array(hdr -> i);
      end if;
    end loop;

    new_rows := '[]'::jsonb;
    for i in 0 .. jsonb_array_length(rows_in) - 1 loop
      row_el := rows_in -> i;
      if jsonb_typeof(row_el) <> 'array' then
        continue;
      end if;

      cell := coalesce(row_el ->> ov_idx, '');
      keep := cell = ''
           or upper(trim(cell)) in ('Y', 'YES', '1', 'TRUE');
      if not keep then
        continue;
      end if;

      trimmed := '[]'::jsonb;
      for j in 0 .. jsonb_array_length(row_el) - 1 loop
        if j <> ov_idx then
          trimmed := trimmed || jsonb_build_array(row_el -> j);
        end if;
      end loop;
      new_rows := new_rows || jsonb_build_array(trimmed);
    end loop;

    update rule
       set param_json = jsonb_set(
             jsonb_set(r.param_json, '{tables,0,header}', new_hdr),
             '{tables,0,rows}', new_rows
           ),
           updated_at = now(),
           updated_by = 'system'
     where rule_id = r.rule_id;
  end loop;
end $$;

commit;
