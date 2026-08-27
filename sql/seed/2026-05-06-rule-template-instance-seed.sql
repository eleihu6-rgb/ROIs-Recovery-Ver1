-- Seed: Rule templates and instances for F8
-- This creates basic CCAR-121 rules for the gantt rule check system

-- ============================================================
-- 1. Rule Templates (algorithm definitions)
-- ============================================================

INSERT INTO rule_template (code, name, category, check_type, param_schema, template_vars, reference, created_by, updated_by)
VALUES
-- Calculators
('fdp_calculator', 'FDP Calculator', 'FDP', 'CALC',
 '{"type":"object","properties":{"fdp_table":{"type":"array"}}}',
 '[{"name":"fdp_minutes","label":"FDP duration (min)","example":720},{"name":"limit_minutes","label":"FDP limit (min)","example":780},{"name":"duty_seq","label":"Duty sequence","example":1},{"name":"segment_count","label":"Segment count","example":2},{"name":"report_local","label":"Report time (local)","example":"06:00"}]',
 'CCAR-121-R5-121.489', 'system', 'system'),

('flight_hour_calculator', 'Flight Hour Calculator', 'FLIGHT_TIME', 'CALC',
 '{"type":"object","properties":{}}',
 '[{"name":"block_minutes","label":"Block time (min)","example":360},{"name":"cumulative_24h","label":"24h cumulative (min)","example":360},{"name":"cumulative_7d","label":"7d cumulative (min)","example":960}]',
 'CCAR-121-R5-121.487', 'system', 'system'),

('rest_calculator', 'Rest Calculator', 'REST', 'CALC',
 '{"type":"object","properties":{}}',
 '[{"name":"rest_minutes","label":"Rest duration (min)","example":540},{"name":"min_rest","label":"Minimum rest (min)","example":600}]',
 'CCAR-121-R5-121.495', 'system', 'system'),

-- Checkers
('max_fdp', 'Maximum FDP', 'FDP', 'CHECK',
 '{"type":"object","properties":{"base_limit_minutes":{"type":"integer","default":780},"segment_adjustments":{"type":"array"},"time_of_day_adjustments":{"type":"array"}}}',
 '[{"name":"fdp_minutes","label":"FDP duration (min)","example":720},{"name":"limit_minutes","label":"FDP limit (min)","example":780},{"name":"duty_seq","label":"Duty sequence","example":1},{"name":"segment_count","label":"Segment count","example":2},{"name":"report_local","label":"Report time (local)","example":"06:00"}]',
 'CCAR-121-R5-121.489', 'system', 'system'),

('max_ft_24h', 'Maximum Flight Time 24h', 'FLIGHT_TIME', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":540}}}',
 '[{"name":"block_minutes","label":"Block time (min)","example":360},{"name":"cumulative_24h","label":"24h cumulative (min)","example":360},{"name":"limit_minutes","label":"Limit (min)","example":540}]',
 'CCAR-121-R5-121.487', 'system', 'system'),

('max_ft_7d', 'Maximum Flight Time 7d', 'FLIGHT_TIME', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":2400}}}',
 '[{"name":"cumulative_7d","label":"7d cumulative (min)","example":960},{"name":"limit_minutes","label":"Limit (min)","example":2400}]',
 'CCAR-121-R5-121.487', 'system', 'system'),

('min_rest', 'Minimum Rest', 'REST', 'CHECK',
 '{"type":"object","properties":{"base_rest_minutes":{"type":"integer","default":600},"absolute_min_minutes":{"type":"integer","default":540}}}',
 '[{"name":"rest_minutes","label":"Rest duration (min)","example":540},{"name":"base_rest_minutes","label":"Base rest requirement (min)","example":600},{"name":"duty_seq","label":"After duty sequence","example":1}]',
 'CCAR-121-R5-121.495', 'system', 'system'),

('min_rest_weekly', 'Minimum Weekly Rest', 'REST', 'CHECK',
 '{"type":"object","properties":{"min_consecutive_hours":{"type":"integer","default":36}}}',
 '[{"name":"max_rest","label":"Maximum consecutive rest (h)","example":36},{"name":"min_consecutive_hours","label":"Minimum required (h)","example":36}]',
 'CCAR-121-R5-121.493', 'system', 'system'),

('max_dp', 'Maximum Duty Period', 'DUTY', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":960}}}',
 '[{"name":"duty_minutes","label":"Duty duration (min)","example":720},{"name":"limit_minutes","label":"Limit (min)","example":960},{"name":"duty_seq","label":"Duty sequence","example":1}]',
 'CCAR-121-R5-121.489', 'system', 'system'),

('qual_airport', 'Airport Qualification', 'QUALIFICATION', 'CHECK',
 '{"type":"object","properties":{}}',
 '[{"name":"airport","label":"Airport code","example":"PEK"},{"name":"crew_code","label":"Crew code","example":"CA001"}]',
 'CCAR-121-R5-Sec4.32', 'system', 'system'),

('qual_fleet', 'Fleet Qualification', 'QUALIFICATION', 'CHECK',
 '{"type":"object","properties":{}}',
 '[{"name":"fleet","label":"Fleet code","example":"B737"},{"name":"crew_code","label":"Crew code","example":"CA001"}]',
 'CCAR-121-R5-Sec4.33', 'system', 'system'),

('qual_recency', 'Recency Check', 'QUALIFICATION', 'CHECK',
 '{"type":"object","properties":{"min_landings":{"type":"integer","default":3},"period_days":{"type":"integer","default":90}}}',
 '[{"name":"recent_landings","label":"Recent landings (90d)","example":3},{"name":"min_landings","label":"Minimum required","example":3},{"name":"crew_code","label":"Crew code","example":"CA001"}]',
 'CCAR-121-R5-121.481', 'system', 'system')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. Rule Instances (F8 specific configurations)
-- ============================================================

INSERT INTO rule_instance (instance_code, name, template_code, severity, params, overridable, filiale, division, created_by, updated_by)
VALUES
-- FDP instances
('f8_fdp_standard', 'F8 FDP Standard', 'fdp_calculator', 'INFO', '{}', false, 'F8', 'P', 'system', 'system'),
('f8_fdp_check', 'F8 FDP Limit Check', 'max_fdp', 'ERROR', '{"base_limit_minutes":780}', true, 'F8', 'P', 'system', 'system'),

-- Flight time instances
('f8_ft_24h', 'F8 Flight Time 24h Limit', 'max_ft_24h', 'ERROR', '{"limit_minutes":540}', true, 'F8', 'P', 'system', 'system'),
('f8_ft_7d', 'F8 Flight Time 7d Limit', 'max_ft_7d', 'ERROR', '{"limit_minutes":2400}', true, 'F8', 'P', 'system', 'system'),
('f8_ft_calc', 'F8 Flight Hour Calculator', 'flight_hour_calculator', 'INFO', '{}', false, 'F8', 'P', 'system', 'system'),

-- Rest instances
('f8_rest_calc', 'F8 Rest Calculator', 'rest_calculator', 'INFO', '{}', false, 'F8', 'P', 'system', 'system'),
('f8_min_rest', 'F8 Minimum Rest', 'min_rest', 'ERROR', '{"base_rest_minutes":600}', true, 'F8', 'P', 'system', 'system'),
('f8_min_rest_weekly', 'F8 Weekly Rest', 'min_rest_weekly', 'ERROR', '{"min_consecutive_hours":36}', true, 'F8', 'P', 'system', 'system'),

-- Duty period
('f8_max_dp', 'F8 Max Duty Period', 'max_dp', 'ERROR', '{"limit_minutes":960}', true, 'F8', 'P', 'system', 'system'),

-- Qualification
('f8_qual_airport', 'F8 Airport Qualification', 'qual_airport', 'WARNING', '{}', true, 'F8', 'P', 'system', 'system'),
('f8_qual_fleet', 'F8 Fleet Qualification', 'qual_fleet', 'WARNING', '{}', true, 'F8', 'P', 'system', 'system'),
('f8_qual_recency', 'F8 Recency Check', 'qual_recency', 'ERROR', '{"min_landings":3}', true, 'F8', 'P', 'system', 'system'),

-- Cabin crew instances (same rules, different division)
('f8_c_fdp_check', 'F8 FDP Limit Check (Cabin)', 'max_fdp', 'ERROR', '{"base_limit_minutes":780}', true, 'F8', 'C', 'system', 'system'),
('f8_c_ft_24h', 'F8 Flight Time 24h (Cabin)', 'max_ft_24h', 'ERROR', '{"limit_minutes":540}', true, 'F8', 'C', 'system', 'system'),
('f8_c_min_rest', 'F8 Minimum Rest (Cabin)', 'min_rest', 'ERROR', '{"base_rest_minutes":600}', true, 'F8', 'C', 'system', 'system')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ============================================================
-- 3. Default Rule Group
-- ============================================================

INSERT INTO rule_group (group_code, name, description, usage, filiale, division, is_default, created_by, updated_by)
VALUES
('f8_gantt_default', 'F8 Gantt Default Rules', 'Default rule set for Gantt live operations', 'GANTT', 'F8', 'P', true, 'system', 'system'),
('f8_c_gantt_default', 'F8 Cabin Gantt Default', 'Default rule set for cabin crew', 'GANTT', 'F8', 'C', true, 'system', 'system')
ON CONFLICT (group_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ============================================================
-- 4. Link instances to default group (Pilot)
-- ============================================================

-- Get group_id and instance_ids for pilot group
DO $$
DECLARE
  g_id bigint;
  i_id bigint;
  ord int;
BEGIN
  SELECT id INTO g_id FROM rule_group WHERE group_code = 'f8_gantt_default' AND filiale = 'F8';
  ord := 0;

  -- Add calculators first (order 0-2)
  FOR i_id IN SELECT id FROM rule_instance WHERE template_code IN ('fdp_calculator', 'flight_hour_calculator', 'rest_calculator') AND filiale = 'F8' AND division = 'P' ORDER BY template_code
  LOOP
    INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
    VALUES (g_id, i_id, true, ord, 'system', 'system')
    ON CONFLICT (group_id, instance_id) DO NOTHING;
    ord := ord + 1;
  END LOOP;

  -- Add checkers (order 3+)
  FOR i_id IN SELECT id FROM rule_instance WHERE template_code NOT IN ('fdp_calculator', 'flight_hour_calculator', 'rest_calculator') AND filiale = 'F8' AND division = 'P' ORDER BY template_code
  LOOP
    INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
    VALUES (g_id, i_id, true, ord, 'system', 'system')
    ON CONFLICT (group_id, instance_id) DO NOTHING;
    ord := ord + 1;
  END LOOP;
END $$;

-- Link instances to cabin group
DO $$
DECLARE
  g_id bigint;
  i_id bigint;
  ord int;
BEGIN
  SELECT id INTO g_id FROM rule_group WHERE group_code = 'f8_c_gantt_default' AND filiale = 'F8';
  ord := 0;

  FOR i_id IN SELECT id FROM rule_instance WHERE filiale = 'F8' AND division = 'C' ORDER BY template_code
  LOOP
    INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
    VALUES (g_id, i_id, true, ord, 'system', 'system')
    ON CONFLICT (group_id, instance_id) DO NOTHING;
    ord := ord + 1;
  END LOOP;
END $$;