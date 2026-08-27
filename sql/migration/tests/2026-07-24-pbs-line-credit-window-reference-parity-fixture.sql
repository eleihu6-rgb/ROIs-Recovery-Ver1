-- Fixture for property 429 Credit Window migration. Run only in an isolated PBS test schema.

begin;

create temporary table credit_window_old_fixture_bids on commit drop as
select id
from pbs_bid
where crew_id = '__cw429_fixture__'
  and period_code = 'Jul 2099';

delete from pbs_bid_line_favorite
where bid_id in (select id from credit_window_old_fixture_bids);
delete from pbs_bid_group
where bid_id in (select id from credit_window_old_fixture_bids);
delete from pbs_bid_tier
where bid_id in (select id from credit_window_old_fixture_bids);
delete from pbs_bid
where id in (select id from credit_window_old_fixture_bids);

create temporary table credit_window_target_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Line'
  and property_code = 429;

create temporary table credit_window_keep_property on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Line'
  and property_code <> 429
order by property_code
limit 1;

do $$
begin
  if (select count(*) from credit_window_target_property) <> 1
    or (select count(*) from credit_window_keep_property) <> 1 then
    raise exception 'Credit Window fixture requires target and keep Line properties.';
  end if;
end $$;

insert into pbs_bid (crew_id, period_code, bid_context, total_tiers)
values ('__cw429_fixture__', 'Jul 2099', 'Current', 1);

insert into pbs_bid_tier (bid_id, tier, total_groups)
select id, 1, 4
from pbs_bid
where crew_id = '__cw429_fixture__'
  and period_code = 'Jul 2099';

insert into pbs_bid_group (
  tier_id,
  bid_id,
  group_seq,
  bid_type,
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
  fixture.group_seq,
  'Line',
  fixture.property_code,
  fixture.operator,
  fixture.param_a,
  0,
  fixture.property_group_key,
  fixture.property_definition_id
from pbs_bid bid
join pbs_bid_tier tier on tier.bid_id = bid.id
cross join lateral (
  select
    1::smallint as group_seq,
    target.property_code,
    'Json'::varchar as operator,
    '{"type":"credit-window-preference","mode":"high","minimumCredit":85,"maximumCredit":95}'::varchar as param_a,
    'cw429-high'::varchar as property_group_key,
    target.id as property_definition_id
  from credit_window_target_property target
  union all
  select
    2::smallint,
    target.property_code,
    'Json',
    '{"type":"credit-window-preference","mode":"custom","minimumCredit":80,"maximumCredit":90}',
    'cw429-custom',
    target.id
  from credit_window_target_property target
  union all
  select
    3::smallint,
    keep_property.property_code,
    '=',
    'keep',
    'cw429-keep',
    keep_property.id
  from credit_window_keep_property keep_property
  union all
  select
    4::smallint,
    target.property_code,
    'Json',
    '{"type":"credit-window-preference","mode":"low","minimumCredit":65,"maximumCredit":75}',
    'cw429-low',
    target.id
  from credit_window_target_property target
) fixture
where bid.crew_id = '__cw429_fixture__'
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
  fixture.property_definition_id,
  fixture.property_code,
  fixture.favorite_name,
  fixture.bid_payload,
  '["T1"]'::jsonb
from pbs_bid bid
cross join lateral (
  select
    target.id as property_definition_id,
    target.property_code,
    'Credit Window High'::varchar as favorite_name,
    '{"type":"credit-window-preference","mode":"high"}'::jsonb as bid_payload
  from credit_window_target_property target
  union all
  select target.id, target.property_code, 'Credit Window Low',
    '{"type":"credit-window-preference","mode":"low"}'::jsonb
  from credit_window_target_property target
  union all
  select target.id, target.property_code, 'Credit Window Custom',
    '{"type":"credit-window-preference","mode":"custom","minimumCredit":80,"maximumCredit":90}'::jsonb
  from credit_window_target_property target
  union all
  select keep_property.id, keep_property.property_code, 'Keep Favorite', '{"type":"flag"}'::jsonb
  from credit_window_keep_property keep_property
) fixture
where bid.crew_id = '__cw429_fixture__'
  and bid.period_code = 'Jul 2099';

commit;
