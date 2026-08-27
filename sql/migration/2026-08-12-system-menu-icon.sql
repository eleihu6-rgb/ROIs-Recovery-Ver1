-- 2026-08-12-system-menu-icon.sql
-- system_menu 增加 icon 字段（存 lucide 图标名，如 'LayoutDashboard'），用于 Menus 管理页图标展示/编辑
ALTER TABLE system_menu ADD COLUMN IF NOT EXISTS icon varchar(50);

COMMENT ON COLUMN system_menu.icon IS '菜单图标（lucide 图标名）；空则前端按 menu_code 映射默认图标';
