-- ============================================================
-- 07-rule-template.sql — 法规模板定义
-- ============================================================
-- 功能：初始化 rule_template 表，预置核心法规算法模板
--       涵盖 FDP、飞行时间、休息时间、值勤时间、疲劳、
--       资质、编制等分类
-- 表：  rule_template
-- 幂等：INSERT ... ON CONFLICT (code) DO NOTHING
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- ============================================================
-- FDP（Flight Duty Period）— 飞行执勤时间限制
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('max_fdp',
     'Maximum FDP / 最大飞行执勤时间',
     'FDP', 'SINGLE',
     'Checks that FDP does not exceed the limit based on report time, number of sectors and acclimatisation state. Supports extension by commander discretion.',
     'CCAR-121-R5-121.489',
     'CHECK',
     '{"required":["duty","sectors","report_time_local"]}',
     '{"base_limit_minutes":{"type":"integer","default":780,"min":480,"max":1080},"sector_adjustments":{"type":"array","items":{"sectors":"integer","reduction":"integer"}},"extension_limit_minutes":{"type":"integer","default":120}}',
     'LINEAR', 'S'),

    ('max_fdp_split',
     'Maximum Split Duty FDP / 拆分执勤最大FDP',
     'FDP', 'CONDITIONAL',
     'Extended FDP limit when duty contains a qualified rest break at a suitable facility.',
     'CCAR-121-R5-121.491',
     'CHECK',
     '{"required":["duty","rest_break","facility_class"]}',
     '{"min_break_minutes":{"type":"integer","default":180},"credit_ratio":{"type":"number","default":0.5},"max_credit_minutes":{"type":"integer","default":240}}',
     'LINEAR', 'S'),

    ('max_fdp_extension',
     'Commander FDP Extension / 机长延伸FDP',
     'FDP', 'CONDITIONAL',
     'Validates commander discretion FDP extension does not exceed maximum allowed.',
     'CCAR-121-R5-121.493',
     'CHECK',
     '{"required":["duty","commander_extension_flag"]}',
     '{"max_extension_minutes":{"type":"integer","default":120},"max_extensions_per_period":{"type":"integer","default":2}}',
     'BOOL', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- FLIGHT_TIME — 飞行时间累计限制
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('max_ft_24h',
     'Max Flight Time 24h / 24小时最大飞行时间',
     'FLIGHT_TIME', 'CUMULATIVE',
     'Cumulative flight time must not exceed the limit in any rolling 24-hour window.',
     'CCAR-121-R5-121.487',
     'CHECK',
     '{"required":["crew_id","window_start","window_end","flight_times"]}',
     '{"limit_minutes":{"type":"integer","default":540}}',
     'LINEAR', 'S'),

    ('max_ft_7d',
     'Max Flight Time 7 days / 7天最大飞行时间',
     'FLIGHT_TIME', 'CUMULATIVE',
     'Cumulative flight time in any rolling 7-day period.',
     'CCAR-121-R5-121.487',
     'CHECK',
     '{"required":["crew_id","window_start","window_end","flight_times"]}',
     '{"limit_minutes":{"type":"integer","default":2400}}',
     'LINEAR', 'S'),

    ('max_ft_28d',
     'Max Flight Time 28 days / 28天最大飞行时间',
     'FLIGHT_TIME', 'CUMULATIVE',
     'Cumulative flight time in any rolling 28-day period.',
     'CCAR-121-R5-121.487',
     'CHECK',
     '{"required":["crew_id","window_start","window_end","flight_times"]}',
     '{"limit_minutes":{"type":"integer","default":6000}}',
     'LINEAR', 'S'),

    ('max_ft_365d',
     'Max Flight Time 365 days / 年度最大飞行时间',
     'FLIGHT_TIME', 'CUMULATIVE',
     'Cumulative flight time in any rolling 365-day (calendar year) period.',
     'CCAR-121-R5-121.487',
     'CHECK',
     '{"required":["crew_id","window_start","window_end","flight_times"]}',
     '{"limit_minutes":{"type":"integer","default":60000}}',
     'LINEAR', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- REST — 休息时间限制
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('min_rest',
     'Minimum Rest Period / 最小休息时间',
     'REST', 'SINGLE',
     'Rest between consecutive duties must not be less than the minimum. Depends on prior FDP duration.',
     'CCAR-121-R5-121.495',
     'CHECK',
     '{"required":["prior_duty_end","next_duty_start","prior_fdp_minutes"]}',
     '{"base_rest_minutes":{"type":"integer","default":600},"rest_ratio":{"type":"number","default":1.0},"absolute_min_minutes":{"type":"integer","default":600}}',
     'LINEAR', 'S'),

    ('min_rest_weekly',
     'Weekly Rest / 周休息',
     'REST', 'CUMULATIVE',
     'Crew must have at least one consecutive rest period of specified duration in every 7-day window.',
     'CCAR-121-R5-121.497',
     'CHECK',
     '{"required":["crew_id","window_start","window_end","duties"]}',
     '{"min_consecutive_hours":{"type":"integer","default":36},"period_days":{"type":"integer","default":7}}',
     'BOOL', 'S'),

    ('min_rest_post_night',
     'Post Night Duty Rest / 夜航后休息',
     'REST', 'CONDITIONAL',
     'Extended rest requirement after night duties (duties ending between 00:00-06:00 local time).',
     'CCAR-121-R5-121.495',
     'CHECK',
     '{"required":["duty_end_local","next_duty_start"]}',
     '{"night_end_hour":{"type":"integer","default":6},"min_rest_minutes":{"type":"integer","default":720}}',
     'LINEAR', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- DUTY — 值勤时间限制
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('max_dp',
     'Maximum Duty Period / 最大值勤时间',
     'DUTY', 'SINGLE',
     'Total duty period (including ground duties and standby) must not exceed the maximum.',
     'CCAR-121-R5-121.489',
     'CHECK',
     '{"required":["duty_start","duty_end"]}',
     '{"limit_minutes":{"type":"integer","default":960}}',
     'LINEAR', 'S'),

    ('max_dp_7d',
     'Max Duty 7 days / 7天最大值勤时间',
     'DUTY', 'CUMULATIVE',
     'Cumulative duty time in any rolling 7-day period.',
     'CCAR-121-R5-121.489',
     'CHECK',
     '{"required":["crew_id","window_start","window_end","duty_times"]}',
     '{"limit_minutes":{"type":"integer","default":3600}}',
     'LINEAR', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- FATIGUE — 疲劳管理
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('fatigue_risk_index',
     'Fatigue Risk Index / 疲劳风险指数',
     'FATIGUE', 'SINGLE',
     'Calculates FRMS fatigue risk score for a duty. Triggers alert if above threshold.',
     'CCAR-121-R5-121.499',
     'BOTH',
     '{"required":["duty","sleep_history","timezone_history"]}',
     '{"warning_threshold":{"type":"number","default":70},"error_threshold":{"type":"number","default":85},"model_version":{"type":"string","default":"SAFTE_v3"}}',
     'CALC', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- QUALIFICATION — 资质检查
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('qual_airport',
     'Airport Qualification / 机场资质检查',
     'QUALIFICATION', 'SINGLE',
     'Validates crew holds required airport qualifications (HP, HP2, RNP, CAT II/III, etc.).',
     'CCAR-121-R5-Sec4.32',
     'CHECK',
     '{"required":["crew_id","airport_code","duty_date"]}',
     '{"check_plateau":{"type":"boolean","default":true},"check_rnp":{"type":"boolean","default":true},"check_cat":{"type":"boolean","default":true}}',
     'BOOL', 'S'),

    ('qual_fleet',
     'Fleet Qualification / 机型资质检查',
     'QUALIFICATION', 'SINGLE',
     'Validates crew holds valid type rating for the assigned fleet.',
     'CCAR-121-R5-Sec4.33',
     'CHECK',
     '{"required":["crew_id","fleet_code","duty_date"]}',
     '{"check_sub_fleet":{"type":"boolean","default":false}}',
     'BOOL', 'S'),

    ('qual_recency',
     'Recency Qualification / 近期经历检查',
     'QUALIFICATION', 'CUMULATIVE',
     'Validates crew meets recency requirements (e.g. 3 takeoffs/landings in 90 days).',
     'CCAR-121-R5-121.481',
     'CHECK',
     '{"required":["crew_id","fleet_code","duty_date","flight_log"]}',
     '{"min_landings":{"type":"integer","default":3},"period_days":{"type":"integer","default":90}}',
     'BOOL', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- COMPOSITION — 编制检查
-- ============================================================
INSERT INTO rule_template (code, name, category, subcategory, description, reference, check_type, input_schema, param_schema, constraint_type, owner) VALUES
    ('composition_check',
     'Crew Composition Check / 机组编制检查',
     'COMPOSITION', 'SINGLE',
     'Validates assigned crew meets minimum rank composition requirements for the flight.',
     'CCAR-121-R5-121.471',
     'CHECK',
     '{"required":["pairing_id","assigned_crew"]}',
     '{"allow_acting":{"type":"boolean","default":true}}',
     'BOOL', 'S')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- end of 07-rule-template.sql
-- ============================================================
