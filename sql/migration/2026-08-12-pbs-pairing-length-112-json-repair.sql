-- Repair legacy PBS Pairing property 112 rows to the current JSON contract.
-- Execute with search_path pointing at exactly one target PBS schema.

begin;

create temporary table pbs_pairing_length_112_repair on commit drop as
select
  group_row.id,
  group_row.operator,
  nullif(btrim(group_row.param_a), '') as param_a,
  nullif(btrim(group_row.param_b), '') as param_b,
  case
    when group_row.operator = '>' and nullif(btrim(group_row.param_a), '') ~ '^[0-9]+$'
      then nullif(btrim(group_row.param_a), '')::integer + 1
    when group_row.operator = '=' and nullif(btrim(group_row.param_a), '') ~ '^[0-9]+$'
      then nullif(btrim(group_row.param_a), '')::integer
    when group_row.operator = 'Between' and nullif(btrim(group_row.param_a), '') ~ '^[0-9]+$'
      then nullif(btrim(group_row.param_a), '')::integer
    else null
  end as min_days,
  case
    when group_row.operator = '<' and nullif(btrim(group_row.param_a), '') ~ '^[0-9]+$'
      then nullif(btrim(group_row.param_a), '')::integer - 1
    when group_row.operator = '=' and nullif(btrim(group_row.param_a), '') ~ '^[0-9]+$'
      then nullif(btrim(group_row.param_a), '')::integer
    when group_row.operator = 'Between' and nullif(btrim(group_row.param_b), '') ~ '^[0-9]+$'
      then nullif(btrim(group_row.param_b), '')::integer
    else null
  end as max_days
from pbs_bid_group group_row
join pbs_bid_property property
  on property.id = group_row.property_definition_id
where group_row.bid_type = 'Pairing'
  and property.bid_type = 'Pairing'
  and property.property_code = 112
  and group_row.operator is distinct from 'Json';

do $$
begin
  raise notice 'PBS Pairing Length 112 legacy rows targeted: %',
    (select count(*) from pbs_pairing_length_112_repair);
end $$;

do $$
begin
  if exists (
    select 1
    from pbs_pairing_length_112_repair repair
    where repair.operator not in ('=', '<', '>', 'Between')
      or repair.param_a is null
      or repair.param_a !~ '^[0-9]+$'
      or (repair.operator = 'Between' and (repair.param_b is null or repair.param_b !~ '^[0-9]+$'))
      or (repair.min_days is null and repair.max_days is null)
      or (repair.min_days is not null and repair.min_days not between 1 and 7)
      or (repair.max_days is not null and repair.max_days not between 1 and 7)
      or (repair.min_days is not null and repair.max_days is not null and repair.min_days > repair.max_days)
  ) then
    raise exception 'Found non-convertible Pairing Length 112 legacy rows.';
  end if;
end $$;

update pbs_bid_group group_row
set
  operator = 'Json',
  param_a = jsonb_build_object(
    'type', 'pairing-length-preference',
    'minDays', to_jsonb(repair.min_days),
    'maxDays', to_jsonb(repair.max_days),
    'dateScope', 'null'::jsonb,
    'min', 1,
    'max', 7
  )::text,
  param_b = null,
  param_c = null,
  updated_by = 'migration',
  updated_at = now()
from pbs_pairing_length_112_repair repair
where group_row.id = repair.id;

do $$
begin
  raise notice 'PBS Pairing Length 112 legacy rows repaired: %',
    (select count(*) from pbs_pairing_length_112_repair);

  if exists (
    select 1
    from pbs_bid_group group_row
    join pbs_bid_property property
      on property.id = group_row.property_definition_id
    where group_row.bid_type = 'Pairing'
      and property.bid_type = 'Pairing'
      and property.property_code = 112
      and group_row.operator is distinct from 'Json'
  ) then
    raise exception 'Pairing Length 112 legacy rows remain after repair.';
  end if;
end $$;

commit;
