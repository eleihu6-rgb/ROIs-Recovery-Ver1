-- 2026-08-11-permission-model.sql
-- 权限控制系统数据模型变更（5 项，已审批）
-- 1) profile_authorization.auth_values varchar(3000) → jsonb（逗号分隔 → jsonb 数组）
-- 2) 删除 profile_authorization_detail（细粒度并入 jsonb 数组）
-- 3) department 重命名 → crew_department（机组业务部门，更清晰）
-- 4) profile 加 profile_code（角色唯一代码）
-- 5) system_menu 加 api_uris（页面级读接口清单，用于读接口菜单门禁）
-- 顺序：数据转换 → 建/改列 → 重命名 → 索引

-- ============================================================
-- 1) profile_authorization.auth_values → jsonb
--    现有数据为逗号分隔字符串，转为 jsonb 数组（trim 后去空项）
-- ============================================================
UPDATE profile_authorization
SET auth_values = (
  SELECT coalesce(jsonb_agg(trim(x)), '[]'::jsonb)
  FROM regexp_split_to_table(auth_values, ',') AS x
  WHERE trim(x) <> ''
)
WHERE auth_values IS NOT NULL AND auth_values <> '';

ALTER TABLE profile_authorization ALTER COLUMN auth_values TYPE jsonb USING (auth_values::jsonb);

-- ============================================================
-- 2) 删除 profile_authorization_detail（细粒度表并入 jsonb）
-- ============================================================
DROP TABLE IF EXISTS profile_authorization_detail;

-- ============================================================
-- 3) department → crew_department（含索引/序列改名，幂等）
-- ============================================================
ALTER TABLE IF EXISTS department RENAME TO crew_department;
ALTER INDEX IF EXISTS uq_department_code RENAME TO uq_crew_department_code;
ALTER SEQUENCE IF EXISTS department_id_seq RENAME TO crew_department_id_seq;

-- ============================================================
-- 4) profile 加 profile_code（角色唯一代码；seed 回填见 seed/06-profile.sql）
-- ============================================================
ALTER TABLE profile ADD COLUMN IF NOT EXISTS profile_code varchar(50);
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_code ON profile (profile_code) WHERE profile_code IS NOT NULL;

-- ============================================================
-- 5) system_menu 加 api_uris（页面级读接口清单，逗号分隔）
-- ============================================================
ALTER TABLE system_menu ADD COLUMN IF NOT EXISTS api_uris varchar(2000);

-- ============================================================
-- 注释更新
-- ============================================================
COMMENT ON COLUMN profile_authorization.auth_values IS '数据权限白名单值列表（jsonb 数组），如 ["B737","A320"]；auth_type 枚举：FILIALE/DIVISION/CREW_DEPARTMENT/RANK/FLEET';
COMMENT ON COLUMN profile.profile_code IS '角色唯一代码，管理界面/前端引用（如 Administrator / RosterPlanner / Viewer）';
COMMENT ON COLUMN system_menu.api_uris IS '页面级读接口清单（逗号分隔，支持通配），用于读接口菜单门禁';
COMMENT ON TABLE crew_department IS '机组业务部门（原 department 表），机组所属部门，branch_code 树结构';
