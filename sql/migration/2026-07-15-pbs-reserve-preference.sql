-- Reserve Preference consolidates Current Reserve onto property 301.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live yet, so old Current Reserve 302/311 saved/favorite data is removed.
-- Standing Reserve properties 312/313/314 are intentionally not modified.

begin;

update pbs_bid_property
set
  property_name = 'Reserve Preference',
  award_or_avoid = null,
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"reserve_preference","label":"Reserve Preference","options":["CRAM","CRPM","PRAM","PRMM","PRPM","RESA","RESB"],"dateScope":["whole_month","first_half","second_half","date_range","specific_dates"],"shortCallType":true}',
  tooltip = 'Crew bids for reserve periods by short-call type and date scope.',
  is_visible_in_portal = 1,
  is_active = 1,
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Reserve'
  and property_code = 301;

update pbs_bid_property
set
  is_visible_in_portal = 0,
  is_active = 0,
  recommended_order = null,
  recommended_usage_count = 0,
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Reserve'
  and property_code in (302, 311);

create temporary table pbs_reserve_preference_obsolete_properties on commit drop as
select property.id, property.property_code
from pbs_bid_property property
where property.bid_type = 'Reserve'
  and property.property_code in (302, 311);

create temporary table pbs_reserve_preference_target_keys on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Reserve'
  and exists (
    select 1
    from pbs_reserve_preference_obsolete_properties obsolete
    where g.property_id = obsolete.property_code
       or g.property_definition_id = obsolete.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
where g.bid_type = 'Reserve'
  and exists (
    select 1
    from pbs_reserve_preference_obsolete_properties obsolete
    where c.property_id = obsolete.property_code
       or c.property_definition_id = obsolete.id
  );

create temporary table pbs_reserve_preference_target_groups on commit drop as
select distinct g.id as group_id, g.bid_id
from pbs_bid_group g
where exists (
  select 1
  from pbs_reserve_preference_target_keys target
  where target.bid_id = g.bid_id
    and target.bid_type is not distinct from g.bid_type
    and target.property_group_key = g.property_group_key
);

create temporary table pbs_reserve_preference_target_bids on commit drop as
select distinct bid_id
from pbs_reserve_preference_target_groups;

create temporary table pbs_reserve_preference_empty_bids on commit drop as
select target.bid_id
from pbs_reserve_preference_target_bids target
where not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_day_off day_off where day_off.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_pairing_occurrence occurrence where occurrence.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_days_off_favorite favorite where favorite.bid_id = target.bid_id)
  and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = target.bid_id);

do $$
declare
  obsolete_property_count integer;
  target_group_count integer;
  target_bid_count integer;
  generic_favorite_count integer;
  condition_count integer;
  group_count integer;
  empty_tier_count integer;
  empty_bid_count integer;
begin
  select count(*) into obsolete_property_count
  from pbs_reserve_preference_obsolete_properties;

  select count(*) into target_group_count
  from pbs_reserve_preference_target_groups;

  select count(*) into target_bid_count
  from pbs_reserve_preference_target_bids;

  delete from pbs_bid_property_favorite favorite
  where favorite.bid_type = 'Reserve'
    and (
      favorite.property_code in (
        select property_code
        from pbs_reserve_preference_obsolete_properties
      )
      or favorite.property_id in (
        select id
        from pbs_reserve_preference_obsolete_properties
      )
    );
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_reserve_preference_target_groups target
  where condition_row.group_id = target.group_id;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_reserve_preference_target_groups target
  where group_row.id = target.group_id;
  get diagnostics group_count = row_count;

  delete from pbs_bid_tier tier
  using pbs_reserve_preference_empty_bids empty_bid
  where tier.bid_id = empty_bid.bid_id;
  get diagnostics empty_tier_count = row_count;

  delete from pbs_bid bid
  using pbs_reserve_preference_empty_bids empty_bid
  where bid.id = empty_bid.bid_id;
  get diagnostics empty_bid_count = row_count;

  raise notice 'Reserve Preference cleanup: obsolete properties hidden=%, affected bids=%, target groups=%, generic favorites deleted=%, conditions deleted=%, groups deleted=%, empty tiers deleted=%, empty bid containers deleted=%',
    obsolete_property_count,
    target_bid_count,
    target_group_count,
    generic_favorite_count,
    condition_count,
    group_count,
    empty_tier_count,
    empty_bid_count;
end $$;

commit;
