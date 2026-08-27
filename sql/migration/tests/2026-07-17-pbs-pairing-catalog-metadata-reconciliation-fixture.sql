-- Fixture for the 103/107/112 catalog reconciliation migration.
-- Run only in an isolated PBS test schema.

begin;

create temporary table pbs_catalog_fixture_old_bids on commit drop as
select id from pbs_bid
where crew_id like '__catrec_%'
  and period_code = 'Jul 2099';

delete from pbs_bid_pairing_occurrence where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_condition where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_group where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_day_off where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_pairing_configured_favorite where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_pairing_favorite where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_property_favorite where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_days_off_favorite where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_line_favorite where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid_tier where bid_id in (select id from pbs_catalog_fixture_old_bids);
delete from pbs_bid where id in (select id from pbs_catalog_fixture_old_bids);

create temporary table pbs_catalog_fixture_properties on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code in (102, 103, 107, 112);

do $$
begin
  if (select count(*) from pbs_catalog_fixture_properties) <> 4 then
    raise exception 'Catalog reconciliation fixture requires properties 102, 103, 107, and 112.';
  end if;
end $$;

insert into pbs_bid (crew_id, period_code, bid_context, total_tiers)
values
  ('__catrec_valid__', 'Jul 2099', 'Current', 1),
  ('__catrec_invalid__', 'Jul 2099', 'Current', 1),
  ('__catrec_mixed__', 'Jul 2099', 'Current', 1),
  ('__catrec_legacy__', 'Jul 2099', 'Current', 1),
  ('__catrec_favorites__', 'Jul 2099', 'Current', 0);

insert into pbs_bid_tier (bid_id, tier, total_groups)
select bid.id, 1,
  case bid.crew_id
    when '__catrec_valid__' then 3
    when '__catrec_mixed__' then 2
    else 1
  end
from pbs_bid bid
where bid.crew_id in ('__catrec_valid__', '__catrec_invalid__', '__catrec_mixed__', '__catrec_legacy__')
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_group (
  tier_id, bid_id, group_seq, bid_type, action_id, property_id,
  operator, param_a, param_b, param_c, total_conditions,
  property_group_key, property_definition_id
)
select tier.id, bid.id, fixture.group_seq, 'Pairing', 1, property.property_code,
  fixture.operator, fixture.param_a, fixture.param_b, fixture.param_c,
  fixture.total_conditions, fixture.group_key, property.id
from (
  values
    ('__catrec_valid__', 1, 103, 'Json', '{"type":"pairing-check-time","timeType":"check_in","operator":"Between","from":"08:00","to":"10:00","dateScope":null}', null, null, 0, 'catrec-valid-103'),
    ('__catrec_valid__', 2, 107, 'Json', '{"type":"flight-legs-per-duty","operator":"Between","from":2,"to":4,"dateScope":{"mode":"specific_dates","dates":["2099-07-03","2099-07-05"]}}', null, 'any', 0, 'catrec-valid-107'),
    ('__catrec_valid__', 3, 112, 'Json', '{"type":"pairing-length-preference","minDays":2,"maxDays":4,"dateScope":{"mode":"date_range","from":"2099-07-01","to":"2099-07-20"},"min":1,"max":7}', null, null, 0, 'catrec-valid-112'),
    ('__catrec_invalid__', 1, 107, 'Json', '{malformed-json', null, 'any', 0, 'catrec-invalid-json'),
    ('__catrec_mixed__', 1, 102, 'Json', '{"type":"pairing-preference","pairingIds":["1"]}', null, null, 0, 'catrec-keep-102'),
    ('__catrec_mixed__', 2, 102, 'Json', '{"type":"pairing-preference","pairingIds":["2"]}', null, null, 1, 'catrec-invalid-condition'),
    ('__catrec_legacy__', 1, 112, 'Between', '99', '-5', null, 0, 'catrec-legacy-112')
) fixture(crew_id, group_seq, property_code, operator, param_a, param_b, param_c, total_conditions, group_key)
join pbs_bid bid on bid.crew_id = fixture.crew_id and bid.period_code = 'Jul 2099'
join pbs_bid_tier tier on tier.bid_id = bid.id and tier.tier = 1
join pbs_catalog_fixture_properties property on property.property_code = fixture.property_code;

insert into pbs_bid_condition (
  group_id, bid_id, node_seq, and_or_or, property_id,
  operator, param_a, param_b, param_c, property_definition_id
)
select group_row.id, group_row.bid_id, 2, 'AND', property.property_code,
  'Json',
  '{"type":"pairing-check-time","timeType":"check_out","operator":"=","value":"12:00","dateScope":{"mode":"specific_date","date":"2099-07-05"}}',
  null, null, property.id
from pbs_bid_group group_row
join pbs_bid bid on bid.id = group_row.bid_id
join pbs_catalog_fixture_properties property on property.property_code = 103
where bid.crew_id = '__catrec_mixed__'
  and bid.period_code = 'Jul 2099'
  and group_row.property_group_key = 'catrec-invalid-condition';

insert into pbs_bid_pairing_favorite (bid_id, property_code, property_id)
select bid.id, property.property_code, property.id
from pbs_bid bid
join pbs_catalog_fixture_properties property on property.property_code = 107
where bid.crew_id = '__catrec_invalid__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_pairing_configured_favorite (
  bid_id, property_id, property_code, favorite_name, action, quantifier, bid_payload, tiers
)
select bid.id, property.id, property.property_code,
  fixture.favorite_name, fixture.action, fixture.quantifier, fixture.bid_payload::jsonb, '["T1"]'::jsonb
from (
  values
    (112, 'Keep legacy 112', 'award', null, '{"type":"stepper-range","from":99,"to":-5}'),
    (103, 'Delete specific_date 103', 'award', null, '{"type":"pairing-check-time","timeType":"check_in","operator":"=","value":"09:00","dateScope":{"mode":"specific_date","date":"2099-07-05"}}')
) fixture(property_code, favorite_name, action, quantifier, bid_payload)
join pbs_bid bid on bid.crew_id = '__catrec_favorites__' and bid.period_code = 'Jul 2099'
join pbs_catalog_fixture_properties property on property.property_code = fixture.property_code;

commit;
