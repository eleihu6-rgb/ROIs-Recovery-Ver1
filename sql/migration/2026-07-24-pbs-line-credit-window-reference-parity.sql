-- Align PBS Line Credit Window Preference with the solver CSV contract.
-- Portal property 429 stores only direction; CSV exports 401/402 with DELTA_HOURS.

begin;

do $$
declare
  live_schema text := case current_schema()
    when 'f8_pbs' then 'f8'
    else null
  end;
begin
  if live_schema is null then
    raise exception 'Unsupported PBS schema for Credit Window migration: %', current_schema();
  end if;

  execute format(
    $sql$
      delete from %I.dictionary
      where parent_code = 'PBS_LINE_CREDIT_WINDOW_CONFIG'
        and code in (
          'MMG_CREDIT',
          'OVERTIME_THRESHOLD',
          'LOW_MIN_CREDIT',
          'LOW_MAX_CREDIT',
          'HIGH_MIN_CREDIT',
          'HIGH_MAX_CREDIT'
        )
    $sql$,
    live_schema
  );

  execute format(
    $sql$
      insert into %I.dictionary as dictionary (parent_code, code, name, idx, code_value)
      values (
        'PBS_LINE_CREDIT_WINDOW_CONFIG',
        'DELTA_HOURS',
        'Credit window adjustment hours',
        1,
        '5'
      )
      on conflict (coalesce(parent_code, '___NULL___'), code)
      do update set
        name = excluded.name,
        idx = excluded.idx,
        code_value = case
          when coalesce(dictionary.code_value, '') = '' then excluded.code_value
          else dictionary.code_value
        end,
        updated_by = 'migration',
        updated_at = now()
    $sql$,
    live_schema
  );
end $$;

update pbs_bid_property
set
  validation_json = '{"type":"credit_window_preference","directions":["more","less"]}'::jsonb,
  tooltip = 'Choose More credit or Less credit. The adjustment is company-defined.',
  updated_by = 'migration',
  updated_at = now()
where property_code = 429;

update pbs_bid_group
set
  param_a = jsonb_build_object(
    'type',
    'credit-window-preference',
    'direction',
    case param_a::jsonb ->> 'mode'
      when 'high' then 'more'
      when 'low' then 'less'
    end
  )::text,
  param_b = null,
  param_c = null,
  updated_by = 'migration',
  updated_at = now()
where coalesce(
    (
      select property_code
      from pbs_bid_property
      where pbs_bid_property.id = pbs_bid_group.property_definition_id
    ),
    pbs_bid_group.property_id
  ) = 429
  and param_a is not null
  and case
    when pg_input_is_valid(param_a, 'jsonb') then
      param_a::jsonb ->> 'type' = 'credit-window-preference'
      and param_a::jsonb ->> 'mode' in ('high', 'low')
    else false
  end;

update pbs_bid_line_favorite
set
  bid_payload = jsonb_build_object(
    'type',
    'credit-window-preference',
    'direction',
    case bid_payload ->> 'mode'
      when 'high' then 'more'
      when 'low' then 'less'
    end
  ),
  updated_by = 'migration',
  updated_at = now()
where property_code = 429
  and bid_payload ->> 'type' = 'credit-window-preference'
  and bid_payload ->> 'mode' in ('high', 'low');

create temporary table credit_window_custom_groups on commit drop as
select id, tier_id
from pbs_bid_group
where coalesce(
    (
      select property_code
      from pbs_bid_property
      where pbs_bid_property.id = pbs_bid_group.property_definition_id
    ),
    pbs_bid_group.property_id
  ) = 429
  and param_a is not null
  and case
    when pg_input_is_valid(param_a, 'jsonb') then
      param_a::jsonb ->> 'type' = 'credit-window-preference'
      and param_a::jsonb ->> 'mode' = 'custom'
    else false
  end;

delete from pbs_bid_group
where id in (select id from credit_window_custom_groups);

delete from pbs_bid_line_favorite
where property_code = 429
  and bid_payload ->> 'type' = 'credit-window-preference'
  and bid_payload ->> 'mode' = 'custom';

with resequenced as (
  select
    id,
    row_number() over (
      partition by tier_id
      order by group_seq, id
    )::smallint as next_group_seq
  from pbs_bid_group
  where tier_id in (select distinct tier_id from credit_window_custom_groups)
)
update pbs_bid_group
set
  group_seq = resequenced.next_group_seq,
  updated_by = 'migration',
  updated_at = now()
from resequenced
where pbs_bid_group.id = resequenced.id
  and pbs_bid_group.group_seq <> resequenced.next_group_seq;

update pbs_bid_tier
set
  total_groups = (
    select count(*)::smallint
    from pbs_bid_group
    where pbs_bid_group.tier_id = pbs_bid_tier.id
  ),
  updated_by = 'migration',
  updated_at = now()
where id in (select distinct tier_id from credit_window_custom_groups);

commit;
