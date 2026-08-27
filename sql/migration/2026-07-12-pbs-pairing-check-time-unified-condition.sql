-- PBS Pairing Check-In / Check-Out Time unified-condition replacement.
-- Execute with search_path pointing at the target PBS schema.
-- This is intentionally destructive: all legacy 103/111 groups and favorites
-- are removed because their payloads cannot be inferred safely as the new
-- single-condition JSON shape.

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
  103,
  'Pairing',
  'Pairing Check-In / Check-Out Time',
  '["award","avoid"]',
  null,
  '["=","<",">","Between"]',
  '{"type":"pairing-check-time","timeType":["check_in","check_out"],"timeWindow":["=","<",">","Between"],"dateScope":["specific_date","date_range"]}',
  'Award or avoid pairings by their check-in (report) or check-out (release) time, optionally limited to a pairing date.',
  'legacy',
  1,
  3,
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

update pbs_bid_property
set
  is_visible_in_portal = 0,
  is_active = 0,
  updated_at = now()
where property_code = 111;

create temporary table pbs_pairing_check_time_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_property property_definition
  on property_definition.property_code in (103, 111)
where g.bid_type = 'Pairing'
  and (
    g.property_definition_id = property_definition.id
    or g.property_id = property_definition.property_code
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
join pbs_bid_property property_definition
  on property_definition.property_code in (103, 111)
where g.bid_type = 'Pairing'
  and (
    c.property_definition_id = property_definition.id
    or c.property_id = property_definition.property_code
  );

create temporary table pbs_pairing_check_time_target_bids on commit drop as
select distinct bid_id from pbs_pairing_check_time_target_groups;

do $$
declare
  target_group_count integer;
  target_bid_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  condition_count integer;
  group_count integer;
  empty_bid_count integer;
begin
  select count(*), count(distinct bid_id)
    into target_group_count, target_bid_count
  from pbs_pairing_check_time_target_groups;

  delete from pbs_bid_pairing_configured_favorite
  where property_code in (103, 111)
    or property_id in (
      select id from pbs_bid_property where property_code in (103, 111)
    );
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite
  where property_code in (103, 111)
    or property_id in (
      select id from pbs_bid_property where property_code in (103, 111)
    );
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_condition condition_row
  using pbs_bid_group group_row, pbs_pairing_check_time_target_groups target
  where condition_row.group_id = group_row.id
    and group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group group_row
  using pbs_pairing_check_time_target_groups target
  where group_row.bid_id = target.bid_id
    and group_row.bid_type is not distinct from target.bid_type
    and group_row.property_group_key = target.property_group_key;
  get diagnostics group_count = row_count;

  delete from pbs_bid bid
  using pbs_pairing_check_time_target_bids target
  where bid.id = target.bid_id
    and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = bid.id);
  get diagnostics empty_bid_count = row_count;

  raise notice 'Pairing Check-In / Check-Out Time replacement: target rule groups=%, affected bids=%, configured favorites deleted=%, simple favorites deleted=%, conditions deleted=%, group rows deleted=%, empty bid containers deleted=%',
    target_group_count,
    target_bid_count,
    configured_favorite_count,
    simple_favorite_count,
    condition_count,
    group_count,
    empty_bid_count;
end $$;

commit;
