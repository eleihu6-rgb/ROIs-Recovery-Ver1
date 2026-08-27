-- ============================================================
-- PBS pairing Departure Time property
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = 'Departure Date / Day',
    validation_json = '{"type":"date_or_dow","label":"Date / Day","multi":true}',
    tooltip = 'Award/Avoid pairings by departure date or day.',
    updated_at = now()
where property_code = 106
  and bid_type = 'Pairing'
  and is_active = 1;

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
  is_active
) values (
  164,
  'Pairing',
  'Departure Time',
  '["award","avoid"]',
  null,
  '["<","=",">","Between"]',
  '{"type":"time_of_day","format":"HH:MM","label":"Departure Time"}',
  'Award/Avoid pairings by first scheduled flight departure time.',
  'legacy',
  1,
  164,
  1
) on conflict (property_code) do update set
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
  updated_at = now();
