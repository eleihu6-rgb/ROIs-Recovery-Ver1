-- ============================================================
-- PBS Days Off employee schedule preference property
-- ============================================================
-- Execute with search_path pointing at the target PBS schema.

update pbs_bid_property
set property_name = 'Employee Schedule Preference',
    operator_options = null,
    validation_json = '{"type":"employee_schedule_preference","label":"Employee Schedule Preference","min":1,"max":31}',
    tooltip = 'Set a schedule preference relative to another employee.',
    is_visible_in_portal = 1,
    is_active = 1,
    updated_at = now()
where property_code = 206
  and bid_type = 'DaysOff';
