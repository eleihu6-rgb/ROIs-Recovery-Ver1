-- Verify PBS Pairing property 112 rows use the current runtime JSON contract.

begin;

do $$
begin
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
    raise exception 'Legacy Pairing Length 112 operator rows remain.';
  end if;

  if exists (
    select 1
    from pbs_bid_group group_row
    join pbs_bid_property property
      on property.id = group_row.property_definition_id
    cross join lateral (
      select group_row.param_a::jsonb as payload
    ) parsed
    where group_row.bid_type = 'Pairing'
      and property.bid_type = 'Pairing'
      and property.property_code = 112
      and (
        parsed.payload->>'type' <> 'pairing-length-preference'
        or not (parsed.payload ? 'minDays')
        or not (parsed.payload ? 'maxDays')
        or (
          parsed.payload ? 'min'
          and (
            jsonb_typeof(parsed.payload->'min') <> 'number'
            or (parsed.payload->>'min')::integer < 1
          )
        )
        or (
          parsed.payload ? 'max'
          and (
            jsonb_typeof(parsed.payload->'max') <> 'number'
            or (parsed.payload->>'max')::integer < 1
          )
        )
        or ((parsed.payload->'minDays') = 'null'::jsonb and (parsed.payload->'maxDays') = 'null'::jsonb)
        or ((parsed.payload->'minDays') <> 'null'::jsonb and (
          jsonb_typeof(parsed.payload->'minDays') <> 'number'
          or (parsed.payload->>'minDays')::integer < 1
        ))
        or ((parsed.payload->'maxDays') <> 'null'::jsonb and (
          jsonb_typeof(parsed.payload->'maxDays') <> 'number'
          or (parsed.payload->>'maxDays')::integer < 1
        ))
        or (
          (parsed.payload->'minDays') <> 'null'::jsonb
          and (parsed.payload->'maxDays') <> 'null'::jsonb
          and (parsed.payload->>'minDays')::integer > (parsed.payload->>'maxDays')::integer
        )
        or not (
          not (parsed.payload ? 'dateScope')
          or parsed.payload->'dateScope' = 'null'::jsonb
          or (
            jsonb_typeof(parsed.payload->'dateScope') = 'object'
            and parsed.payload->'dateScope'->>'mode' = 'specific_dates'
            and jsonb_typeof(parsed.payload->'dateScope'->'dates') = 'array'
            and jsonb_array_length(parsed.payload->'dateScope'->'dates') > 0
            and not exists (
              select 1
              from jsonb_array_elements_text(parsed.payload->'dateScope'->'dates') date_value
              where date_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            )
          )
          or (
            jsonb_typeof(parsed.payload->'dateScope') = 'object'
            and parsed.payload->'dateScope'->>'mode' = 'date_range'
            and parsed.payload->'dateScope'->>'from' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and parsed.payload->'dateScope'->>'to' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and parsed.payload->'dateScope'->>'from' <= parsed.payload->'dateScope'->>'to'
          )
        )
      )
  ) then
    raise exception 'Invalid Pairing Length 112 JSON payload remains.';
  end if;

  if exists (
    select 1
    from pbs_bid_group group_row
    join pbs_bid bid on bid.id = group_row.bid_id
    join pbs_bid_property property
      on property.id = group_row.property_definition_id
    where bid.crew_id = '73'
      and bid.period_code = 'Jun 2026'
      and group_row.bid_type = 'Pairing'
      and property.bid_type = 'Pairing'
      and property.property_code = 112
      and (
        group_row.operator <> 'Json'
        or group_row.param_a::jsonb->>'type' <> 'pairing-length-preference'
        or group_row.param_a::jsonb->>'minDays' <> '3'
        or group_row.param_a::jsonb->'maxDays' <> 'null'::jsonb
      )
  ) then
    raise exception 'Crew 73 Pairing Length 112 row was not repaired as expected.';
  end if;
end $$;

commit;
