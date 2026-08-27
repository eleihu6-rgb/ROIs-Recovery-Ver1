-- PBS Pairing property 110 aligned to the Work Day Preference product wording.
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = 'Work Day Preference',
    tooltip = 'Award/Avoid pairings by work day.',
    updated_at = now()
where bid_type = 'Pairing'
  and property_code = 110;
