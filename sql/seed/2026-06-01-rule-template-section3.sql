-- Seed: §3 new rule templates and F8 instances
-- Adds rules that require both DB entries and Python checkers.
-- Run after: 2026-05-06-rule-template-instance-seed.sql

-- ============================================================
-- 1. New Rule Templates
-- ============================================================

INSERT INTO rule_template (code, name, category, check_type, param_schema, template_vars, reference, created_by, updated_by)
VALUES
('min_gdo_count', 'Minimum GDO Count (FD)', 'REST', 'CHECK',
 '{"type":"object","properties":{"min_gdo":{"type":"integer","default":12}}}',
 '[{"name":"actual_gdos","label":"Actual GDO count","example":12},{"name":"min_gdo","label":"Minimum required","example":12}]',
 'CBA-F8-ALPA-8.13', 'system', 'system'),

('min_gdo_count_cc', 'Minimum GDO Count (CC)', 'REST', 'CHECK',
 '{"type":"object","properties":{"min_gdo":{"type":"integer","default":12}}}',
 '[{"name":"actual_gdos","label":"Actual GDO count","example":12},{"name":"min_gdo","label":"Minimum required","example":12}]',
 'CBA-F8-CUPE-5.01.10', 'system', 'system'),

('single_daily_checkin', 'Single Daily Check-in (FD)', 'DUTY', 'CHECK',
 '{"type":"object","properties":{}}',
 '[{"name":"date","label":"Calendar day","example":"2025-01-10"},{"name":"count","label":"Check-in count","example":2}]',
 'F8-rule-4.9', 'system', 'system'),

('single_daily_checkin_cc', 'Single Daily Check-in (CC)', 'DUTY', 'CHECK',
 '{"type":"object","properties":{}}',
 '[{"name":"date","label":"Calendar day","example":"2025-01-10"},{"name":"count","label":"Check-in count","example":2}]',
 'F8-rule-5.5', 'system', 'system'),

('max_duty_hours_7d', 'Maximum Duty Hours 7d', 'DUTY', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":3600},"window_days":{"type":"integer","default":7}}}',
 '[{"name":"total_minutes","label":"Total duty minutes in window","example":2400},{"name":"limit_minutes","label":"Limit (min)","example":3600}]',
 'CAR-700.29.1', 'system', 'system'),

('max_duty_hours_28d', 'Maximum Duty Hours 28d', 'DUTY', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":11520},"window_days":{"type":"integer","default":28}}}',
 '[{"name":"total_minutes","label":"Total duty minutes in window","example":9600},{"name":"limit_minutes","label":"Limit (min)","example":11520}]',
 'CAR-700.29.1', 'system', 'system'),

('max_duty_hours_365d', 'Maximum Duty Hours 365d', 'DUTY', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":132000},"window_days":{"type":"integer","default":365}}}',
 '[{"name":"total_minutes","label":"Total duty minutes in window","example":60000},{"name":"limit_minutes","label":"Limit (min)","example":132000}]',
 'CAR-700.29.1', 'system', 'system'),

('max_consecutive_wocl', 'Max Consecutive WOCL Duties', 'REST', 'CHECK',
 '{"type":"object","properties":{"max_consecutive":{"type":"integer","default":3}}}',
 '[{"name":"streak","label":"Consecutive WOCL count","example":4},{"name":"max_consecutive","label":"Maximum allowed","example":3}]',
 'CAR-700.51.1', 'system', 'system'),

('age_restriction', 'Age Restriction', 'QUALIFICATION', 'CHECK',
 '{"type":"object","properties":{"age_limit":{"type":"integer","default":65},"canadian_iata_prefixes":{"type":"array","default":["Y"]}}}',
 '[{"name":"age","label":"Crew age (years)","example":66},{"name":"age_limit","label":"Age limit","example":65}]',
 'F8-rule-4.11', 'system', 'system'),

('cc_monthly_credit_hours', 'CC Monthly Credit Hours', 'FLIGHT_TIME', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":5100},"min_guarantee_minutes":{"type":"integer","default":240}}}',
 '[{"name":"total_credit","label":"Total credit (min)","example":4800},{"name":"limit_minutes","label":"Limit (min)","example":5100}]',
 'CBA-F8-CUPE-5.01.12', 'system', 'system'),

('cc_max_consecutive_reserve', 'CC Max Consecutive Reserve', 'REST', 'CHECK',
 '{"type":"object","properties":{"max_consecutive_days":{"type":"integer","default":6},"max_total_days":{"type":"integer","default":20}}}',
 '[{"name":"streak","label":"Consecutive SBY days","example":7},{"name":"max_consecutive_days","label":"Max consecutive","example":6}]',
 'CBA-F8-CUPE-5.07.04', 'system', 'system')

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. F8 Rule Instances
-- ============================================================

INSERT INTO rule_instance (instance_code, name, template_code, severity, params, overridable, filiale, division, created_by, updated_by)
VALUES
-- FD rules
('f8_min_gdo_count',    'F8 Min GDO Count (FD)',          'min_gdo_count',          'ERROR',   '{"min_gdo":12}',                               true,  'F8', 'P', 'system', 'system'),
('f8_single_checkin',   'F8 Single Daily Check-in (FD)',  'single_daily_checkin',   'ERROR',   '{}',                                           true,  'F8', 'P', 'system', 'system'),
('f8_max_dh_7d',        'F8 Max Duty Hours 7d',           'max_duty_hours_7d',      'ERROR',   '{"limit_minutes":3600,"window_days":7}',        true,  'F8', 'P', 'system', 'system'),
('f8_max_dh_28d',       'F8 Max Duty Hours 28d',          'max_duty_hours_28d',     'ERROR',   '{"limit_minutes":11520,"window_days":28}',      true,  'F8', 'P', 'system', 'system'),
('f8_max_dh_365d',      'F8 Max Duty Hours 365d',         'max_duty_hours_365d',    'ERROR',   '{"limit_minutes":132000,"window_days":365}',    true,  'F8', 'P', 'system', 'system'),
('f8_max_cons_wocl',    'F8 Max Consecutive WOCL',        'max_consecutive_wocl',   'ERROR',   '{"max_consecutive":3}',                        true,  'F8', 'P', 'system', 'system'),
('f8_age_restriction',  'F8 Age Restriction',             'age_restriction',        'WARNING', '{"age_limit":65,"canadian_iata_prefixes":["Y"]}', true, 'F8', 'P', 'system', 'system'),
-- CC rules
('f8_c_min_gdo_count',  'F8 Min GDO Count (CC)',          'min_gdo_count_cc',       'ERROR',   '{"min_gdo":12}',                               true,  'F8', 'C', 'system', 'system'),
('f8_c_single_checkin', 'F8 Single Daily Check-in (CC)',  'single_daily_checkin_cc','ERROR',   '{}',                                           true,  'F8', 'C', 'system', 'system'),
('f8_c_credit_hours',   'F8 CC Monthly Credit Hours',     'cc_monthly_credit_hours','ERROR',   '{"limit_minutes":5100,"min_guarantee_minutes":240}', true, 'F8', 'C', 'system', 'system'),
('f8_c_cons_reserve',   'F8 CC Max Consecutive Reserve',  'cc_max_consecutive_reserve','ERROR','{"max_consecutive_days":6,"max_total_days":20}', true, 'F8', 'C', 'system', 'system')

ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ============================================================
-- 3. Link new instances to default rule groups
-- ============================================================

DO $$
DECLARE
  g_id bigint;
  i_id bigint;
  ord  int;
BEGIN
  -- Pilot group (ccar121_gantt is the active F8 pilot gantt rule group)
  SELECT id INTO g_id FROM rule_group
  WHERE group_code = 'ccar121_gantt' AND filiale = 'F8' AND is_deleted = 0;

  IF g_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO ord FROM rule_group_instance WHERE group_id = g_id;

    FOR i_id IN
      SELECT id FROM rule_instance
      WHERE instance_code IN (
        'f8_min_gdo_count','f8_single_checkin','f8_max_dh_7d','f8_max_dh_28d',
        'f8_max_dh_365d','f8_max_cons_wocl','f8_age_restriction'
      ) AND filiale = 'F8' AND is_deleted = 0
      ORDER BY instance_code
    LOOP
      INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
      VALUES (g_id, i_id, true, ord, 'system', 'system')
      ON CONFLICT (group_id, instance_id) DO NOTHING;
      ord := ord + 1;
    END LOOP;
  END IF;

  -- CC group: skip if no CC gantt group exists yet
  SELECT id INTO g_id FROM rule_group
  WHERE group_code = 'ccar121_c_gantt' AND filiale = 'F8' AND is_deleted = 0;

  IF g_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO ord FROM rule_group_instance WHERE group_id = g_id;

    FOR i_id IN
      SELECT id FROM rule_instance
      WHERE instance_code IN (
        'f8_c_min_gdo_count','f8_c_single_checkin','f8_c_credit_hours','f8_c_cons_reserve'
      ) AND filiale = 'F8' AND is_deleted = 0
      ORDER BY instance_code
    LOOP
      INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
      VALUES (g_id, i_id, true, ord, 'system', 'system')
      ON CONFLICT (group_id, instance_id) DO NOTHING;
      ord := ord + 1;
    END LOOP;
  END IF;
END $$;
