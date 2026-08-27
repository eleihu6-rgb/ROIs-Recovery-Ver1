-- Verify the first property 168 migration run in an isolated PBS test schema.

begin;

do $$
declare
  expected_metadata constant jsonb :=
    '{"type":"airport_preference","events":["landing","layover","landing_or_layover"],"locations":["airport","city"],"dateScope":["specific_dates","date_range"],"minimumLayoverDuration":"HH:MM"}'::jsonb;
  mixed_bid_id bigint;
  dayoff_bid_id bigint;
  other_favorite_bid_id bigint;
begin
  if (
    select validation_json::jsonb
    from pbs_bid_property
    where property_code = 168
      and bid_type = 'Pairing'
  ) is distinct from expected_metadata then
    raise exception 'Property 168 metadata does not match the expected contract.';
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
    raise exception 'A target-only or favorite-only empty bid survived.';
  end if;

  select id into mixed_bid_id
  from pbs_bid
  where crew_id = '__air168_mixed__'
    and period_code = 'Jul 2099';

  if mixed_bid_id is null
    or (select total_tiers from pbs_bid where id = mixed_bid_id) <> 1
    or (select count(*) from pbs_bid_tier where bid_id = mixed_bid_id) <> 1
    or (select total_groups from pbs_bid_tier where bid_id = mixed_bid_id) <> 1
    or (select count(*) from pbs_bid_group where bid_id = mixed_bid_id) <> 1
    or (select count(*) from pbs_bid_group
        where bid_id = mixed_bid_id and property_group_key = 'airport-keep-group') <> 1
    or exists (
      select 1
      from pbs_bid_group
      where bid_id = mixed_bid_id
        and property_group_key = 'airport-target-condition-group'
    ) then
    raise exception 'Mixed bid, tier counter, or keep group state is incorrect.';
  end if;

  select id into dayoff_bid_id
  from pbs_bid
  where crew_id = '__air168_dayoff__'
    and period_code = 'Jul 2099';

  if dayoff_bid_id is null
    or (select total_tiers from pbs_bid where id = dayoff_bid_id) <> 1
    or (select total_groups from pbs_bid_tier where bid_id = dayoff_bid_id) <> 0
    or (select count(*) from pbs_bid_day_off where bid_id = dayoff_bid_id) <> 1
    or exists (select 1 from pbs_bid_group where bid_id = dayoff_bid_id) then
    raise exception 'Day-off bid or its empty tier was not preserved correctly.';
  end if;

  select id into other_favorite_bid_id
  from pbs_bid
  where crew_id = '__air168_otherfav__'
    and period_code = 'Jul 2099';

  if other_favorite_bid_id is null
    or exists (
      select 1
      from pbs_bid_pairing_configured_favorite
      where bid_id = other_favorite_bid_id
        and property_code = 168
    )
    or (select count(*) from pbs_bid_line_favorite where bid_id = other_favorite_bid_id) <> 1 then
    raise exception 'Favorite-only bid with another category favorite was not preserved correctly.';
  end if;

  if exists (
    select 1
    from pbs_bid_group
    where bid_type = 'Pairing'
      and property_id = 168
  ) or exists (
    select 1
    from pbs_bid_condition
    where property_id = 168
  ) or exists (
    select 1
    from pbs_bid_pairing_occurrence
    where property_group_key like 'airport-target-%'
  ) or exists (
    select 1
    from pbs_bid_pairing_configured_favorite
    where property_code = 168
  ) or exists (
    select 1
    from pbs_bid_pairing_favorite
    where property_code = 168
  ) or exists (
    select 1
    from pbs_bid_property_favorite
    where bid_type = 'Pairing'
      and property_code = 168
  ) then
    raise exception 'A property 168 group, condition, occurrence, or favorite survived.';
  end if;
end $$;

commit;
