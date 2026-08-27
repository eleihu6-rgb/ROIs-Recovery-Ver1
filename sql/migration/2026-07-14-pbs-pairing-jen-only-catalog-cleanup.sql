-- PBS Pairing catalog cleanup for Jen's approved Excel list.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live yet, so saved Pairing bids that use obsolete Pairing properties are removed.

begin;

create temporary table pbs_pairing_jen_keep_codes (
  property_code smallint primary key
) on commit drop;

insert into pbs_pairing_jen_keep_codes (property_code)
values
  (102), -- Pairing Preference
  (103), -- Pairing Check-In / Check-Out Time
  (107), -- Flight Legs per Duty
  (110), -- Work Day Preference
  (112), -- Pairing Length
  (116), -- Flight Number Preference
  (117), -- Redeye Preference
  (122), -- Deadhead Flying
  (129), -- Time Between Flights
  (163), -- Month-End Carryover
  (168); -- Airport Preference

update pbs_bid_property property
set
  is_visible_in_portal = case
    when keep_codes.property_code is not null then 1
    else 0
  end,
  is_active = case
    when keep_codes.property_code is not null then 1
    else 0
  end,
  updated_at = now()
from pbs_pairing_jen_keep_codes keep_codes
where property.bid_type = 'Pairing'
  and property.property_code = keep_codes.property_code;

update pbs_bid_property property
set
  is_visible_in_portal = 0,
  is_active = 0,
  updated_at = now()
where property.bid_type = 'Pairing'
  and not exists (
    select 1
    from pbs_pairing_jen_keep_codes keep_codes
    where keep_codes.property_code = property.property_code
  );

update pbs_bid_property property
set
  recommended_order = null,
  recommended_usage_count = 0,
  updated_at = now()
where property.bid_type = 'Pairing';

update pbs_bid_property property
set
  recommended_order = defaults.recommended_order,
  recommended_usage_count = defaults.recommended_usage_count,
  updated_at = now()
from (
  values
    (102, 1, 2094),
    (168, 2, 1186),
    (103, 3, 625),
    (107, 4, 332),
    (110, 5, 295)
) as defaults(property_code, recommended_order, recommended_usage_count)
where property.bid_type = 'Pairing'
  and property.property_code = defaults.property_code;

create temporary table pbs_pairing_jen_obsolete_properties on commit drop as
select property.id, property.property_code
from pbs_bid_property property
where property.bid_type = 'Pairing'
  and not exists (
    select 1
    from pbs_pairing_jen_keep_codes keep_codes
    where keep_codes.property_code = property.property_code
  );

create temporary table pbs_pairing_jen_cleanup_target_keys on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Pairing'
  and exists (
    select 1
    from pbs_pairing_jen_obsolete_properties obsolete
    where g.property_id = obsolete.property_code
       or g.property_definition_id = obsolete.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
where g.bid_type = 'Pairing'
  and exists (
    select 1
    from pbs_pairing_jen_obsolete_properties obsolete
    where c.property_id = obsolete.property_code
       or c.property_definition_id = obsolete.id
  );

create temporary table pbs_pairing_jen_cleanup_target_groups on commit drop as
select distinct g.id as group_id, g.bid_id
from pbs_bid_group g
where exists (
  select 1
  from pbs_pairing_jen_cleanup_target_keys target
  where target.bid_id = g.bid_id
    and target.bid_type is not distinct from g.bid_type
    and target.property_group_key = g.property_group_key
);

create temporary table pbs_pairing_jen_cleanup_target_bids on commit drop as
select distinct bid_id
from pbs_pairing_jen_cleanup_target_groups;

do $$
declare
  obsolete_property_count integer;
  target_group_count integer;
  target_bid_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  generic_favorite_count integer;
  occurrence_count integer;
  condition_count integer;
  group_count integer;
  empty_bid_count integer;
begin
  select count(*) into obsolete_property_count
  from pbs_pairing_jen_obsolete_properties;

  select count(*) into target_group_count
  from pbs_pairing_jen_cleanup_target_groups;

  select count(*) into target_bid_count
  from pbs_pairing_jen_cleanup_target_bids;

  delete from pbs_bid_pairing_configured_favorite favorite
  where favorite.property_code in (
      select property_code
      from pbs_pairing_jen_obsolete_properties
    )
     or favorite.property_id in (
      select id
      from pbs_pairing_jen_obsolete_properties
    );
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite favorite
  where favorite.property_code in (
      select property_code
      from pbs_pairing_jen_obsolete_properties
    )
     or favorite.property_id in (
      select id
      from pbs_pairing_jen_obsolete_properties
    );
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_property_favorite favorite
  where favorite.bid_type = 'Pairing'
    and (
      favorite.property_code in (
        select property_code
        from pbs_pairing_jen_obsolete_properties
      )
      or favorite.property_id in (
        select id
        from pbs_pairing_jen_obsolete_properties
      )
    );
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_pairing_occurrence occurrence
  using pbs_pairing_jen_cleanup_target_groups target
  where occurrence.group_id = target.group_id;
  get diagnostics occurrence_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_pairing_jen_cleanup_target_groups target
  where condition_row.group_id = target.group_id;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_pairing_jen_cleanup_target_groups target
  where group_row.id = target.group_id;
  get diagnostics group_count = row_count;

  delete from pbs_bid bid
  using pbs_pairing_jen_cleanup_target_bids target
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
  get diagnostics empty_bid_count = row_count;

  raise notice 'Jen Pairing catalog cleanup: obsolete properties hidden=%, affected bids=%, target groups=%, configured favorites deleted=%, simple favorites deleted=%, generic favorites deleted=%, occurrences deleted=%, conditions deleted=%, groups deleted=%, empty bid containers deleted=%',
    obsolete_property_count,
    target_bid_count,
    target_group_count,
    configured_favorite_count,
    simple_favorite_count,
    generic_favorite_count,
    occurrence_count,
    condition_count,
    group_count,
    empty_bid_count;
end $$;

commit;
