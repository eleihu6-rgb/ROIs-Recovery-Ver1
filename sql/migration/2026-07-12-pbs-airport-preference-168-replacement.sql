-- PBS Airport Preference (property 168) complete replacement.
-- Execute with search_path pointing at the target PBS schema.
-- This is intentionally destructive: legacy 168 bids and favorites must be recreated.

begin;

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
  '{"type":"airport_preference","events":["landing","layover","landing_or_layover"],"locations":["airport","city"],"dateScope":["specific_dates","date_range"],"minimumLayoverDuration":"HH:MM","fulfilment":["minimumRequired","maximumRequired"]}',
  'Award or avoid pairings by airport/city landing, layover, or either event.',
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

create temporary table pbs_airport_preference_168_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_property property_definition
  on property_definition.property_code = 168
where g.bid_type = 'Pairing'
  and (
    g.property_definition_id = property_definition.id
    or g.property_id = 168
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
join pbs_bid_property property_definition
  on property_definition.property_code = 168
where g.bid_type = 'Pairing'
  and (
    c.property_definition_id = property_definition.id
    or c.property_id = 168
  );

create temporary table pbs_airport_preference_168_target_bids on commit drop as
select distinct bid_id from pbs_airport_preference_168_target_groups;

do $$
declare
  target_property_id bigint;
  target_group_count integer;
  target_bid_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  condition_count integer;
  group_count integer;
  empty_bid_count integer;
begin
  select id into target_property_id
  from pbs_bid_property
  where property_code = 168;

  select count(*), count(distinct bid_id)
    into target_group_count, target_bid_count
  from pbs_airport_preference_168_target_groups;

  delete from pbs_bid_pairing_configured_favorite
  where property_id = target_property_id or property_code = 168;
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite
  where property_id = target_property_id or property_code = 168;
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_bid_group group_row, pbs_airport_preference_168_target_groups target
  where condition_row.group_id = group_row.id
    and group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_airport_preference_168_target_groups target
  where group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics group_count = row_count;

  delete from pbs_bid bid
  using pbs_airport_preference_168_target_bids target
  where bid.id = target.bid_id
    and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = bid.id);
  get diagnostics empty_bid_count = row_count;

  raise notice 'Airport Preference 168 replacement: target rule groups=%, affected bids=%, configured favorites deleted=%, simple favorites deleted=%, conditions deleted=%, group rows deleted=%, empty bid containers deleted=%',
    target_group_count,
    target_bid_count,
    configured_favorite_count,
    simple_favorite_count,
    condition_count,
    group_count,
    empty_bid_count;
end $$;

commit;
