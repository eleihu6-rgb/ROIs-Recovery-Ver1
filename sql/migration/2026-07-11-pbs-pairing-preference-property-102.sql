-- PBS Pairing property 102 aligned to Jen's final Pairing Preference wording.
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = 'Pairing Preference',
    validation_json = jsonb_set(
      coalesce(nullif(validation_json, '')::jsonb, '{}'::jsonb),
      '{label}',
      '"Pairing Number"'::jsonb,
      true
    )::text,
    tooltip = 'Award/Avoid specific pairings by pairing number, optional run date scope, and required quantity.',
    updated_at = now()
where bid_type = 'Pairing'
  and property_code = 102;
