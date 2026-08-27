-- PBS Long Stretch Off / Compressed Flying award-only cleanup.
-- Execute with search_path pointing at the target PBS schema.
-- This aligns property 204 with the reference LINE_RULES.csv format: no Avoid branch.

begin;

create temporary table pbs_long_stretch_property_ids on commit drop as
select property.id, property.property_code
from pbs_bid_property property
where property.bid_type = 'DaysOff'
  and property.property_code = 204;

update pbs_bid_group target
set
  action_id = 1,
  updated_by = 'system',
  updated_at = now()
where target.bid_type = 'DaysOff'
  and (
    target.property_id = 204
    or exists (
      select 1
      from pbs_long_stretch_property_ids property
      where property.id = target.property_definition_id
    )
  )
  and target.action_id is distinct from 1;

update pbs_bid_days_off_favorite favorite
set
  action = 'award',
  updated_by = 'system',
  updated_at = now()
where (
    favorite.property_code = 204
    or exists (
      select 1
      from pbs_long_stretch_property_ids property
      where property.id = favorite.property_id
    )
  )
  and favorite.action is distinct from 'award';

comment on column pbs_bid_days_off_favorite.action is
  'Days Off configured favorite action snapshot; Long Stretch Off / Compressed Flying is award-only and stores award for compatibility.';

commit;
