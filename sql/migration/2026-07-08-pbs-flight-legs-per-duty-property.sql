-- PBS Flight Legs per Duty pairing property cleanup
-- Execute with search_path pointing at the target PBS schema.
-- This intentionally hides narrower total / first / last duty leg entries.

do $$
declare
  old_codes smallint[] := array[108, 124, 130]::smallint[];
  renamed_property_count integer;
  hidden_property_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  generic_favorite_count integer;
  target_rule_group_count integer;
  target_condition_count integer;
  affected_bid_count integer;
begin
  select count(*)
    into renamed_property_count
  from pbs_bid_property
  where bid_type = 'Pairing'
    and property_code = 107;

  select count(*)
    into hidden_property_count
  from pbs_bid_property
  where bid_type = 'Pairing'
    and property_code = any(old_codes);

  select count(*)
    into configured_favorite_count
  from pbs_bid_pairing_configured_favorite favorite
  where favorite.property_code = any(old_codes)
     or favorite.property_id in (
       select id
       from pbs_bid_property
       where bid_type = 'Pairing'
         and property_code = any(old_codes)
     );

  select count(*)
    into simple_favorite_count
  from pbs_bid_pairing_favorite favorite
  where favorite.property_code = any(old_codes)
     or favorite.property_id in (
       select id
       from pbs_bid_property
       where bid_type = 'Pairing'
         and property_code = any(old_codes)
     );

  select count(*)
    into generic_favorite_count
  from pbs_bid_property_favorite favorite
  where favorite.bid_type = 'Pairing'
    and (
      favorite.property_code = any(old_codes)
      or favorite.property_id in (
        select id
        from pbs_bid_property
        where bid_type = 'Pairing'
          and property_code = any(old_codes)
      )
    );

  with target_properties as (
    select id
    from pbs_bid_property
    where bid_type = 'Pairing'
      and property_code = any(old_codes)
  ),
  target_keys as (
    select distinct bid_id, bid_type, property_group_key
    from pbs_bid_group
    where bid_type = 'Pairing'
      and (
        property_id = any(old_codes)
        or property_definition_id in (select id from target_properties)
      )
    union
    select distinct g.bid_id, g.bid_type, g.property_group_key
    from pbs_bid_group g
    join pbs_bid_condition c
      on c.group_id = g.id
    where g.bid_type = 'Pairing'
      and (
        c.property_id = any(old_codes)
        or c.property_definition_id in (select id from target_properties)
      )
  ),
  target_groups as (
    select g.id, g.bid_id
    from pbs_bid_group g
    where exists (
      select 1
      from target_keys target
      where target.bid_id = g.bid_id
        and target.bid_type is not distinct from g.bid_type
        and target.property_group_key = g.property_group_key
    )
  )
  select count(distinct target_groups.id),
         count(distinct target_groups.bid_id),
         count(distinct c.id)
    into target_rule_group_count, affected_bid_count, target_condition_count
  from target_groups
  left join pbs_bid_condition c
    on c.group_id = target_groups.id;

  raise notice 'Flight Legs per Duty migration: property 107 renamed=%, properties to hide=%, configured favorites to delete=%, simple favorites to delete=%, generic favorites to delete=%, rule groups to delete=%, conditions to delete=%, affected bids=%',
    renamed_property_count,
    hidden_property_count,
    configured_favorite_count,
    simple_favorite_count,
    generic_favorite_count,
    target_rule_group_count,
    target_condition_count,
    affected_bid_count;
end $$;

update pbs_bid_property
set property_name = 'Flight Legs per Duty',
    tooltip = 'Award/Avoid pairings by flight legs per duty.',
    updated_at = now()
where bid_type = 'Pairing'
  and property_code = 107;

update pbs_bid_property
set is_visible_in_portal = 0,
    recommended_order = null,
    recommended_usage_count = null,
    updated_at = now()
where bid_type = 'Pairing'
  and property_code in (108, 124, 130);

delete from pbs_bid_pairing_configured_favorite favorite
where favorite.property_code in (108, 124, 130)
   or favorite.property_id in (
     select id
     from pbs_bid_property
     where bid_type = 'Pairing'
       and property_code in (108, 124, 130)
   );

delete from pbs_bid_pairing_favorite favorite
where favorite.property_code in (108, 124, 130)
   or favorite.property_id in (
     select id
     from pbs_bid_property
     where bid_type = 'Pairing'
       and property_code in (108, 124, 130)
   );

delete from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Pairing'
  and (
    favorite.property_code in (108, 124, 130)
    or favorite.property_id in (
      select id
      from pbs_bid_property
      where bid_type = 'Pairing'
        and property_code in (108, 124, 130)
    )
  );

with target_properties as (
  select id
  from pbs_bid_property
  where bid_type = 'Pairing'
    and property_code in (108, 124, 130)
),
target_keys as (
  select distinct bid_id, bid_type, property_group_key
  from pbs_bid_group
  where bid_type = 'Pairing'
    and (
      property_id in (108, 124, 130)
      or property_definition_id in (select id from target_properties)
    )
  union
  select distinct g.bid_id, g.bid_type, g.property_group_key
  from pbs_bid_group g
  join pbs_bid_condition c
    on c.group_id = g.id
  where g.bid_type = 'Pairing'
    and (
      c.property_id in (108, 124, 130)
      or c.property_definition_id in (select id from target_properties)
    )
),
target_groups as (
  select g.id
  from pbs_bid_group g
  where exists (
    select 1
    from target_keys target
    where target.bid_id = g.bid_id
      and target.bid_type is not distinct from g.bid_type
      and target.property_group_key = g.property_group_key
  )
),
deleted_conditions as (
  delete from pbs_bid_condition c
  using target_groups target
  where c.group_id = target.id
  returning c.id
)
delete from pbs_bid_group g
using target_groups target
where g.id = target.id;
