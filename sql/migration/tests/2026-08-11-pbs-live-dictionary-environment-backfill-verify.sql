-- Verify 2026-08-11-pbs-live-dictionary-environment-backfill.sql.
-- Configure pbs.live_dictionary_backfill_schema in the current database session.

do $verify$
declare
  target_schema text := nullif(
    current_setting('pbs.live_dictionary_backfill_schema', true),
    ''
  );
  target_count integer;
  target_value text;
begin
  if target_schema is null
     or target_schema not in ('f8', 'f8_sit_live', 'f8_uat_live') then
    raise exception
      'pbs.live_dictionary_backfill_schema must be one of f8, f8_sit_live, f8_uat_live; received %',
      coalesce(target_schema, '<unset>');
  end if;

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into target_count, target_value
  using 'SYS_PARAM', 'PBS_LINE_MINIMUM_BASE_LAYOVER';

  if target_count <> 1
     or target_value !~ '^[0-9]{3}:[0-5][0-9]$' then
    raise exception
      'Invalid PBS_LINE_MINIMUM_BASE_LAYOVER in %.dictionary: count=%, value=%',
      target_schema,
      target_count,
      target_value;
  end if;

  execute format(
    'select count(*), min(code_value)
       from %I.dictionary
      where parent_code = $1
        and code = $2',
    target_schema
  )
  into target_count, target_value
  using 'SYS_PARAM', 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES';

  if target_count <> 1
     or target_value !~ '^[1-9][0-9]{0,8}$' then
    raise exception
      'Invalid PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES in %.dictionary: count=%, value=%',
      target_schema,
      target_count,
      target_value;
  end if;

  raise notice 'PBS Live dictionary backfill verification passed for %.', target_schema;
end;
$verify$;
