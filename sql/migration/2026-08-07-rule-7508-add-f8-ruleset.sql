-- =============================================================================
-- 2026-08-07 Rule 7508 F8 calendar-day Single Day Free from Duty
--
-- Adds 7508/001 as a separate rule from 7501/001. The parameter table is copied
-- from 7501/001 on purpose: 7508 keeps the 7501 table shape, but the Rust engine
-- interprets whole-day RH windows as crew-base-local calendar-day windows.
--
-- Run under the target live schema search_path (for example f8_sit_live).
-- Do not replace this with a hard-coded schema prefix.
-- =============================================================================

begin;

do $$
begin
  if not exists (
    select 1
      from rule
     where rule_id = 7501001
       and function = 7501
       and param_json is not null
  ) then
    raise exception 'Rule 7501/001 with param_json must exist before adding 7508/001';
  end if;
end
$$;

insert into rule (
  created_by, created_at, updated_by, updated_at,
  function, instance, class, description, reference, category, store_structure,
  source, detail, overridability, severity, filiale, division, owner, locked,
  exception_code, rule_id, param_json
)
select
  'migration', now(), 'migration', now(),
  7508, '001',
  coalesce(src.class, 'R'),
  'Single Day Free from Duty in Calendar Days',
  coalesce(src.reference, 'F8'),
  coalesce(src.category, 'Duty'),
  coalesce(src.store_structure, 'Table'),
  coalesce(src.source, 'F8'),
  'Single Day Free from Duty in Calendar Days',
  coalesce(src.overridability, 'S'),
  coalesce(src.severity, 1),
  'F8', 'P', 'S', '1', '', 7508001,
  '{"tables": [{"rows": [["*", "*", "*", "*", "168", "RH", "Y", "Y", "00:00", "1"], ["*", "*", "*", "*", "672", "RH", "Y", "Y", "00:00", "4"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Period", "Unit", "Duty Report", "Duty Release", "Duty End Buffer", "Min Limits"]}]}'::jsonb
from (
  select *
    from rule
   where rule_id = 7501001
     and function = 7501
   order by id
   limit 1
) src
where not exists (
  select 1 from rule where rule_id = 7508001
);

update rule as target
   set function = 7508,
       instance = '001',
       class = coalesce(src.class, target.class, 'R'),
       description = 'Single Day Free from Duty in Calendar Days',
       reference = coalesce(src.reference, target.reference, 'F8'),
       category = coalesce(src.category, target.category, 'Duty'),
       store_structure = coalesce(src.store_structure, target.store_structure, 'Table'),
       source = coalesce(src.source, target.source, 'F8'),
       detail = 'Single Day Free from Duty in Calendar Days',
       overridability = coalesce(src.overridability, target.overridability, 'S'),
       severity = coalesce(src.severity, target.severity, 1),
       filiale = 'F8',
       division = 'P',
       owner = 'S',
       locked = '1',
       exception_code = coalesce(target.exception_code, ''),
       param_json = '{"tables": [{"rows": [["*", "*", "*", "*", "168", "RH", "Y", "Y", "00:00", "1"], ["*", "*", "*", "*", "672", "RH", "Y", "Y", "00:00", "4"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Period", "Unit", "Duty Report", "Duty Release", "Duty End Buffer", "Min Limits"]}]}'::jsonb,
       updated_by = 'migration',
       updated_at = now()
  from (
    select *
      from rule
     where rule_id = 7501001
       and function = 7501
     order by id
     limit 1
  ) src
 where target.rule_id = 7508001;

insert into rule_set (created_by, created_at, updated_by, updated_at, workset_id, rule_id)
select 'migration', now(), 'migration', now(), src.workset_id, 7508001
  from rule_set src
 where src.rule_id = 7501001
   and exists (select 1 from workset where id = src.workset_id)
   and not exists (
     select 1
       from rule_set rs
      where rs.workset_id = src.workset_id
        and rs.rule_id = 7508001
   );

commit;
