-- PBS Redeye Preference definition.
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set
  property_name = 'Redeye Preference',
  award_or_avoid = '["award","avoid"]',
  any_or_every = null,
  operator_options = null,
  validation_json = '{"type":"redeye_preference","definition":{"start":"03:30","end":"05:30","label":"03:30-05:30 local time"},"dateScope":["specific_date","date_range"]}',
  tooltip = 'Award/Avoid pairings with a flight operating within 03:30-05:30 local time.',
  updated_at = now()
where bid_type = 'Pairing'
  and property_code = 117;
