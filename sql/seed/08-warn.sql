-- ============================================================
-- 08-warn.sql — 预警类型定义
-- ============================================================
-- 功能：初始化 warn、warn_column、warn_notice、warn_parameter 表
-- 表：  warn, warn_column, warn_notice, warn_parameter
-- 幂等：通过 NOT EXISTS 检查 或先建唯一索引
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- 创建唯一索引（如果不存在）
create unique index if not exists uq_warn_name on warn (warn_name);

-- ============================================================
-- warn — 预警类型
-- 使用 OVERRIDING SYSTEM VALUE 指定确定性 ID，后续子表引用
-- ============================================================
INSERT INTO warn (id, warn_name, file_name, icon_name) OVERRIDING SYSTEM VALUE VALUES
    (1,  'Qualification Expiry / 资质到期预警',         'qual_expiry',   'icon_qual'),
    (2,  'Certificate Expiry / 证件到期预警',           'cert_expiry',   'icon_cert'),
    (3,  'License Expiry / 执照到期预警',               'lic_expiry',    'icon_lic'),
    (4,  'Medical Expiry / 体检到期预警',               'med_expiry',    'icon_med'),
    (5,  'Flight Time Limit / 飞行时间临界预警',        'ft_limit',      'icon_ft'),
    (6,  'FDP Limit / 执勤时间临界预警',                'fdp_limit',     'icon_fdp'),
    (7,  'Rest Violation / 休息时间不足预警',           'rest_violation','icon_rest'),
    (8,  'Fatigue Risk / 疲劳风险预警',                 'fatigue_risk',  'icon_fatigue'),
    (9,  'Passport Expiry / 护照到期预警',              'passport_exp',  'icon_passport'),
    (10, 'Recency Check / 近期经历不足预警',            'recency_check', 'icon_recency')
ON CONFLICT (warn_name) DO NOTHING;

-- ============================================================
-- warn_column — 预警显示列
-- ============================================================
-- 资质到期预警列
INSERT INTO warn_column (warn_id, column_code, column_name, column_idx) VALUES
    (1, 'crew_id',          'Crew ID / 工号',      1),
    (1, 'crew_name',        'Name / 姓名',         2),
    (1, 'qualification',    'Qualification / 资质', 3),
    (1, 'expiry_date',      'Expiry Date / 到期日', 4),
    (1, 'days_remaining',   'Days Left / 剩余天数', 5)
ON CONFLICT (warn_id, column_code) DO NOTHING;

-- 证件到期预警列
INSERT INTO warn_column (warn_id, column_code, column_name, column_idx) VALUES
    (2, 'crew_id',          'Crew ID / 工号',      1),
    (2, 'crew_name',        'Name / 姓名',         2),
    (2, 'certificate',      'Certificate / 证件',  3),
    (2, 'expiry_date',      'Expiry Date / 到期日', 4),
    (2, 'days_remaining',   'Days Left / 剩余天数', 5)
ON CONFLICT (warn_id, column_code) DO NOTHING;

-- 飞行时间临界预警列
INSERT INTO warn_column (warn_id, column_code, column_name, column_idx) VALUES
    (5, 'crew_id',       'Crew ID / 工号',            1),
    (5, 'crew_name',     'Name / 姓名',               2),
    (5, 'period',        'Period / 统计周期',          3),
    (5, 'current_ft',    'Current FT / 当前飞行时间',  4),
    (5, 'limit_ft',      'Limit / 上限',              5),
    (5, 'usage_pct',     'Usage % / 使用率',           6)
ON CONFLICT (warn_id, column_code) DO NOTHING;

-- 疲劳风险预警列
INSERT INTO warn_column (warn_id, column_code, column_name, column_idx) VALUES
    (8, 'crew_id',        'Crew ID / 工号',           1),
    (8, 'crew_name',      'Name / 姓名',              2),
    (8, 'duty_date',      'Duty Date / 值勤日期',     3),
    (8, 'fatigue_index',  'Fatigue Index / 疲劳指数', 4),
    (8, 'risk_level',     'Risk Level / 风险等级',     5)
ON CONFLICT (warn_id, column_code) DO NOTHING;

-- ============================================================
-- warn_notice — 预警通知消息模板
-- ============================================================
INSERT INTO warn_notice (warn_id, information_notice)
SELECT 1, 'Crew {crew_id} qual {qualification} expires {expiry_date}, {days_remaining}d left'
WHERE NOT EXISTS (SELECT 1 FROM warn_notice WHERE warn_id = 1);

INSERT INTO warn_notice (warn_id, information_notice)
SELECT 2, 'Crew {crew_id} certificate {certificate} expires on {expiry_date}, {days_remaining} days remaining'
WHERE NOT EXISTS (SELECT 1 FROM warn_notice WHERE warn_id = 2);

INSERT INTO warn_notice (warn_id, information_notice)
SELECT 5, 'Crew {crew_id} flight time {current_ft}h/{limit_ft}h ({usage_pct}%) in {period}'
WHERE NOT EXISTS (SELECT 1 FROM warn_notice WHERE warn_id = 5);

INSERT INTO warn_notice (warn_id, information_notice)
SELECT 8, 'Crew {crew_id} fatigue index {fatigue_index} ({risk_level}) on {duty_date}'
WHERE NOT EXISTS (SELECT 1 FROM warn_notice WHERE warn_id = 8);

-- ============================================================
-- warn_parameter — 预警过滤参数
-- ============================================================
INSERT INTO warn_parameter (warn_id, parameter_name, parameter_bind)
SELECT 1, 'Base / 基地', 'base'
WHERE NOT EXISTS (SELECT 1 FROM warn_parameter WHERE warn_id = 1 AND parameter_bind = 'base');

INSERT INTO warn_parameter (warn_id, parameter_name, parameter_bind)
SELECT 1, 'Fleet / 机队', 'fleet'
WHERE NOT EXISTS (SELECT 1 FROM warn_parameter WHERE warn_id = 1 AND parameter_bind = 'fleet');

INSERT INTO warn_parameter (warn_id, parameter_name, parameter_bind)
SELECT 5, 'Base / 基地', 'base'
WHERE NOT EXISTS (SELECT 1 FROM warn_parameter WHERE warn_id = 5 AND parameter_bind = 'base');

INSERT INTO warn_parameter (warn_id, parameter_name, parameter_bind)
SELECT 8, 'Base / 基地', 'base'
WHERE NOT EXISTS (SELECT 1 FROM warn_parameter WHERE warn_id = 8 AND parameter_bind = 'base');

-- ============================================================
-- end of 08-warn.sql
-- ============================================================
