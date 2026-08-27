-- ============================================================
-- PBS pairing property 114 Every quantifier support
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = 'Any/Every Enroute Check-In Time',
    any_or_every = '["any","every"]',
    tooltip = 'Award/Avoid pairings by any or every enroute check-in time.',
    updated_at = now()
where property_code = 114
  and bid_type = 'Pairing'
  and is_active = 1;
