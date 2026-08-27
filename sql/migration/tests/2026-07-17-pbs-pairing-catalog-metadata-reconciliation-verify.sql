-- Verify the first 103/107/112 catalog reconciliation migration run.

begin;

do $$
begin
  if exists (
    select 1 from pbs_bid_property
    where bid_type = 'Pairing'
      and (
        (property_code = 103 and validation_json::jsonb is distinct from '{"type":"pairing-check-time","timeType":["check_in","check_out"],"timeWindow":["=","<",">","Between"],"dateScope":["specific_dates","date_range"]}'::jsonb)
        or (property_code = 107 and validation_json::jsonb is distinct from '{"type":"flight-legs-per-duty","label":"Legs","min":1,"max":8,"dateScope":["specific_dates","date_range"]}'::jsonb)
        or (property_code = 112 and validation_json::jsonb is distinct from '{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":["specific_dates","date_range"]}'::jsonb)
      )
  ) then
    raise exception 'Catalog metadata does not match the reconciled contract.';
  end if;

  if (
    select count(*)
    from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id = '__catrec_valid__' and bid.period_code = 'Jul 2099'
  ) <> 3 then
    raise exception 'A valid current-format group was deleted.';
  end if;

  if not exists (
    select 1 from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id = '__catrec_legacy__'
      and group_row.property_group_key = 'catrec-legacy-112'
  ) then
    raise exception 'The Server-supported legacy 112 group was deleted.';
  end if;

  if exists (
    select 1 from pbs_bid_group group_row
    where group_row.property_group_key in ('catrec-invalid-json', 'catrec-invalid-condition')
  ) then
    raise exception 'An invalid group survived reconciliation.';
  end if;

  if (
    select count(*) from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    where bid.crew_id = '__catrec_mixed__'
      and group_row.property_group_key = 'catrec-keep-102'
  ) <> 1 then
    raise exception 'The unrelated group in the mixed bid was not preserved.';
  end if;

  if (
    select count(*) from pbs_bid_pairing_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__catrec_invalid__'
      and favorite.property_code = 107
  ) <> 1 then
    raise exception 'The simple property favorite was not preserved.';
  end if;

  if exists (
    select 1 from pbs_bid_pairing_configured_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__catrec_favorites__'
      and favorite.favorite_name = 'Delete specific_date 103'
  ) or not exists (
    select 1 from pbs_bid_pairing_configured_favorite favorite
    join pbs_bid bid on bid.id = favorite.bid_id
    where bid.crew_id = '__catrec_favorites__'
      and favorite.favorite_name = 'Keep legacy 112'
  ) then
    raise exception 'Configured favorite cleanup boundaries are incorrect.';
  end if;
end $$;

commit;
