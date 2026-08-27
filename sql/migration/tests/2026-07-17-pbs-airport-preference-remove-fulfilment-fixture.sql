-- Fixture for property 168 destructive cleanup. Run only in an isolated PBS test schema.

begin;

create temporary table pbs_airport_fixture_old_bids on commit drop as
select id
from pbs_bid
where crew_id like '__air168_%'
  and period_code = 'Jul 2099';

delete from pbs_bid_pairing_occurrence where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_condition where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_group where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_day_off where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_pairing_configured_favorite where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_pairing_favorite where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_property_favorite where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_days_off_favorite where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_line_favorite where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid_tier where bid_id in (select id from pbs_airport_fixture_old_bids);
delete from pbs_bid where id in (select id from pbs_airport_fixture_old_bids);

create temporary table pbs_airport_fixture_target_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code = 168;

create temporary table pbs_airport_fixture_keep_pairing_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code <> 168
order by property_code
limit 1;

create temporary table pbs_airport_fixture_keep_line_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Line'
order by property_code
limit 1;

do $$
begin
  if (select count(*) from pbs_airport_fixture_target_property) <> 1
    or (select count(*) from pbs_airport_fixture_keep_pairing_property) <> 1
    or (select count(*) from pbs_airport_fixture_keep_line_property) <> 1 then
    raise exception 'Airport Preference fixture requires target, keep Pairing, and keep Line properties.';
  end if;
end $$;

insert into pbs_bid (crew_id, period_code, bid_context, total_tiers)
values
  ('__air168_target__', 'Jul 2099', 'Current', 2),
  ('__air168_mixed__', 'Jul 2099', 'Current', 1),
  ('__air168_dayoff__', 'Jul 2099', 'Current', 1),
  ('__air168_config__', 'Jul 2099', 'Current', 0),
  ('__air168_simple__', 'Jul 2099', 'Current', 0),
  ('__air168_otherfav__', 'Jul 2099', 'Current', 0);

insert into pbs_bid_tier (bid_id, tier, total_groups)
select bid.id, tier_number, 1
from pbs_bid bid
cross join generate_series(1, 2) tier_number
where bid.crew_id = '__air168_target__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_tier (bid_id, tier, total_groups)
select bid.id, 1, expected_groups
from (
  values
    ('__air168_mixed__', 2),
    ('__air168_dayoff__', 1)
) fixture(crew_id, expected_groups)
join pbs_bid bid
  on bid.crew_id = fixture.crew_id
  and bid.period_code = 'Jul 2099';

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
  target.property_code,
  'Json',
  '{"type":"airport-preference","event":"landing","locations":[{"code":"YYZ","kind":"airport"}],"minimumRequired":1,"maximumRequired":2}',
  case when tier.tier = 1 then 1 else 0 end,
  'airport-target-cross-tier',
  target.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id
cross join pbs_airport_fixture_target_property target
where bid.crew_id = '__air168_target__'
  and bid.period_code = 'Jul 2099';

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
  keep_property.property_code,
  '=',
  'fixture-sibling',
  keep_property.id
from pbs_bid_group group_row
cross join pbs_airport_fixture_keep_pairing_property keep_property
where group_row.property_group_key = 'airport-target-cross-tier'
  and group_row.total_conditions = 1;

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
  keep_property.property_code,
  '=',
  'keep',
  0,
  'airport-keep-group',
  keep_property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id
cross join pbs_airport_fixture_keep_pairing_property keep_property
where bid.crew_id = '__air168_mixed__'
  and bid.period_code = 'Jul 2099';

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
  2,
  'Pairing',
  1,
  keep_property.property_code,
  '=',
  'target-through-condition',
  2,
  'airport-target-condition-group',
  keep_property.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id
cross join pbs_airport_fixture_keep_pairing_property keep_property
where bid.crew_id = '__air168_mixed__'
  and bid.period_code = 'Jul 2099';

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
  condition_fixture.node_seq,
  condition_fixture.property_code,
  'Json',
  condition_fixture.param_a,
  condition_fixture.property_definition_id
from pbs_bid_group group_row
cross join lateral (
  select
    2::smallint as node_seq,
    target.property_code,
    '{"type":"airport-preference","event":"layover","locations":[{"code":"YVR","kind":"airport"}],"minimumRequired":1}' as param_a,
    target.id as property_definition_id
  from pbs_airport_fixture_target_property target
  union all
  select
    3::smallint,
    keep_property.property_code,
    'fixture-sibling',
    keep_property.id
  from pbs_airport_fixture_keep_pairing_property keep_property
) condition_fixture
where group_row.property_group_key = 'airport-target-condition-group';

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
  target.property_code,
  'Json',
  '{"type":"airport-preference","event":"landing_or_layover","locations":[{"code":"YYZ","kind":"city"}],"maximumRequired":3}',
  0,
  'airport-target-with-dayoff',
  target.id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id
cross join pbs_airport_fixture_target_property target
where bid.crew_id = '__air168_dayoff__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_day_off (bid_id, tier_id, tier, bid_date, request_type)
select bid.id, tier.id, 1, date '2099-07-07', 'DAY_OFF'
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier = 1
where bid.crew_id = '__air168_dayoff__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_pairing_occurrence (
  bid_id,
  group_id,
  property_group_key,
  tier_id,
  tier,
  pairing_number,
  origin_date,
  pairing_id,
  source
)
select
  group_row.bid_id,
  group_row.id,
  group_row.property_group_key,
  group_row.tier_id,
  tier.tier,
  'TEST-AIRPORT',
  date '2099-07-03',
  '999168',
  'portal'
from pbs_bid_group group_row
join pbs_bid_tier tier on tier.id = group_row.tier_id
where group_row.property_group_key = 'airport-target-cross-tier'
  and tier.tier = 1;

insert into pbs_bid_pairing_configured_favorite (
  bid_id,
  property_id,
  property_code,
  favorite_name,
  action,
  bid_payload,
  tiers
)
select
  bid.id,
  target.id,
  target.property_code,
  'airport-configured-fixture',
  'award',
  '{"type":"airport-preference","event":"landing","locations":[{"code":"YYZ","kind":"airport"}],"minimumRequired":1,"maximumRequired":2}'::jsonb,
  '["T1"]'::jsonb
from pbs_bid bid
cross join pbs_airport_fixture_target_property target
where bid.crew_id in ('__air168_config__', '__air168_otherfav__')
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_pairing_favorite (bid_id, property_id, property_code)
select bid.id, target.id, target.property_code
from pbs_bid bid
cross join pbs_airport_fixture_target_property target
where bid.crew_id = '__air168_simple__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_property_favorite (bid_id, bid_type, property_id, property_code)
select bid.id, 'Pairing', target.id, target.property_code
from pbs_bid bid
cross join pbs_airport_fixture_target_property target
where bid.crew_id = '__air168_simple__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_line_favorite (
  bid_id,
  property_id,
  property_code,
  favorite_name,
  bid_payload,
  tiers
)
select
  bid.id,
  keep_property.id,
  keep_property.property_code,
  'keep-line-favorite',
  '{}'::jsonb,
  '[]'::jsonb
from pbs_bid bid
cross join pbs_airport_fixture_keep_line_property keep_property
where bid.crew_id = '__air168_otherfav__'
  and bid.period_code = 'Jul 2099';

commit;
