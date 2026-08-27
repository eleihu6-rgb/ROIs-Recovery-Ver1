-- PBS Deadhead Flying replaces the legacy Deadhead Legs entry and retires split deadhead properties.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live yet, so legacy 122 / 128 / 147 / 148 saved data is removed instead of runtime-compatible.

begin;

update pbs_bid_property
set
  property_name = 'Deadhead Flying',
  award_or_avoid = '["award","avoid"]',
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"deadhead_flying","label":"Deadhead Flying","modes":["any-deadhead","deadhead-only-duty","deadhead-legs"],"deadheadLegs":{"operators":["<","=",">","Between"],"min":0}}',
  tooltip = 'Award/Avoid pairings by deadhead flying.',
  is_visible_in_portal = 1,
  is_active = 1,
  updated_at = now()
where bid_type = 'Pairing'
  and property_code = 122;

update pbs_bid_property
set
  is_visible_in_portal = 0,
  is_active = 0,
  updated_at = now()
where bid_type = 'Pairing'
  and property_code in (128, 147, 148);

create temporary table pbs_deadhead_flying_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Pairing'
 and property_definition.property_code in (122, 128, 147, 148)
where g.bid_type = 'Pairing'
  and (
    g.property_id in (122, 128, 147, 148)
    or g.property_definition_id = property_definition.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Pairing'
 and property_definition.property_code in (122, 128, 147, 148)
where g.bid_type = 'Pairing'
  and (
    c.property_id in (122, 128, 147, 148)
    or c.property_definition_id = property_definition.id
  );

create temporary table pbs_deadhead_flying_target_bids on commit drop as
select distinct bid_id
from pbs_deadhead_flying_target_groups;

do $$
declare
  configured_favorite_count integer;
  simple_favorite_count integer;
  generic_favorite_count integer;
  condition_count integer;
  group_count integer;
  empty_bid_count integer;
begin
  delete from pbs_bid_pairing_configured_favorite
  where property_code in (122, 128, 147, 148)
    or property_id in (
      select id
      from pbs_bid_property
      where bid_type = 'Pairing'
        and property_code in (122, 128, 147, 148)
    );
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite
  where property_code in (122, 128, 147, 148)
    or property_id in (
      select id
      from pbs_bid_property
      where bid_type = 'Pairing'
        and property_code in (122, 128, 147, 148)
    );
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_property_favorite
  where bid_type = 'Pairing'
    and (
      property_code in (122, 128, 147, 148)
      or property_id in (
        select id
        from pbs_bid_property
        where bid_type = 'Pairing'
          and property_code in (122, 128, 147, 148)
      )
    );
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_bid_group group_row, pbs_deadhead_flying_target_groups target
  where condition_row.group_id = group_row.id
    and group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_deadhead_flying_target_groups target
  where group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics group_count = row_count;

  delete from pbs_bid bid
  using pbs_deadhead_flying_target_bids target
  where bid.id = target.bid_id
    and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = bid.id);
  get diagnostics empty_bid_count = row_count;

  raise notice 'Deadhead Flying replacement: configured favorites deleted=%, simple favorites deleted=%, generic favorites deleted=%, conditions deleted=%, groups deleted=%, empty bid containers deleted=%',
    configured_favorite_count,
    simple_favorite_count,
    generic_favorite_count,
    condition_count,
    group_count,
    empty_bid_count;
end $$;

commit;
