-- PBS pairing Work Start Station property
-- Adds a visible Pairing bid property for filtering by the first duty start airport.

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
  165,
  'Pairing',
  'Work Start Station',
  '["award","avoid"]',
  null,
  '["In"]',
  '{"type":"airport","format":"IATA","label":"Work Start Station","multi":true}',
  'Award/Avoid pairings by the first duty work start station.',
  'legacy',
  1,
  165,
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
