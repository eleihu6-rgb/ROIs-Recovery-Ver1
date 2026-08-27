-- Test fixture for the required Work Day Preference window migration.
-- Run only in an isolated PBS test schema.

begin;

create temporary table pbs_work_day_fixture_existing_bids on commit drop as
select id
from pbs_bid
where crew_id = '__wd_required_window_test__'
  and period_code = 'Jul 2099'
  and bid_context = 'Current';

delete from pbs_bid_pairing_occurrence
where bid_id in (select id from pbs_work_day_fixture_existing_bids);
delete from pbs_bid_condition
where bid_id in (select id from pbs_work_day_fixture_existing_bids);
delete from pbs_bid_group
where bid_id in (select id from pbs_work_day_fixture_existing_bids);
delete from pbs_bid_pairing_configured_favorite
where bid_id in (select id from pbs_work_day_fixture_existing_bids);
delete from pbs_bid_tier
where bid_id in (select id from pbs_work_day_fixture_existing_bids);
delete from pbs_bid
where id in (select id from pbs_work_day_fixture_existing_bids);

insert into pbs_bid (
  crew_id,
  period_code,
  bid_context,
  total_tiers
)
values ('__wd_required_window_test__', 'Jul 2099', 'Current', 5);

insert into pbs_bid_tier (bid_id, tier, total_groups)
select bid.id, tier_number, 1
from pbs_bid bid
cross join generate_series(1, 5) tier_number
where bid.crew_id = '__wd_required_window_test__'
  and bid.period_code = 'Jul 2099'
  and bid.bid_context = 'Current';

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
  'Pairing',
  1,
  110,
  'Json',
  '{"type":"work-day-preference","days":[{"dayOfWeek":"MON","checkInFrom":"06:00","checkInTo":null}],"dateScope":null}',
  0,
  'test-wd-invalid-main',
  work_day_property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier in (1, 2)
join pbs_bid_property work_day_property
  on work_day_property.bid_type = 'Pairing' and work_day_property.property_code = 110
where bid.crew_id = '__wd_required_window_test__'
  and bid.period_code = 'Jul 2099'
  and bid.bid_context = 'Current';

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
  'Pairing',
  1,
  110,
  'Json',
  '{"type":"work-day-preference","days":[{"dayOfWeek":"WED","checkInFrom":"22:00","checkInTo":"04:00"}],"dateScope":null}',
  0,
  'test-wd-valid-main',
  work_day_property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier = 3
join pbs_bid_property work_day_property
  on work_day_property.bid_type = 'Pairing' and work_day_property.property_code = 110
where bid.crew_id = '__wd_required_window_test__'
  and bid.period_code = 'Jul 2099'
  and bid.bid_context = 'Current';

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
  'Pairing',
  1,
  101,
  'In',
  'YVR',
  1,
  'test-wd-invalid-and',
  landing_property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier in (4, 5)
join pbs_bid_property landing_property
  on landing_property.bid_type = 'Pairing' and landing_property.property_code = 101
where bid.crew_id = '__wd_required_window_test__'
  and bid.period_code = 'Jul 2099'
  and bid.bid_context = 'Current';

insert into pbs_bid_condition (
  group_id,
  bid_id,
  node_seq,
  property_id,
  operator,
  param_a,
  property_definition_id
)
select
  group_row.id,
  group_row.bid_id,
  2,
  110,
  'Json',
  '{',
  work_day_property.id
from pbs_bid_group group_row
join pbs_bid_property work_day_property
  on work_day_property.bid_type = 'Pairing' and work_day_property.property_code = 110
where group_row.property_group_key = 'test-wd-invalid-and';

insert into pbs_bid_pairing_configured_favorite (
  bid_id,
  property_id,
  property_code,
  favorite_name,
  action,
  quantifier,
  bid_payload,
  tiers
)
select
  bid.id,
  work_day_property.id,
  110,
  favorite_name,
  'award',
  null,
  payload::jsonb,
  '["T3"]'::jsonb
from pbs_bid bid
join pbs_bid_property work_day_property
  on work_day_property.bid_type = 'Pairing' and work_day_property.property_code = 110
cross join (values
  ('test-wd-invalid-favorite', '{"type":"work-day-preference","days":[{"dayOfWeek":"FRI","checkInFrom":"","checkInTo":"10:00"}],"dateScope":null}'),
  ('test-wd-valid-favorite', '{"type":"work-day-preference","days":[{"dayOfWeek":"FRI","checkInFrom":"06:00","checkInTo":"10:00"}],"dateScope":null}')
) fixture(favorite_name, payload)
where bid.crew_id = '__wd_required_window_test__'
  and bid.period_code = 'Jul 2099'
  and bid.bid_context = 'Current';

commit;
