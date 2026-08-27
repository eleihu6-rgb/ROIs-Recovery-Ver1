-- Run after 2026-07-16-pbs-work-day-preference-required-window.sql in an isolated test schema.

create or replace function pg_temp.is_complete_work_day_preference(payload_text text)
returns boolean
language plpgsql
as $$
declare
  payload jsonb;
  day_count integer;
  unique_day_count integer;
begin
  if nullif(btrim(payload_text), '') is null then
    return false;
  end if;

  payload := payload_text::jsonb;
  if jsonb_typeof(payload) <> 'object'
    or payload ->> 'type' <> 'work-day-preference'
    or jsonb_typeof(payload -> 'days') <> 'array'
    or jsonb_array_length(payload -> 'days') = 0 then
    return false;
  end if;

  select count(*), count(distinct (day ->> 'dayOfWeek'))
  into day_count, unique_day_count
  from jsonb_array_elements(payload -> 'days') day;

  if day_count <> unique_day_count then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(payload -> 'days') day
    where jsonb_typeof(day) <> 'object'
      or coalesce(day ->> 'dayOfWeek', '') not in ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN')
      or coalesce(day ->> 'checkInFrom', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(day ->> 'checkInTo', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      or day ->> 'checkInFrom' = day ->> 'checkInTo'
  );
exception
  when others then
    return false;
end;
$$;

begin;

do $$
begin
  if exists (
    select 1
    from pbs_bid_group g
    join pbs_bid_property property
      on property.id = g.property_definition_id
      or property.property_code = g.property_id
    where property.bid_type = 'Pairing'
      and property.property_code = 110
      and (
        g.operator is distinct from 'Json'
        or not pg_temp.is_complete_work_day_preference(g.param_a)
      )
  ) then
    raise exception 'Incomplete Work Day Preference groups remain after migration.';
  end if;

  if exists (
    select 1
    from pbs_bid_pairing_configured_favorite favorite
    where favorite.property_code = 110
      and not pg_temp.is_complete_work_day_preference(favorite.bid_payload::text)
  ) then
    raise exception 'Incomplete Work Day Preference favorites remain after migration.';
  end if;

  if not exists (
    select 1
    from pbs_bid_property property
    where property.bid_type = 'Pairing'
      and property.property_code = 110
      and property.validation_json::jsonb ->> 'checkInWindowRequired' = 'true'
      and property.validation_json::jsonb ->> 'checkInWindowEndpoints' = 'both'
      and property.tooltip not ilike '%optional local check-in window%'
  ) then
    raise exception 'Work Day Preference catalog metadata is not aligned to required windows.';
  end if;

  if exists (
    select 1
    from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id = '__wd_required_window_test__'
      and group_row.property_group_key in ('test-wd-invalid-main', 'test-wd-invalid-and')
  ) then
    raise exception 'Invalid main or AND Work Day fixture groups survived migration.';
  end if;

  if not exists (
    select 1
    from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id = '__wd_required_window_test__'
      and group_row.property_group_key = 'test-wd-valid-main'
  ) then
    raise exception 'Valid Work Day fixture group was removed.';
  end if;

  if exists (
    select 1
    from pbs_bid_pairing_configured_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__wd_required_window_test__'
      and favorite.favorite_name = 'test-wd-invalid-favorite'
  ) or not exists (
    select 1
    from pbs_bid_pairing_configured_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__wd_required_window_test__'
      and favorite.favorite_name = 'test-wd-valid-favorite'
  ) then
    raise exception 'Configured favorite cleanup did not preserve only the valid fixture.';
  end if;

  if not exists (
    select 1
    from pbs_bid bid
    join pbs_bid_tier tier on tier.bid_id = bid.id
    where bid.crew_id = '__wd_required_window_test__'
      and bid.total_tiers = 1
      and tier.tier = 3
      and tier.total_groups = 1
  ) then
    raise exception 'Work Day fixture tier or bid derived counts are incorrect.';
  end if;
end $$;

create temporary table pbs_work_day_fixture_cleanup_bids on commit drop as
select id
from pbs_bid
where crew_id = '__wd_required_window_test__'
  and period_code = 'Jul 2099'
  and bid_context = 'Current';

delete from pbs_bid_pairing_occurrence
where bid_id in (select id from pbs_work_day_fixture_cleanup_bids);
delete from pbs_bid_condition
where bid_id in (select id from pbs_work_day_fixture_cleanup_bids);
delete from pbs_bid_group
where bid_id in (select id from pbs_work_day_fixture_cleanup_bids);
delete from pbs_bid_pairing_configured_favorite
where bid_id in (select id from pbs_work_day_fixture_cleanup_bids);
delete from pbs_bid_tier
where bid_id in (select id from pbs_work_day_fixture_cleanup_bids);
delete from pbs_bid
where id in (select id from pbs_work_day_fixture_cleanup_bids);

commit;
