-- Verify idempotence after the second reconciliation run, then remove the fixture.

begin;

do $$
begin
  if (
    select count(*)
    from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id like '__catrec_%'
      and bid.period_code = 'Jul 2099'
  ) <> 5 then
    raise exception 'Second migration run changed the preserved group set.';
  end if;

  if (
    select count(*) from pbs_bid_pairing_configured_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__catrec_favorites__'
  ) <> 1 then
    raise exception 'Second migration run changed the preserved favorite set.';
  end if;
end $$;

create temporary table pbs_catalog_fixture_cleanup_bids on commit drop as
select id from pbs_bid
where crew_id like '__catrec_%'
  and period_code = 'Jul 2099';

delete from pbs_bid_pairing_occurrence where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_condition where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_group where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_day_off where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_pairing_configured_favorite where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_pairing_favorite where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_property_favorite where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_days_off_favorite where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_line_favorite where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid_tier where bid_id in (select id from pbs_catalog_fixture_cleanup_bids);
delete from pbs_bid where id in (select id from pbs_catalog_fixture_cleanup_bids);

commit;
