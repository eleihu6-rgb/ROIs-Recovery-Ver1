-- Add the no-parameter Line "Most Flying In Least Working Days" flag property.
-- Keep property 409 as the configured credit-density version.

UPDATE pbs_bid_property
SET
  property_name = 'Most Flying In Least Working Days (Configured)',
  validation_json = '{"type":"credit_density_preference","label":"Most Flying In Least Working Days (Configured)","minimumTotalCredit":{"min":"40:00","max":"120:00"},"maximumWorkingDays":{"min":1,"max":31},"strength":["normal","strong","must_try"]}',
  tooltip = 'Prefer high total credit with fewer working days in the final line.',
  updated_at = now()
WHERE property_code = 409;

INSERT INTO pbs_bid_property (
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
) VALUES (
  428,
  'Line',
  'Most Flying In Least Working Days',
  null,
  null,
  null,
  '{"type":"flag"}',
  'Prefer most flying in the fewest flying days.',
  'aa',
  1,
  428,
  1
)
ON CONFLICT (property_code) DO UPDATE SET
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
