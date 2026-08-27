-- Verify the first property 429 migration run in an isolated PBS test schema.

begin;

do $$
declare
  fixture_bid_id bigint;
  fixture_tier_id bigint;
begin
  select id into fixture_bid_id
  from pbs_bid
  where crew_id = '__cw429_fixture__'
    and period_code = 'Jul 2099';

  select id into fixture_tier_id
  from pbs_bid_tier
  where bid_id = fixture_bid_id
    and tier = 1;

  if fixture_bid_id is null
    or fixture_tier_id is null
    or (select total_groups from pbs_bid_tier where id = fixture_tier_id) <> 3
    or (select count(*) from pbs_bid_group where tier_id = fixture_tier_id) <> 3
    or (
      select array_agg(group_seq order by group_seq)
      from pbs_bid_group
      where tier_id = fixture_tier_id
    ) is distinct from array[1, 2, 3]::smallint[] then
    raise exception 'Credit Window group cleanup or resequencing is incorrect.';
  end if;

  if (
    select param_a::jsonb
    from pbs_bid_group
    where bid_id = fixture_bid_id
      and property_group_key = 'cw429-high'
  ) is distinct from '{"type":"credit-window-preference","direction":"more"}'::jsonb
    or (
      select param_a::jsonb
      from pbs_bid_group
      where bid_id = fixture_bid_id
        and property_group_key = 'cw429-low'
    ) is distinct from '{"type":"credit-window-preference","direction":"less"}'::jsonb
    or exists (
      select 1
      from pbs_bid_group
      where bid_id = fixture_bid_id
        and property_group_key = 'cw429-custom'
    )
    or not exists (
      select 1
      from pbs_bid_group
      where bid_id = fixture_bid_id
        and property_group_key = 'cw429-keep'
    ) then
    raise exception 'Credit Window group conversion did not preserve the expected data.';
  end if;

  if (select count(*) from pbs_bid_line_favorite where bid_id = fixture_bid_id) <> 3
    or exists (
      select 1
      from pbs_bid_line_favorite
      where bid_id = fixture_bid_id
        and bid_payload ->> 'mode' = 'custom'
    )
    or (
      select count(*)
      from pbs_bid_line_favorite
      where bid_id = fixture_bid_id
        and bid_payload in (
          '{"type":"credit-window-preference","direction":"more"}'::jsonb,
          '{"type":"credit-window-preference","direction":"less"}'::jsonb
        )
    ) <> 2 then
    raise exception 'Credit Window favorite conversion is incorrect.';
  end if;
end $$;

commit;
