-- Configure Flight Number Preference autocomplete type ranges.
-- Run with search_path set to the intended live schema.

begin;

insert into dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select null, 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE', 'PBS Flight Number Category Range', 19, null, 'migration', 'migration'
where not exists (
  select 1
  from dictionary
  where parent_code is null
    and code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE'
);

update dictionary
set
  name = 'PBS Flight Number Category Range',
  idx = 19,
  updated_by = 'migration',
  updated_at = now()
where parent_code is null
  and code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE';

insert into dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE', 'CHARTER_MAIN', 'Charter', 1, '7000-7999', 'migration', 'migration'
where not exists (
  select 1
  from dictionary
  where parent_code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE'
    and code = 'CHARTER_MAIN'
);

insert into dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE', 'CHARTER_POSITIONING_NETWORK', 'Positioning Flights - Charter Network', 2, '9900-9949', 'migration', 'migration'
where not exists (
  select 1
  from dictionary
  where parent_code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE'
    and code = 'CHARTER_POSITIONING_NETWORK'
);

insert into dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE', 'CHARTER_RECOVERY_NETWORK', 'Recovery Flights - Charter Network', 3, '9950-9999', 'migration', 'migration'
where not exists (
  select 1
  from dictionary
  where parent_code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE'
    and code = 'CHARTER_RECOVERY_NETWORK'
);

update dictionary
set
  name = defaults.name,
  idx = defaults.idx,
  code_value = case
    when coalesce(dictionary.code_value, '') = '' then defaults.code_value
    else dictionary.code_value
  end,
  updated_by = 'migration',
  updated_at = now()
from (
  values
    ('CHARTER_MAIN', 'Charter', 1::smallint, '7000-7999'),
    ('CHARTER_POSITIONING_NETWORK', 'Positioning Flights - Charter Network', 2::smallint, '9900-9949'),
    ('CHARTER_RECOVERY_NETWORK', 'Recovery Flights - Charter Network', 3::smallint, '9950-9999')
) as defaults(code, name, idx, code_value)
where dictionary.parent_code = 'PBS_FLIGHT_NUMBER_CATEGORY_RANGE'
  and dictionary.code = defaults.code;

commit;
