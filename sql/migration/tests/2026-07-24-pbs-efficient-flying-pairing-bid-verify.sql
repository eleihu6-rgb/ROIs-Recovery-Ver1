-- Verify 2026-07-24-pbs-efficient-flying-pairing-bid.sql.
-- Execute with search_path pointing at the target PBS schema.

do $$
declare
  live_schema text := case current_schema()
    when 'f8_pbs' then 'f8'
    else null
  end;
  config_count integer;
  config_value text;
begin
  if live_schema is null then
    raise exception 'Unsupported PBS schema for Efficient Flying verification: %', current_schema();
  end if;

  if (
    select count(*)
    from pbs_bid_property
    where property_code = 428
      and bid_type = 'Pairing'
      and property_name = 'Efficient Flying First'
      and award_or_avoid::jsonb = '["award"]'::jsonb
      and validation_json::jsonb = '{"type":"efficient_flying_preference","modes":["efficient","inefficient"]}'::jsonb
      and is_visible_in_portal = 1
      and is_active = 1
  ) <> 1 then
    raise exception 'Expected one active Pairing property 428 with the canonical contract.';
  end if;

  if exists (
    select 1
    from pbs_bid_group group_row
    left join pbs_bid_property property_definition
      on property_definition.id = group_row.property_definition_id
    where group_row.bid_type = 'Line'
      and (
        group_row.property_id = 428
        or property_definition.property_code = 428
      )
  ) then
    raise exception 'Legacy Line 428 bid groups remain.';
  end if;

  if exists (
    select 1
    from pbs_bid_line_favorite favorite
    where favorite.property_code = 428
  ) then
    raise exception 'Legacy Line 428 favorites remain.';
  end if;

  execute format(
    'select count(*), min(code_value) from %I.dictionary where parent_code = $1 and code = $2',
    live_schema
  )
  into config_count, config_value
  using 'PBS_EFFICIENT_FLYING_CONFIG', 'PERCENTILE';

  if config_count <> 1 or config_value !~ '^[0-9]+$'
     or config_value::integer not between 1 and 50 then
    raise exception 'Efficient Flying percentile is missing or invalid: count=%, value=%',
      config_count,
      config_value;
  end if;

  raise notice 'Efficient Flying Pairing Bid verification passed for %.', current_schema();
end $$;
