-- Verify that the legacy-data guard left fixture data untouched after migration failure.

begin;

do $$
begin
  if not exists (
    select 1
    from pbs_bid_group g
    join pbs_bid b on b.id = g.bid_id
    where b.crew_id = '__reserve427_legacy__'
      and b.period_code = 'Aug 2099'
      and g.property_id = 427
      and g.operator = 'Json'
      and g.param_a::jsonb = '{"type":"reserve-avoidance","mode":"if_possible"}'::jsonb
  ) then
    raise exception 'Legacy Line Reserve 427 fixture data was changed or deleted.';
  end if;

  if not exists (
    select 1
    from pbs_bid_property
    where bid_type = 'Line'
      and property_code = 427
      and property_name = 'Reserve Avoidance'
  ) then
    raise exception 'Legacy guard did not roll back property metadata.';
  end if;
end $$;

commit;
