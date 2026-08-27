-- Pre-migration fixture. Run only in an isolated PBS test schema before the migration.

begin;

create temporary table favorite_without_tiers_old_bid on commit drop as
select id
from pbs_bid
where crew_id = '__favorite_without_tiers_fixture__'
  and period_code = 'Jul 2099';

delete from pbs_bid_pairing_configured_favorite
where bid_id in (select id from favorite_without_tiers_old_bid);
delete from pbs_bid_days_off_favorite
where bid_id in (select id from favorite_without_tiers_old_bid);
delete from pbs_bid_line_favorite
where bid_id in (select id from favorite_without_tiers_old_bid);
delete from pbs_bid
where id in (select id from favorite_without_tiers_old_bid);

insert into pbs_bid (crew_id, period_code, bid_context)
values ('__favorite_without_tiers_fixture__', 'Jul 2099', 'Current');

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
  property.id,
  property.property_code,
  'Pairing favorite fixture',
  'award',
  '{"type":"flag"}'::jsonb,
  '["T2","T4"]'::jsonb
from pbs_bid bid
join lateral (
  select id, property_code
  from pbs_bid_property
  where bid_type = 'Pairing'
  order by property_code
  limit 1
) property on true
where bid.crew_id = '__favorite_without_tiers_fixture__'
  and bid.period_code = 'Jul 2099';

insert into pbs_bid_days_off_favorite (
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
  property.id,
  property.property_code,
  'Days Off favorite fixture',
  'award',
  '{"type":"flag"}'::jsonb,
  '["T1"]'::jsonb
from pbs_bid bid
join lateral (
  select id, property_code
  from pbs_bid_property
  where bid_type = 'Days Off'
  order by property_code
  limit 1
) property on true
where bid.crew_id = '__favorite_without_tiers_fixture__'
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
  property.id,
  property.property_code,
  'Line favorite fixture',
  '{"type":"flag"}'::jsonb,
  '["T3"]'::jsonb
from pbs_bid bid
join lateral (
  select id, property_code
  from pbs_bid_property
  where bid_type = 'Line'
  order by property_code
  limit 1
) property on true
where bid.crew_id = '__favorite_without_tiers_fixture__'
  and bid.period_code = 'Jul 2099';

do $$
begin
  if (
    select count(*)
    from (
      select id from pbs_bid_pairing_configured_favorite
      where favorite_name = 'Pairing favorite fixture'
      union all
      select id from pbs_bid_days_off_favorite
      where favorite_name = 'Days Off favorite fixture'
      union all
      select id from pbs_bid_line_favorite
      where favorite_name = 'Line favorite fixture'
    ) fixture_rows
  ) <> 3 then
    raise exception 'Favorite tiers fixture requires one property for each bid type.';
  end if;
end
$$;

commit;
