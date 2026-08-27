-- =============================================================================
-- 2026-08-06 Remove legacy 8002/009 definition
--
-- Model-A renamed the old 8002/009 Maximum Hours of Work instance to 8002/002.
-- The current DP rule is therefore rule_id=8002002. This migration removes only
-- stale rule_id=8002009 membership and definition rows.
--
-- Run against the target airline schema/search_path (for example f8_sit_live).
-- Do not replace this with a hard-coded schema prefix.
-- =============================================================================

begin;

-- Guardrail: never remove the legacy row unless the current DP replacement is
-- present and still carries at least one Type=DP parameter row.
do $$
begin
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
    raise exception
      'Refusing to remove 8002009: current 8002002 Type=DP configuration is missing';
  end if;
end
$$;

delete from rule_set
 where rule_id = 8002009;

delete from rule
 where rule_id = 8002009;

commit;
