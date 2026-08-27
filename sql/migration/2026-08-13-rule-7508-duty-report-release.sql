-- 2026-08-13 Rule 7508 Duty Report / Duty Release boundary parameters
--
-- Adds two Y/N columns to existing 7508 param_json tables:
--   ... Period, Unit, Duty Report, Duty Release, Duty End Buffer, Min Limits
--
-- Existing rows default to Y/Y to preserve the previous behavior:
-- rest_start = previous duty end + Duty End Buffer
-- rest_end   = next duty start
--
-- Run under the target live schema search_path. Do not hard-code schema names.

begin;

update rule r
   set param_json = rebuilt.param_json,
       updated_by = 'migration',
       updated_at = now()
  from (
    select r0.id,
           r0.param_json || jsonb_build_object(
             'tables',
             jsonb_agg(
               case
                 when table_obj ? 'header'
                  and table_obj ? 'rows'
                  and (not header_state.has_duty_report or not header_state.has_duty_release)
                 then table_obj || jsonb_build_object(
                   'header',
                   (
                     select jsonb_agg(value order by sort_ord)
                       from (
                         select h.value, h.ord * 10 as sort_ord
                           from jsonb_array_elements_text(table_obj->'header') with ordinality h(value, ord)
                         union all
                         select 'Duty Report', unit_pos * 10 + 1
                           where not header_state.has_duty_report
                         union all
                         select 'Duty Release', unit_pos * 10 + 2
                           where not header_state.has_duty_release
                       ) header_values
                   ),
                   'rows',
                   (
                     select coalesce(jsonb_agg(row_values.row_json order by row_values.row_ord), '[]'::jsonb)
                       from (
                         select row_el.row_ord,
                                (
                                  select jsonb_agg(value order by sort_ord)
                                    from (
                                      select cell.value, cell.ord * 10 as sort_ord
                                        from jsonb_array_elements_text(row_el.row_json) with ordinality cell(value, ord)
                                      union all
                                      select 'Y', unit_pos * 10 + 1
                                       where not header_state.has_duty_report
                                      union all
                                      select 'Y', unit_pos * 10 + 2
                                       where not header_state.has_duty_release
                                    ) row_cells
                                ) as row_json
                           from jsonb_array_elements(table_obj->'rows') with ordinality row_el(row_json, row_ord)
                       ) row_values
                   )
                 )
                 else table_obj
               end
               order by table_ord
             )
           ) as param_json
      from rule r0,
           jsonb_array_elements(coalesce(r0.param_json->'tables', '[]'::jsonb)) with ordinality table_el(table_obj, table_ord),
           lateral (
             select coalesce(
               (
                 select h.ord::bigint
                   from jsonb_array_elements_text(table_obj->'header') with ordinality h(value, ord)
                  where upper(h.value) = 'UNIT'
                  limit 1
               ),
               6::bigint
             ) as unit_pos
           ) unit_header,
           lateral (
             select exists (
                      select 1
                        from jsonb_array_elements_text(table_obj->'header') h(col)
                       where upper(h.col) = 'DUTY REPORT'
                    ) as has_duty_report,
                    exists (
                      select 1
                        from jsonb_array_elements_text(table_obj->'header') h(col)
                       where upper(h.col) = 'DUTY RELEASE'
                    ) as has_duty_release
           ) header_state
     where r0.function = 7508
       and r0.param_json is not null
     group by r0.id
  ) rebuilt
 where r.id = rebuilt.id
   and r.param_json is distinct from rebuilt.param_json;

commit;
