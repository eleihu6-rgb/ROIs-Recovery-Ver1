begin;

create or replace function pg_temp.pbs_favorite_has_iso_date(value text)
returns boolean
language sql
immutable
as $function$
  select coalesce(
    value ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$',
    false
  );
$function$;

create or replace function pg_temp.pbs_favorite_date_scope_has_explicit_date(scope jsonb)
returns boolean
language sql
immutable
as $function$
  select case scope ->> 'mode'
    when 'specific_dates' then exists (
      select 1
      from jsonb_array_elements_text(coalesce(scope -> 'dates', '[]'::jsonb)) as date_value(value)
      where pg_temp.pbs_favorite_has_iso_date(date_value.value)
    )
    when 'date_range' then
      pg_temp.pbs_favorite_has_iso_date(scope ->> 'from')
      or pg_temp.pbs_favorite_has_iso_date(scope ->> 'to')
    else false
  end;
$function$;

create or replace function pg_temp.pbs_favorite_has_explicit_date(payload jsonb, prefer_off boolean)
returns boolean
language sql
immutable
as $function$
  select case payload ->> 'type'
    when 'date' then pg_temp.pbs_favorite_has_iso_date(payload ->> 'value')
    when 'stepper-date' then pg_temp.pbs_favorite_has_iso_date(payload ->> 'date')
    when 'stepper-range-date' then pg_temp.pbs_favorite_has_iso_date(payload ->> 'date')
    when 'time-date' then pg_temp.pbs_favorite_has_iso_date(payload ->> 'date')
    when 'time-range-date' then pg_temp.pbs_favorite_has_iso_date(payload ->> 'date')
    when 'tag-list-date' then pg_temp.pbs_favorite_has_iso_date(payload ->> 'date')
    when 'stepper-date-range' then
      pg_temp.pbs_favorite_has_iso_date(payload ->> 'from')
      or pg_temp.pbs_favorite_has_iso_date(payload ->> 'to')
    when 'date-range' then
      pg_temp.pbs_favorite_has_iso_date(payload ->> 'from')
      or pg_temp.pbs_favorite_has_iso_date(payload ->> 'to')
    when 'days-off-on-pattern' then
      pg_temp.pbs_favorite_has_iso_date(payload #>> '{dateRange,from}')
      or pg_temp.pbs_favorite_has_iso_date(payload #>> '{dateRange,to}')
    when 'date-or-dow-list' then exists (
      select 1
      from jsonb_array_elements_text(coalesce(payload -> 'dates', '[]'::jsonb)) as date_value(value)
      where pg_temp.pbs_favorite_has_iso_date(date_value.value)
    )
    when 'work-day-preference' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'airport-preference' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'pairing-check-time' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'flight-legs-per-duty' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'pairing-length-preference' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'deadhead-flying' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'flight-number-preference' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'redeye-preference' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'reserve-call-type-date-scope' then pg_temp.pbs_favorite_date_scope_has_explicit_date(payload -> 'dateScope')
    when 'reserve-flying-date-pattern' then exists (
      select 1
      from jsonb_array_elements(coalesce(payload -> 'segments', '[]'::jsonb)) as segment(value)
      where pg_temp.pbs_favorite_date_scope_has_explicit_date(segment.value -> 'dateScope')
    )
    when 'tag-list' then prefer_off and exists (
      select 1
      from jsonb_array_elements_text(coalesce(payload -> 'values', '[]'::jsonb)) as bid_value(value)
      where pg_temp.pbs_favorite_has_iso_date(bid_value.value)
         or bid_value.value ~ '^Between \d{4}-\d{2}-\d{2} - \d{4}-\d{2}-\d{2}$'
    )
    when 'pairing-occurrence-list' then exists (
      select 1
      from jsonb_array_elements(coalesce(payload -> 'occurrences', '[]'::jsonb)) as occurrence(value)
      where pg_temp.pbs_favorite_has_iso_date(occurrence.value ->> 'originDate')
    )
    else false
  end;
$function$;

delete from pbs_bid_days_off_favorite
where pg_temp.pbs_favorite_has_explicit_date(bid_payload, property_code = 201);

delete from pbs_bid_pairing_configured_favorite
where pg_temp.pbs_favorite_has_explicit_date(bid_payload, false);

delete from pbs_bid_line_favorite
where pg_temp.pbs_favorite_has_explicit_date(bid_payload, false);

commit;
