-- Minimum Base Layover upgrades legacy Line property 407 to the Jen-defined condition.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live yet, so old 407 saved/favorite data is removed instead of runtime-compatible.

begin;

create temporary table pbs_minimum_base_layover_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Line'
 and property_definition.property_code = 407
where g.bid_type = 'Line'
  and (
    g.property_id = 407
    or g.property_definition_id = property_definition.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Line'
 and property_definition.property_code = 407
where g.bid_type = 'Line'
  and (
    c.property_id = 407
    or c.property_definition_id = property_definition.id
  );

create temporary table pbs_minimum_base_layover_target_bids on commit drop as
select distinct bid_id
from pbs_minimum_base_layover_target_groups;

update pbs_bid_property
set
  property_name = 'Minimum Base Layover',
  award_or_avoid = null,
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"minimum_base_layover","format":"HHH:MM","minDuration":"013:00"}',
  tooltip = 'Set the minimum home-base spacing between pairings. Must be at least 13:00.',
  source_type = 'legacy',
  is_visible_in_portal = 1,
  display_order = 407,
  is_active = 1,
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Line'
  and property_code = 407;

update f8.dictionary
set
  code_value = '013:00',
  name = 'PBS Line Minimum Base Layover',
  updated_by = 'migration',
  updated_at = now()
where parent_code = 'SYS_PARAM'
  and code = 'PBS_LINE_MINIMUM_BASE_LAYOVER';

insert into f8.dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select 'SYS_PARAM', 'PBS_LINE_MINIMUM_BASE_LAYOVER', 'PBS Line Minimum Base Layover', 0, '013:00', 'migration', 'migration'
where not exists (
  select 1
  from f8.dictionary
  where parent_code = 'SYS_PARAM'
    and code = 'PBS_LINE_MINIMUM_BASE_LAYOVER'
);

delete from pbs_bid_line_favorite favorite
where favorite.property_code = 407
   or favorite.property_id in (
     select id
     from pbs_bid_property
     where bid_type = 'Line'
       and property_code = 407
   );

delete from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Line'
  and (
    favorite.property_code = 407
    or favorite.property_id in (
      select id
      from pbs_bid_property
      where bid_type = 'Line'
        and property_code = 407
    )
  );

delete from pbs_bid_condition condition_row
using pbs_bid_group group_row, pbs_minimum_base_layover_target_groups target
where condition_row.group_id = group_row.id
  and group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid_group group_row
using pbs_minimum_base_layover_target_groups target
where group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid bid
using pbs_minimum_base_layover_target_bids target
where bid.id = target.bid_id
  and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = bid.id);

commit;
