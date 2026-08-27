-- Backfill environment-scoped PBS bid definition parameters in the target Live schema.
-- Execute once per environment in a session configured with:
--   PGOPTIONS='-c pbs.live_dictionary_backfill_schema=f8_sit_live' psql ... -f <file>
-- Allowed schemas: f8, f8_sit_live, f8_uat_live.

begin;

do $migration$
declare
  target_schema text := nullif(
    current_setting('pbs.live_dictionary_backfill_schema', true),
    ''
  );
  duplicate_count integer;
  existing_count integer;
  existing_value text;
begin
  if target_schema is null
     or target_schema not in ('f8', 'f8_sit_live', 'f8_uat_live') then
    raise exception
      'pbs.live_dictionary_backfill_schema must be one of f8, f8_sit_live, f8_uat_live; received %',
      coalesce(target_schema, '<unset>');
  end if;

  if to_regnamespace(target_schema) is null then
    raise exception 'Live schema does not exist: %', target_schema;
  end if;

  if to_regclass(format('%I.dictionary', target_schema)) is null then
    raise exception 'Dictionary table does not exist in live schema: %', target_schema;
  end if;

  execute format(
    'select count(*)
       from (
         select parent_code, code
           from %I.dictionary
          where parent_code = $1
            and code = any($2)
          group by parent_code, code
         having count(*) > 1
       ) duplicate_keys',
    target_schema
  )
  into duplicate_count
  using
    'SYS_PARAM',
    array[
      'PBS_LINE_MINIMUM_BASE_LAYOVER',
      'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES'
    ]::text[];

  if duplicate_count > 0 then
    raise exception
      'Duplicate target PBS dictionary keys exist in %.dictionary; resolve them before backfill.',
      target_schema;
  end if;

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into existing_count, existing_value
  using 'SYS_PARAM', 'PBS_LINE_MINIMUM_BASE_LAYOVER';

  if existing_count = 1
     and coalesce(btrim(existing_value), '') <> ''
     and existing_value !~ '^[0-9]{3}:[0-5][0-9]$' then
    raise exception
      'Invalid existing PBS_LINE_MINIMUM_BASE_LAYOVER in %.dictionary: %',
      target_schema,
      existing_value;
  end if;

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into existing_count, existing_value
  using 'SYS_PARAM', 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES';

  if existing_count = 1
     and coalesce(btrim(existing_value), '') <> ''
     and existing_value !~ '^[1-9][0-9]{0,8}$' then
    raise exception
      'Invalid existing PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES in %.dictionary: %',
      target_schema,
      existing_value;
  end if;

  execute format(
    'insert into %I.dictionary as target (
       parent_code,
       code,
       name,
       idx,
       code_value,
       created_by,
       updated_by
     )
     values ($1, $2, $3, $4, $5, $6, $6)
     on conflict (coalesce(parent_code, ''___NULL___''), code)
     do update
       set name = excluded.name,
           idx = excluded.idx,
           code_value = excluded.code_value,
           updated_by = excluded.updated_by,
           updated_at = now()
     where coalesce(btrim(target.code_value), '''') = ''''',
    target_schema
  )
  using
    'SYS_PARAM',
    'PBS_LINE_MINIMUM_BASE_LAYOVER',
    'PBS Line Minimum Base Layover',
    0,
    '013:00',
    'migration';

  execute format(
    'insert into %I.dictionary as target (
       parent_code,
       code,
       name,
       idx,
       code_value,
       created_by,
       updated_by
     )
     values ($1, $2, $3, $4, $5, $6, $6)
     on conflict (coalesce(parent_code, ''___NULL___''), code)
     do update
       set name = excluded.name,
           idx = excluded.idx,
           code_value = excluded.code_value,
           updated_by = excluded.updated_by,
           updated_at = now()
     where coalesce(btrim(target.code_value), '''') = ''''',
    target_schema
  )
  using
    'SYS_PARAM',
    'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES',
    'PBS Time Between Flights Minimum Minutes',
    0,
    '45',
    'migration';

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into existing_count, existing_value
  using 'SYS_PARAM', 'PBS_LINE_MINIMUM_BASE_LAYOVER';

  if existing_count <> 1
     or existing_value !~ '^[0-9]{3}:[0-5][0-9]$' then
    raise exception
      'PBS_LINE_MINIMUM_BASE_LAYOVER backfill assertion failed in %.dictionary: count=%, value=%',
      target_schema,
      existing_count,
      existing_value;
  end if;

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into existing_count, existing_value
  using 'SYS_PARAM', 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES';

  if existing_count <> 1
     or existing_value !~ '^[1-9][0-9]{0,8}$' then
    raise exception
      'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES backfill assertion failed in %.dictionary: count=%, value=%',
      target_schema,
      existing_count,
      existing_value;
  end if;

  raise notice 'PBS Live dictionary backfill passed for %.', target_schema;
end;
$migration$;

commit;
