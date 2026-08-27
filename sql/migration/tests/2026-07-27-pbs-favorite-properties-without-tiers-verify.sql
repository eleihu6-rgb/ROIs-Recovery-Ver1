do $$
declare
  remaining_tier_columns integer;
  retained_fixture_rows integer;
begin
  select count(*)
    into remaining_tier_columns
  from information_schema.columns
  where table_schema = current_schema()
    and table_name in (
      'pbs_bid_pairing_configured_favorite',
      'pbs_bid_days_off_favorite',
      'pbs_bid_line_favorite'
    )
    and column_name = 'tiers';

  if remaining_tier_columns <> 0 then
    raise exception 'Configured favorite tiers columns were not removed.';
  end if;

  select count(*)
    into retained_fixture_rows
  from (
    select id from pbs_bid_pairing_configured_favorite
    where favorite_name = 'Pairing favorite fixture'
    union all
    select id from pbs_bid_days_off_favorite
    where favorite_name = 'Days Off favorite fixture'
    union all
    select id from pbs_bid_line_favorite
    where favorite_name = 'Line favorite fixture'
  ) fixture_rows;

  if retained_fixture_rows not in (0, 3) then
    raise exception 'Configured favorite rows were not preserved completely.';
  end if;
end
$$;
