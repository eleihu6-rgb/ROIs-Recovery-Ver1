-- ============================================================
-- PBS pairing enroute check-in/check-out date/day conditions
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = 'Any/Every Enroute Check-Out Time',
    any_or_every = '["any","every"]',
    tooltip = 'Award/Avoid pairings by any or every enroute check-out time.',
    updated_at = now()
where property_code = 126
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
) values
  (
    166,
    'Pairing',
    'Any/Every Enroute Check-In Date / Day',
    '["award","avoid"]',
    '["any","every"]',
    '["In","Between"]',
    '{"type":"date_or_dow","label":"Enroute Check-In Date / Day","multi":true}',
    'Award/Avoid pairings by any or every enroute check-in date or day.',
    'legacy',
    1,
    166,
    1
  ),
  (
    167,
    'Pairing',
    'Any/Every Enroute Check-Out Date / Day',
    '["award","avoid"]',
    '["any","every"]',
    '["In","Between"]',
    '{"type":"date_or_dow","label":"Enroute Check-Out Date / Day","multi":true}',
    'Award/Avoid pairings by any or every enroute check-out date or day.',
    'legacy',
    1,
    167,
    1
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
  updated_at = now();

