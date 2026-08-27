-- Verify idempotence after the second property 429 migration run, then remove the fixture.

begin;

do $$
declare
  fixture_bid_id bigint;
begin
  select id into fixture_bid_id
  from pbs_bid
  where crew_id = '__cw429_fixture__'
    and period_code = 'Jul 2099';

  if fixture_bid_id is null
    or (select count(*) from pbs_bid_group where bid_id = fixture_bid_id) <> 3
    or (select count(*) from pbs_bid_line_favorite where bid_id = fixture_bid_id) <> 3
    or exists (
      select 1
      from pbs_bid_group
      where bid_id = fixture_bid_id
        and param_a::jsonb ->> 'mode' is not null
    )
    or exists (
      select 1
      from pbs_bid_line_favorite
      where bid_id = fixture_bid_id
        and bid_payload ->> 'mode' is not null
    ) then
    raise exception 'Second Credit Window migration run changed the preserved fixture state.';
  end if;
end $$;

create temporary table credit_window_fixture_cleanup_bids on commit drop as
select id
from pbs_bid
where crew_id = '__cw429_fixture__'
  and period_code = 'Jul 2099';

delete from pbs_bid_line_favorite
where bid_id in (select id from credit_window_fixture_cleanup_bids);
delete from pbs_bid_group
where bid_id in (select id from credit_window_fixture_cleanup_bids);
delete from pbs_bid_tier
where bid_id in (select id from credit_window_fixture_cleanup_bids);
delete from pbs_bid
where id in (select id from credit_window_fixture_cleanup_bids);

commit;
