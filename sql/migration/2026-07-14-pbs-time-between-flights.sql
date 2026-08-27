-- Property 129 replaces the legacy Any/Every Sit Length condition.
-- Execute with search_path pointing at the target PBS/live schema.
-- Existing 129 rules and favorites are deliberately removed: their old semantics
-- are not compatible with Time Between Flights.

begin;

create temporary table pbs_time_between_flights_target_groups on commit drop as
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Pairing'
 and property_definition.property_code = 129
where g.bid_type = 'Pairing'
  and (
    g.property_id = 129
    or g.property_definition_id = property_definition.id
  )
union
select distinct g.bid_id, g.bid_type, g.property_group_key
from pbs_bid_group g
join pbs_bid_condition c
  on c.group_id = g.id
join pbs_bid_property property_definition
  on property_definition.bid_type = 'Pairing'
 and property_definition.property_code = 129
where g.bid_type = 'Pairing'
  and (
    c.property_id = 129
    or c.property_definition_id = property_definition.id
  );

create temporary table pbs_time_between_flights_target_bids on commit drop as
select distinct bid_id from pbs_time_between_flights_target_groups;

update pbs_bid_property
set
  property_name = 'Time Between Flights',
  award_or_avoid = '["award","avoid"]',
  any_or_every = '["any","every"]',
  operator_options = '["<","=",">"]',
  validation_json = '{"type":"duration","format":"HH:MM","label":"Time Between Flights"}',
  tooltip = 'Award/Avoid pairings by any or every same-duty time between consecutive flights.',
  is_visible_in_portal = 1,
  display_order = 129,
  is_active = 1,
  updated_at = now()
where bid_type = 'Pairing'
  and property_code = 129;

update f8.dictionary
set code_value = '45',
    name = 'PBS Time Between Flights Minimum Minutes',
    updated_by = 'migration',
    updated_at = now()
where parent_code = 'SYS_PARAM'
  and code = 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES';

insert into f8.dictionary (parent_code, code, name, idx, code_value, created_by, updated_by)
select 'SYS_PARAM', 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES', 'PBS Time Between Flights Minimum Minutes', 0, '45', 'migration', 'migration'
where not exists (
  select 1
  from f8.dictionary
  where parent_code = 'SYS_PARAM'
    and code = 'PBS_TIME_BETWEEN_FLIGHTS_MIN_MINUTES'
);

delete from pbs_bid_pairing_configured_favorite favorite
where favorite.property_code = 129
   or favorite.property_id in (
     select id from pbs_bid_property where bid_type = 'Pairing' and property_code = 129
   );

delete from pbs_bid_pairing_favorite favorite
where favorite.property_code = 129
   or favorite.property_id in (
     select id from pbs_bid_property where bid_type = 'Pairing' and property_code = 129
   );

delete from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Pairing'
  and (
    favorite.property_code = 129
    or favorite.property_id in (
      select id from pbs_bid_property where bid_type = 'Pairing' and property_code = 129
    )
  );

delete from pbs_bid_condition condition_row
using pbs_bid_group group_row, pbs_time_between_flights_target_groups target
where condition_row.group_id = group_row.id
  and group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid_group group_row
using pbs_time_between_flights_target_groups target
where group_row.bid_id = target.bid_id
  and group_row.bid_type is not distinct from target.bid_type
  and group_row.property_group_key = target.property_group_key;

delete from pbs_bid bid
using pbs_time_between_flights_target_bids target
where bid.id = target.bid_id
  and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
  and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = bid.id);

commit;
