-- ============================================================
-- 03-assignment.sql — 任务类型、任务分组、分组映射
-- ============================================================
-- 功能：初始化 assignment、assignment_group、assignment_group_map 表
-- 表：  assignment, assignment_group, assignment_group_map
-- 幂等：INSERT ... ON CONFLICT DO NOTHING
-- 修改记录：
--   2026-03-25  初始创建
--   2026-05-07  修正 assignment_group 代码为简短格式（FLT/DHD/GND等）
--   2026-05-07  移除 description/name 中的中文部分
-- ============================================================

-- ============================================================
-- assignment_group — 任务分组
-- ============================================================
INSERT INTO assignment_group (assignment_group, name, allow_overlap, optimizer_indicator) VALUES
    ('FLT',   'Flight Duties',           0, 1),
    ('GND',   'Ground Duties',           0, 1),
    ('TRN',   'Training',                1, 0),
    ('SBY',   'Standby',                 0, 1),
    ('LVE',   'Leave',                   0, 0),
    ('ADM',   'Administration',          1, 0),
    ('DHD',   'Deadhead',                0, 1)
ON CONFLICT (assignment_group) DO NOTHING;

-- ============================================================
-- assignment — 任务类型定义
-- ============================================================
INSERT INTO assignment (assignment, description, type, is_rest, color_hex, label, standalone, bt_pct, fdp_pct, dp_pct, is_adhoc, default_location, is_recency, ft_pct, is_qualifier, wp_pct, divide_crew_manday, reca_label, default_assignment_group, dp_gap) VALUES
    -- 飞行类
    ('FLT',  'Flight',              'W', 0, '4A90D9', 'F',   'N', 1.00, 1.00, 1.00, 0, null, 1, 1.00, 0, 1.00, 'E', 'Y', 'FLT',   0),
    ('IOE',  'IOE',                 'W', 0, '6A5ACD', 'IOE', 'N', 1.00, 1.00, 1.00, 0, null, 1, 1.00, 1, 1.00, 'E', 'Y', 'FLT',   0),
    ('DH',   'Deadhead',            'W', 0, 'A0A0A0', 'DH',  'N', 0.00, 1.00, 1.00, 0, null, 0, 0.00, 0, 1.00, 'E', 'Y', 'DHD',   0),
    ('PAX',  'Positioning',         'W', 0, 'B0B0B0', 'PAX', 'N', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'DHD',   0),

    -- 地面值勤类
    ('OFC',  'Office Duty',         'W', 0, 'FFB347', 'OFC', 'Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'GND',   0),
    ('BRF',  'Briefing',            'W', 0, 'FFC857', 'BRF', 'Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'GND',   0),

    -- 行政类
    ('MTG',  'Meeting',             'W', 0, 'FFD87F', 'MTG', 'Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'ADM',   0),
    ('MED',  'Medical Check',       'W', 0, 'E8A0BF', 'MED', 'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'ADM',   0),

    -- 训练类
    ('TRN',  'Training',            'T', 0, '7B68EE', 'T',   'Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'TRN',   0),
    ('SIM',  'Simulator',           'T', 0, '9370DB', 'SIM', 'Y', 0.00, 0.00, 1.00, 0, null, 1, 0.00, 1, 0.00, 'E', 'Y', 'TRN',   0),
    ('CRE',  'CRE',                 'T', 0, '8B7BD8', 'CRE', 'Y', 0.00, 0.00, 1.00, 0, null, 1, 0.00, 1, 0.00, 'E', 'Y', 'TRN',   0),

    -- 待命类
    ('SBY',  'Standby',             'S', 0, '66CDAA', 'SBY', 'Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'SBY',   0),
    ('ASBY', 'Airport Standby',     'S', 0, '20B2AA', 'ASBY','Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'SBY',   0),
    ('RES',  'Reserve',             'S', 0, '66CDAA', 'RES', 'Y', 0.00, 0.00, 1.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'Y', 'RES',   0),

    -- 假期休假类
    ('DO',   'Day Off',             'O', 1, 'E6E6E6', 'DO',  'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE',   0),
    ('AL',   'Annual Leave',        'L', 1, '90EE90', 'AL',  'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE',   0),
    ('SL',   'Sick Leave',          'L', 1, 'FFB6C1', 'SL',  'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE',   0),
    ('ML',   'Maternity Leave',     'L', 1, 'FFC0CB', 'ML',  'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE',   0),
    ('CL',   'Compassionate',       'L', 1, 'DDA0DD', 'CL',  'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE',   0),
    ('PH',   'Public Holiday',      'L', 1, 'C1FFC1', 'PH',  'Y', 0.00, 0.00, 0.00, 0, null, 0, 0.00, 0, 0.00, 'E', 'N', 'LVE',   0)
ON CONFLICT (assignment) DO NOTHING;

-- ============================================================
-- assignment_group_map — 任务与分组映射
-- 通过子查询获取 id
-- ============================================================
INSERT INTO assignment_group_map (assignment_group_id, assignment_id)
SELECT ag.id, a.id
FROM assignment_group ag, assignment a
WHERE (ag.assignment_group, a.assignment) IN (
    ('FLT',   'FLT'),
    ('FLT',   'IOE'),
    ('DHD',   'DH'),
    ('DHD',   'PAX'),
    ('GND',   'OFC'),
    ('GND',   'BRF'),
    ('ADM',   'MTG'),
    ('ADM',   'MED'),
    ('TRN',   'TRN'),
    ('TRN',   'SIM'),
    ('TRN',   'CRE'),
    ('SBY',   'SBY'),
    ('SBY',   'ASBY'),
    ('LVE',   'DO'),
    ('LVE',   'AL'),
    ('LVE',   'SL'),
    ('LVE',   'ML'),
    ('LVE',   'CL'),
    ('LVE',   'PH')
)
AND NOT EXISTS (
    SELECT 1 FROM assignment_group_map agm
    WHERE agm.assignment_group_id = ag.id AND agm.assignment_id = a.id
);

-- ============================================================
-- end of 03-assignment.sql
-- ============================================================
