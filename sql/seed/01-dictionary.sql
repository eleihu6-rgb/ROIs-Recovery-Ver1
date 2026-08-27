-- ============================================================
-- 01-dictionary.sql — 数据字典基础数据
-- ============================================================
-- 功能：初始化 dictionary 表的树形结构数据
--       包含系统参数 SYS_PARAM、功能配置 FUNC_CONFIG、
--       以及各类下拉选项（性别、婚姻状况、机组状态等）
-- 表：  dictionary
-- 幂等：INSERT ... ON CONFLICT DO NOTHING（基于 parent_code + code 组合）
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- ============================================================
-- 由于 dictionary 表没有唯一约束（仅有 parent_code 和 code 上的索引），
-- 为了实现幂等需先为 seed 数据建立唯一约束
-- ============================================================
-- 先创建唯一索引（如果不存在）
create unique index if not exists uq_dictionary_parent_code
    on dictionary (coalesce(parent_code, '___NULL___'), code);

-- ============================================================
-- section 1: 顶级分类节点（parent_code IS NULL）
-- ============================================================
INSERT INTO dictionary (parent_code, code, name, idx) VALUES
    (null, 'SYS_PARAM',    'System Parameters',    1),
    (null, 'FUNC_CONFIG',  'Function Config',      2),
    (null, 'GENDER',       'Gender',                   3),
    (null, 'MARITAL',      'Marital Status',       4),
    (null, 'CREW_STATUS',  'Crew Status',          5),
    (null, 'SEG_TYPE',     'Segment Type',         6),
    (null, 'FLT_TYPE',     'Flight Type',          7),
    (null, 'DIR',          'Direction',          8),
    (null, 'DIVISION',     'Division',             9),
    (null, 'DOW',          'Day of Week',             10),
    (null, 'LOGIN_TYPE',   'Login Type',          11),
    (null, 'ASSIGN_TYPE',  'Assignment Type',     12),
    (null, 'CERT_TYPE',    'Certificate Type',    13),
    (null, 'QUAL_TYPE',    'Qualification Type',  14),
    (null, 'RULE_SEV',     'Rule Severity',   15),
    (null, 'BODY_TYPE',    'Body Type',           16),
    (null, 'PBS_STATUS',   'PBS Status',           17),
    (null, 'BID_CONTEXT',  'Bid Context',       18),
    (null, 'SCENARIO_ST',  'Scenario Status',     19),
    (null, 'REST_FACILITY','Rest Facility',   20),
    (null, 'PLATEAU_TYPE', 'Plateau Type',        21),
    (null, 'LANG_LEVEL',   'Language Level',      22),
    (null, 'PROJ_TYPE',    'Projection Type',     23),
    (null, 'HOLIDAY_TYPE', 'Holiday Type',        24)
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- ============================================================
-- section 2: 系统参数 SYS_PARAM
-- ============================================================
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('SYS_PARAM', 'MANDAY_DAILY_KEEP_MONTHS',  'Manday daily data retention months',             1, '6'),
    ('SYS_PARAM', 'ROSTER_LOCK_DAYS',          'Days before roster period lock',                   2, '3'),
    ('SYS_PARAM', 'MAX_LOGIN_FAIL',            'Max consecutive login failures before lockout',  3, '5'),
    ('SYS_PARAM', 'LOGIN_LOCK_MINUTES',        'Account lockout duration (min)',                     4, '30'),
    ('SYS_PARAM', 'PASSWORD_EXPIRE_DAYS',      'Password expiry days',                                 5, '90'),
    ('SYS_PARAM', 'SESSION_TIMEOUT_MIN',       'Session timeout (min)',                              6, '120'),
    ('SYS_PARAM', 'GANTT_DEFAULT_RANGE_DAYS',  'Gantt default display range (days)',              7, '31'),
    ('SYS_PARAM', 'WARN_CHECK_INTERVAL_MIN',   'Warning check interval (min)',                   8, '60'),
    ('SYS_PARAM', 'PBS_MAX_TIERS',            'PBS max bid tiers per crew',                        9, '24'),
    ('SYS_PARAM', 'FDP_SPLIT_DUTY_GAP_MIN',    'Min ground time for split duty (min)',    10, '180'),
    ('SYS_PARAM', 'DEFAULT_CHECKIN_MIN',        'Default pre-flight check-in (min)',             11, '60'),
    ('SYS_PARAM', 'DEFAULT_CHECKOUT_MIN',       'Default post-flight checkout (min)',            12, '30'),
    ('SYS_PARAM', 'DEFAULT_TIMEZONE',           'Default timezone',                                       13, 'Asia/Shanghai'),
    ('SYS_PARAM', 'FATIGUE_MODEL_VERSION',      'Fatigue model version',                              14, 'SAFTE_v3'),
    ('SYS_PARAM', 'CREW_MANDAY_CALC_METHOD',    'Manday calc method (E=equal S=start L=land)',        15, 'E'),
    ('SYS_PARAM', 'PBS_LINE_CREDIT_WINDOW_CONFIG', 'PBS line credit window configuration',            16, null),
    ('SYS_PARAM', 'PBS_EFFICIENT_FLYING_CONFIG',   'PBS efficient flying configuration',               17, null),
    ('SYS_PARAM', 'PBS_PAIRING_REDEYE_CONFIG',     'PBS pairing Redeye configuration',                 21, null),
    ('SYS_PARAM', 'RP_SELECT_BACK_COUNT',          'Roster-period selectable window — RPs before current', 18, '6'),
    ('SYS_PARAM', 'RP_SELECT_FORWARD_COUNT',       'Roster-period selectable window — RPs after current',  19, '6'),
    ('SYS_PARAM', 'RP_GANTT_MAX_PERIODS',          'Max roster periods selectable in the Gantt toolbar',    20, '5'),
    ('SYS_PARAM', 'PBS_PORTAL_PUBLIC_URL',         'PBS portal public URL for simulated crew login',        22, null),
    ('SYS_PARAM', 'PBS_SIMULATED_LOGIN_TTL_SECONDS', 'PBS simulated login token TTL seconds',               23, '300')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- PBS Line Credit Window Preference
-- These defaults keep the employee UI usable until the admin management screen edits dictionary values.
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('PBS_LINE_CREDIT_WINDOW_CONFIG', 'DELTA_HOURS', 'Credit window adjustment hours', 1, '5')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- PBS Pairing Redeye Preference
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('PBS_PAIRING_REDEYE_CONFIG', 'START_TIME', 'Redeye local start time', 1, '03:30'),
    ('PBS_PAIRING_REDEYE_CONFIG', 'END_TIME',   'Redeye local end time',   2, '05:30')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- PBS Efficient Flying Pairing Bid
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('PBS_EFFICIENT_FLYING_CONFIG', 'PERCENTILE', 'Efficient flying percentile', 1, '20')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- ============================================================
-- section 3: 功能配置 FUNC_CONFIG
-- ============================================================
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('FUNC_CONFIG', 'ENABLE_FATIGUE_CHECK',     'Enable FRMS fatigue check',                    1, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_PBS',               'Enable PBS module',                              2, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_QUALIFICATION_WARN','Enable qualification expiry warning',        3, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_CERTIFICATE_WARN',  'Enable certificate expiry warning',         4, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_AUTO_COMPOSITION',  'Enable auto composition loading',           5, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_SPLIT_DUTY',        'Enable split duty calculation',             6, 'Y'),
    ('FUNC_CONFIG', 'GANTT_SHOW_FATIGUE_COLOR', 'Show fatigue color in Gantt',             7, 'Y'),
    ('FUNC_CONFIG', 'ROSTER_PUBLISH_NOTIFY',    'Notify crew on roster publish',             8, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_HOTEL_MANAGEMENT',  'Enable hotel management',                       9, 'Y'),
    ('FUNC_CONFIG', 'ENABLE_SCENARIO',          'Enable scenario management',                   10, 'Y')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- ============================================================
-- section 4: 下拉选项数据
-- ============================================================

-- 性别
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('GENDER', 'M', 'Male',   1, 'M'),
    ('GENDER', 'F', 'Female', 2, 'F')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 婚姻状况
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('MARITAL', 'S', 'Single',   1, 'S'),
    ('MARITAL', 'M', 'Married',  2, 'M'),
    ('MARITAL', 'D', 'Divorced', 3, 'D'),
    ('MARITAL', 'W', 'Widowed',  4, 'W')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 机组状态
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('CREW_STATUS', 'A',  'Active',          1, 'A'),
    ('CREW_STATUS', 'I',  'Inactive',        2, 'I'),
    ('CREW_STATUS', 'T',  'Training',      3, 'T'),
    ('CREW_STATUS', 'L',  'Long Leave',    4, 'L'),
    ('CREW_STATUS', 'R',  'Resigned',        5, 'R')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 航段类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('SEG_TYPE', 'D', 'Domestic',        1, 'D'),
    ('SEG_TYPE', 'I', 'International',   2, 'I'),
    ('SEG_TYPE', 'R', 'Regional',        3, 'R')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 航班类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('FLT_TYPE', 'J', 'Scheduled',   1, 'J'),
    ('FLT_TYPE', 'C', 'Charter',     2, 'C'),
    ('FLT_TYPE', 'E', 'Extra',       3, 'E'),
    ('FLT_TYPE', 'P', 'Positioning', 4, 'P')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 国内外标识
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('DIR', 'D', 'Domestic',       1, 'D'),
    ('DIR', 'I', 'International',  2, 'I')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 机组类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('DIVISION', 'P', 'Pilot',       1, 'P'),
    ('DIVISION', 'C', 'Cabin',   2, 'C'),
    ('DIVISION', 'A', 'Airmarshal', 3, 'A')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 星期
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('DOW', 'MON', 'Monday',    1, '1'),
    ('DOW', 'TUE', 'Tuesday',   2, '2'),
    ('DOW', 'WED', 'Wednesday', 3, '3'),
    ('DOW', 'THU', 'Thursday',  4, '4'),
    ('DOW', 'FRI', 'Friday',    5, '5'),
    ('DOW', 'SAT', 'Saturday',  6, '6'),
    ('DOW', 'SUN', 'Sunday',    7, '7')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 登录方式
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('LOGIN_TYPE', 'WEB', 'Web Browser',  1, 'WEB'),
    ('LOGIN_TYPE', 'APP', 'Mobile App',   2, 'APP'),
    ('LOGIN_TYPE', 'API', 'API Call',   3, 'API')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 任务大类
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('ASSIGN_TYPE', 'L', 'Leave',    1, 'L'),
    ('ASSIGN_TYPE', 'O', 'Off',      2, 'O'),
    ('ASSIGN_TYPE', 'W', 'Work',     3, 'W'),
    ('ASSIGN_TYPE', 'T', 'Training', 4, 'T'),
    ('ASSIGN_TYPE', 'S', 'Reserve',  5, 'S')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 证件类别
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('CERT_TYPE', 'O', 'Other',                    1, 'O'),
    ('CERT_TYPE', 'L', 'License',              2, 'L'),
    ('CERT_TYPE', 'P', 'Passport',         3, 'P'),
    ('CERT_TYPE', 'M', 'Medical',                4, 'M')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 资质类别
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('QUAL_TYPE', 'AIRPORT',   'Airport Qualification',      1, 'AIRPORT'),
    ('QUAL_TYPE', 'OPERATION', 'Operation Qualification',    2, 'OPERATION'),
    ('QUAL_TYPE', 'FLEET',     'Fleet Qualification',        3, 'FLEET')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 法规严重级别
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('RULE_SEV', 'INFO',    'Information', 1, 'INFO'),
    ('RULE_SEV', 'WARNING', 'Warning',   2, 'WARNING'),
    ('RULE_SEV', 'ERROR',   'Error',     3, 'ERROR')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 机身类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('BODY_TYPE', 'N', 'Narrow Body',  1, 'N'),
    ('BODY_TYPE', 'W', 'Wide Body',    2, 'W')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- PBS状态
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('PBS_STATUS', 'DRAFT',     'Draft',        1, 'DRAFT'),
    ('PBS_STATUS', 'OPEN',      'Open',       2, 'OPEN'),
    ('PBS_STATUS', 'CLOSED',    'Closed',       3, 'CLOSED'),
    ('PBS_STATUS', 'AWARDED',   'Awarded',      4, 'AWARDED'),
    ('PBS_STATUS', 'PUBLISHED', 'Published',    5, 'PUBLISHED')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 申请上下文
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('BID_CONTEXT', 'Default', 'Default Preference',   1, 'Default'),
    ('BID_CONTEXT', 'Current', 'Current Period',       2, 'Current')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 方案状态
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('SCENARIO_ST', 'DRAFT',     'Draft',            1, 'DRAFT'),
    ('SCENARIO_ST', 'RUNNING',   'Running',        2, 'RUNNING'),
    ('SCENARIO_ST', 'DONE',      'Done',           3, 'DONE'),
    ('SCENARIO_ST', 'FAILED',    'Failed',           4, 'FAILED'),
    ('SCENARIO_ST', 'COMPLETED', 'Completed',      5, 'COMPLETED'),
    ('SCENARIO_ST', 'PUBLISHED', 'Published',      6, 'PUBLISHED'),
    ('SCENARIO_ST', 'ARCHIVED',  'Archived',       7, 'ARCHIVED')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 休息设施等级
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('REST_FACILITY', '0', 'None',                        1, '0'),
    ('REST_FACILITY', '1', 'Class 1 Bunk',   2, '1'),
    ('REST_FACILITY', '2', 'Class 2 Seat',   3, '2'),
    ('REST_FACILITY', '3', 'Class 3 Seat',   4, '3')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 高原类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('PLATEAU_TYPE', 'HP',  'High Plateau',         1, 'HP'),
    ('PLATEAU_TYPE', 'HP2', 'Very High Plateau',  2, 'HP2')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 语言等级
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('LANG_LEVEL', '4', 'Operational',  1, '4'),
    ('LANG_LEVEL', '5', 'Extended',          2, '5'),
    ('LANG_LEVEL', '6', 'Expert',          3, '6')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 续期类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('PROJ_TYPE', 'QUAL', 'Qualification',  1, 'QUAL'),
    ('PROJ_TYPE', 'LIC',  'License',        2, 'LIC'),
    ('PROJ_TYPE', 'MED',  'Medical',        3, 'MED')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- 假日类型
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('HOLIDAY_TYPE', 'PH', 'Public Holiday',  1, 'PH'),
    ('HOLIDAY_TYPE', 'WE', 'Weekend',             2, 'WE'),
    ('HOLIDAY_TYPE', 'CF', 'Company Festival',    3, 'CF')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- ============================================================
-- end of 01-dictionary.sql
-- ============================================================
