-- 2026-08-25-internal-tooling-menu.sql
-- 把 Regression / Dev / Release 三个内部 Tab 注册为 system_menu 一级菜单，
-- 让权限系统能按角色授予/撤销可见性，替代原先 env-based SHOW_INTERNAL_TOOLING 门控。
-- 幂等：ON CONFLICT DO NOTHING（依赖 uq_system_menu_parent_code 唯一索引）
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('REGRESSION', 'Regression', 'ROOT', 'RegressionView', 'S', 9,  null),
    ('DEV',        'Dev',        'ROOT', 'DevView',        'S', 10, null),
    ('RELEASE',    'Release',    'ROOT', '',               'S', 11, null)
ON CONFLICT (parent_menu_code, menu_code) DO NOTHING;