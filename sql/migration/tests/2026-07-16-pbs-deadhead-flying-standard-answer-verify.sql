-- Run after the Deadhead Flying standard-answer migration in an isolated test schema.

begin;

do $$
declare
  metadata jsonb;
  fixture_bid_id bigint;
begin
  select validation_json::jsonb into metadata
  from pbs_bid_property
  where bid_type = 'Pairing' and property_code = 122;

  if metadata -> 'modes' <> '["any-deadhead","deadhead-only-duty"]'::jsonb
    or metadata -> 'dateScope' <> '["specific_dates","date_range"]'::jsonb
    or metadata ? 'deadheadLegs' then
    raise exception 'Property 122 metadata is not aligned.';
  end if;

  select id into fixture_bid_id from pbs_bid
  where crew_id = '__deadhead_standard_test__'
    and period_code = 'Jul 2099'
    and bid_context = 'Current';

  if fixture_bid_id is null then
    raise exception 'Fixture bid was unexpectedly removed.';
  end if;

  if exists (
    select 1 from pbs_bid_group
    where bid_id = fixture_bid_id
      and property_group_key in ('test-deadhead-target-main', 'test-deadhead-target-mixed')
  ) or exists (
    select 1 from pbs_bid_pairing_occurrence
    where bid_id = fixture_bid_id
      and property_group_key = 'test-deadhead-target-main'
  ) then
    raise exception 'Target property 122 groups or occurrences survived.';
  end if;

  if (select count(*) from pbs_bid_group
      where bid_id = fixture_bid_id and property_group_key = 'test-deadhead-keep') <> 1 then
    raise exception 'Unrelated group outside the target property_group_key was not preserved.';
  end if;

  if exists (
    select 1 from pbs_bid_pairing_configured_favorite where bid_id = fixture_bid_id and property_code = 122
  ) or exists (
    select 1 from pbs_bid_pairing_favorite where bid_id = fixture_bid_id and property_code = 122
  ) or exists (
    select 1 from pbs_bid_property_favorite where bid_id = fixture_bid_id and property_code = 122
  ) then
    raise exception 'A property 122 favorite survived.';
  end if;

  if (select count(*) from pbs_bid_pairing_configured_favorite where bid_id = fixture_bid_id and property_code = 101) <> 1
    or (select count(*) from pbs_bid_pairing_favorite where bid_id = fixture_bid_id and property_code = 101) <> 1
    or (select count(*) from pbs_bid_property_favorite where bid_id = fixture_bid_id and property_code = 101) <> 1 then
    raise exception 'Unrelated favorites were not preserved.';
  end if;
end $$;

commit;
