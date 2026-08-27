-- ============================================================
-- 06-profile.sql — 权限档案模板 + 管理员用户
-- ============================================================
-- 功能：初始化 profile、profile_menu_privilege、users、
--       user_profile、user_department 表
-- 表：  profile, profile_menu_privilege, users,
--       user_profile, user_department
-- 幂等：INSERT ... ON CONFLICT DO NOTHING 或 NOT EXISTS 检查
-- 修改记录：
--   2026-03-25  初始创建
-- ============================================================

-- 创建唯一索引（如果不存在）
create unique index if not exists uq_profile_name on profile (profile_name, filiale, division);
create unique index if not exists uq_profile_menu on profile_menu_privilege (profile_id, menu_code);

-- ============================================================
-- user_department — 默认部门
-- ============================================================
INSERT INTO user_department (branch_code, branch_name, parent_code, division, idx) VALUES
    ('HQ',      'Headquarters / 总部',           null,  null, 1),
    ('HQ_FD',   'Flight Dispatch / 飞行签派',    'HQ',  'P',  1),
    ('HQ_CC',   'Cabin Crew / 客舱管理',         'HQ',  'C',  2),
    ('HQ_OPS',  'Operations / 运行管理',          'HQ',  null, 3)
ON CONFLICT (branch_code) DO NOTHING;

-- ============================================================
-- profile — 权限档案（预设 profile_code 初始角色）
-- ============================================================
INSERT INTO profile (profile_name, profile_code, division, idx) VALUES
    ('Administrator',           'Administrator',    'P', 1),
    ('Roster Planner - Pilot',  'RosterPlanner-P',  'P', 2),
    ('Roster Planner - Cabin',  'RosterPlanner-C',  'C', 3),
    ('Viewer - Pilot',          'Viewer-P',         'P', 4),
    ('Viewer - Cabin',          'Viewer-C',         'C', 5)
ON CONFLICT (profile_name, filiale, division) DO NOTHING;

-- 回填已有档案的 profile_code（幂等）
UPDATE profile SET profile_code = 'Administrator'   WHERE profile_name = 'Administrator'          AND profile_code IS NULL;
UPDATE profile SET profile_code = 'RosterPlanner-P' WHERE profile_name = 'Roster Planner - Pilot' AND profile_code IS NULL;
UPDATE profile SET profile_code = 'RosterPlanner-C' WHERE profile_name = 'Roster Planner - Cabin' AND profile_code IS NULL;
UPDATE profile SET profile_code = 'Viewer-P'        WHERE profile_name = 'Viewer - Pilot'         AND profile_code IS NULL;
UPDATE profile SET profile_code = 'Viewer-C'        WHERE profile_name = 'Viewer - Cabin'         AND profile_code IS NULL;

-- ============================================================
-- profile_menu_privilege — 管理员可访问所有菜单
-- ============================================================
INSERT INTO profile_menu_privilege (profile_id, menu_code, is_hidden)
SELECT p.id, sm.menu_code, 'N'
FROM profile p
CROSS JOIN system_menu sm
WHERE p.profile_name = 'Administrator' AND p.filiale = 'F8' AND p.division = 'P'
  AND NOT EXISTS (
      SELECT 1 FROM profile_menu_privilege pmp
      WHERE pmp.profile_id = p.id AND pmp.menu_code = sm.menu_code
  );

-- Viewer 只能看排班/仪表盘/帮助（示例：只开放部分菜单，其余隐藏）
INSERT INTO profile_menu_privilege (profile_id, menu_code, is_hidden)
SELECT p.id, sm.menu_code,
       CASE WHEN sm.menu_code IN ('ROOT','DASHBOARD','LIVE','LIVE_ROSTER','SCENARIO','SCENARIO_LIST','SCENARIO_ALL','SCENARIO_PO','SCENARIO_RO','HELP')
            THEN 'N' ELSE 'Y' END
FROM profile p
CROSS JOIN system_menu sm
WHERE p.profile_name = 'Viewer - Pilot' AND p.filiale = 'F8' AND p.division = 'P'
  AND NOT EXISTS (
      SELECT 1 FROM profile_menu_privilege pmp
      WHERE pmp.profile_id = p.id AND pmp.menu_code = sm.menu_code
  );

-- ============================================================
-- users — 默认管理员账号
-- 密码: bcrypt 哈希 of 'Admin@2026' (需要在应用层生成真实哈希)
-- 此处使用占位 bcrypt 哈希
-- ============================================================
INSERT INTO users (user_code, user_name, password_hash, branch_code, py_abbr, gender, eff_dt, status, is_admin, is_first_login, password_access, portal_access)
VALUES
    ('admin', 'System Administrator', '$2b$10$placeholder.hash.for.seed.data.only.000000000000', 'HQ', 'ADMIN', 'M', '2026-01-01'::timestamptz, 0, 1, 'Y', 'Y', 'Y')
ON CONFLICT (user_code) DO NOTHING;

-- ============================================================
-- user_profile — 管理员绑定 Administrator 档案
-- ============================================================
INSERT INTO user_profile (user_code, profile_id)
SELECT 'admin', p.id
FROM profile p
WHERE p.profile_name = 'Administrator' AND p.filiale = 'F8' AND p.division = 'P'
  AND NOT EXISTS (
      SELECT 1 FROM user_profile up WHERE up.user_code = 'admin' AND up.profile_id = p.id
  );

-- ============================================================
-- end of 06-profile.sql
-- ============================================================
