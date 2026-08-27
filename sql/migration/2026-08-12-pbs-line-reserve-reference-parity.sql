-- Restore Line property 427 from Reserve Avoidance to canonical Reserve.
-- Execute with search_path pointing at the target PBS schema.
-- This migration is intentionally non-destructive: legacy 427 crew data must be
-- reviewed separately, so the migration aborts if any non-canonical 427 rows exist.

begin;

lock table pbs_bid_property in row exclusive mode;

create temporary table pbs_line_reserve_427_definition on commit drop as
select id, property_code
from pbs_bid_property
where bid_type = 'Line'
  and property_code = 427;

create temporary table pbs_line_reserve_427_noncanonical_groups on commit drop as
select g.id, g.bid_id, g.property_group_key
from pbs_bid_group g
where g.bid_type = 'Line'
  and (
    g.property_id = 427
    or g.property_definition_id in (select id from pbs_line_reserve_427_definition)
  )
  and not (
    g.action_id in (1, 2)
    and g.operator is null
    and g.param_a is null
    and g.param_b is null
    and g.param_c is null
  );

create temporary table pbs_line_reserve_427_condition_refs on commit drop as
select c.id, c.bid_id, g.property_group_key
from pbs_bid_condition c
join pbs_bid_group g on g.id = c.group_id
where g.bid_type = 'Line'
  and (
    c.property_id = 427
    or c.property_definition_id in (select id from pbs_line_reserve_427_definition)
  );

create temporary table pbs_line_reserve_427_noncanonical_line_favorites on commit drop as
select favorite.id, favorite.bid_id
from pbs_bid_line_favorite favorite
where (
    favorite.property_code = 427
    or favorite.property_id in (select id from pbs_line_reserve_427_definition)
  )
  and not (
    favorite.action in ('award', 'avoid')
    and favorite.bid_payload = '{"type":"flag"}'::jsonb
  );

create temporary table pbs_line_reserve_427_generic_favorites on commit drop as
select favorite.id, favorite.bid_id
from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Line'
  and (
    favorite.property_code = 427
    or favorite.property_id in (select id from pbs_line_reserve_427_definition)
  );

do $$
declare
  noncanonical_group_count integer;
  condition_ref_count integer;
  noncanonical_line_favorite_count integer;
  generic_favorite_count integer;
begin
  select count(*) into noncanonical_group_count
  from pbs_line_reserve_427_noncanonical_groups;

  select count(*) into condition_ref_count
  from pbs_line_reserve_427_condition_refs;

  select count(*) into noncanonical_line_favorite_count
  from pbs_line_reserve_427_noncanonical_line_favorites;

  select count(*) into generic_favorite_count
  from pbs_line_reserve_427_generic_favorites;

  if noncanonical_group_count > 0
    or condition_ref_count > 0
    or noncanonical_line_favorite_count > 0
    or generic_favorite_count > 0 then
    raise exception
      'Line Reserve 427 migration found non-canonical crew data: groups=%, conditions=%, line_favorites=%, generic_favorites=%. Resolve explicitly before rerunning.',
      noncanonical_group_count,
      condition_ref_count,
      noncanonical_line_favorite_count,
      generic_favorite_count;
  end if;
end $$;

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
  is_active,
  created_by,
  updated_by
)
values (
  427,
  'Line',
  'Reserve',
  '["award","avoid"]',
  null,
  null,
  '{"type":"flag"}',
  'Line whole-month Reserve preference; Award means reserve-only and Avoid means no reserve.',
  'aa',
  1,
  5,
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
  is_active = excluded.is_active,
  updated_by = 'migration',
  updated_at = now();

insert into pbs_bid_property_context (
  property_id,
  bid_context,
  is_visible_in_portal,
  display_order,
  created_by,
  updated_by
)
select
  property.id,
  context.bid_context,
  case when context.bid_context in ('Current', 'StandingLineholder') then 1 else 0 end,
  case when context.bid_context in ('Current', 'StandingLineholder') then 5 else null end,
  'migration',
  'migration'
from pbs_bid_property property
cross join (
  values
    ('Current'::varchar(24)),
    ('StandingLineholder'::varchar(24)),
    ('StandingReserve'::varchar(24))
) as context(bid_context)
where property.bid_type = 'Line'
  and property.property_code = 427
on conflict (property_id, bid_context) do update set
  is_visible_in_portal = excluded.is_visible_in_portal,
  display_order = excluded.display_order,
  updated_by = 'migration',
  updated_at = now();

commit;
