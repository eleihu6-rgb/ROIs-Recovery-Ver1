-- ============================================================
-- 02-rank-division.sql — 职级、机组类型、代飞映射、席位定义
-- ============================================================
-- 功能：初始化 rank、division、rank_acting、rank_position 表
-- 表：  rank, division, rank_acting, rank_position
-- 幂等：INSERT ... ON CONFLICT DO NOTHING
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- ============================================================
-- division — 机组类型
-- ============================================================
-- division 表无唯一索引，用 NOT EXISTS 保证幂等
INSERT INTO division (division, description)
SELECT 'P', '飞行员 Pilot'
WHERE NOT EXISTS (SELECT 1 FROM division WHERE division = 'P');

INSERT INTO division (division, description)
SELECT 'C', '客舱乘务员 Cabin'
WHERE NOT EXISTS (SELECT 1 FROM division WHERE division = 'C');

INSERT INTO division (division, description)
SELECT 'A', '空中安全员 Airmarshal'
WHERE NOT EXISTS (SELECT 1 FROM division WHERE division = 'A');

-- ============================================================
-- rank — 机组职级
-- ============================================================
INSERT INTO rank (rank, division, display_order, description, is_include_in_ft, is_acting_rank, is_crew_rank, is_must_crew_rank) VALUES
    ('CA',  'P', 1,  'Captain / 机长',                     1, 1, 1, 1),
    ('FO',  'P', 2,  'First Officer / 副驾驶',             1, 1, 1, 0),
    ('RP',  'P', 3,  'Relief Pilot / 巡航机长',            1, 1, 1, 0),
    ('SO',  'P', 4,  'Second Officer / 第二副驾驶',        1, 1, 1, 0),
    ('IP',  'P', 5,  'Instructor Pilot / 教员',            1, 1, 1, 0),
    ('CK',  'P', 6,  'Check Pilot / 检查员',               1, 1, 1, 0),
    ('ST',  'P', 7,  'Student Pilot / 学员',               0, 0, 1, 0),
    ('PU',  'C', 10, 'Purser / 乘务长',                    0, 1, 1, 1),
    ('FA',  'C', 11, 'Flight Attendant / 乘务员',          0, 1, 1, 0),
    ('IFA', 'C', 12, 'Instructor FA / 客舱教员',           0, 1, 1, 0),
    ('TFA', 'C', 13, 'Trainee FA / 乘务学员',              0, 0, 1, 0),
    ('AM',  'A', 20, 'Airmarshal / 空中安全员',            0, 1, 1, 0)
ON CONFLICT (rank) DO NOTHING;

-- ============================================================
-- rank_acting — 代飞职级映射
-- ============================================================
INSERT INTO rank_acting (active_rank, acting_rank, qual)
SELECT 'CA', 'FO', null
WHERE NOT EXISTS (
    SELECT 1 FROM rank_acting WHERE filiale='F8' AND active_rank='CA' AND acting_rank='FO' AND qual IS NULL
);

INSERT INTO rank_acting (active_rank, acting_rank, qual)
SELECT 'IP', 'CA', null
WHERE NOT EXISTS (
    SELECT 1 FROM rank_acting WHERE filiale='F8' AND active_rank='IP' AND acting_rank='CA' AND qual IS NULL
);

INSERT INTO rank_acting (active_rank, acting_rank, qual)
SELECT 'IP', 'FO', null
WHERE NOT EXISTS (
    SELECT 1 FROM rank_acting WHERE filiale='F8' AND active_rank='IP' AND acting_rank='FO' AND qual IS NULL
);

INSERT INTO rank_acting (active_rank, acting_rank, qual)
SELECT 'CK', 'CA', null
WHERE NOT EXISTS (
    SELECT 1 FROM rank_acting WHERE filiale='F8' AND active_rank='CK' AND acting_rank='CA' AND qual IS NULL
);

INSERT INTO rank_acting (active_rank, acting_rank, qual)
SELECT 'IFA', 'PU', null
WHERE NOT EXISTS (
    SELECT 1 FROM rank_acting WHERE filiale='F8' AND active_rank='IFA' AND acting_rank='PU' AND qual IS NULL
);

-- ============================================================
-- rank_position — 职级与席位对应关系
-- ============================================================
INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'CA', 'PIC', 'P', 1, 'Pilot In Command / 正驾驶（左座）'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'CA' AND position = 'PIC');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'FO', 'SIC', 'P', 2, 'Second In Command / 副驾驶（右座）'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'FO' AND position = 'SIC');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'RP', 'RP', 'P', 3, 'Relief Pilot / 巡航机长席'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'RP' AND position = 'RP');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'SO', 'SO', 'P', 4, 'Second Officer / 第二副驾驶席'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'SO' AND position = 'SO');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'ST', 'OBS', 'P', 5, 'Observer / 观察员席'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'ST' AND position = 'OBS');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'PU', 'PU', 'C', 10, 'Purser / 乘务长席'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'PU' AND position = 'PU');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'FA', 'FA', 'C', 11, 'Flight Attendant / 乘务员席'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'FA' AND position = 'FA');

INSERT INTO rank_position (rank, position, division, display_order, description)
SELECT 'AM', 'AM', 'A', 20, 'Airmarshal / 空中安全员席'
WHERE NOT EXISTS (SELECT 1 FROM rank_position WHERE rank = 'AM' AND position = 'AM');

-- ============================================================
-- end of 02-rank-division.sql
-- ============================================================
