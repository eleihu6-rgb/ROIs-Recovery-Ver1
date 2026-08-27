-- Legacy-data guard fixture for property 427 Reserve migration.
-- Run only in an isolated PBS test schema. The migration must fail after this fixture.

begin;

create temporary table line_reserve_427_fixture_bid on commit drop as
select id
from pbs_bid
where crew_id = '__reserve427_legacy__'
  and period_code = 'Aug 2099';

delete from pbs_bid_line_favorite
where bid_id in (select id from line_reserve_427_fixture_bid);
delete from pbs_bid_property_favorite
where bid_id in (select id from line_reserve_427_fixture_bid);
delete from pbs_bid_condition
where bid_id in (select id from line_reserve_427_fixture_bid);
delete from pbs_bid_group
where bid_id in (select id from line_reserve_427_fixture_bid);
delete from pbs_bid_tier
where bid_id in (select id from line_reserve_427_fixture_bid);
delete from pbs_bid
where id in (select id from line_reserve_427_fixture_bid);

update pbs_bid_property
set
  property_name = 'Reserve Avoidance',
  award_or_avoid = null,
  operator_options = null,
  validation_json = '{"type":"reserve_avoidance","label":"Reserve Avoidance","mode":["if_possible","no_matter_what"]}',
  tooltip = 'Avoid reserve if possible, or avoid reserve no matter what.',
  updated_by = 'fixture',
  updated_at = now()
where bid_type = 'Line'
  and property_code = 427;

insert into pbs_bid (crew_id, period_code, bid_context, total_tiers)
values ('__reserve427_legacy__', 'Aug 2099', 'Current', 1);

insert into pbs_bid_tier (bid_id, tier, total_groups)
select id, 1, 1
from pbs_bid
where crew_id = '__reserve427_legacy__'
  and period_code = 'Aug 2099';

insert into pbs_bid_group (
  tier_id,
  bid_id,
  group_seq,
  bid_type,
  action_id,
  property_id,
  operator,
  param_a,
  total_conditions,
  property_group_key,
  property_definition_id
)
select
  tier.id,
  bid.id,
  1,
  'Line',
  null,
  property.property_code,
  'Json',
  '{"type":"reserve-avoidance","mode":"if_possible"}',
  0,
  'reserve427-legacy',
  property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id
join pbs_bid_property property
  on property.bid_type = 'Line'
 and property.property_code = 427
where bid.crew_id = '__reserve427_legacy__'
  and bid.period_code = 'Aug 2099';

commit;
