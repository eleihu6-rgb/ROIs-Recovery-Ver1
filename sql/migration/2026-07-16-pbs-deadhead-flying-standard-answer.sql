-- Align property 122 Deadhead Flying to the standard-answer modes and flight-date scope.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live, so existing property 122 groups and favorites are removed.

begin;

do $$
begin
  if (select count(*) from pbs_bid_property where bid_type = 'Pairing' and property_code = 122) <> 1 then
    raise exception 'Expected exactly one Pairing property definition for property 122.';
  end if;
end $$;

update pbs_bid_property
set
  property_name = 'Deadhead Flying',
  award_or_avoid = '["award","avoid"]',
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"deadhead_flying","label":"Deadhead Flying","modes":["any-deadhead","deadhead-only-duty"],"dateScope":["specific_dates","date_range"],"dateField":"pairing_segment.flt_dt"}',
  tooltip = 'Award/Avoid pairings by deadhead flying, optionally limited to flight dates.',
  is_visible_in_portal = 1,
  is_active = 1,
  updated_at = now()
where bid_type = 'Pairing'
  and property_code = 122;

create temporary table pbs_deadhead_122_definition on commit drop as
select id
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code = 122;

create temporary table pbs_deadhead_122_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Pairing'
  and (
    g.property_id = 122
    or g.property_definition_id in (select id from pbs_deadhead_122_definition)
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c on c.group_id = g.id
where g.bid_type = 'Pairing'
  and (
    c.property_id = 122
    or c.property_definition_id in (select id from pbs_deadhead_122_definition)
  );

create temporary table pbs_deadhead_122_target_bids on commit drop as
select distinct bid_id
from pbs_deadhead_122_target_groups;

do $$
declare
  occurrence_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  generic_favorite_count integer;
  condition_count integer;
  group_count integer;
  tier_count integer;
  bid_count integer;
begin
  delete from pbs_bid_pairing_configured_favorite favorite
  where favorite.property_code = 122
    or favorite.property_id in (select id from pbs_deadhead_122_definition);
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite favorite
  where favorite.property_code = 122
    or favorite.property_id in (select id from pbs_deadhead_122_definition);
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_property_favorite favorite
  where favorite.bid_type = 'Pairing'
    and (
      favorite.property_code = 122
      or favorite.property_id in (select id from pbs_deadhead_122_definition)
    );
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_pairing_occurrence occurrence_row
  using pbs_deadhead_122_target_groups target
  where occurrence_row.bid_id = target.bid_id
    and occurrence_row.property_group_key = target.property_group_key;
  get diagnostics occurrence_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_bid_group group_row, pbs_deadhead_122_target_groups target
  where condition_row.group_id = group_row.id
    and group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_deadhead_122_target_groups target
  where group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics group_count = row_count;

  update pbs_bid_tier tier
  set total_groups = (
    select count(*)::smallint
    from pbs_bid_group group_row
    where group_row.tier_id = tier.id
  ),
  updated_at = now()
  where tier.bid_id in (select bid_id from pbs_deadhead_122_target_bids);

  delete from pbs_bid_tier tier
  where tier.bid_id in (select bid_id from pbs_deadhead_122_target_bids)
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
  where bid.id in (select bid_id from pbs_deadhead_122_target_bids);

  delete from pbs_bid bid
  using pbs_deadhead_122_target_bids target
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

  raise notice 'Deadhead Flying alignment: configured favorites=%, simple favorites=%, generic favorites=%, occurrences=%, conditions=%, groups=%, empty tiers=%, empty bids=%',
    configured_favorite_count,
    simple_favorite_count,
    generic_favorite_count,
    occurrence_count,
    condition_count,
    group_count,
    tier_count,
    bid_count;
end $$;

do $$
begin
  if exists (
    select 1
    from pbs_bid_group g
    where g.bid_type = 'Pairing'
      and (
        g.property_id = 122
        or g.property_definition_id in (select id from pbs_deadhead_122_definition)
      )
  ) or exists (
    select 1
    from pbs_bid_condition c
    join pbs_bid_group g on g.id = c.group_id
    where g.bid_type = 'Pairing'
      and (
        c.property_id = 122
        or c.property_definition_id in (select id from pbs_deadhead_122_definition)
      )
  ) then
    raise exception 'Property 122 bid rows remain after cleanup.';
  end if;
end $$;

commit;
