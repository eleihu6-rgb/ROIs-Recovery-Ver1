-- Move property 428 Efficient Flying First from Line to Pairing.
-- The project is not live, so legacy Line 428 bids and favorites are removed.
-- Execute with search_path pointing at the target PBS schema.

begin;

create temporary table pbs_efficient_flying_428_property on commit drop as
select id
from pbs_bid_property
where property_code = 428;

create temporary table pbs_efficient_flying_428_groups on commit drop as
select distinct group_row.id, group_row.tier_id
from pbs_bid_group group_row
left join pbs_bid_property property_definition
  on property_definition.id = group_row.property_definition_id
where group_row.bid_type = 'Line'
  and (
    group_row.property_id = 428
    or property_definition.property_code = 428
  )
union
select distinct group_row.id, group_row.tier_id
from pbs_bid_group group_row
join pbs_bid_condition condition_row
  on condition_row.group_id = group_row.id
left join pbs_bid_property property_definition
  on property_definition.id = condition_row.property_definition_id
where group_row.bid_type = 'Line'
  and (
    condition_row.property_id = 428
    or property_definition.property_code = 428
  );

create temporary table pbs_efficient_flying_428_affected_tiers on commit drop as
select distinct tier_id as id
from pbs_efficient_flying_428_groups;

delete from pbs_bid_line_favorite favorite
where favorite.property_code = 428
   or favorite.property_id in (select id from pbs_efficient_flying_428_property);

delete from pbs_bid_pairing_configured_favorite favorite
where favorite.property_code = 428
   or favorite.property_id in (select id from pbs_efficient_flying_428_property);

delete from pbs_bid_pairing_favorite favorite
where favorite.property_code = 428
   or favorite.property_id in (select id from pbs_efficient_flying_428_property);

delete from pbs_bid_property_favorite favorite
where favorite.property_code = 428
   or favorite.property_id in (select id from pbs_efficient_flying_428_property);

delete from pbs_bid_condition condition_row
where condition_row.group_id in (select id from pbs_efficient_flying_428_groups);

delete from pbs_bid_group group_row
where group_row.id in (select id from pbs_efficient_flying_428_groups);

with reordered_groups as (
  select
    group_row.id,
    row_number() over (
      partition by group_row.tier_id
      order by group_row.group_seq, group_row.id
    )::smallint as next_group_seq
  from pbs_bid_group group_row
  where group_row.tier_id in (select id from pbs_efficient_flying_428_affected_tiers)
)
update pbs_bid_group group_row
set
  group_seq = reordered_groups.next_group_seq,
  updated_by = 'migration',
  updated_at = now()
from reordered_groups
where group_row.id = reordered_groups.id
  and group_row.group_seq is distinct from reordered_groups.next_group_seq;

update pbs_bid_tier tier
set
  total_groups = (
    select count(*)::smallint
    from pbs_bid_group group_row
    where group_row.tier_id = tier.id
  ),
  updated_by = 'migration',
  updated_at = now()
where tier.id in (select id from pbs_efficient_flying_428_affected_tiers)
  and tier.total_groups is distinct from (
    select count(*)::smallint
    from pbs_bid_group group_row
    where group_row.tier_id = tier.id
  );

insert into pbs_bid_property (
  property_code,
  bid_type,
  property_name,
  award_or_avoid,
  any_or_every,
  operator_options,
  validation_json,
  tooltip,
  source_type,
  is_visible_in_portal,
  display_order,
  recommended_order,
  recommended_usage_count,
  is_active,
  created_by,
  updated_by
) values (
  428,
  'Pairing',
  'Efficient Flying First',
  '["award"]',
  null,
  null,
  '{"type":"efficient_flying_preference","modes":["efficient","inefficient"]}',
  'Choose the company-defined top or bottom average daily credit band.',
  'app',
  1,
  6,
  6,
  0,
  1,
  'migration',
  'migration'
)
on conflict (property_code) do update set
  bid_type = excluded.bid_type,
  property_name = excluded.property_name,
  award_or_avoid = excluded.award_or_avoid,
  any_or_every = excluded.any_or_every,
  operator_options = excluded.operator_options,
  validation_json = excluded.validation_json,
  tooltip = excluded.tooltip,
  source_type = excluded.source_type,
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  recommended_order = excluded.recommended_order,
  recommended_usage_count = excluded.recommended_usage_count,
  is_active = excluded.is_active,
  updated_by = 'migration',
  updated_at = now();

update pbs_bid_property
set
  recommended_order = case property_code
    when 410 then 4
    when 427 then 5
    else recommended_order
  end,
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Line'
  and property_code in (410, 427);

do $$
declare
  live_schema text := case current_schema()
    when 'f8_pbs' then 'f8'
    else null
  end;
begin
  if live_schema is null then
    raise exception 'Unsupported PBS schema for Efficient Flying migration: %', current_schema();
  end if;

  execute format(
    $sql$
      insert into %I.dictionary as dictionary (
        parent_code,
        code,
        name,
        idx,
        code_value,
        updated_by
      ) values (
        'SYS_PARAM',
        'PBS_EFFICIENT_FLYING_CONFIG',
        'PBS efficient flying configuration',
        17,
        null,
        'migration'
      )
      on conflict (coalesce(parent_code, '___NULL___'), code)
      do update set
        name = excluded.name,
        idx = excluded.idx,
        updated_by = 'migration',
        updated_at = now()
    $sql$,
    live_schema
  );

  execute format(
    $sql$
      insert into %I.dictionary as dictionary (
        parent_code,
        code,
        name,
        idx,
        code_value,
        updated_by
      ) values (
        'PBS_EFFICIENT_FLYING_CONFIG',
        'PERCENTILE',
        'Efficient flying percentile',
        1,
        '20',
        'migration'
      )
      on conflict (coalesce(parent_code, '___NULL___'), code)
      do update set
        name = excluded.name,
        idx = excluded.idx,
        code_value = case
          when dictionary.code_value ~ '^[0-9]+$'
            and dictionary.code_value::integer between 1 and 50
          then dictionary.code_value
          else excluded.code_value
        end,
        updated_by = 'migration',
        updated_at = now()
    $sql$,
    live_schema
  );
end $$;

do $$
begin
  if (
    select count(*)
    from pbs_bid_property
    where property_code = 428
      and bid_type = 'Pairing'
      and is_active = 1
  ) <> 1 then
    raise exception 'Efficient Flying property 428 was not migrated to one active Pairing definition.';
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
    raise exception 'Legacy Line 428 bid groups remain after migration.';
  end if;

  if exists (
    select 1
    from pbs_bid_tier tier
    where tier.id in (select id from pbs_efficient_flying_428_affected_tiers)
      and tier.total_groups <> (
        select count(*)::smallint
        from pbs_bid_group group_row
        where group_row.tier_id = tier.id
      )
  ) then
    raise exception 'An affected pbs_bid_tier.total_groups value is inconsistent.';
  end if;

  if exists (
    select 1
    from (
      select
        group_row.tier_id,
        group_row.group_seq,
        row_number() over (
          partition by group_row.tier_id
          order by group_row.group_seq, group_row.id
        )::smallint as expected_group_seq
      from pbs_bid_group group_row
      where group_row.tier_id in (select id from pbs_efficient_flying_428_affected_tiers)
    ) ordered_groups
    where ordered_groups.group_seq <> ordered_groups.expected_group_seq
  ) then
    raise exception 'An affected pbs_bid_group.group_seq is not contiguous.';
  end if;
end $$;

commit;
