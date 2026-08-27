-- ============================================================
-- 09-query-criteria.sql — Gantt 查询/排序条件元数据
-- ============================================================
-- 功能：初始化 query_criteria 和 sort_criteria 表
-- 表：  query_criteria, sort_criteria
-- 幂等：先建唯一索引再 ON CONFLICT DO NOTHING
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- 创建唯一索引（如果不存在）
create unique index if not exists uq_query_criteria_code on query_criteria (criteria_code_name);
create unique index if not exists uq_sort_criteria_code  on sort_criteria  (criteria_code_name);

-- ============================================================
-- query_criteria — 查询条件字段元数据
-- ============================================================
INSERT INTO query_criteria (criteria_code_name, criteria_ui_name, ref_table, ref_column, data_type, flight_applicable, pairing_applicable, roster_applicable, remark) VALUES
    -- 航班面板条件
    ('FLT_NUM',      'Flight No.',       null,          null,       'STRING',   1, 0, 0, 'Flight number'),
    ('DEP_ARP',      'Departure',        'airport',     'airport',  'LOV',      1, 1, 0, 'Departure airport'),
    ('ARV_ARP',      'Arrival',          'airport',     'airport',  'LOV',      1, 1, 0, 'Arrival airport'),
    ('FLEET',        'Fleet',            'fleet',       'fleet',    'LOV',      1, 1, 0, 'Fleet type'),
    ('FLT_DATE',     'Flight Date',      null,          null,       'DATE',     1, 0, 0, 'Flight date range'),
    ('SEG_TYPE',     'Seg Type',         'dictionary',  'code',     'LOV',      1, 1, 0, 'Segment type D/I/R'),
    ('AC_REG',       'A/C Reg',          'aircraft',    'ac_reg',   'LOV',      1, 0, 0, 'Aircraft registration'),

    -- 环面板条件
    ('PAIRING_ID',   'Pairing ID',       null,          null,       'STRING',   0, 1, 0, 'Pairing identifier'),
    ('PAIRING_BASE', 'Base',             'base',        'base',     'LOV',      0, 1, 0, 'Pairing home base'),
    ('PAIRING_DAYS', 'Duration (days)',  null,          null,       'NUMBER',   0, 1, 0, 'Number of duty days'),

    -- 排班面板条件
    ('CREW_ID',      'Crew ID',          null,          null,       'STRING',   0, 0, 1, 'Crew employee ID'),
    ('CREW_NAME',    'Crew Name',        null,          null,       'STRING',   0, 0, 1, 'Crew name keyword'),
    ('RANK',         'Rank',             'rank',        'rank',     'LOV',      0, 0, 1, 'Crew rank'),
    ('BASE',         'Base',             'base',        'base',     'LOV',      0, 0, 1, 'Crew home base'),
    ('TEAM',         'Team',             'team',        'team',     'LOV',      0, 0, 1, 'Crew team'),
    ('DIVISION',     'Division',         'division',    'division', 'LOV',      0, 0, 1, 'Crew division P/C/A'),
    ('ASSIGNMENT',   'Assignment',       'assignment',  'assignment','LOV',     0, 0, 1, 'Assignment type filter'),
    ('CREW_STATUS',  'Status',           'dictionary',  'code',     'LOV',      0, 0, 1, 'Crew status'),

    -- 通用条件
    ('DOW',          'Day of Week',      null,          null,       'LOV',      1, 1, 1, 'Day of week filter')
ON CONFLICT (criteria_code_name) DO NOTHING;

-- ============================================================
-- sort_criteria — 排序条件字段元数据
-- ============================================================
INSERT INTO sort_criteria (criteria_code_name, criteria_ui_name, data_type, flight_applicable, pairing_applicable, roster_applicable, criteria_code_enum) VALUES
    -- 航班排序
    ('SORT_FLT_NUM',      'Flight No.',       'STRING',  1, 0, 0, 'FLT_NUM'),
    ('SORT_DEP_TIME',     'Departure Time',   'TIME',    1, 1, 0, 'DEP_TIME'),
    ('SORT_ARV_TIME',     'Arrival Time',     'TIME',    1, 1, 0, 'ARV_TIME'),
    ('SORT_DEP_ARP',      'Departure',        'STRING',  1, 1, 0, 'DEP_ARP'),
    ('SORT_FLEET',        'Fleet',            'STRING',  1, 1, 0, 'FLEET'),

    -- 环排序
    ('SORT_PAIRING_ID',   'Pairing ID',       'STRING',  0, 1, 0, 'PAIRING_ID'),
    ('SORT_PAIRING_DAYS', 'Duration',         'NUMBER',  0, 1, 0, 'PAIRING_DAYS'),
    ('SORT_PAIRING_BLH',  'Block Hours',      'NUMBER',  0, 1, 0, 'PAIRING_BLH'),

    -- 排班排序
    ('SORT_CREW_ID',      'Crew ID',          'STRING',  0, 0, 1, 'CREW_ID'),
    ('SORT_CREW_NAME',    'Crew Name',        'STRING',  0, 0, 1, 'CREW_NAME'),
    ('SORT_RANK',         'Rank',             'STRING',  0, 0, 1, 'RANK'),
    ('SORT_BASE',         'Base',             'STRING',  0, 0, 1, 'BASE'),
    ('SORT_TEAM',         'Team',             'STRING',  0, 0, 1, 'TEAM'),
    ('SORT_SENIORITY',    'Seniority',        'NUMBER',  0, 0, 1, 'SENIORITY'),
    ('SORT_FT_MONTH',     'FT This Month',    'NUMBER',  0, 0, 1, 'FT_MONTH')
ON CONFLICT (criteria_code_name) DO NOTHING;

-- ============================================================
-- end of 09-query-criteria.sql
-- ============================================================
