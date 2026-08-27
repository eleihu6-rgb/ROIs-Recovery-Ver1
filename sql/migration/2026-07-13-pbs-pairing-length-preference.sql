-- PBS Pairing property 112 aligned to the Pairing Length product wording.
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set operator_options = null,
    validation_json = '{"type":"pairing_length_preference","label":"Days","min":1,"max":7,"dateScope":"pairing_start_date_range"}',
    tooltip = 'Award/Avoid pairings by pairing length, optionally limited by pairing start date range.',
    updated_at = now()
where bid_type = 'Pairing'
  and property_code = 112;
