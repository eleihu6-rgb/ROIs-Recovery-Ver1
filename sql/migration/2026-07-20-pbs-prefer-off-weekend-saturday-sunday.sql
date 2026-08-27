\set ON_ERROR_STOP on

\if :{?live_schema}
\else
\echo 'ERROR: live_schema is required (example: psql -v live_schema=f8 -f <migration>)'
\quit 3
\endif

begin;

select set_config('pbs.migration_live_schema', :'live_schema', true);

do $migration$
declare
  target_schema text := current_setting('pbs.migration_live_schema');
  target_count integer;
  current_value text;
  updated_count integer;
begin
  if target_schema !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'Invalid live_schema: %', target_schema;
  end if;

  if to_regnamespace(target_schema) is null then
    raise exception 'Live schema does not exist: %', target_schema;
  end if;

  if to_regclass(format('%I.dictionary', target_schema)) is null then
    raise exception 'Dictionary table does not exist in live schema: %', target_schema;
  end if;

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into target_count, current_value
  using 'PBS_PREFER_OFF', 'WEEKEND_START_DOW';

  if target_count <> 1 then
    raise exception
      'Expected exactly one PBS_PREFER_OFF/WEEKEND_START_DOW row in %.dictionary, found %',
      target_schema,
      target_count;
  end if;

  if current_value not in ('FRI', 'SAT') then
    raise exception
      'Unexpected PBS_PREFER_OFF/WEEKEND_START_DOW value in %.dictionary: %',
      target_schema,
      current_value;
  end if;

  execute format(
    'update %I.dictionary
        set code_value = $1,
            updated_by = $2,
            updated_at = now()
      where parent_code = $3
        and code = $4
        and code_value = $5',
    target_schema
  )
  using 'SAT', 'migration', 'PBS_PREFER_OFF', 'WEEKEND_START_DOW', 'FRI';

  get diagnostics updated_count = row_count;

  raise notice
    'PBS Prefer Off weekend start in %.dictionary: previous=%, updated_rows=%',
    target_schema,
    current_value,
    updated_count;
end;
$migration$;

commit;
