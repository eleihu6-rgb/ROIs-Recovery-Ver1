-- Run after executing the migration a second time. Verifies idempotence, then removes the fixture.

begin;

do $$
declare
  fixture_bid_id bigint;
begin
  select id into fixture_bid_id from pbs_bid
  where crew_id = '__deadhead_standard_test__'
    and period_code = 'Jul 2099'
    and bid_context = 'Current';

  if fixture_bid_id is null
    or (select count(*) from pbs_bid_group where bid_id = fixture_bid_id) <> 1
    or (select count(*) from pbs_bid_group where bid_id = fixture_bid_id and property_group_key = 'test-deadhead-keep') <> 1
    or exists (select 1 from pbs_bid_pairing_occurrence where bid_id = fixture_bid_id)
    or exists (select 1 from pbs_bid_pairing_configured_favorite where bid_id = fixture_bid_id and property_code = 122)
    or exists (select 1 from pbs_bid_pairing_favorite where bid_id = fixture_bid_id and property_code = 122)
    or exists (select 1 from pbs_bid_property_favorite where bid_id = fixture_bid_id and property_code = 122) then
    raise exception 'Second migration run changed the expected post-migration state.';
  end if;
end $$;

create temporary table pbs_deadhead_fixture_cleanup_bids on commit drop as
select id from pbs_bid
where crew_id = '__deadhead_standard_test__'
  and period_code = 'Jul 2099'
  and bid_context = 'Current';

delete from pbs_bid_pairing_occurrence where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid_condition where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid_group where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid_pairing_configured_favorite where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid_pairing_favorite where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid_property_favorite where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid_tier where bid_id in (select id from pbs_deadhead_fixture_cleanup_bids);
delete from pbs_bid where id in (select id from pbs_deadhead_fixture_cleanup_bids);

commit;
