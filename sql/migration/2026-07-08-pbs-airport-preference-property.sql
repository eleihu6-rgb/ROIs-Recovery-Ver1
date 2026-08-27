-- PBS Airport Preference pairing property
-- Execute with search_path pointing at the target PBS schema.
-- This intentionally removes old split airport / layover pairing bids.

do $$
declare
  old_codes smallint[] := array[101, 104, 119, 123]::smallint[];
  hidden_property_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  target_rule_group_count integer;
  affected_bid_count integer;
begin
  select count(*)
    into hidden_property_count
  from pbs_bid_property
  where bid_type = 'Pairing'
    and property_code = any(old_codes);

  select count(*)
    into configured_favorite_count
  from pbs_bid_pairing_configured_favorite
  where property_code = any(old_codes);

  select count(*)
    into simple_favorite_count
  from pbs_bid_pairing_favorite
  where property_code = any(old_codes);

  with target_keys as (
    select distinct bid_id, bid_type, property_group_key
    from pbs_bid_group
    where bid_type = 'Pairing'
      and property_id = any(old_codes)
    union
    select distinct g.bid_id, g.bid_type, g.property_group_key
    from pbs_bid_group g
    join pbs_bid_condition c
      on c.group_id = g.id
    where g.bid_type = 'Pairing'
      and c.property_id = any(old_codes)
  )
  select count(*), count(distinct bid_id)
    into target_rule_group_count, affected_bid_count
  from pbs_bid_group g
  where exists (
    select 1
    from target_keys target
    where target.bid_id = g.bid_id
      and target.bid_type is not distinct from g.bid_type
      and target.property_group_key = g.property_group_key
  );

  raise notice 'Airport Preference migration: properties to hide=%, configured favorites to delete=%, simple favorites to delete=%, rule groups to delete=%, affected bids=%',
    hidden_property_count,
    configured_favorite_count,
    simple_favorite_count,
    target_rule_group_count,
    affected_bid_count;
end $$;

insert into pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  is_active
) values (
  168,
  'Pairing',
  'Airport Preference',
  '["award","avoid"]',
  null,
  null,
  '{"type":"airport_preference","label":"Airport Preference","events":["landing","layover"],"dateCondition":["specific_dates","day","date_range"],"matchingCount":["=","<",">","Between"],"layoverDuration":["=","<",">","Between"]}',
  'Award/Avoid pairings by landing or layover airport with optional date, count, and layover duration filters.',
  'legacy',
  1,
  101,
  1
)
on conflict (property_code) do update set
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  is_active = excluded.is_active,
  updated_at = now();

update pbs_bid_property
set is_visible_in_portal = 0,
    recommended_order = null,
    recommended_usage_count = null,
    updated_at = now()
where bid_type = 'Pairing'
  and property_code in (101, 104, 119, 123);

delete from pbs_bid_pairing_configured_favorite
where property_code in (101, 104, 119, 123);

delete from pbs_bid_pairing_favorite
where property_code in (101, 104, 119, 123);

with target_keys as (
  select distinct bid_id, bid_type, property_group_key
  from pbs_bid_group
  where bid_type = 'Pairing'
    and property_id in (101, 104, 119, 123)
  union
  select distinct g.bid_id, g.bid_type, g.property_group_key
  from pbs_bid_group g
  join pbs_bid_condition c
    on c.group_id = g.id
  where g.bid_type = 'Pairing'
    and c.property_id in (101, 104, 119, 123)
)
delete from pbs_bid_group g
using target_keys target
where target.bid_id = g.bid_id
  and target.bid_type is not distinct from g.bid_type
  and target.property_group_key = g.property_group_key;

update pbs_bid_property
set recommended_order = null,
    recommended_usage_count = null,
    updated_at = now()
where bid_type = 'Pairing';

update pbs_bid_property
set recommended_order = defaults.recommended_order,
    recommended_usage_count = defaults.recommended_usage_count,
    updated_at = now()
from (
  values
    (102, 1, 2094),
    (168, 2, 1186),
    (106, 3, 625),
    (103, 4, 332),
    (105, 5, 295)
) as defaults(property_code, recommended_order, recommended_usage_count)
where pbs_bid_property.bid_type = 'Pairing'
  and pbs_bid_property.property_code = defaults.property_code;
