-- ============================================================
-- 07b-rule-instance-group.sql — 法规实例 + 法规集合 + 集合项
-- ============================================================
-- 功能：基于 rule_template 创建法规实例（f8 航司 CCAR-121 标准参数），
--       创建法规集合并关联实例
-- 表：  rule_template (补充 CALC 模板)
--       rule_instance
--       rule_group
--       rule_group_instance
-- 幂等：INSERT ... ON CONFLICT DO NOTHING
-- 依赖：07-rule-template.sql (rule_template 数据已存在)
-- 修改记录：
--   2026-04-01  初始创建
-- ============================================================

-- ============================================================
-- 补充 Calculator 类型的 rule_template（纯计算模板）
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('fdp_calculator',
     'FDP Calculator / FDP计算器',
     'FDP', 'CALC',
     'Calculates Flight Duty Period duration in minutes for each duty.',
     'CCAR-121-R5-121.489',
     'CALC',
     '{"required":["duty"]}',
     '{}',
     NULL, 'S'),

    ('flight_hour_calculator',
     'Flight Hour Calculator / 飞行时间计算器',
     'FLIGHT_TIME', 'CALC',
     'Calculates total block time and cumulative flight hours over rolling windows.',
     'CCAR-121-R5-121.487',
     'CALC',
     '{"required":["duties","segments"]}',
     '{}',
     NULL, 'S'),

    ('duty_period_calculator',
     'Duty Period Calculator / 值勤时间计算器',
     'DUTY', 'CALC',
     'Calculates duty period duration including ground tasks.',
     'CCAR-121-R5-121.489',
     'CALC',
     '{"required":["duty"]}',
     '{}',
     NULL, 'S'),

    ('rest_calculator',
     'Rest Calculator / 休息时间计算器',
     'REST', 'CALC',
     'Calculates rest period between consecutive duties.',
     'CCAR-121-R5-121.495',
     'CALC',
     '{"required":["duties"]}',
     '{}',
     NULL, 'S')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- rule_instance — f8 航司飞行员（P）法规实例
-- ============================================================
-- 使用 CCAR-121-R5 标准参数值

-- ── FDP 检查 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    -- FDP 计算器
    ('fdp_calculator', 'fdp_calc_std', 'FDP Calculator (Standard)', 'Standard FDP calculation',
     'CCAR-121-R5-121.489', 'INFO', false, '{}', NULL, 'F8', 'P'),

    -- 最大 FDP
    ('max_fdp', 'max_fdp_std', 'Max FDP (Standard)', 'Maximum FDP based on segments and report time',
     'CCAR-121-R5-121.489', 'ERROR', false,
     '{"base_limit_minutes":780,"fdp_table":[{"min_seg":1,"max_seg":1,"windows":[{"start":"06:00","end":"13:59","limit":780},{"start":"14:00","end":"17:59","limit":720},{"start":"18:00","end":"21:59","limit":660},{"start":"22:00","end":"05:59","limit":600}]},{"min_seg":2,"max_seg":2,"windows":[{"start":"06:00","end":"13:59","limit":750},{"start":"14:00","end":"17:59","limit":690},{"start":"18:00","end":"21:59","limit":630},{"start":"22:00","end":"05:59","limit":570}]},{"min_seg":3,"max_seg":3,"windows":[{"start":"06:00","end":"13:59","limit":720},{"start":"14:00","end":"17:59","limit":660},{"start":"18:00","end":"21:59","limit":600},{"start":"22:00","end":"05:59","limit":570}]},{"min_seg":4,"max_seg":4,"windows":[{"start":"06:00","end":"13:59","limit":690},{"start":"14:00","end":"17:59","limit":630},{"start":"18:00","end":"21:59","limit":570},{"start":"22:00","end":"05:59","limit":540}]},{"min_seg":5,"max_seg":99,"windows":[{"start":"06:00","end":"13:59","limit":660},{"start":"14:00","end":"17:59","limit":600},{"start":"18:00","end":"21:59","limit":570},{"start":"22:00","end":"05:59","limit":540}]}]}',
     NULL, 'F8', 'P'),

    -- 拆分执勤 FDP
    ('max_fdp_split', 'max_fdp_split_std', 'Split Duty FDP', 'Extended FDP with qualified rest break',
     'CCAR-121-R5-121.491', 'ERROR', false,
     '{"min_break_minutes":180,"credit_ratio":0.5,"max_credit_minutes":240}',
     NULL, 'F8', 'P'),

    -- 机长延伸 FDP
    ('max_fdp_extension', 'max_fdp_ext_std', 'Commander FDP Extension', 'Commander discretion extension',
     'CCAR-121-R5-121.493', 'WARNING', true,
     '{"max_extension_minutes":120,"max_extensions_per_period":2}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ── 飞行时间检查 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    -- 飞行时间计算器
    ('flight_hour_calculator', 'ft_calc_std', 'Flight Hour Calculator (Standard)', 'Cumulative flight time calculation',
     'CCAR-121-R5-121.487', 'INFO', false, '{}', NULL, 'F8', 'P'),

    -- 24h 飞行时间
    ('max_ft_24h', 'max_ft_24h_std', 'Max Flight Time 24h', '24-hour rolling window flight time limit',
     'CCAR-121-R5-121.487', 'ERROR', false,
     '{"limit_minutes":540}',
     NULL, 'F8', 'P'),

    -- 7d 飞行时间
    ('max_ft_7d', 'max_ft_7d_std', 'Max Flight Time 7d', '7-day rolling window flight time limit',
     'CCAR-121-R5-121.487', 'ERROR', false,
     '{"limit_minutes":2400}',
     NULL, 'F8', 'P'),

    -- 28d 飞行时间
    ('max_ft_28d', 'max_ft_28d_std', 'Max Flight Time 28d', '28-day rolling window flight time limit',
     'CCAR-121-R5-121.487', 'ERROR', false,
     '{"limit_minutes":6000}',
     NULL, 'F8', 'P'),

    -- 365d 飞行时间
    ('max_ft_365d', 'max_ft_365d_std', 'Max Flight Time 365d', 'Annual flight time limit',
     'CCAR-121-R5-121.487', 'ERROR', false,
     '{"limit_minutes":60000}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ── 休息时间检查 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    -- 休息时间计算器
    ('rest_calculator', 'rest_calc_std', 'Rest Calculator (Standard)', 'Rest period calculation',
     'CCAR-121-R5-121.495', 'INFO', false, '{}', NULL, 'F8', 'P'),

    -- 最小休息
    ('min_rest', 'min_rest_std', 'Minimum Rest Period', 'Minimum rest between duties',
     'CCAR-121-R5-121.495', 'ERROR', false,
     '{"base_rest_minutes":600,"rest_ratio":1.0,"absolute_min_minutes":600}',
     NULL, 'F8', 'P'),

    -- 周休息
    ('min_rest_weekly', 'min_rest_weekly_std', 'Weekly Rest', 'Minimum consecutive rest in 7-day window',
     'CCAR-121-R5-121.497', 'ERROR', false,
     '{"min_consecutive_hours":36,"period_days":7}',
     NULL, 'F8', 'P'),

    -- 夜航后休息
    ('min_rest_post_night', 'min_rest_night_std', 'Post Night Duty Rest', 'Extended rest after night duties',
     'CCAR-121-R5-121.495', 'WARNING', false,
     '{"night_end_hour":6,"min_rest_minutes":720}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ── 值勤时间检查 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    -- 值勤时间计算器
    ('duty_period_calculator', 'dp_calc_std', 'Duty Period Calculator (Standard)', 'Duty period calculation',
     'CCAR-121-R5-121.489', 'INFO', false, '{}', NULL, 'F8', 'P'),

    -- 最大值勤时间
    ('max_dp', 'max_dp_std', 'Maximum Duty Period', 'Maximum single duty period',
     'CCAR-121-R5-121.489', 'ERROR', false,
     '{"limit_minutes":960}',
     NULL, 'F8', 'P'),

    -- 7天值勤累计
    ('max_dp_7d', 'max_dp_7d_std', 'Max Duty 7 days', '7-day cumulative duty limit',
     'CCAR-121-R5-121.489', 'ERROR', false,
     '{"limit_minutes":3600}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ── 疲劳管理 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    ('fatigue_risk_index', 'fatigue_std', 'Fatigue Risk Index', 'FRMS fatigue risk scoring',
     'CCAR-121-R5-121.499', 'WARNING', false,
     '{"warning_threshold":70,"error_threshold":85,"model_version":"SAFTE_v3"}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ── 资质检查 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    ('qual_airport', 'qual_airport_std', 'Airport Qualification', 'Airport qualification check',
     'CCAR-121-R5-Sec4.32', 'ERROR', false,
     '{"check_plateau":true,"check_rnp":true,"check_cat":true}',
     NULL, 'F8', 'P'),

    ('qual_fleet', 'qual_fleet_std', 'Fleet Qualification', 'Fleet type rating check',
     'CCAR-121-R5-Sec4.33', 'ERROR', false,
     '{"check_sub_fleet":false}',
     NULL, 'F8', 'P'),

    ('qual_recency', 'qual_recency_std', 'Recency Check', 'Recent landing experience check',
     'CCAR-121-R5-121.481', 'ERROR', false,
     '{"min_landings":3,"period_days":90}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- ── 编制检查 ──
INSERT INTO rule_instance (template_code, instance_code, name, description, reference, severity, overridable, params, conditions, filiale, division) VALUES
    ('composition_check', 'composition_std', 'Crew Composition Check', 'Minimum rank composition for flight',
     'CCAR-121-R5-121.471', 'ERROR', false,
     '{"allow_acting":true}',
     NULL, 'F8', 'P')
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;


-- ============================================================
-- rule_group — 法规集合
-- ============================================================
INSERT INTO rule_group (group_code, name, description, usage, filiale, division, is_default) VALUES
    ('ccar121_gantt', 'CCAR-121 Gantt Full Check',
     'Complete CCAR-121 rule set for Gantt real-time validation',
     'GANTT', 'F8', 'P', true),

    ('ccar121_po', 'CCAR-121 PO Optimization',
     'CCAR-121 rules for pairing optimization constraints',
     'PO', 'F8', 'P', true),

    ('ccar121_ro', 'CCAR-121 RO Optimization',
     'CCAR-121 rules for roster optimization constraints',
     'RO', 'F8', 'P', true),

    ('ccar121_pbs', 'CCAR-121 PBS Bidding',
     'CCAR-121 rules for PBS bid validation',
     'PBS', 'F8', 'P', true)
ON CONFLICT (group_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;


-- ============================================================
-- rule_group_instance — Gantt 集合项（关联所有检查类实例）
-- ============================================================
-- 使用子查询获取 group_id 和 instance_id，避免硬编码 ID

-- Gantt 集合：包含所有法规（计算器 + 检查器）
INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order)
SELECT g.id, i.id, true,
    CASE i.instance_code
        -- Calculators first (sort 1xx)
        WHEN 'fdp_calc_std'         THEN 100
        WHEN 'ft_calc_std'          THEN 101
        WHEN 'dp_calc_std'          THEN 102
        WHEN 'rest_calc_std'        THEN 103
        -- FDP checks (sort 2xx)
        WHEN 'max_fdp_std'          THEN 200
        WHEN 'max_fdp_split_std'    THEN 201
        WHEN 'max_fdp_ext_std'      THEN 202
        -- Flight time checks (sort 3xx)
        WHEN 'max_ft_24h_std'       THEN 300
        WHEN 'max_ft_7d_std'        THEN 301
        WHEN 'max_ft_28d_std'       THEN 302
        WHEN 'max_ft_365d_std'      THEN 303
        -- Rest checks (sort 4xx)
        WHEN 'min_rest_std'         THEN 400
        WHEN 'min_rest_weekly_std'  THEN 401
        WHEN 'min_rest_night_std'   THEN 402
        -- Duty checks (sort 5xx)
        WHEN 'max_dp_std'           THEN 500
        WHEN 'max_dp_7d_std'        THEN 501
        -- Fatigue (sort 6xx)
        WHEN 'fatigue_std'          THEN 600
        -- Qualifications (sort 7xx)
        WHEN 'qual_airport_std'     THEN 700
        WHEN 'qual_fleet_std'       THEN 701
        WHEN 'qual_recency_std'     THEN 702
        -- Composition (sort 8xx)
        WHEN 'composition_std'      THEN 800
        ELSE 999
    END
FROM rule_group g, rule_instance i
WHERE g.group_code = 'ccar121_gantt'
  AND g.filiale = 'F8' AND g.division = 'P'
  AND i.filiale = 'F8' AND i.division = 'P'
  AND i.is_deleted = 0
ON CONFLICT (group_id, instance_id) DO NOTHING;

-- PO 集合：与 Gantt 相同法规（资质类 severity 在 instance 上直接设置，无需 group 级覆盖）
INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order)
SELECT g.id, i.id, true,
    CASE i.instance_code
        WHEN 'fdp_calc_std'         THEN 100
        WHEN 'ft_calc_std'          THEN 101
        WHEN 'dp_calc_std'          THEN 102
        WHEN 'rest_calc_std'        THEN 103
        WHEN 'max_fdp_std'          THEN 200
        WHEN 'max_fdp_split_std'    THEN 201
        WHEN 'max_fdp_ext_std'      THEN 202
        WHEN 'max_ft_24h_std'       THEN 300
        WHEN 'max_ft_7d_std'        THEN 301
        WHEN 'max_ft_28d_std'       THEN 302
        WHEN 'max_ft_365d_std'      THEN 303
        WHEN 'min_rest_std'         THEN 400
        WHEN 'min_rest_weekly_std'  THEN 401
        WHEN 'min_rest_night_std'   THEN 402
        WHEN 'max_dp_std'           THEN 500
        WHEN 'max_dp_7d_std'        THEN 501
        WHEN 'fatigue_std'          THEN 600
        WHEN 'qual_airport_std'     THEN 700
        WHEN 'qual_fleet_std'       THEN 701
        WHEN 'qual_recency_std'     THEN 702
        WHEN 'composition_std'      THEN 800
        ELSE 999
    END
FROM rule_group g, rule_instance i
WHERE g.group_code = 'ccar121_po'
  AND g.filiale = 'F8' AND g.division = 'P'
  AND i.filiale = 'F8' AND i.division = 'P'
  AND i.is_deleted = 0
ON CONFLICT (group_id, instance_id) DO NOTHING;

-- RO 集合：与 PO 相同
INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order)
SELECT g.id, i.id, true,
    CASE i.instance_code
        WHEN 'fdp_calc_std'         THEN 100
        WHEN 'ft_calc_std'          THEN 101
        WHEN 'dp_calc_std'          THEN 102
        WHEN 'rest_calc_std'        THEN 103
        WHEN 'max_fdp_std'          THEN 200
        WHEN 'max_fdp_split_std'    THEN 201
        WHEN 'max_fdp_ext_std'      THEN 202
        WHEN 'max_ft_24h_std'       THEN 300
        WHEN 'max_ft_7d_std'        THEN 301
        WHEN 'max_ft_28d_std'       THEN 302
        WHEN 'max_ft_365d_std'      THEN 303
        WHEN 'min_rest_std'         THEN 400
        WHEN 'min_rest_weekly_std'  THEN 401
        WHEN 'min_rest_night_std'   THEN 402
        WHEN 'max_dp_std'           THEN 500
        WHEN 'max_dp_7d_std'        THEN 501
        WHEN 'fatigue_std'          THEN 600
        WHEN 'qual_airport_std'     THEN 700
        WHEN 'qual_fleet_std'       THEN 701
        WHEN 'qual_recency_std'     THEN 702
        WHEN 'composition_std'      THEN 800
        ELSE 999
    END
FROM rule_group g, rule_instance i
WHERE g.group_code = 'ccar121_ro'
  AND g.filiale = 'F8' AND g.division = 'P'
  AND i.filiale = 'F8' AND i.division = 'P'
  AND i.is_deleted = 0
ON CONFLICT (group_id, instance_id) DO NOTHING;

-- PBS 集合：去掉疲劳检查（PBS 不需要），其余同 Gantt
INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order)
SELECT g.id, i.id,
    CASE WHEN i.template_code = 'fatigue_risk_index' THEN false ELSE true END,
    CASE i.instance_code
        WHEN 'fdp_calc_std'         THEN 100
        WHEN 'ft_calc_std'          THEN 101
        WHEN 'dp_calc_std'          THEN 102
        WHEN 'rest_calc_std'        THEN 103
        WHEN 'max_fdp_std'          THEN 200
        WHEN 'max_fdp_split_std'    THEN 201
        WHEN 'max_fdp_ext_std'      THEN 202
        WHEN 'max_ft_24h_std'       THEN 300
        WHEN 'max_ft_7d_std'        THEN 301
        WHEN 'max_ft_28d_std'       THEN 302
        WHEN 'max_ft_365d_std'      THEN 303
        WHEN 'min_rest_std'         THEN 400
        WHEN 'min_rest_weekly_std'  THEN 401
        WHEN 'min_rest_night_std'   THEN 402
        WHEN 'max_dp_std'           THEN 500
        WHEN 'max_dp_7d_std'        THEN 501
        WHEN 'fatigue_std'          THEN 600
        WHEN 'qual_airport_std'     THEN 700
        WHEN 'qual_fleet_std'       THEN 701
        WHEN 'qual_recency_std'     THEN 702
        WHEN 'composition_std'      THEN 800
        ELSE 999
    END
FROM rule_group g, rule_instance i
WHERE g.group_code = 'ccar121_pbs'
  AND g.filiale = 'F8' AND g.division = 'P'
  AND i.filiale = 'F8' AND i.division = 'P'
  AND i.is_deleted = 0
ON CONFLICT (group_id, instance_id) DO NOTHING;

-- ============================================================
-- end of 07b-rule-instance-group.sql
-- ============================================================
