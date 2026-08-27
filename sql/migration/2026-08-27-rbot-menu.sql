-- 2026-08-27-rbot-menu.sql
-- 把 R'Bot AI 助手（gantt/src/components/ai-chat/ai-chat-panel.tsx，挂载在 shell 根，
-- 无独立页面/Tab）注册为 system_menu 一级权限开关，让 System → Roles 能按角色
-- 授予/撤销可见性。此前该组件已实现但从未挂载、也无 menu_code，任何角色（含 Admin）
-- 都无法在 Roles 里看到它。
-- 幂等：ON CONFLICT DO NOTHING（依赖 uq_system_menu_parent_code 唯一索引）
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('RBOT', 'R''Bot Assistant', 'ROOT', 'AiChatPanel', 'S', 12, null)
ON CONFLICT (parent_menu_code, menu_code) DO NOTHING;
