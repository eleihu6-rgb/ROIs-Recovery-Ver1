-- PBS Line catalog cleanup for Jen's approved Excel list.
-- Execute with search_path pointing at the target PBS schema.
-- The project is not live yet, so saved Line bids that use obsolete Line properties are removed.

begin;

create temporary table pbs_line_jen_keep_codes (
  property_code smallint primary key,
  property_name varchar(100) not null,
  display_order integer not null,
  recommended_order smallint not null,
  recommended_usage_count integer not null
) on commit drop;

insert into pbs_line_jen_keep_codes (
  property_code,
  property_name,
  display_order,
  recommended_order,
  recommended_usage_count
)
values
  (429, 'Credit Window Preference', 1, 1, 122),
  (407, 'Minimum Base Layover', 2, 2, 0),
  (408, 'Commuter Pattern', 3, 3, 0),
  (428, 'Efficient Flying First', 4, 4, 0),
  (410, 'Mixed Block Pattern', 5, 5, 0),
  (427, 'Reserve Avoidance', 6, 6, 0);

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
  is_active
)
values
  (429, 'Line', 'Credit Window Preference', null, null, null,
   '{"type":"credit_window_preference","modes":["low","high","custom"]}',
   'Choose Low credit, High credit, or a custom credit window.', 'app', 1, 1, 1, 122, 1),
  (407, 'Line', 'Minimum Base Layover', null, null, null,
   '{"type":"minimum_base_layover","format":"HHH:MM","minDuration":"013:00"}',
   'Set the minimum home-base spacing between pairings. Must be at least 13:00.', 'legacy', 1, 2, 2, 0, 1),
  (408, 'Line', 'Commuter Pattern', null, null, null,
   '{"type":"days_off_on_pattern","label":"Commuter Pattern","min":1,"max":14}',
   'Prefer line work/off blocks such as 5 on / 4 off or 4 on / 4 off.', 'legacy', 1, 3, 3, 0, 1),
  (428, 'Line', 'Efficient Flying First', '["award","avoid"]', null, null,
   '{"type":"flag"}',
   'Award prioritizes highest average daily credit first; Avoid prioritizes lowest average daily credit first.', 'aa', 1, 4, 4, 0, 1),
  (410, 'Line', 'Mixed Block Pattern', null, null, null,
   '{"type":"reserve_flying_date_pattern","label":"Mixed Block Pattern"}',
   'Prefer a mix of reserve and flying blocks.', 'app', 1, 5, 5, 0, 1),
  (427, 'Line', 'Reserve Avoidance', null, null, null,
   '{"type":"reserve_avoidance","label":"Reserve Avoidance","mode":["if_possible","no_matter_what"]}',
   'Avoid reserve if possible, or avoid reserve no matter what.', 'aa', 1, 6, 6, 0, 1)
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
  updated_at = now();

update pbs_bid_property property
set
  is_visible_in_portal = 0,
  is_active = 0,
  recommended_order = null,
  recommended_usage_count = 0,
  updated_at = now()
where property.bid_type = 'Line'
  and not exists (
    select 1
    from pbs_line_jen_keep_codes keep_codes
    where keep_codes.property_code = property.property_code
  );

update pbs_bid_property property
set
  property_name = keep_codes.property_name,
  is_visible_in_portal = 1,
  is_active = 1,
  display_order = keep_codes.display_order,
  recommended_order = keep_codes.recommended_order,
  recommended_usage_count = keep_codes.recommended_usage_count,
  updated_at = now()
from pbs_line_jen_keep_codes keep_codes
where property.bid_type = 'Line'
  and property.property_code = keep_codes.property_code;

create temporary table pbs_line_jen_obsolete_properties on commit drop as
select property.id, property.property_code
from pbs_bid_property property
where property.bid_type = 'Line'
  and not exists (
    select 1
    from pbs_line_jen_keep_codes keep_codes
    where keep_codes.property_code = property.property_code
  );

create temporary table pbs_line_jen_cleanup_target_keys on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Line'
  and exists (
    select 1
    from pbs_line_jen_obsolete_properties obsolete
    where g.property_id = obsolete.property_code
       or g.property_definition_id = obsolete.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
where g.bid_type = 'Line'
  and exists (
    select 1
    from pbs_line_jen_obsolete_properties obsolete
    where c.property_id = obsolete.property_code
       or c.property_definition_id = obsolete.id
  );

create temporary table pbs_line_jen_cleanup_target_groups on commit drop as
select distinct g.id as group_id, g.bid_id
from pbs_bid_group g
where exists (
  select 1
  from pbs_line_jen_cleanup_target_keys target
  where target.bid_id = g.bid_id
    and target.bid_type is not distinct from g.bid_type
    and target.property_group_key = g.property_group_key
);

create temporary table pbs_line_jen_cleanup_target_bids on commit drop as
select distinct bid_id
from pbs_line_jen_cleanup_target_groups;

do $$
declare
  obsolete_property_count integer;
  target_group_count integer;
  target_bid_count integer;
  configured_favorite_count integer;
  generic_favorite_count integer;
  condition_count integer;
  group_count integer;
  empty_bid_count integer;
begin
  select count(*) into obsolete_property_count
  from pbs_line_jen_obsolete_properties;

  select count(*) into target_group_count
  from pbs_line_jen_cleanup_target_groups;

  select count(*) into target_bid_count
  from pbs_line_jen_cleanup_target_bids;

  delete from pbs_bid_line_favorite favorite
  where favorite.property_code in (
      select property_code
      from pbs_line_jen_obsolete_properties
    )
     or favorite.property_id in (
      select id
      from pbs_line_jen_obsolete_properties
    );
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_property_favorite favorite
  where favorite.bid_type = 'Line'
    and (
      favorite.property_code in (
        select property_code
        from pbs_line_jen_obsolete_properties
      )
      or favorite.property_id in (
        select id
        from pbs_line_jen_obsolete_properties
      )
    );
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_line_jen_cleanup_target_groups target
  where condition_row.group_id = target.group_id;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_line_jen_cleanup_target_groups target
  where group_row.id = target.group_id;
  get diagnostics group_count = row_count;

  delete from pbs_bid bid
  using pbs_line_jen_cleanup_target_bids target
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

  raise notice 'Jen Line catalog cleanup: obsolete properties hidden=%, affected bids=%, target groups=%, configured favorites deleted=%, generic favorites deleted=%, conditions deleted=%, groups deleted=%, empty bid containers deleted=%',
    obsolete_property_count,
    target_bid_count,
    target_group_count,
    configured_favorite_count,
    generic_favorite_count,
    condition_count,
    group_count,
    empty_bid_count;
end $$;

commit;
