-- Require a complete local check-in From/To window for every Work Day Preference weekday.
-- Execute with search_path pointing at the target PBS schema.

begin;

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

create temporary table pbs_work_day_required_window_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code = 110;

create temporary table pbs_work_day_required_window_keys on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Pairing'
  and exists (
    select 1
    from pbs_work_day_required_window_property property
    where g.property_id = property.property_code
       or g.property_definition_id = property.id
  )
  and (
    g.operator is distinct from 'Json'
    or not pg_temp.is_complete_work_day_preference(g.param_a)
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c on c.group_id = g.id
where g.bid_type = 'Pairing'
  and exists (
    select 1
    from pbs_work_day_required_window_property property
    where c.property_id = property.property_code
       or c.property_definition_id = property.id
  )
  and (
    c.operator is distinct from 'Json'
    or not pg_temp.is_complete_work_day_preference(c.param_a)
  );

create temporary table pbs_work_day_required_window_groups on commit drop as
select distinct g.id as group_id, g.bid_id, g.tier_id
from pbs_bid_group g
where exists (
  select 1
  from pbs_work_day_required_window_keys target
  where target.bid_id = g.bid_id
    and target.bid_type is not distinct from g.bid_type
    and target.property_group_key = g.property_group_key
);

create temporary table pbs_work_day_required_window_bids on commit drop as
select distinct bid_id
from pbs_work_day_required_window_groups
union
select distinct favorite.bid_id
from pbs_bid_pairing_configured_favorite favorite
where favorite.property_code = 110
  and not pg_temp.is_complete_work_day_preference(favorite.bid_payload::text);

do $$
declare
  configured_favorite_count integer;
  occurrence_count integer;
  condition_count integer;
  group_count integer;
  tier_count integer;
  bid_count integer;
begin
  delete from pbs_bid_pairing_configured_favorite favorite
  where (
      favorite.property_code = 110
      or favorite.property_id in (select id from pbs_work_day_required_window_property)
    )
    and not pg_temp.is_complete_work_day_preference(favorite.bid_payload::text);
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_occurrence occurrence
  using pbs_work_day_required_window_groups target
  where occurrence.group_id = target.group_id;
  get diagnostics occurrence_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_work_day_required_window_groups target
  where condition_row.group_id = target.group_id;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_work_day_required_window_groups target
  where group_row.id = target.group_id;
  get diagnostics group_count = row_count;

  update pbs_bid_tier tier
  set total_groups = (
    select count(*)::smallint
    from pbs_bid_group group_row
    where group_row.tier_id = tier.id
  ),
  updated_at = now()
  where tier.bid_id in (select bid_id from pbs_work_day_required_window_bids);

  delete from pbs_bid_tier tier
  where tier.bid_id in (select bid_id from pbs_work_day_required_window_bids)
    and not exists (select 1 from pbs_bid_group group_row where group_row.tier_id = tier.id)
    and not exists (select 1 from pbs_bid_day_off day_off where day_off.tier_id = tier.id);
  get diagnostics tier_count = row_count;

  update pbs_bid bid
  set total_tiers = (
    select count(*)::smallint
    from pbs_bid_tier tier
    where tier.bid_id = bid.id
  ),
  updated_at = now()
  where bid.id in (select bid_id from pbs_work_day_required_window_bids);

  delete from pbs_bid bid
  using pbs_work_day_required_window_bids target
  where bid.id = target.bid_id
    and not exists (select 1 from pbs_bid_tier tier where tier.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_day_off day_off where day_off.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_occurrence occurrence where occurrence.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_days_off_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = bid.id);
  get diagnostics bid_count = row_count;

  raise notice 'Work Day required-window cleanup: configured favorites=%, occurrences=%, conditions=%, groups=%, empty tiers=%, empty bids=%',
    configured_favorite_count,
    occurrence_count,
    condition_count,
    group_count,
    tier_count,
    bid_count;
end $$;

update pbs_bid_property
set validation_json = '{"type":"work_day_preference","label":"Work Days & Check-In Window","weekdays":true,"checkInWindow":true,"checkInWindowRequired":true,"checkInWindowEndpoints":"both","dateScope":["specific_dates","date_range"]}',
    tooltip = 'Award pairings when a duty check-in matches a selected weekday and its required local check-in From/To window, optionally limited to event dates.',
    updated_at = now()
where bid_type = 'Pairing'
  and property_code = 110;

commit;
