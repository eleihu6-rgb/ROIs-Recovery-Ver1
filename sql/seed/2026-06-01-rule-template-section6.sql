-- =============================================================================
-- §6 Phase 2 Rule Templates & Instances
--   • cc_max_segments_24h (CUPE §5.04.01)
--   • min_rest_post_positioning (CAR 700.43(1))
--   • extended_rest_after_long_fdp (CAR 121.475 / F8-rule §4.10)
--   • max_night_ft_30d (CCAR 121.473 rolling 30-day night flight cumulative)
-- Idempotent: all inserts use ON CONFLICT DO NOTHING.
-- Run after: 2026-06-01-rule-template-section3.sql
-- =============================================================================

-- ============================================================
-- 1. Rule Templates
-- ============================================================

INSERT INTO rule_template (code, name, category, check_type, param_schema, template_vars, reference, created_by, updated_by)
VALUES
('cc_max_segments_24h', 'CC Max Segments in 24h Window', 'FLIGHT_TIME', 'CHECK',
 '{"type":"object","properties":{"max_segments":{"type":"integer","default":8}}}',
 '[{"name":"worst_count","label":"Max segments in 24h","example":9},{"name":"max_segs","label":"Limit","example":8}]',
 'CUPE §5.04.01', 'system', 'system'),

('min_rest_post_positioning', 'Min Rest After Positioning Duty', 'REST', 'CHECK',
 '{"type":"object","properties":{"min_rest_minutes":{"type":"integer","default":480}}}',
 '[{"name":"worst_rest","label":"Shortest rest after positioning (min)","example":300},{"name":"min_rest","label":"Minimum required (min)","example":480}]',
 'CAR 700.43(1)', 'system', 'system'),

('extended_rest_after_long_fdp', 'Extended Rest After Long FDP', 'REST', 'CHECK',
 '{"type":"object","properties":{"long_fdp_threshold_minutes":{"type":"integer","default":720},"extended_rest_minutes":{"type":"integer","default":720}}}',
 '[{"name":"worst_rest","label":"Shortest post-long-FDP rest (min)","example":480},{"name":"extended_rest","label":"Required rest (min)","example":720}]',
 'CAR 121.475', 'system', 'system'),

('max_night_ft_30d', 'Max Night Flight Time 30d', 'FLIGHT_TIME', 'CHECK',
 '{"type":"object","properties":{"limit_minutes":{"type":"integer","default":2400},"window_days":{"type":"integer","default":30}}}',
 '[{"name":"night_minutes","label":"Rolling night flight (min)","example":2500},{"name":"limit_minutes","label":"Limit (min)","example":2400}]',
 'CCAR 121.473', 'system', 'system')

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. F8 Rule Instances
-- ============================================================

INSERT INTO rule_instance (instance_code, name, template_code, severity, params, overridable, filiale, division, created_by, updated_by)
VALUES
('f8_c_max_segs_24h',          'F8 CC Max Segments 24h',             'cc_max_segments_24h',          'ERROR', '{"max_segments":8}',                                                false, 'F8', 'C', 'system', 'system'),
('f8_min_rest_post_pos',       'F8 Min Rest Post Positioning (FD)',  'min_rest_post_positioning',    'ERROR', '{"min_rest_minutes":480}',                                          false, 'F8', 'P', 'system', 'system'),
('f8_c_min_rest_post_pos',     'F8 CC Min Rest Post Positioning',    'min_rest_post_positioning',    'ERROR', '{"min_rest_minutes":480}',                                          false, 'F8', 'C', 'system', 'system'),
('f8_extended_rest_long_fdp',  'F8 Extended Rest After Long FDP',   'extended_rest_after_long_fdp', 'ERROR',   '{"long_fdp_threshold_minutes":720,"extended_rest_minutes":720}',    false, 'F8', 'P', 'system', 'system'),
('f8_max_night_ft_30d',        'F8 Max Night Flight Time 30d',      'max_night_ft_30d',             'WARNING', '{"limit_minutes":2400,"window_days":30}',                            false, 'F8', 'P', 'system', 'system')

ON CONFLICT (instance_code, filiale, division) WHERE (is_deleted = 0) DO NOTHING;

-- ============================================================
-- 3. Link to rule groups
-- ============================================================

DO $$
DECLARE
  g_id    bigint;
  inst_id bigint;
  ord     int;
BEGIN
  -- FD gantt group (ccar121_gantt)
  SELECT id INTO g_id FROM rule_group
  WHERE group_code = 'ccar121_gantt' AND filiale = 'F8' AND is_deleted = 0;

  IF g_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO ord FROM rule_group_instance WHERE group_id = g_id;

    FOR inst_id IN
      SELECT id FROM rule_instance
      WHERE instance_code IN ('f8_min_rest_post_pos', 'f8_extended_rest_long_fdp', 'f8_max_night_ft_30d')
        AND filiale = 'F8' AND is_deleted = 0
      ORDER BY instance_code
    LOOP
      INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
      VALUES (g_id, inst_id, true, ord, 'system', 'system')
      ON CONFLICT (group_id, instance_id) DO NOTHING;
      ord := ord + 1;
    END LOOP;
  END IF;

  -- CC gantt group (ccar121_c_gantt — skip if not yet created)
  SELECT id INTO g_id FROM rule_group
  WHERE group_code = 'ccar121_c_gantt' AND filiale = 'F8' AND is_deleted = 0;

  IF g_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO ord FROM rule_group_instance WHERE group_id = g_id;

    FOR inst_id IN
      SELECT id FROM rule_instance
      WHERE instance_code IN ('f8_c_max_segs_24h', 'f8_c_min_rest_post_pos')
        AND filiale = 'F8' AND is_deleted = 0
      ORDER BY instance_code
    LOOP
      INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order, created_by, updated_by)
      VALUES (g_id, inst_id, true, ord, 'system', 'system')
      ON CONFLICT (group_id, instance_id) DO NOTHING;
      ord := ord + 1;
    END LOOP;
  END IF;

END $$;
