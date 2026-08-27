-- Store menu buttons in system_menu as system_type = 'B', then retire system_menu_ctrl.
-- Button identity is (parent_menu_code, menu_code): button codes such as BTN_ADD are reused by different pages.

DROP INDEX IF EXISTS uq_system_menu_code;
DROP INDEX IF EXISTS system_menu_menu_code_idx;
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_menu_parent_code ON system_menu (parent_menu_code, menu_code);

DO $$
BEGIN
  IF to_regclass('system_menu_ctrl') IS NOT NULL THEN
    INSERT INTO system_menu (
      created_by, created_at, updated_by, updated_at,
      menu_code, menu_name, parent_menu_code, system_type,
      idx, is_hidden, api_uris, icon
    )
    SELECT
      created_by, created_at, updated_by, updated_at,
      menu_ctl_code, menu_ctl_name, menu_code, 'B',
      idx, is_hidden, api_uris, icon
    FROM system_menu_ctrl
    ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
      menu_name = EXCLUDED.menu_name,
      idx = EXCLUDED.idx,
      is_hidden = EXCLUDED.is_hidden,
      api_uris = EXCLUDED.api_uris,
      icon = EXCLUDED.icon,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

    DROP TABLE system_menu_ctrl;
  END IF;
END $$;
