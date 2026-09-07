-- Add the System -> Interface page for OPS flight schedule simulation.
-- Idempotent and safe to run after the base system-menu seed.
-- Older deployed databases may not yet have the seed's composite uniqueness rule.
-- The index makes the idempotent upserts below safe without changing menu data.
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_menu_parent_code
  ON system_menu (parent_menu_code, menu_code);

INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris)
VALUES (
  'SYSTEM_INTERFACE',
  'Interface',
  'SYSTEM',
  'interface',
  'S',
  2,
  '/api/flight,/api/flight/*'
)
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
  menu_name = EXCLUDED.menu_name,
  factory_name = EXCLUDED.factory_name,
  system_type = EXCLUDED.system_type,
  idx = EXCLUDED.idx,
  api_uris = EXCLUDED.api_uris,
  updated_by = 'system',
  updated_at = now();

UPDATE system_menu
SET idx = CASE menu_code
  WHEN 'SYSTEM_SCHEDULER' THEN 1
  WHEN 'SYSTEM_INTERFACE' THEN 2
  WHEN 'SYSTEM_QUEUE_TASKS' THEN 3
  WHEN 'SYSTEM_GRAFANA' THEN 4
  WHEN 'SYSTEM_PROMETHEUS' THEN 5
  WHEN 'SYSTEM_WINDMILL' THEN 6
  WHEN 'SYSTEM_DATA_QUALITY' THEN 7
  WHEN 'SYSTEM_USER_MGMT' THEN 8
  WHEN 'SYSTEM_PROFILE_MGMT' THEN 9
  WHEN 'SYSTEM_MENU_MGMT' THEN 10
  WHEN 'SYSTEM_PBS_USER_MGMT' THEN 11
  WHEN 'SYSTEM_DEPT_MGMT' THEN 12
  WHEN 'MANDAY_REFRESH' THEN 13
  ELSE idx
END,
updated_by = 'system',
updated_at = now()
WHERE parent_menu_code = 'SYSTEM';

INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type)
VALUES
  ('SYSTEM_INTERFACE', 'BTN_SEARCH', 'Search', 1, '/api/flight', 'B'),
  ('SYSTEM_INTERFACE', 'BTN_EDIT', 'Edit', 2, '/api/flight/*', 'B'),
  ('SYSTEM_INTERFACE', 'BTN_SAVE', 'Save', 3, '/api/flight/*', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
  menu_name = EXCLUDED.menu_name,
  idx = EXCLUDED.idx,
  api_uris = EXCLUDED.api_uris,
  system_type = EXCLUDED.system_type,
  updated_by = 'system',
  updated_at = now();
