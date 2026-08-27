-- Add the F8 Line Credit Window Preference property.
-- Existing 401/402 legacy rows remain readable but are hidden from new Portal entry.

begin;

update f8.dictionary
set
  name = 'PBS line credit window configuration',
  idx = 16,
  updated_by = 'migration',
  updated_at = now()
where parent_code = 'SYS_PARAM'
  and code = 'PBS_LINE_CREDIT_WINDOW_CONFIG';

insert into f8.dictionary (
  parent_code,
  code,
  name,
  idx,
  code_value,
  created_by,
  updated_by
)
select
  'SYS_PARAM',
  'PBS_LINE_CREDIT_WINDOW_CONFIG',
  'PBS line credit window configuration',
  16,
  null,
  'migration',
  'migration'
where not exists (
  select 1
  from f8.dictionary
  where parent_code = 'SYS_PARAM'
    and code = 'PBS_LINE_CREDIT_WINDOW_CONFIG'
);

-- Temporary dictionary defaults until the admin management screen owns these values.
-- Existing non-empty values are preserved by the migration.
update f8.dictionary as dictionary
set
  name = excluded.name,
  idx = excluded.idx,
  code_value = case
    when coalesce(dictionary.code_value, '') = '' then excluded.code_value
    else dictionary.code_value
  end,
  updated_by = 'migration',
  updated_at = now()
from (
  values
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'MMG_CREDIT',         'Minimum monthly guarantee credit', 1, '70:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'OVERTIME_THRESHOLD', 'Overtime threshold credit',        2, '90:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'LOW_MIN_CREDIT',     'Low credit minimum',               3, '70:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'LOW_MAX_CREDIT',     'Low credit maximum',               4, '78:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'HIGH_MIN_CREDIT',    'High credit minimum',              5, '82:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'HIGH_MAX_CREDIT',    'High credit maximum',              6, '90:00')
) as excluded(parent_code, code, name, idx, code_value)
where dictionary.parent_code = excluded.parent_code
  and dictionary.code = excluded.code;

insert into f8.dictionary (
  parent_code,
  code,
  name,
  idx,
  code_value,
  created_by,
  updated_by
)
select excluded.parent_code, excluded.code, excluded.name, excluded.idx, excluded.code_value, 'migration', 'migration'
from (
  values
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'MMG_CREDIT',         'Minimum monthly guarantee credit', 1, '70:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'OVERTIME_THRESHOLD', 'Overtime threshold credit',        2, '90:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'LOW_MIN_CREDIT',     'Low credit minimum',               3, '70:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'LOW_MAX_CREDIT',     'Low credit maximum',               4, '78:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'HIGH_MIN_CREDIT',    'High credit minimum',              5, '82:00'),
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'HIGH_MAX_CREDIT',    'High credit maximum',              6, '90:00')
) as excluded(parent_code, code, name, idx, code_value)
where not exists (
  select 1
  from f8.dictionary as dictionary
  where dictionary.parent_code = excluded.parent_code
    and dictionary.code = excluded.code
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
  429,
  'Line',
  'Credit Window Preference',
  null,
  null,
  null,
  '{"type":"credit_window_preference","modes":["low","high","custom"]}',
  'Choose Low credit, High credit, or a custom credit window.',
  'app',
  1,
  429,
  1,
  122,
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
  updated_by = excluded.updated_by,
  updated_at = now();

update pbs_bid_property
set
  is_visible_in_portal = 0,
  recommended_order = null,
  recommended_usage_count = null,
  tooltip = 'Legacy Line property from crew_bids_reference. Hidden in Portal; retained for historical drafts.',
  updated_by = 'migration',
  updated_at = now()
where bid_type = 'Line'
  and property_code in (401, 402);

update pbs_bid_property as property
set
  recommended_order = defaults.recommended_order,
  recommended_usage_count = defaults.recommended_usage_count,
  updated_by = 'migration',
  updated_at = now()
from (
  values
    (429, 1, 122),
    (404, 2, 56),
    (405, 3, 29)
) as defaults(property_code, recommended_order, recommended_usage_count)
where property.bid_type = 'Line'
  and property.property_code = defaults.property_code;

commit;
