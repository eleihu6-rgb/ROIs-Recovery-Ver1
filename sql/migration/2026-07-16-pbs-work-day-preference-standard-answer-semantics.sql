-- Align Work Day Preference (property 110) with the approved standard-answer semantics.
-- Execute with search_path pointing at the target PBS schema.
-- All saved/favorited property 110 data is intentionally removed; legacy payloads are not migrated.

begin;

create temporary table pbs_work_day_preference_cleanup_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code = 110;

create temporary table pbs_work_day_preference_cleanup_keys on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Pairing'
  and exists (
    select 1
    from pbs_work_day_preference_cleanup_property property
    where g.property_id = property.property_code
       or g.property_definition_id = property.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c on c.group_id = g.id
where g.bid_type = 'Pairing'
  and exists (
    select 1
    from pbs_work_day_preference_cleanup_property property
    where c.property_id = property.property_code
       or c.property_definition_id = property.id
  );

create temporary table pbs_work_day_preference_cleanup_groups on commit drop as
select distinct g.id as group_id, g.bid_id, g.tier_id
from pbs_bid_group g
where exists (
  select 1
  from pbs_work_day_preference_cleanup_keys target
  where target.bid_id = g.bid_id
    and target.bid_type is not distinct from g.bid_type
    and target.property_group_key = g.property_group_key
);

create temporary table pbs_work_day_preference_cleanup_bids on commit drop as
select distinct bid_id
from pbs_work_day_preference_cleanup_groups;

do $$
declare
  configured_favorite_count integer;
  simple_favorite_count integer;
  generic_favorite_count integer;
  occurrence_count integer;
  condition_count integer;
  group_count integer;
  tier_count integer;
  bid_count integer;
begin
  delete from pbs_bid_pairing_configured_favorite favorite
  where favorite.property_code = 110
     or favorite.property_id in (select id from pbs_work_day_preference_cleanup_property);
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite favorite
  where favorite.property_code = 110
     or favorite.property_id in (select id from pbs_work_day_preference_cleanup_property);
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_property_favorite favorite
  where favorite.bid_type = 'Pairing'
    and (
      favorite.property_code = 110
      or favorite.property_id in (select id from pbs_work_day_preference_cleanup_property)
    );
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_pairing_occurrence occurrence
  using pbs_work_day_preference_cleanup_groups target
  where occurrence.group_id = target.group_id;
  get diagnostics occurrence_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_work_day_preference_cleanup_groups target
  where condition_row.group_id = target.group_id;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_work_day_preference_cleanup_groups target
  where group_row.id = target.group_id;
  get diagnostics group_count = row_count;

  update pbs_bid_tier tier
  set total_groups = (
    select count(*)::smallint
    from pbs_bid_group group_row
    where group_row.tier_id = tier.id
  ),
  updated_at = now()
  where tier.bid_id in (select bid_id from pbs_work_day_preference_cleanup_bids);

  delete from pbs_bid_tier tier
  where tier.bid_id in (select bid_id from pbs_work_day_preference_cleanup_bids)
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
  where bid.id in (select bid_id from pbs_work_day_preference_cleanup_bids);

  delete from pbs_bid bid
  using pbs_work_day_preference_cleanup_bids target
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

  raise notice 'Work Day Preference cleanup: configured favorites=%, simple favorites=%, generic favorites=%, occurrences=%, conditions=%, groups=%, empty tiers=%, empty bids=%',
    configured_favorite_count,
    simple_favorite_count,
    generic_favorite_count,
    occurrence_count,
    condition_count,
    group_count,
    tier_count,
    bid_count;
end $$;

update pbs_bid_property
set property_name = 'Work Day Preference',
    award_or_avoid = '["award"]',
    any_or_every = null,
    operator_options = null,
    validation_json = '{"type":"work_day_preference","label":"Work Days & Check-In Window","weekdays":true,"checkInWindow":true,"dateScope":["specific_dates","date_range"]}',
    tooltip = 'Award pairings when a duty check-in matches a selected weekday and its optional local check-in window, optionally limited to event dates.',
    is_active = 1,
    is_visible_in_portal = 1,
    updated_at = now()
where bid_type = 'Pairing'
  and property_code = 110;

commit;
