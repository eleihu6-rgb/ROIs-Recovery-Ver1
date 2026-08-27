-- Reserve Avoidance upgrades Line property 427 from old Award/Avoid Reserve.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live yet, so old 427 saved/favorite data is removed.

begin;

create temporary table pbs_reserve_avoidance_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Line'
 and property_definition.property_code = 427
where g.bid_type = 'Line'
  and (
    g.property_id = 427
    or g.property_definition_id = property_definition.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Line'
 and property_definition.property_code = 427
where g.bid_type = 'Line'
  and (
    c.property_id = 427
    or c.property_definition_id = property_definition.id
  );

create temporary table pbs_reserve_avoidance_target_bids on commit drop as
select distinct bid_id
from pbs_reserve_avoidance_target_groups;

update pbs_bid_property
set
  property_name = 'Reserve Avoidance',
  award_or_avoid = null,
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"reserve_avoidance","label":"Reserve Avoidance","mode":["if_possible","no_matter_what"]}',
  tooltip = 'Avoid reserve if possible, or avoid reserve no matter what.',
  source_type = 'aa',
  is_visible_in_portal = 1,
  display_order = 427,
  is_active = 1,
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Line'
  and property_code = 427;

delete from pbs_bid_line_favorite favorite
where favorite.property_code = 427
   or favorite.property_id in (
     select id
     from pbs_bid_property
     where bid_type = 'Line'
       and property_code = 427
   );

delete from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Line'
  and (
    favorite.property_code = 427
    or favorite.property_id in (
      select id
      from pbs_bid_property
      where bid_type = 'Line'
        and property_code = 427
    )
  );

delete from pbs_bid_condition condition_row
using pbs_bid_group group_row, pbs_reserve_avoidance_target_groups target
where condition_row.group_id = group_row.id
  and group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid_group group_row
using pbs_reserve_avoidance_target_groups target
where group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid bid
using pbs_reserve_avoidance_target_bids target
where bid.id = target.bid_id
  and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = bid.id);

commit;
