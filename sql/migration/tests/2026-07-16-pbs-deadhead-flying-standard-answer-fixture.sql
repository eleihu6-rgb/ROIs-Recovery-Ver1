-- Fixture for property 122 cleanup. Run only in an isolated PBS test schema.

begin;

create temporary table pbs_deadhead_fixture_old_bids on commit drop as
select id from pbs_bid
where crew_id = '__deadhead_standard_test__'
  and period_code = 'Jul 2099'
  and bid_context = 'Current';

delete from pbs_bid_pairing_occurrence where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid_condition where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid_group where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid_pairing_configured_favorite where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid_pairing_favorite where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid_property_favorite where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid_tier where bid_id in (select id from pbs_deadhead_fixture_old_bids);
delete from pbs_bid where id in (select id from pbs_deadhead_fixture_old_bids);

insert into pbs_bid (crew_id, period_code, bid_context, total_tiers)
values ('__deadhead_standard_test__', 'Jul 2099', 'Current', 2);

insert into pbs_bid_tier (bid_id, tier, total_groups)
select bid.id, tier_number, 2
from pbs_bid bid
cross join generate_series(1, 2) tier_number
where bid.crew_id = '__deadhead_standard_test__'
  and bid.period_code = 'Jul 2099'
  and bid.bid_context = 'Current';

insert into pbs_bid_group (
  tier_id, bid_id, group_seq, bid_type, action_id, property_id, operator,
  param_a, total_conditions, property_group_key, property_definition_id
)
select tier.id, bid.id, 1, 'Pairing', 1, 122, 'Json',
  '{"type":"deadhead-flying","mode":"deadhead-legs","operator":">","legs":1}',
  0, 'test-deadhead-target-main', property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier = 1
join pbs_bid_property property on property.bid_type = 'Pairing' and property.property_code = 122
where bid.crew_id = '__deadhead_standard_test__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_group (
  tier_id, bid_id, group_seq, bid_type, action_id, property_id, operator,
  param_a, total_conditions, property_group_key, property_definition_id
)
select tier.id, bid.id, 2, 'Pairing', 1, 101, 'In', 'YVR',
  case when tier.tier = 2 then 1 else 0 end,
  case when tier.tier = 2 then 'test-deadhead-target-mixed' else 'test-deadhead-keep' end,
  property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier in (1, 2)
join pbs_bid_property property on property.bid_type = 'Pairing' and property.property_code = 101
where bid.crew_id = '__deadhead_standard_test__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_condition (
  group_id, bid_id, node_seq, property_id, operator, param_a, property_definition_id
)
select group_row.id, group_row.bid_id, 2, 122, 'Json',
  '{"type":"deadhead-flying","mode":"any-deadhead"}', property.id
from pbs_bid_group group_row
join pbs_bid_property property on property.bid_type = 'Pairing' and property.property_code = 122
where group_row.property_group_key = 'test-deadhead-target-mixed';

insert into pbs_bid_pairing_occurrence (
  bid_id, group_id, property_group_key, tier_id, tier,
  pairing_number, origin_date, pairing_id, source
)
select group_row.bid_id, group_row.id, group_row.property_group_key, group_row.tier_id, 1,
  'TEST-DHD', date '2099-07-03', '999001', 'portal'
from pbs_bid_group group_row
where group_row.property_group_key = 'test-deadhead-target-main';

insert into pbs_bid_pairing_configured_favorite (
  bid_id, property_id, property_code, favorite_name, action, bid_payload, tiers
)
select bid.id, property.id, property.property_code, 'test-deadhead-configured-' || property.property_code,
  'award', '{}'::jsonb, '["T1"]'::jsonb
from pbs_bid bid
join pbs_bid_property property on property.bid_type = 'Pairing' and property.property_code in (101, 122)
where bid.crew_id = '__deadhead_standard_test__' and bid.period_code = 'Jul 2099';

insert into pbs_bid_pairing_favorite (bid_id, property_id, property_code)
select bid.id, property.id, property.property_code
from pbs_bid bid
join pbs_bid_property property on property.bid_type = 'Pairing' and property.property_code in (101, 122)
where bid.crew_id = '__deadhead_standard_test__' and bid.period_code = 'Jul 2099';

insert into pbs_bid_property_favorite (bid_id, bid_type, property_id, property_code)
select bid.id, 'Pairing', property.id, property.property_code
from pbs_bid bid
join pbs_bid_property property on property.bid_type = 'Pairing' and property.property_code in (101, 122)
where bid.crew_id = '__deadhead_standard_test__' and bid.period_code = 'Jul 2099';

commit;
