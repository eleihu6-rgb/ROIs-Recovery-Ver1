-- Verify the first property 427 Reserve migration run in an isolated PBS test schema.

begin;

do $$
declare
  reserve_property_id bigint;
begin
  select id into reserve_property_id
  from pbs_bid_property
  where bid_type = 'Line'
    and property_code = 427
    and property_name = 'Reserve'
    and award_or_avoid = '["award","avoid"]'
    and validation_json = '{"type":"flag"}'
    and is_active = 1;

  if reserve_property_id is null then
    raise exception 'Line Reserve 427 property metadata was not canonicalized.';
  end if;

  if (
    select count(*)
    from pbs_bid_property_context
    where property_id = reserve_property_id
      and bid_context in ('Current', 'StandingLineholder')
      and is_visible_in_portal = 1
  ) <> 2
    or exists (
      select 1
      from pbs_bid_property_context
      where property_id = reserve_property_id
        and bid_context = 'StandingReserve'
        and is_visible_in_portal <> 0
    ) then
    raise exception 'Line Reserve 427 context visibility is incorrect.';
  end if;
end $$;

commit;
