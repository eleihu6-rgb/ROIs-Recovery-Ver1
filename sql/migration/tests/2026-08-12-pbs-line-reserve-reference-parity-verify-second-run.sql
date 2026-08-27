-- Verify the canonical-data second property 427 migration run.

begin;

do $$
begin
  if not exists (
    select 1
    from pbs_bid_group g
    join pbs_bid b on b.id = g.bid_id
    where b.crew_id = '__reserve427_canonical__'
      and b.period_code = 'Sep 2099'
      and g.property_id = 427
      and g.action_id = 2
      and g.operator is null
      and g.param_a is null
  ) then
    raise exception 'Canonical Line Reserve 427 group did not survive second migration run.';
  end if;

  if not exists (
    select 1
    from pbs_bid_line_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__reserve427_canonical__'
      and bid.period_code = 'Sep 2099'
      and favorite.property_code = 427
      and favorite.action = 'avoid'
      and favorite.bid_payload = '{"type":"flag"}'::jsonb
  ) then
    raise exception 'Canonical Line Reserve 427 favorite did not survive second migration run.';
  end if;

  if not exists (
    select 1
    from pbs_bid_property
    where bid_type = 'Line'
      and property_code = 427
      and property_name = 'Reserve'
      and award_or_avoid = '["award","avoid"]'
      and validation_json = '{"type":"flag"}'
  ) then
    raise exception 'Line Reserve 427 metadata is not canonical after second run.';
  end if;
end $$;

commit;
