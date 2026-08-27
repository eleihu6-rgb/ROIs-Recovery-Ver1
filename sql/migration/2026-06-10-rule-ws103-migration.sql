-- ============================================================
-- 2026-06-10  workset 103 法规迁移 + 模板整合
-- ============================================================
-- 变更内容：
--   Part A  新增合并模板：max_ft / max_duty_hours（替代各 _7d/_28d/_365d）
--           新增专项模板：acc_state / wocl_spacing / local_night_def /
--                        roster_spacing / credit_hours_calc
--   Part B  更新 min_gdo_count param_schema → 支持 windows 数组
--   Part C  合并现有 instance：
--             max_ft_7d_std + max_ft_28d_std + max_ft_365d_std
--               → max_ft_ccar_std
--             f8_max_dh_7d + f8_max_dh_28d + f8_max_dh_365d
--               → max_duty_hours_f8_std
--           更新 rule_group_instance 关联到新 instance
--           删除旧 instance + 旧 template
--   Part D  迁移 workset 103 的 14 条法规 → rule_instance
--           （不加 group，由用户自行加入法规集合）
--
-- 幂等：INSERT ... ON CONFLICT DO NOTHING；UPDATE 用 WHERE 保护
-- Schema：无前缀，通过 SET search_path 切换
-- ============================================================

-- ============================================================
-- Part A  新增模板
-- ============================================================

INSERT INTO rule_template (
  code, name, category, subcategory, description,
  reference, check_type, input_schema, param_schema,
  constraint_type, owner, template_vars
) VALUES

-- max_ft：多窗口飞行时间检查（替代 max_ft_7d/28d/365d）
('max_ft',
 'Maximum Flight Time (Multi-period)',
 'FLIGHT_TIME', 'CUMULATIVE',
 'Checks block hours do not exceed limits across multiple rolling calendar-day windows in a single pass.',
 NULL, 'CHECK',
 '{"required":["crew_id","window_end","flight_times"]}',
 '{
   "periods": {
     "type": "array",
     "description": "Rolling window limits; evaluated in order, all must pass",
     "items": {
       "type": "object",
       "required": ["days","limit_minutes"],
       "properties": {
         "days":          {"type":"integer","description":"Rolling window in calendar days"},
         "limit_minutes": {"type":"integer","description":"Max block time in minutes"}
       }
     }
   }
 }',
 'LINEAR', 'S',
 '[{"name":"window_days","label":"Window (days)","example":28},
   {"name":"actual_minutes","label":"Actual block time (min)","example":6200},
   {"name":"limit_minutes","label":"Limit (min)","example":6720}]'
),

-- max_duty_hours：多窗口值勤时间检查（替代 max_duty_hours_7d/28d/365d）
('max_duty_hours',
 'Maximum Duty Hours (Multi-period)',
 'DUTY', 'CUMULATIVE',
 'Checks cumulative duty period hours do not exceed limits across multiple rolling windows.',
 NULL, 'CHECK',
 '{"required":["crew_id","window_end","duty_times"]}',
 '{
   "periods": {
     "type": "array",
     "description": "Rolling window duty hour limits",
     "items": {
       "type": "object",
       "required": ["days","limit_minutes"],
       "properties": {
         "days":          {"type":"integer","description":"Rolling window in calendar days"},
         "limit_minutes": {"type":"integer","description":"Max duty hours in minutes"}
       }
     }
   }
 }',
 'LINEAR', 'S',
 '[{"name":"window_days","label":"Window (days)","example":7},
   {"name":"actual_minutes","label":"Actual duty hours (min)","example":3400},
   {"name":"limit_minutes","label":"Limit (min)","example":3600}]'
),

-- acc_state：疲劳基准-时区差/停留时长驱动的习服状态
('acc_state',
 'Acclimatisation State Definition',
 'FATIGUE', 'CALC',
 'Calculates crew acclimatisation state (acclimatised / partially / not) based on time-zone difference and layover stay duration.',
 NULL, 'CALC',
 '{"required":["tz_diff_hours","stay_duration_hours"]}',
 '{
   "tz_diff_table": {
     "type": "array",
     "description": "Maps TZ difference ranges to minimum stay duration ranges that achieve acclimatisation",
     "items": {
       "type": "object",
       "properties": {
         "tz_diff_range":  {"type":"string","description":"e.g. 00:00-04:00"},
         "min_stay_range": {"type":"string","description":"e.g. 72:00-96:00"}
       }
     }
   },
   "tz_adjust_rate": {
     "type": "object",
     "description": "Hours of stay required per 1 hour of TZ adjustment",
     "properties": {
       "stay_hours":      {"type":"number","description":"Stay hours"},
       "tz_adjust_hours": {"type":"number","description":"TZ adjustment hours earned"}
     }
   }
 }',
 NULL, 'S',
 '[{"name":"tz_diff_hours","label":"TZ difference (h)","example":5},
   {"name":"stay_hours","label":"Stay duration (h)","example":48},
   {"name":"acc_state","label":"Acclimatisation state","example":"PARTIAL"}]'
),

-- wocl_spacing：WOCL 间隔规则
('wocl_spacing',
 'WOCL Spacing Rule',
 'REST', 'CONDITIONAL',
 'Enforces minimum rolling-hour gap between duties that fall in WOCL windows.',
 NULL, 'CHECK',
 '{"required":["duties"]}',
 '{
   "rules": {
     "type": "array",
     "items": {
       "type": "object",
       "properties": {
         "prev_assignments":  {"type":"array","items":{"type":"string"},"description":"Preceding assignment types, e.g. [\"FLY\"]"},
         "next_assignments":  {"type":"array","items":{"type":"string"},"description":"Following assignment types"},
         "prev_attribute":    {"type":"string","description":"Required attribute on prev duty, e.g. WOCL"},
         "next_attribute":    {"type":"string","description":"Required attribute on next duty"},
         "utilize_post_rest": {"type":"boolean","description":"Credit post-duty rest toward spacing"},
         "level":             {"type":"string","enum":["D","P"],"description":"D=Duty-level P=Pairing-level"},
         "min_spacing_hours": {"type":"number","description":"Minimum gap in rolling hours"}
       }
     }
   }
 }',
 'BOOL', 'S',
 '[{"name":"prev_assignment","label":"Prev assignment","example":"FLY"},
   {"name":"next_assignment","label":"Next assignment","example":"FLY"},
   {"name":"gap_hours","label":"Actual gap (h)","example":48},
   {"name":"min_spacing_hours","label":"Required gap (h)","example":55}]'
),

-- local_night_def：本地夜间时段定义
('local_night_def',
 'Local Night Definition',
 'DUTY', 'CALC',
 'Defines the local night window used by FDP and rest calculations.',
 NULL, 'CALC',
 '{"required":["local_time"]}',
 '{
   "local_night_start":  {"type":"string","default":"22:00","description":"HH:MM start of local night"},
   "local_night_end":    {"type":"string","default":"08:00","description":"HH:MM end of local night"},
   "min_interval_hours": {"type":"number","default":8,"description":"Minimum continuous hours for local-night credit"}
 }',
 NULL, 'S',
 '[{"name":"local_night_start","label":"Night start","example":"22:00"},
   {"name":"local_night_end","label":"Night end","example":"08:00"}]'
),

-- roster_spacing：排班间隔规则（assignment-group 层级）
('roster_spacing',
 'Roster Spacing Rule',
 'REST', 'SINGLE',
 'Enforces a minimum rolling-hour gap between pairs of assignment groups on the roster.',
 NULL, 'CHECK',
 '{"required":["roster_assignments"]}',
 '{
   "rules": {
     "type": "array",
     "items": {
       "type": "object",
       "properties": {
         "from_assignment_groups": {"type":"array","items":{"type":"string"},"description":"e.g. [\"FLY\"]"},
         "to_assignment_groups":   {"type":"array","items":{"type":"string"},"description":"e.g. [\"FLY\",\"SBY\",\"SIM\"]"},
         "min_spacing_hours":      {"type":"number","description":"Minimum gap in rolling hours"},
         "directional":            {"type":"boolean","description":"True = only from→to, not to→from"},
         "utilize_post_rest":      {"type":"boolean","description":"Credit post-duty rest toward spacing"}
       }
     }
   }
 }',
 'LINEAR', 'S',
 '[{"name":"from_assignment","label":"From assignment","example":"FLY"},
   {"name":"to_assignment","label":"To assignment","example":"FLY"},
   {"name":"gap_hours","label":"Actual gap (h)","example":10},
   {"name":"min_spacing_hours","label":"Required gap (h)","example":13}]'
),

-- credit_hours_calc：信用小时计算配置
('credit_hours_calc',
 'Credit Hours Calculator',
 'FLIGHT_TIME', 'CALC',
 'Calculates crew credit hours from assignment types using configurable FT/DP ratios and minimum values.',
 NULL, 'CALC',
 '{"required":["duties"]}',
 '{
   "rules": {
     "type": "array",
     "description": "Assignment group → credit hour calculation method",
     "items": {
       "type": "object",
       "properties": {
         "assignment_groups": {"type":"array","items":{"type":"string"},"description":"e.g. [\"FLY\"]"},
         "min_credit_minutes":{"type":"integer","description":"Minimum credit regardless of actual (0 = no minimum)"},
         "ft_ratio":          {"type":"number","description":"Block time multiplier (null = not applicable)"},
         "dp_ratio":          {"type":"number","description":"Duty period multiplier (null = not applicable)"},
         "split_method":      {"type":"string","enum":["START","SPAN"],"description":"Which UTC day the credit is counted to"}
       }
     }
   }
 }',
 NULL, 'S',
 '[{"name":"assignment","label":"Assignment","example":"FLY"},
   {"name":"credit_minutes","label":"Credit hours (min)","example":360}]'
)

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Part B  更新 min_gdo_count param_schema → 支持 windows 数组
-- ============================================================
UPDATE rule_template
SET param_schema = '{
  "windows": {
    "type": "array",
    "description": "Rolling window GDO requirements; all windows must be satisfied",
    "items": {
      "type": "object",
      "required": ["hours","min_gdos"],
      "properties": {
        "hours":    {"type":"integer","description":"Rolling window in hours"},
        "min_gdos": {"type":"integer","description":"Minimum GDOs required in this window"}
      }
    }
  }
}'
WHERE code = 'min_gdo_count'
  AND param_schema::text NOT LIKE '%windows%';

-- ============================================================
-- Part C  合并现有 instance，更新 group 关联，删除旧数据
-- ============================================================

-- ── C1: 合并 max_ft_7d_std + _28d_std + _365d_std → max_ft_ccar_std ──

INSERT INTO rule_instance (
  template_code, instance_code, name, description, reference,
  severity, overridable, params, filiale, division, owner
)
SELECT
  'max_ft', 'max_ft_ccar_std',
  'Max Flight Time CCAR (7/28/365d)',
  'Merged multi-period flight time check: 7d 40h / 28d 100h / 365d 1000h (CCAR-121)',
  'CCAR-121-R5-121.487',
  'ERROR', false,
  '{"periods":[
    {"days":7,   "limit_minutes":2400},
    {"days":28,  "limit_minutes":6000},
    {"days":365, "limit_minutes":60000}
  ]}',
  filiale, division, owner
FROM rule_instance WHERE instance_code = 'max_ft_7d_std' AND is_deleted = 0
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

-- 将所有 group 里的 max_ft_7d_std / _28d_std / _365d_std 替换为 max_ft_ccar_std
-- 先保留 max_ft_7d_std 的 sort_order 作为新行的基准
DO $$
DECLARE
  new_id bigint;
  rec    RECORD;
BEGIN
  SELECT id INTO new_id FROM rule_instance
  WHERE instance_code = 'max_ft_ccar_std' AND is_deleted = 0 LIMIT 1;
  IF new_id IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT DISTINCT rgi.group_id,
           MIN(rgi.sort_order) AS base_sort,
           bool_and(rgi.enabled) AS enabled
    FROM rule_group_instance rgi
    JOIN rule_instance ri ON ri.id = rgi.instance_id
    WHERE ri.instance_code IN ('max_ft_7d_std','max_ft_28d_std','max_ft_365d_std')
      AND ri.is_deleted = 0
    GROUP BY rgi.group_id
  LOOP
    INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order)
    VALUES (rec.group_id, new_id, rec.enabled, rec.base_sort)
    ON CONFLICT (group_id, instance_id) DO NOTHING;

    DELETE FROM rule_group_instance
    WHERE group_id = rec.group_id
      AND instance_id IN (
        SELECT id FROM rule_instance
        WHERE instance_code IN ('max_ft_7d_std','max_ft_28d_std','max_ft_365d_std')
          AND is_deleted = 0
      );
  END LOOP;
END $$;

UPDATE rule_instance SET is_deleted = 1, updated_at = now()
WHERE instance_code IN ('max_ft_7d_std','max_ft_28d_std','max_ft_365d_std')
  AND is_deleted = 0;

-- ── C2: 合并 f8_max_dh_7d + _28d + _365d → max_duty_hours_f8_std ──

INSERT INTO rule_instance (
  template_code, instance_code, name, description, reference,
  severity, overridable, params, filiale, division, owner
)
SELECT
  'max_duty_hours', 'max_duty_hours_f8_std',
  'Max Duty Hours F8 (7/28/365d)',
  'Merged multi-period duty hours check: 7d 60h / 28d 192h / 365d 2200h (Flair F8)',
  'Flair',
  'ERROR', false,
  '{"periods":[
    {"days":7,   "limit_minutes":3600},
    {"days":28,  "limit_minutes":11520},
    {"days":365, "limit_minutes":132000}
  ]}',
  filiale, division, owner
FROM rule_instance WHERE instance_code = 'f8_max_dh_7d' AND is_deleted = 0
ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;

DO $$
DECLARE
  new_id bigint;
  rec    RECORD;
BEGIN
  SELECT id INTO new_id FROM rule_instance
  WHERE instance_code = 'max_duty_hours_f8_std' AND is_deleted = 0 LIMIT 1;
  IF new_id IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT DISTINCT rgi.group_id,
           MIN(rgi.sort_order) AS base_sort,
           bool_and(rgi.enabled) AS enabled
    FROM rule_group_instance rgi
    JOIN rule_instance ri ON ri.id = rgi.instance_id
    WHERE ri.instance_code IN ('f8_max_dh_7d','f8_max_dh_28d','f8_max_dh_365d')
      AND ri.is_deleted = 0
    GROUP BY rgi.group_id
  LOOP
    INSERT INTO rule_group_instance (group_id, instance_id, enabled, sort_order)
    VALUES (rec.group_id, new_id, rec.enabled, rec.base_sort)
    ON CONFLICT (group_id, instance_id) DO NOTHING;

    DELETE FROM rule_group_instance
    WHERE group_id = rec.group_id
      AND instance_id IN (
        SELECT id FROM rule_instance
        WHERE instance_code IN ('f8_max_dh_7d','f8_max_dh_28d','f8_max_dh_365d')
          AND is_deleted = 0
      );
  END LOOP;
END $$;

UPDATE rule_instance SET is_deleted = 1, updated_at = now()
WHERE instance_code IN ('f8_max_dh_7d','f8_max_dh_28d','f8_max_dh_365d')
  AND is_deleted = 0;

-- ── C3: 删除旧单周期模板（已无 instance 使用）──
DELETE FROM rule_template
WHERE code IN ('max_ft_7d','max_ft_28d','max_ft_365d',
               'max_duty_hours_7d','max_duty_hours_28d','max_duty_hours_365d');

-- ============================================================
-- Part D  迁移 workset 103 → 14 条 rule_instance
--         division=P, filiale=F8；不加入任何 group
-- ============================================================

INSERT INTO rule_instance (
  template_code, instance_code, name, description, reference,
  severity, overridable, params, conditions,
  message_template, filiale, division, owner
) VALUES

-- 8002/006  Maximum Flight Time (Flair, 28/90/365d)
('max_ft',
 'max_ft_flair_f8_p',
 'Max Flight Time – Flair F8 (28/90/365d)',
 'Block hour limits: 112h/28d · 300h/90d · 1000h/365d (Flair)',
 'Flair',
 'ERROR', false,
 '{"periods":[
   {"days":28,  "limit_minutes":6720},
   {"days":90,  "limit_minutes":18000},
   {"days":365, "limit_minutes":60000}
 ]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 8002/009  Maximum Hours of Work (Flair, 7/28/365d DP)
('max_duty_hours',
 'max_duty_hours_flair_f8_p',
 'Max Duty Hours – Flair F8 (7/28/365d)',
 'Duty period limits: 60h/7d · 192h/28d · 2200h/365d (Flair)',
 'Flair',
 'ERROR', false,
 '{"periods":[
   {"days":7,   "limit_minutes":3600},
   {"days":28,  "limit_minutes":11520},
   {"days":365, "limit_minutes":132000}
 ]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7272/001  Calculate DP of the Reserves
('duty_period_calculator',
 'dp_calc_reserves_f8_p',
 'Duty Period Calculator – Reserves (F8)',
 'Calculates duty period duration for reserve assignments',
 'F8',
 'INFO', false,
 '{}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7500/002  Basic definition of Acc State
('acc_state',
 'acc_state_f8_p',
 'Acclimatisation State – F8',
 'TZ-diff/stay-duration table for acclimatisation state calculation',
 'Duty',
 'INFO', false,
 '{"tz_diff_table":[
   {"tz_diff_range":"00:00-04:00","min_stay_range":"72:00-96:00"},
   {"tz_diff_range":"04:00-24:00","min_stay_range":"96:00-999:00"}
 ],
 "tz_adjust_rate":{"stay_hours":24,"tz_adjust_hours":1}}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7501/004  Single Day Free from Duty (rolling windows: 168h/1 GDO + 672h/4 GDOs)
('min_gdo_count',
 'min_gdo_rolling_f8_p',
 'Min GDO Rolling Windows – F8',
 '1 GDO in any 168h · 4 GDOs in any 672h rolling window',
 'F8',
 'ERROR', false,
 '{"windows":[
   {"hours":168,"min_gdos":1},
   {"hours":672,"min_gdos":4}
 ]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7502/002  The Calculation of Credit Hours
('credit_hours_calc',
 'credit_hours_calc_f8_p',
 'Credit Hours Calculator – F8',
 'Credit hour ratios: DO/LO/LEA/SBY min 4h · FLY 1:1 BH · GND 0.5 DP',
 'F8',
 'INFO', false,
 '{"rules":[
   {"assignment_groups":["DO","LO","LEA","SBY"],"min_credit_minutes":240,"ft_ratio":null,"dp_ratio":null,"split_method":"START"},
   {"assignment_groups":["FLY"],"min_credit_minutes":0,"ft_ratio":1.0,"dp_ratio":null,"split_method":"START"},
   {"assignment_groups":["GND"],"min_credit_minutes":0,"ft_ratio":null,"dp_ratio":0.5,"split_method":"START"}
 ]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7503/003  Limits of Consecutive WOCLs (WOCL 02:00-05:59, max 3)
('max_consecutive_wocl',
 'max_consec_wocl_f8_p',
 'Max Consecutive WOCL Duties – F8',
 'No more than 3 consecutive duties touching WOCL (02:00-05:59)',
 'F8',
 'ERROR', false,
 '{"wocl_start":"02:00","wocl_end":"05:59","max_consecutive":3}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7504/003  Spacing Rule - WOCL (FLY→FLY, WOCL→WOCL, 55h)
('wocl_spacing',
 'wocl_spacing_f8_p',
 'WOCL Spacing – F8',
 'Min 55h between duties with WOCL attribute (FLY→FLY), using post-rest',
 'F8',
 'ERROR', false,
 '{"rules":[{
   "prev_assignments":["FLY"],
   "next_assignments":["FLY"],
   "prev_attribute":"WOCL",
   "next_attribute":"WOCL",
   "utilize_post_rest":true,
   "level":"D",
   "min_spacing_hours":55
 }]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7505/002  Min # GDOs in a RP（无具体参数，待补充）
('min_gdo_count',
 'min_gdo_rp_f8_p',
 'Min GDO per Roster Period – F8',
 'Minimum GDOs per roster period (parameters to be configured)',
 'ROIs',
 'ERROR', false,
 '{"windows":[]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 7506/002  One Checkin Per Day
('single_daily_checkin',
 'single_checkin_f8_p',
 'Single Daily Check-in – F8',
 'Only one duty check-in allowed per calendar day',
 'ROIs',
 'ERROR', false,
 '{}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 8004/004  Basic Competency-F8 (BASE check enabled, RANK/FLEET disabled)
('qual_fleet',
 'qual_competency_f8_p',
 'Basic Competency – F8',
 'Base-level competency check (BASE=Y); rank/fleet checks disabled',
 'ROIs',
 'ERROR', false,
 '{"check_base":true,"check_rank":false,"check_fleet":false}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 8030/004  Age Restriction (P division, max 65, max 1 such pilot per pairing)
('age_restriction',
 'age_restriction_f8_p',
 'Age Restriction – F8',
 'Pilots aged ≥65 may not operate (division=P, max 1 per pairing)',
 'ROIs',
 'ERROR', false,
 '{"division":"P","max_age":65,"max_count":1}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 8056/006  Roster Spacing (FLY → FLY|SBY|SIM, 13h, directional, post-rest)
('roster_spacing',
 'roster_spacing_f8_p',
 'Roster Spacing 13h – F8',
 'Min 13h between FLY and next FLY/SBY/SIM on roster (directional, utilize post-rest)',
 'Flair',
 'ERROR', false,
 '{"rules":[{
   "from_assignment_groups":["FLY"],
   "to_assignment_groups":["FLY","SBY","SIM"],
   "min_spacing_hours":13,
   "directional":true,
   "utilize_post_rest":true
 }]}',
 NULL, NULL, 'F8', 'P', 'C'),

-- 2014/014  Local Night Definition
('local_night_def',
 'local_night_f8_p',
 'Local Night Definition – F8',
 'Local night window 22:00-08:00, minimum 8h interval',
 'ROIs',
 'INFO', false,
 '{"local_night_start":"22:00","local_night_end":"08:00","min_interval_hours":8}',
 NULL, NULL, 'F8', 'P', 'C')

ON CONFLICT (instance_code, filiale, division) WHERE is_deleted = 0 DO NOTHING;
