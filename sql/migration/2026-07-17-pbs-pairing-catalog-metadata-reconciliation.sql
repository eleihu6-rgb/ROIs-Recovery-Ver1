-- Reconcile Pairing catalog metadata for properties 103, 107, and 112.
-- Execute with search_path pointing at exactly one target PBS schema.
-- Valid current rows are preserved; only rows that fail the current storage
-- contract are removed.

begin;

create or replace function pg_temp.pbs_try_jsonb(value text)
returns jsonb
language plpgsql
immutable
as $$
begin
  return value::jsonb;
exception when others then
  return null;
end;
$$;

create or replace function pg_temp.pbs_json_integer(value jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(value) = 'number'
    and (value #>> '{}') ~ '^-?[0-9]+$';
$$;

create or replace function pg_temp.pbs_only_keys(value jsonb, allowed text[])
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1
      from jsonb_object_keys(value) key_name
      where not (key_name = any(allowed))
    );
$$;

create or replace function pg_temp.pbs_valid_iso_date(value text)
returns boolean
language plpgsql
immutable
as $$
declare
  parsed date;
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;
  parsed := to_date(value, 'YYYY-MM-DD');
  return to_char(parsed, 'YYYY-MM-DD') = value;
exception when others then
  return false;
end;
$$;

create or replace function pg_temp.pbs_date_in_period(value text, period_code text)
returns boolean
language plpgsql
immutable
as $$
declare
  month_number integer;
  period_year integer;
  parsed date;
begin
  if not pg_temp.pbs_valid_iso_date(value)
    or period_code is null
    or split_part(trim(period_code), ' ', 2) !~ '^[0-9]{4}$' then
    return false;
  end if;

  month_number := case upper(left(split_part(trim(period_code), ' ', 1), 3))
    when 'JAN' then 1 when 'FEB' then 2 when 'MAR' then 3
    when 'APR' then 4 when 'MAY' then 5 when 'JUN' then 6
    when 'JUL' then 7 when 'AUG' then 8 when 'SEP' then 9
    when 'OCT' then 10 when 'NOV' then 11 when 'DEC' then 12
    else null
  end;
  period_year := split_part(trim(period_code), ' ', 2)::integer;
  parsed := value::date;
  return month_number is not null
    and extract(month from parsed)::integer = month_number
    and extract(year from parsed)::integer = period_year;
exception when others then
  return false;
end;
$$;

create or replace function pg_temp.pbs_valid_date_scope(scope jsonb, period_code text)
returns boolean
language plpgsql
immutable
as $$
begin
  if scope is null or scope = 'null'::jsonb then
    return true;
  end if;

  if jsonb_typeof(scope) <> 'object' then
    return false;
  end if;

  if scope->>'mode' = 'specific_dates' then
    return pg_temp.pbs_only_keys(scope, array['mode', 'dates'])
      and jsonb_typeof(scope->'dates') = 'array'
      and jsonb_array_length(scope->'dates') > 0
      and not exists (
        select 1
        from jsonb_array_elements(scope->'dates') item
        where jsonb_typeof(item) <> 'string'
          or not pg_temp.pbs_date_in_period(item #>> '{}', period_code)
      );
  end if;

  if scope->>'mode' = 'date_range' then
    return pg_temp.pbs_only_keys(scope, array['mode', 'from', 'to'])
      and pg_temp.pbs_date_in_period(scope->>'from', period_code)
      and pg_temp.pbs_date_in_period(scope->>'to', period_code)
      and scope->>'from' <= scope->>'to';
  end if;

  return false;
end;
$$;

create or replace function pg_temp.pbs_valid_target_payload(
  property_code integer,
  payload jsonb,
  period_code text
)
returns boolean
language plpgsql
immutable
as $$
declare
  operator_value text;
  min_days jsonb;
  max_days jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return false;
  end if;

  if property_code = 103 then
    operator_value := payload->>'operator';
    if payload->>'type' <> 'pairing-check-time'
      or payload->>'timeType' not in ('check_in', 'check_out')
      or operator_value not in ('=', '<', '>', 'Between')
      or not pg_temp.pbs_valid_date_scope(payload->'dateScope', period_code) then
      return false;
    end if;
    if operator_value = 'Between' then
      return pg_temp.pbs_only_keys(payload, array['type','timeType','operator','from','to','dateScope'])
        and coalesce(payload->>'from', '') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        and coalesce(payload->>'to', '') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$';
    end if;
    return pg_temp.pbs_only_keys(payload, array['type','timeType','operator','value','dateScope'])
      and coalesce(payload->>'value', '') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$';
  end if;

  if property_code = 107 then
    operator_value := payload->>'operator';
    if payload->>'type' <> 'flight-legs-per-duty'
      or operator_value not in ('=', '<', '>', 'Between')
      or not pg_temp.pbs_valid_date_scope(payload->'dateScope', period_code) then
      return false;
    end if;
    if operator_value = 'Between' then
      return pg_temp.pbs_only_keys(payload, array['type','operator','from','to','dateScope'])
        and pg_temp.pbs_json_integer(payload->'from')
        and pg_temp.pbs_json_integer(payload->'to')
        and (payload->>'from')::integer between 1 and 8
        and (payload->>'to')::integer between 1 and 8
        and (payload->>'from')::integer <= (payload->>'to')::integer;
    end if;
    return pg_temp.pbs_only_keys(payload, array['type','operator','legs','dateScope'])
      and pg_temp.pbs_json_integer(payload->'legs')
      and (payload->>'legs')::integer between 1 and 8;
  end if;

  if property_code = 112 and payload->>'type' = 'pairing-length-preference' then
    if not pg_temp.pbs_only_keys(payload, array['type','minDays','maxDays','dateScope','min','max'])
      or not pg_temp.pbs_valid_date_scope(payload->'dateScope', period_code) then
      return false;
    end if;
    min_days := payload->'minDays';
    max_days := payload->'maxDays';
    if (min_days is null or min_days = 'null'::jsonb)
      and (max_days is null or max_days = 'null'::jsonb) then
      return false;
    end if;
    if min_days is not null and min_days <> 'null'::jsonb
      and (not pg_temp.pbs_json_integer(min_days) or (min_days #>> '{}')::integer not between 1 and 7) then
      return false;
    end if;
    if max_days is not null and max_days <> 'null'::jsonb
      and (not pg_temp.pbs_json_integer(max_days) or (max_days #>> '{}')::integer not between 1 and 7) then
      return false;
    end if;
    if min_days is not null and min_days <> 'null'::jsonb
      and max_days is not null and max_days <> 'null'::jsonb
      and (min_days #>> '{}')::integer > (max_days #>> '{}')::integer then
      return false;
    end if;
    return (not (payload ? 'min') or pg_temp.pbs_json_integer(payload->'min'))
      and (not (payload ? 'max') or pg_temp.pbs_json_integer(payload->'max'));
  end if;

  if property_code = 112 and payload->>'type' = 'stepper' then
    return pg_temp.pbs_only_keys(payload, array['type','value','min','max','operator'])
      and pg_temp.pbs_json_integer(payload->'value')
      and (not (payload ? 'min') or pg_temp.pbs_json_integer(payload->'min'))
      and (not (payload ? 'max') or pg_temp.pbs_json_integer(payload->'max'))
      and (not (payload ? 'operator') or payload->>'operator' in ('=', '<', '>'));
  end if;

  if property_code = 112 and payload->>'type' = 'stepper-range' then
    return pg_temp.pbs_only_keys(payload, array['type','from','to','min','max'])
      and pg_temp.pbs_json_integer(payload->'from')
      and pg_temp.pbs_json_integer(payload->'to')
      and (not (payload ? 'min') or pg_temp.pbs_json_integer(payload->'min'))
      and (not (payload ? 'max') or pg_temp.pbs_json_integer(payload->'max'));
  end if;

  return false;
end;
$$;

create temporary table pbs_catalog_reconcile_definitions on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Pairing'
  and property_code in (103, 107, 112);

do $$
begin
  if (select count(*) from pbs_catalog_reconcile_definitions) <> 3 then
    raise exception 'Expected exactly one Pairing property definition for each of 103, 107, and 112.';
  end if;

  if exists (
    select 1
    from pbs_bid_group row_value
    left join pbs_catalog_reconcile_definitions stable on stable.id = row_value.property_definition_id
    left join pbs_catalog_reconcile_definitions legacy on legacy.property_code = row_value.property_id
    where (stable.id is not null or legacy.id is not null)
      and (stable.id is null or legacy.id is null or stable.property_code <> legacy.property_code)
  ) or exists (
    select 1
    from pbs_bid_condition row_value
    left join pbs_catalog_reconcile_definitions stable on stable.id = row_value.property_definition_id
    left join pbs_catalog_reconcile_definitions legacy on legacy.property_code = row_value.property_id
    where (stable.id is not null or legacy.id is not null)
      and (stable.id is null or legacy.id is null or stable.property_code <> legacy.property_code)
  ) or exists (
    select 1
    from pbs_bid_pairing_configured_favorite row_value
    left join pbs_catalog_reconcile_definitions stable on stable.id = row_value.property_id
    left join pbs_catalog_reconcile_definitions legacy on legacy.property_code = row_value.property_code
    where (stable.id is not null or legacy.id is not null)
      and (stable.id is null or legacy.id is null or stable.property_code <> legacy.property_code)
  ) then
    raise exception 'Stable and legacy property identities conflict for 103, 107, or 112.';
  end if;
end $$;

create temporary table pbs_catalog_reconcile_invalid_keys on commit drop as
select distinct group_row.bid_id, group_row.bid_type, group_row.property_group_key
from pbs_bid_group group_row
join pbs_catalog_reconcile_definitions definition
  on definition.id = group_row.property_definition_id
join pbs_bid bid on bid.id = group_row.bid_id
where group_row.bid_type is distinct from 'Pairing'
   or group_row.action_id is null
   or group_row.action_id not in (1, 2)
   or (
     definition.property_code = 107
     and (group_row.param_c is null or group_row.param_c not in ('any', 'every'))
   )
   or (
     definition.property_code in (103, 112)
     and group_row.param_c is not null
   )
   or (
     definition.property_code = 112
     and group_row.operator is distinct from 'Json'
     and not (
       (group_row.operator in ('=', '<', '>')
         and coalesce(group_row.param_a, '') ~ '^-?[0-9]+$'
         and group_row.param_b is null)
       or
       (group_row.operator = 'Between'
         and coalesce(group_row.param_a, '') ~ '^-?[0-9]+$'
         and coalesce(group_row.param_b, '') ~ '^-?[0-9]+$')
     )
   )
   or (
     (definition.property_code <> 112 or group_row.operator = 'Json')
     and (
       group_row.operator is distinct from 'Json'
       or not pg_temp.pbs_valid_target_payload(
         definition.property_code,
         pg_temp.pbs_try_jsonb(group_row.param_a),
         bid.period_code
       )
     )
   )
union
select distinct group_row.bid_id, group_row.bid_type, group_row.property_group_key
from pbs_bid_condition condition_row
join pbs_catalog_reconcile_definitions definition
  on definition.id = condition_row.property_definition_id
join pbs_bid_group group_row on group_row.id = condition_row.group_id
join pbs_bid bid on bid.id = group_row.bid_id
where group_row.bid_type is distinct from 'Pairing'
   or group_row.action_id is null
   or group_row.action_id not in (1, 2)
   or (definition.property_code = 107 and (condition_row.param_c is null or condition_row.param_c not in ('any', 'every')))
   or (definition.property_code in (103, 112) and condition_row.param_c is not null)
   or condition_row.operator is distinct from 'Json'
   or not pg_temp.pbs_valid_target_payload(
     definition.property_code,
     pg_temp.pbs_try_jsonb(condition_row.param_a),
     bid.period_code
   );

create temporary table pbs_catalog_reconcile_invalid_groups on commit drop as
select group_row.id, group_row.bid_id, group_row.tier_id
from pbs_bid_group group_row
join pbs_catalog_reconcile_invalid_keys target
  on target.bid_id = group_row.bid_id
  and target.bid_type is not distinct from group_row.bid_type
  and target.property_group_key = group_row.property_group_key;

create temporary table pbs_catalog_reconcile_invalid_favorites on commit drop as
select favorite.id, favorite.bid_id
from pbs_bid_pairing_configured_favorite favorite
join pbs_catalog_reconcile_definitions definition on definition.id = favorite.property_id
join pbs_bid bid on bid.id = favorite.bid_id
where favorite.action is null
   or favorite.action not in ('award', 'avoid')
   or (definition.property_code = 107 and (favorite.quantifier is null or favorite.quantifier not in ('any', 'every')))
   or (definition.property_code in (103, 112) and favorite.quantifier is not null)
   or not pg_temp.pbs_valid_target_payload(definition.property_code, favorite.bid_payload, bid.period_code);

create temporary table pbs_catalog_reconcile_affected_tiers on commit drop as
select distinct tier_id as id from pbs_catalog_reconcile_invalid_groups;

create temporary table pbs_catalog_reconcile_affected_bids on commit drop as
select distinct bid_id as id from pbs_catalog_reconcile_invalid_groups
union
select distinct bid_id from pbs_catalog_reconcile_invalid_favorites;

do $$
declare
  favorite_delete_count integer;
  condition_delete_count integer;
  group_delete_count integer;
  tier_delete_count integer;
  bid_delete_count integer;
  metadata_update_count integer;
begin
  raise notice 'Pairing catalog reconciliation preflight: invalid rule keys=%, invalid groups=%, invalid configured favorites=%',
    (select count(*) from pbs_catalog_reconcile_invalid_keys),
    (select count(*) from pbs_catalog_reconcile_invalid_groups),
    (select count(*) from pbs_catalog_reconcile_invalid_favorites);

  delete from pbs_bid_pairing_configured_favorite
  where id in (select id from pbs_catalog_reconcile_invalid_favorites);
  get diagnostics favorite_delete_count = row_count;

  delete from pbs_bid_condition
  where group_id in (select id from pbs_catalog_reconcile_invalid_groups);
  get diagnostics condition_delete_count = row_count;

  delete from pbs_bid_group
  where id in (select id from pbs_catalog_reconcile_invalid_groups);
  get diagnostics group_delete_count = row_count;

  update pbs_bid_tier tier
  set total_groups = (
        select count(*)::smallint from pbs_bid_group group_row where group_row.tier_id = tier.id
      ),
      updated_at = now()
  where tier.id in (select id from pbs_catalog_reconcile_affected_tiers)
    and tier.total_groups is distinct from (
      select count(*)::smallint from pbs_bid_group group_row where group_row.tier_id = tier.id
    );

  delete from pbs_bid_tier tier
  where tier.id in (select id from pbs_catalog_reconcile_affected_tiers)
    and not exists (select 1 from pbs_bid_group group_row where group_row.tier_id = tier.id)
    and not exists (select 1 from pbs_bid_day_off day_off where day_off.tier_id = tier.id)
    and not exists (select 1 from pbs_bid_pairing_occurrence occurrence_row where occurrence_row.tier_id = tier.id);
  get diagnostics tier_delete_count = row_count;

  update pbs_bid bid
  set total_tiers = (
        select count(*)::smallint from pbs_bid_tier tier where tier.bid_id = bid.id
      ),
      updated_at = now()
  where bid.id in (select id from pbs_catalog_reconcile_affected_bids)
    and bid.total_tiers is distinct from (
      select count(*)::smallint from pbs_bid_tier tier where tier.bid_id = bid.id
    );

  delete from pbs_bid bid
  where bid.id in (select id from pbs_catalog_reconcile_affected_bids)
    and not exists (select 1 from pbs_bid_tier tier where tier.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_day_off day_off where day_off.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_occurrence occurrence_row where occurrence_row.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_pairing_configured_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_days_off_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = bid.id);
  get diagnostics bid_delete_count = row_count;

  update pbs_bid_property
  set operator_options = case property_code
        when 103 then '["=","<",">","Between"]'
        when 107 then '["<","=",">","Between"]'
        when 112 then null
      end,
      validation_json = case property_code
        when 103 then '{"type":"pairing-check-time","timeType":["check_in","check_out"],"timeWindow":["=","<",">","Between"],"dateScope":["specific_dates","date_range"]}'
        when 107 then '{"type":"flight-legs-per-duty","label":"Legs","min":1,"max":8,"dateScope":["specific_dates","date_range"]}'
        when 112 then '{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":["specific_dates","date_range"]}'
      end,
      tooltip = case property_code
        when 103 then 'Award or avoid pairings by check-in or check-out time, optionally limited to pairing dates.'
        when 107 then 'Award or avoid pairings by FLY legs per duty, optionally limited to event dates.'
        when 112 then 'Award or avoid pairings by pairing length, optionally limited to pairing start dates.'
      end,
      updated_at = now()
  where bid_type = 'Pairing'
    and property_code in (103, 107, 112)
    and (
      operator_options is distinct from case property_code
        when 103 then '["=","<",">","Between"]'
        when 107 then '["<","=",">","Between"]'
        when 112 then null
      end
      or pg_temp.pbs_try_jsonb(validation_json) is distinct from case property_code
        when 103 then '{"type":"pairing-check-time","timeType":["check_in","check_out"],"timeWindow":["=","<",">","Between"],"dateScope":["specific_dates","date_range"]}'::jsonb
        when 107 then '{"type":"flight-legs-per-duty","label":"Legs","min":1,"max":8,"dateScope":["specific_dates","date_range"]}'::jsonb
        when 112 then '{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":["specific_dates","date_range"]}'::jsonb
      end
      or tooltip is distinct from case property_code
        when 103 then 'Award or avoid pairings by check-in or check-out time, optionally limited to pairing dates.'
        when 107 then 'Award or avoid pairings by FLY legs per duty, optionally limited to event dates.'
        when 112 then 'Award or avoid pairings by pairing length, optionally limited to pairing start dates.'
      end
    );
  get diagnostics metadata_update_count = row_count;

  raise notice 'Pairing catalog reconciliation applied: configured favorites=%, conditions=%, groups=%, empty tiers=%, empty bids=%, metadata updates=%',
    favorite_delete_count, condition_delete_count, group_delete_count,
    tier_delete_count, bid_delete_count, metadata_update_count;
end $$;

do $$
begin
  if exists (
    select 1
    from pbs_bid_property
    where bid_type = 'Pairing'
      and (
        (property_code = 103 and (
          operator_options is distinct from '["=","<",">","Between"]'
          or validation_json::jsonb is distinct from '{"type":"pairing-check-time","timeType":["check_in","check_out"],"timeWindow":["=","<",">","Between"],"dateScope":["specific_dates","date_range"]}'::jsonb
        ))
        or
        (property_code = 107 and (
          operator_options is distinct from '["<","=",">","Between"]'
          or validation_json::jsonb is distinct from '{"type":"flight-legs-per-duty","label":"Legs","min":1,"max":8,"dateScope":["specific_dates","date_range"]}'::jsonb
        ))
        or
        (property_code = 112 and (
          operator_options is not null
          or validation_json::jsonb is distinct from '{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":["specific_dates","date_range"]}'::jsonb
        ))
      )
  ) then
    raise exception 'Pairing catalog metadata reconciliation failed its final assertion.';
  end if;
end $$;

commit;
