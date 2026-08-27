-- Verify idempotence after the second property 168 migration run, then remove the fixture.

begin;

do $$
declare
  expected_metadata constant jsonb :=
    '{"type":"airport_preference","events":["landing","layover","landing_or_layover"],"locations":["airport","city"],"dateScope":["specific_dates","date_range"],"minimumLayoverDuration":"HH:MM"}'::jsonb;
begin
  if (
    select validation_json::jsonb
    from pbs_bid_property
    where property_code = 168
      and bid_type = 'Pairing'
  ) is distinct from expected_metadata then
    raise exception 'Second migration run changed property 168 metadata.';
  end if;

  if exists (
    select 1
    from pbs_bid
    where crew_id in (
      '__air168_target__',
      '__air168_config__',
      '__air168_simple__'
    )
      and period_code = 'Jul 2099'
  ) then
    raise exception 'Second migration run left a target-only bid.';
  end if;

  if (
    select count(*)
    from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id like '__air168_%'
      and bid.period_code = 'Jul 2099'
  ) <> 1 then
    raise exception 'Second migration run changed the preserved group set.';
  end if;

  if (
    select count(*)
    from pbs_bid_line_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__air168_otherfav__'
      and bid.period_code = 'Jul 2099'
  ) <> 1 then
    raise exception 'Second migration run changed the preserved Line favorite.';
  end if;
end $$;

create temporary table pbs_airport_fixture_cleanup_bids on commit drop as
select id
from pbs_bid
where crew_id like '__air168_%'
  and period_code = 'Jul 2099';

delete from pbs_bid_pairing_occurrence where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_condition where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_group where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_day_off where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_pairing_configured_favorite where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_pairing_favorite where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_property_favorite where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_days_off_favorite where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_line_favorite where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid_tier where bid_id in (select id from pbs_airport_fixture_cleanup_bids);
delete from pbs_bid where id in (select id from pbs_airport_fixture_cleanup_bids);

commit;
