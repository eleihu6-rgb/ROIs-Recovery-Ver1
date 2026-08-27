-- Remove Fulfilment from Pairing property 168 Airport Preference.
-- Execute with search_path pointing at exactly one target PBS schema.
-- The project is not live: existing Airport Preference groups and favorites are deleted.

begin;

do $$
declare
  target_property_id bigint;
begin
  if (
    select count(*)
    from pbs_bid_property
    where property_code = 168
      and bid_type = 'Pairing'
  ) <> 1 then
    raise exception 'Expected exactly one Pairing property definition for property 168.';
  end if;

  select id
  into target_property_id
  from pbs_bid_property
  where property_code = 168
    and bid_type = 'Pairing';

  if exists (
    select 1
    from pbs_bid_group
    where bid_type is distinct from 'Pairing'
      and (
        property_definition_id = target_property_id
        or property_id = 168
      )
  ) then
    raise exception 'Property 168 is referenced by a non-Pairing bid group.';
  end if;

  if exists (
    select 1
    from pbs_bid_condition condition_row
    join pbs_bid_group group_row on group_row.id = condition_row.group_id
    where group_row.bid_type is distinct from 'Pairing'
      and (
        condition_row.property_definition_id = target_property_id
        or condition_row.property_id = 168
      )
  ) then
    raise exception 'Property 168 is referenced by a condition in a non-Pairing bid group.';
  end if;

  if exists (
    select 1
    from pbs_bid_property_favorite
    where bid_type is distinct from 'Pairing'
      and (
        property_id = target_property_id
        or property_code = 168
      )
  ) then
    raise exception 'Property 168 is referenced by a non-Pairing generic favorite.';
  end if;

  if exists (
    select 1
    from pbs_bid_days_off_favorite
    where property_id = target_property_id
      or property_code = 168
  ) then
    raise exception 'Property 168 is referenced by a Days Off favorite.';
  end if;

  if exists (
    select 1
    from pbs_bid_line_favorite
    where property_id = target_property_id
      or property_code = 168
  ) then
    raise exception 'Property 168 is referenced by a Line favorite.';
  end if;
end $$;

create temporary table pbs_airport_168_definition on commit drop as
select id
from pbs_bid_property
where property_code = 168
  and bid_type = 'Pairing';

create temporary table pbs_airport_168_target_group_keys on commit drop as
select distinct group_row.bid_id, group_row.bid_type, group_row.property_group_key
from pbs_bid_group group_row
where group_row.bid_type = 'Pairing'
  and (
    group_row.property_definition_id in (select id from pbs_airport_168_definition)
    or group_row.property_id = 168
  )
union
select distinct group_row.bid_id, group_row.bid_type, group_row.property_group_key
from pbs_bid_group group_row
join pbs_bid_condition condition_row on condition_row.group_id = group_row.id
where group_row.bid_type = 'Pairing'
  and (
    condition_row.property_definition_id in (select id from pbs_airport_168_definition)
    or condition_row.property_id = 168
  );

create temporary table pbs_airport_168_target_groups on commit drop as
select group_row.id, group_row.bid_id, group_row.tier_id, group_row.property_group_key
from pbs_bid_group group_row
join pbs_airport_168_target_group_keys target
  on target.bid_id = group_row.bid_id
  and target.bid_type is not distinct from group_row.bid_type
  and target.property_group_key = group_row.property_group_key;

create temporary table pbs_airport_168_target_occurrences on commit drop as
select occurrence_row.id
from pbs_bid_pairing_occurrence occurrence_row
where occurrence_row.group_id in (select id from pbs_airport_168_target_groups);

create temporary table pbs_airport_168_target_configured_favorites on commit drop as
select favorite.id, favorite.bid_id
from pbs_bid_pairing_configured_favorite favorite
where favorite.property_id in (select id from pbs_airport_168_definition)
  or favorite.property_code = 168;

create temporary table pbs_airport_168_target_simple_favorites on commit drop as
select favorite.id, favorite.bid_id
from pbs_bid_pairing_favorite favorite
where favorite.property_id in (select id from pbs_airport_168_definition)
  or favorite.property_code = 168;

create temporary table pbs_airport_168_target_generic_favorites on commit drop as
select favorite.id, favorite.bid_id
from pbs_bid_property_favorite favorite
where favorite.bid_type = 'Pairing'
  and (
    favorite.property_id in (select id from pbs_airport_168_definition)
    or favorite.property_code = 168
  );

create temporary table pbs_airport_168_affected_tiers on commit drop as
select distinct tier_id as id
from pbs_airport_168_target_groups;

create temporary table pbs_airport_168_affected_bids on commit drop as
select distinct bid_id as id from pbs_airport_168_target_groups
union
select distinct bid_id from pbs_airport_168_target_configured_favorites
union
select distinct bid_id from pbs_airport_168_target_simple_favorites
union
select distinct bid_id from pbs_airport_168_target_generic_favorites;

create temporary table pbs_airport_168_expected_empty_tiers on commit drop as
select tier.id
from pbs_bid_tier tier
where tier.id in (select id from pbs_airport_168_affected_tiers)
  and not exists (
    select 1
    from pbs_bid_group group_row
    where group_row.tier_id = tier.id
      and group_row.id not in (select id from pbs_airport_168_target_groups)
  )
  and not exists (
    select 1
    from pbs_bid_day_off day_off
    where day_off.tier_id = tier.id
  )
  and not exists (
    select 1
    from pbs_bid_pairing_occurrence occurrence_row
    where occurrence_row.tier_id = tier.id
      and occurrence_row.id not in (select id from pbs_airport_168_target_occurrences)
  );

create temporary table pbs_airport_168_expected_empty_bids on commit drop as
select bid.id
from pbs_bid bid
where bid.id in (select id from pbs_airport_168_affected_bids)
  and not exists (
    select 1
    from pbs_bid_tier tier
    where tier.bid_id = bid.id
      and tier.id not in (select id from pbs_airport_168_expected_empty_tiers)
  )
  and not exists (
    select 1
    from pbs_bid_day_off day_off
    where day_off.bid_id = bid.id
  )
  and not exists (
    select 1
    from pbs_bid_group group_row
    where group_row.bid_id = bid.id
      and group_row.id not in (select id from pbs_airport_168_target_groups)
  )
  and not exists (
    select 1
    from pbs_bid_pairing_occurrence occurrence_row
    where occurrence_row.bid_id = bid.id
      and occurrence_row.id not in (select id from pbs_airport_168_target_occurrences)
  )
  and not exists (
    select 1
    from pbs_bid_pairing_favorite favorite
    where favorite.bid_id = bid.id
      and favorite.id not in (select id from pbs_airport_168_target_simple_favorites)
  )
  and not exists (
    select 1
    from pbs_bid_pairing_configured_favorite favorite
    where favorite.bid_id = bid.id
      and favorite.id not in (select id from pbs_airport_168_target_configured_favorites)
  )
  and not exists (
    select 1
    from pbs_bid_property_favorite favorite
    where favorite.bid_id = bid.id
      and favorite.id not in (select id from pbs_airport_168_target_generic_favorites)
  )
  and not exists (
    select 1
    from pbs_bid_days_off_favorite favorite
    where favorite.bid_id = bid.id
  )
  and not exists (
    select 1
    from pbs_bid_line_favorite favorite
    where favorite.bid_id = bid.id
  );

do $$
declare
  expected_metadata constant jsonb :=
    '{"type":"airport_preference","events":["landing","layover","landing_or_layover"],"locations":["airport","city"],"dateScope":["specific_dates","date_range"],"minimumLayoverDuration":"HH:MM"}'::jsonb;
  metadata_update_count integer;
  configured_favorite_count integer;
  simple_favorite_count integer;
  generic_favorite_count integer;
  occurrence_count integer;
  condition_count integer;
  group_count integer;
  tier_update_count integer;
  tier_delete_count integer;
  bid_update_count integer;
  bid_delete_count integer;
begin
  update pbs_bid_property
  set validation_json = expected_metadata::text,
      updated_at = now()
  where property_code = 168
    and bid_type = 'Pairing'
    and validation_json::jsonb is distinct from expected_metadata;
  get diagnostics metadata_update_count = row_count;

  delete from pbs_bid_pairing_configured_favorite
  where id in (select id from pbs_airport_168_target_configured_favorites);
  get diagnostics configured_favorite_count = row_count;

  delete from pbs_bid_pairing_favorite
  where id in (select id from pbs_airport_168_target_simple_favorites);
  get diagnostics simple_favorite_count = row_count;

  delete from pbs_bid_property_favorite
  where id in (select id from pbs_airport_168_target_generic_favorites);
  get diagnostics generic_favorite_count = row_count;

  delete from pbs_bid_pairing_occurrence
  where id in (select id from pbs_airport_168_target_occurrences);
  get diagnostics occurrence_count = row_count;

  delete from pbs_bid_condition
  where group_id in (select id from pbs_airport_168_target_groups);
  get diagnostics condition_count = row_count;

  delete from pbs_bid_group
  where id in (select id from pbs_airport_168_target_groups);
  get diagnostics group_count = row_count;

  update pbs_bid_tier tier
  set total_groups = (
        select count(*)::smallint
        from pbs_bid_group group_row
        where group_row.tier_id = tier.id
      ),
      updated_at = now()
  where tier.id in (select id from pbs_airport_168_affected_tiers)
    and tier.id not in (select id from pbs_airport_168_expected_empty_tiers)
    and tier.total_groups is distinct from (
      select count(*)::smallint
      from pbs_bid_group group_row
      where group_row.tier_id = tier.id
    );
  get diagnostics tier_update_count = row_count;

  delete from pbs_bid_tier tier
  where tier.id in (select id from pbs_airport_168_expected_empty_tiers)
    and not exists (select 1 from pbs_bid_group group_row where group_row.tier_id = tier.id)
    and not exists (select 1 from pbs_bid_day_off day_off where day_off.tier_id = tier.id)
    and not exists (
      select 1
      from pbs_bid_pairing_occurrence occurrence_row
      where occurrence_row.tier_id = tier.id
    );
  get diagnostics tier_delete_count = row_count;

  update pbs_bid bid
  set total_tiers = (
        select count(*)::smallint
        from pbs_bid_tier tier
        where tier.bid_id = bid.id
      ),
      updated_at = now()
  where bid.id in (select id from pbs_airport_168_affected_bids)
    and bid.id not in (select id from pbs_airport_168_expected_empty_bids)
    and bid.total_tiers is distinct from (
      select count(*)::smallint
      from pbs_bid_tier tier
      where tier.bid_id = bid.id
    );
  get diagnostics bid_update_count = row_count;

  delete from pbs_bid bid
  where bid.id in (select id from pbs_airport_168_expected_empty_bids)
    and not exists (select 1 from pbs_bid_tier tier where tier.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_day_off day_off where day_off.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_group group_row where group_row.bid_id = bid.id)
    and not exists (
      select 1
      from pbs_bid_pairing_occurrence occurrence_row
      where occurrence_row.bid_id = bid.id
    )
    and not exists (select 1 from pbs_bid_pairing_favorite favorite where favorite.bid_id = bid.id)
    and not exists (
      select 1
      from pbs_bid_pairing_configured_favorite favorite
      where favorite.bid_id = bid.id
    )
    and not exists (select 1 from pbs_bid_property_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_days_off_favorite favorite where favorite.bid_id = bid.id)
    and not exists (select 1 from pbs_bid_line_favorite favorite where favorite.bid_id = bid.id);
  get diagnostics bid_delete_count = row_count;

  raise notice 'Airport Preference 168 cleanup: metadata updates=%, configured favorites=%, simple favorites=%, generic favorites=%, occurrences=%, conditions=%, groups=%, tier updates=%, empty tiers=%, bid updates=%, empty bids=%',
    metadata_update_count,
    configured_favorite_count,
    simple_favorite_count,
    generic_favorite_count,
    occurrence_count,
    condition_count,
    group_count,
    tier_update_count,
    tier_delete_count,
    bid_update_count,
    bid_delete_count;
end $$;

do $$
declare
  expected_metadata constant jsonb :=
    '{"type":"airport_preference","events":["landing","layover","landing_or_layover"],"locations":["airport","city"],"dateScope":["specific_dates","date_range"],"minimumLayoverDuration":"HH:MM"}'::jsonb;
begin
  if (
    select validation_json::jsonb
    from pbs_bid_property
    where property_code = 168
      and bid_type = 'Pairing'
  ) is distinct from expected_metadata then
    raise exception 'Property 168 validation metadata does not match the new contract.';
  end if;

  if exists (
    select 1
    from pbs_bid_group
    where bid_type = 'Pairing'
      and (
        property_definition_id in (select id from pbs_airport_168_definition)
        or property_id = 168
      )
  ) or exists (
    select 1
    from pbs_bid_condition condition_row
    join pbs_bid_group group_row on group_row.id = condition_row.group_id
    where group_row.bid_type = 'Pairing'
      and (
        condition_row.property_definition_id in (select id from pbs_airport_168_definition)
        or condition_row.property_id = 168
      )
  ) or exists (
    select 1
    from pbs_bid_pairing_configured_favorite
    where property_id in (select id from pbs_airport_168_definition)
      or property_code = 168
  ) or exists (
    select 1
    from pbs_bid_pairing_favorite
    where property_id in (select id from pbs_airport_168_definition)
      or property_code = 168
  ) or exists (
    select 1
    from pbs_bid_property_favorite
    where bid_type = 'Pairing'
      and (
        property_id in (select id from pbs_airport_168_definition)
        or property_code = 168
      )
  ) then
    raise exception 'Property 168 bid rows remain after cleanup.';
  end if;

  if exists (
    select 1
    from pbs_bid_tier tier
    where tier.id in (select id from pbs_airport_168_affected_tiers)
      and tier.total_groups <> (
        select count(*)::smallint
        from pbs_bid_group group_row
        where group_row.tier_id = tier.id
      )
  ) then
    raise exception 'An affected bid tier has an incorrect total_groups value.';
  end if;

  if exists (
    select 1
    from pbs_bid bid
    where bid.id in (select id from pbs_airport_168_affected_bids)
      and bid.total_tiers <> (
        select count(*)::smallint
        from pbs_bid_tier tier
        where tier.bid_id = bid.id
      )
  ) then
    raise exception 'An affected bid has an incorrect total_tiers value.';
  end if;
end $$;

commit;
