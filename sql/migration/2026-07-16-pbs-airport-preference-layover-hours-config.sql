-- Configure Airport Preference preferred layover hour slider bounds.
-- Run with search_path set to the intended live schema (for example f8).

begin;

insert into dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select
  'SYS_PARAM',
  'PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE',
  'PBS Airport Preference Layover Hours Range',
  18,
  '{"min":13,"max":18,"step":1,"default":13}',
  'migration',
  'migration'
where not exists (
  select 1
  from dictionary
  where parent_code = 'SYS_PARAM'
    and code = 'PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE'
);

update dictionary
set
  name = 'PBS Airport Preference Layover Hours Range',
  idx = 18,
  code_value = case
    when coalesce(code_value, '') = '' then '{"min":13,"max":18,"step":1,"default":13}'
    else code_value
  end,
  updated_by = 'migration',
  updated_at = now()
where parent_code = 'SYS_PARAM'
  and code = 'PBS_AIRPORT_PREFERENCE_LAYOVER_HOURS_RANGE';

commit;
