-- Rename Line property 428 to Efficient Flying First and make it Award/Avoid.
-- Existing 409/428 saved/favorite data is removed because the project is not live yet
-- and old 428 rows did not carry the required Award/Avoid action.
-- Execute with search_path pointing at the target PBS schema.

begin;

create temporary table pbs_efficient_flying_first_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
left join pbs_bid_property property_definition
  on property_definition.id = g.property_definition_id
where g.bid_type = 'Line'
  and (
    g.property_id in (409, 428)
    or property_definition.property_code in (409, 428)
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
left join pbs_bid_property condition_property_definition
  on condition_property_definition.id = c.property_definition_id
where g.bid_type = 'Line'
  and (
    c.property_id in (409, 428)
    or condition_property_definition.property_code in (409, 428)
  );

create temporary table pbs_efficient_flying_first_target_bids on commit drop as
select distinct bid_id
from pbs_efficient_flying_first_target_groups;

update pbs_bid_property
set
  property_name = 'Most Flying In Least Working Days (Configured)',
  award_or_avoid = null,
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"credit_density_preference","label":"Most Flying In Least Working Days (Configured)","minimumTotalCredit":{"min":"40:00","max":"120:00"},"maximumWorkingDays":{"min":1,"max":31},"strength":["normal","strong","must_try"]}',
  tooltip = 'Legacy configured credit-density condition; hidden from the Portal.',
  source_type = 'app',
  is_visible_in_portal = 0,
  display_order = 409,
  is_active = 1,
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Line'
  and property_code = 409;

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
  recommended_order,
  recommended_usage_count,
  is_active,
  created_by,
  updated_by
) values (
  428,
  'Line',
  'Efficient Flying First',
  '["award","avoid"]',
  null,
  null,
  '{"type":"flag"}',
  'Award prioritizes highest average daily credit first; Avoid prioritizes lowest average daily credit first.',
  'aa',
  1,
  428,
  null,
  0,
  1,
  'migration',
  'migration'
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
  recommended_order = excluded.recommended_order,
  recommended_usage_count = excluded.recommended_usage_count,
  is_active = excluded.is_active,
  updated_by = 'migration',
  updated_at = now();

delete from pbs_bid_line_favorite favorite
where favorite.property_code in (409, 428)
   or favorite.property_id in (
     select id
     from pbs_bid_property
     where bid_type = 'Line'
       and property_code in (409, 428)
   );

delete from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Line'
  and (
    favorite.property_code in (409, 428)
    or favorite.property_id in (
      select id
      from pbs_bid_property
      where bid_type = 'Line'
        and property_code in (409, 428)
    )
  );

delete from pbs_bid_condition condition_row
using pbs_bid_group group_row, pbs_efficient_flying_first_target_groups target
where condition_row.group_id = group_row.id
  and group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid_group group_row
using pbs_efficient_flying_first_target_groups target
where group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid bid
using pbs_efficient_flying_first_target_bids target
where bid.id = target.bid_id
  and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = bid.id);

commit;
