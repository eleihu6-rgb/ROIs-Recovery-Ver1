-- ============================================================
-- 05-system-menu.sql — 系统菜单树 + 菜单控件定义（重建）
-- ============================================================
-- 功能：以当前 gantt 真实导航为素材重建 system_menu
-- 结构：3 级菜单树（Tab → 页面 → 子视图），按钮 ctrl 挂叶子菜单
-- api_uris 使用归一化路径（/api/...，不含 /altair/live 代理前缀）
-- 幂等：先建唯一索引再 ON CONFLICT (parent_menu_code, menu_code) DO UPDATE
--       （写入 menu_name/factory_name/system_type/idx/api_uris + updated_by/at；
--        created_by/created_at 沿用首次插入；icon/is_hidden 等运行时字段不动）
--       这样 seed 既是「补缺」也是「校正」：历史 idx 漂移可被后续 seed 自愈。
-- 修改记录：
--   2026-08-11  整体重建（清理旧菜单树，对齐 gantt 实际 Tab/页面/按钮）
--   2026-08-26  Add menu codes for PBS Period / Legality rule mgmt menu-gate
--               migration (PBS_PERIOD, LEGALITY_VIOLATIONS_INIT, MANDAY_REFRESH,
--               SCENARIO_KPI_BACKFILL). Legal composition already covered by
--               existing LEGALITY_COMPOSITION.
--   2026-08-26  ON CONFLICT DO NOTHING → DO UPDATE（写入 menu_name/factory_name/
--               system_type/idx/api_uris + updated_by/at）— 让 seed 自动校正历史
--               漂移（如 BTN_LOG idx=2→3）。同时新增显式 migration 修存量。
--   2026-08-27  Add RBOT — R'Bot AI 助手是跨模块悬浮组件（挂载在 shell 根,
--               见 gantt/src/components/shell/app-shell.tsx），无独立页面/Tab，
--               仅作为权限开关注册，供 System → Roles 勾选授予/撤销可见性。
-- ============================================================

-- 创建唯一索引（如果不存在）
create unique index if not exists uq_system_menu_parent_code on system_menu (parent_menu_code, menu_code);

-- ============================================================
-- system_menu — 一级菜单（Tab）
-- ============================================================
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('ROOT',      'Root',                        '',       'DashboardView', 'S', 0,  null),
    ('DASHBOARD', 'Dashboard',          'ROOT',   'DashboardView', 'S', 1,  '/api/dashboard*'),
    ('LIVE',      'Live',                 'ROOT',   '',              'S', 2,  null),
    ('SCENARIO',  'Scenario',             'ROOT',   '',              'S', 3,  null),
    ('DATA',      'Data',             'ROOT',   '',              'S', 4,  null),
    ('LEGALITY',  'Legality',             'ROOT',   '',              'S', 5,  null),
    ('SYSTEM',    'System',               'ROOT',   '',              'S', 6,  null),
    ('PBS',       'PBS',              'ROOT',   '',              'S', 7,  null),
    ('HELP',      'Help',                 'ROOT',   'HelpView',      'S', 8,  null),
    ('REGRESSION','Regression',           'ROOT',   'RegressionView','S', 9,  null),
    ('DEV',       'Dev',                  'ROOT',   'DevView',       'S', 10, null),
    ('RELEASE',   'Release',              'ROOT',   '',              'S', 11, null),
    ('RBOT',      'R''Bot Assistant',     'ROOT',   'AiChatPanel',   'S', 12, null)
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ============================================================
-- system_menu — 二级菜单（页面）
-- ============================================================

-- Live — 排班甘特
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('LIVE_ROSTER', 'Roster', 'LIVE', 'RosterView', 'S', 1,
     '/api/gantt/bootstrap,/api/crew,/api/roster,/api/fleet,/api/base,/api/division,/api/rank,/api/pairing/types,/api/base/timezone-options')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- Scenario — 方案列表（含子视图）
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('SCENARIO_LIST', 'Scenario List', 'SCENARIO', 'ScenarioView', 'S', 1, '/api/scenario*,/api/workset'),
    ('SCENARIO_KPI_BACKFILL', 'KPI Backfill', 'SCENARIO', 'kpi-backfill', 'S', 2, '/api/admin/scenario-kpi-backfill')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- Data — 基础数据 + 机组数据（读接口统一走 /api/data 聚合 + 实体读接口）
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('DATA_ORG_BASE',           'Org & Base',       'DATA',     'basic.org-base',          'S', 1,  '/api/data/table,/api/data/catalog,/api/data/reference-options,/api/base'),
    ('DATA_RANK',               'Rank',                 'DATA',     'basic.rank',              'S', 2,  '/api/data/table,/api/data/catalog,/api/data/reference-options,/api/rank'),
    ('DATA_FLEET_AIRCRAFT',     'Fleet & Aircraft', 'DATA',     'basic.fleet-aircraft',    'S', 3,  '/api/data/table,/api/data/catalog,/api/data/reference-options,/api/fleet'),
    ('DATA_LOCATION_ROUTE',     'Location & Route', 'DATA',     'basic.location-route',    'S', 4,  '/api/data/table,/api/data/catalog,/api/data/reference-options,/api/airport'),
    ('DATA_ASSIGNMENT',         'Assignment',       'DATA',     'basic.assignment',        'S', 5,  '/api/data/table,/api/data/catalog,/api/data/reference-options'),
    ('DATA_QUALIFICATION',      'Qualification',        'DATA',     'basic.qualification',     'S', 6,  '/api/data/table,/api/data/catalog,/api/data/reference-options'),
    ('DATA_COMPOSITION',        'Composition',          'DATA',     'basic.composition',       'S', 7,  '/api/data/table,/api/data/catalog,/api/data/reference-options,/api/composition*'),
    ('DATA_ROSTER_PERIOD',      'Roster Period',    'DATA',     'basic.roster-period',     'S', 8,  '/api/data/table,/api/data/catalog,/api/data/reference-options'),
    ('DATA_CONFIG_DICTIONARY',  'Config Dictionary','DATA',     'basic.config-dictionary', 'S', 9,  '/api/data/table,/api/data/catalog,/api/dictionary'),
    ('DATA_QUERY',              'Query',                'DATA',     'basic.query',             'S', 10, '/api/data/table,/api/data/catalog,/api/query'),
    ('DATA_HOLIDAY',            'Holiday Calendar',   'DATA',     'basic.holiday',           'S', 11, '/api/data/table,/api/data/catalog,/api/holiday'),
    ('DATA_CREW_MASTER',        'Crew Master',    'DATA',     'crew.master',             'S', 12, '/api/data/table,/api/data/catalog,/api/crew'),
    ('DATA_CREW_WORKLOAD',      'Crew Workload',    'DATA',     'crew.workload-summary',   'S', 13, '/api/data/table,/api/data/catalog')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- Legality — 法规
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('LEGALITY_RULE_SETS',      'Rule Sets',      'LEGALITY', 'rule-sets',      'S', 1, '/api/legality*,/api/division'),
    ('LEGALITY_RULE_INSTANCES', 'Rule Templates', 'LEGALITY', 'rule-instances', 'S', 2, '/api/legality*,/api/division'),
    ('LEGALITY_COMPOSITION',    'Composition',        'LEGALITY', 'composition',    'S', 3, '/api/composition*'),
    ('LEGALITY_COMP_LOAD',      'Comp Load',      'LEGALITY', 'comp-load',      'S', 4, '/api/composition-load*'),
    ('LEGALITY_VIOLATIONS_INIT','Violations Init',    'LEGALITY', 'violations-init','S', 5, '/api/admin/violations-init*')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- System — 运营工具 + 管理页
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('SYSTEM_SCHEDULER',      'Scheduler',        'SYSTEM', 'scheduler',      'S', 1,  '/api/admin/scheduler*'),
    ('SYSTEM_QUEUE_TASKS',    'Queue Tasks',  'SYSTEM', 'queue-tasks',    'S', 2,  null),
    ('SYSTEM_GRAFANA',        'Grafana',          'SYSTEM', 'grafana',        'S', 3,  null),
    ('SYSTEM_PROMETHEUS',     'Prometheus',       'SYSTEM', 'prometheus',     'S', 4,  null),
    ('SYSTEM_WINDMILL',       'Windmill',       'SYSTEM', 'windmill',       'S', 5,  null),
    ('SYSTEM_DATA_QUALITY',   'Data Quality', 'SYSTEM', 'data-quality',   'S', 6,  '/api/admin/data-quality'),
    ('SYSTEM_USER_MGMT',      'Users',        'SYSTEM', 'user-mgmt',      'S', 7,  '/api/admin/users*'),
    ('SYSTEM_PROFILE_MGMT',   'Roles',        'SYSTEM', 'profile-mgmt',   'S', 8,  '/api/admin/profiles*,/api/admin/menus*'),
    ('SYSTEM_MENU_MGMT',      'Menus',        'SYSTEM', 'menu-mgmt',      'S', 9,  '/api/admin/menus*'),
    ('SYSTEM_PBS_USER_MGMT',  'PBS Users',    'SYSTEM', 'pbs-user-mgmt',  'S', 10, '/api/admin/pbs-users*'),
    ('SYSTEM_DEPT_MGMT',      'Departments',  'SYSTEM', 'dept-mgmt',      'S', 11, '/api/admin/departments*'),
    ('MANDAY_REFRESH',        'Manday Refresh',    'SYSTEM', 'manday-refresh',   'S', 12, '/api/admin/manday-credit-refresh')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- PBS — 优先申请管理
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('PBS_PERIOD',          'PBS Period',       'PBS', 'period',           'S', 1, '/api/pbs/period-admin'),
    ('PBS_BID_DEFINITIONS', 'Bid Definitions', 'PBS', 'bid-definitions',  'S', 2, '/api/pbs/bid-definitions'),
    ('PBS_BUSINESS_TIME',   'Business Time',   'PBS', 'business-time',    'S', 3, '/api/admin/pbs-business-time'),
    ('PBS_ADMIN_TOOLS',     'Admin Tools',     'PBS', 'admin-tools',      'S', 4, '/api/admin/algorithm-export*,/api/admin/crew-bid-imports*,/api/pbs/period-admin,/api/base'),
    ('PBS_SIMULATED_CREW_PORTAL', 'Simulated Crew Portal', 'PBS', 'simulated-crew-portal', 'S', 5, '/api/admin/simulated-crew-portal*')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

UPDATE system_menu
SET parent_menu_code = 'PBS',
    idx = 5,
    updated_by = 'system',
    updated_at = now()
WHERE menu_code = 'PBS_SIMULATED_CREW_PORTAL'
  AND (parent_menu_code <> 'PBS' OR idx IS DISTINCT FROM 5);

-- ============================================================
-- system_menu — 三级菜单（子视图）
-- ============================================================
INSERT INTO system_menu (menu_code, menu_name, parent_menu_code, factory_name, system_type, idx, api_uris) VALUES
    ('SCENARIO_ALL',       'All Scenarios',   'SCENARIO_LIST', 'all',       'S', 1, '/api/scenario*,/api/workset'),
    ('SCENARIO_PO',        'Pairing',           'SCENARIO_LIST', 'po',        'S', 2, '/api/scenario*,/api/workset'),
    ('SCENARIO_RO',        'Roster',          'SCENARIO_LIST', 'ro',        'S', 3, '/api/scenario*,/api/workset'),
    ('SCENARIO_CREW_BIDS', 'Crew Bids',       'SCENARIO_LIST', 'crew-bids', 'S', 4, '/api/scenario*,/api/workset,/api/crew-bids*')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ============================================================
-- system_menu — 按钮（system_type = B）
-- 按页面真实按钮（工具栏 + 弹窗内）枚举；api_uris 为触发的后端接口（归一化路径）
-- UI-only 按钮（缩放/布局/选择等）不触发后端接口，api_uris 留空，仅前端控制可见性
-- ============================================================

-- ---- LIVE_ROSTER ----
INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type) VALUES
    ('LIVE_ROSTER', 'LIVE_REFRESH',     'Refresh',             1,  '/api/gantt/bootstrap,/api/roster,/api/crew', 'B'),
    ('LIVE_ROSTER', 'LIVE_FILTER',      'Filter',              2,  '/api/gantt/bootstrap,/api/roster,/api/crew', 'B'),
    ('LIVE_ROSTER', 'LIVE_DELETE',      'Delete',          3,  '/api/roster/*/delete,/api/roster/pairing/*/crew/*/delete', 'B'),
    ('LIVE_ROSTER', 'LIVE_UNDO',        'Undo',                4,  '/api/rules/check/session', 'B'),
    ('LIVE_ROSTER', 'LIVE_REDO',        'Redo',                5,  '/api/rules/check/session', 'B'),
    ('LIVE_ROSTER', 'LIVE_SAVE',        'Save',            6,  '/api/draft/commit', 'B'),
    ('LIVE_ROSTER', 'LIVE_PUBLISH',     'Publish',         7,  '/api/roster/publish/diff,/api/roster/publish/apply', 'B'),
    ('LIVE_ROSTER', 'LIVE_CREATE_GROUND','Create Ground Task', 8, '/api/roster/create-ground-task', 'B'),
    ('LIVE_ROSTER', 'LIVE_LOCK',        'Lock',            9,  '/api/locks/acquire,/api/locks/heartbeat,/api/locks/release', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_SWAP',     'Swap',            10, '/api/roster/swap', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_EDIT_TASK','Edit Task',       11, '/api/roster*', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_EDIT_GROUND','Edit Ground',   12, '/api/roster*', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_VIEW_PAIRING','Pairing Detail', 13, '/api/pairing/*', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_ADD_MEMO', 'Add Memo',        14, '/api/crew-memo*', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_EDIT_MEMO','Edit Memo',       15, '/api/crew-memo*', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_CREW_INFO','Crew Info',       16, '/api/crew/*', 'B'),
    ('LIVE_ROSTER', 'LIVE_CM_MANDAY',   'Manday Info',     17, '/api/crew/manday-daily', 'B'),
    ('LIVE_ROSTER', 'LIVE_PUBLISH_SEARCH','Publish Search', 18, '/api/roster/publish/diff', 'B'),
    ('LIVE_ROSTER', 'LIVE_PUBLISH_APPLY','Publish Apply',   19, '/api/roster/publish/apply', 'B'),
    ('LIVE_ROSTER', 'LIVE_PAIRING_DELETE','Delete Pairing',    20, '/api/pairing/*/delete', 'B'),
    ('LIVE_ROSTER', 'LIVE_FLIGHT_CREATE_PAIRING','Create Pairing', 21, '/api/pairing/create-from-flights', 'B'),
    ('LIVE_ROSTER', 'LIVE_RULE_CHECK',  'Rule Check',      22, '/api/rule-check/on-demand', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ---- SCENARIO_LIST 及子视图 ----
INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type) VALUES
    ('SCENARIO_ALL', 'SCENARIO_NEW',       'New Scenario',     1, '/api/scenario', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_IMPORT_PBS','Import PBS',    2, '/api/scenario/import*', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_IMPORT_S3', 'Import S3',      3, '/api/scenario/s3-pairing-import', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_RENAME',    'Rename',         4, '/api/scenario/*', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_DELETE',    'Delete',           5, '/api/scenario/*', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_DUPLICATE', 'Duplicate',        6, '/api/scenario/*/duplicate', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_EXPORT',    'Export',           7, '/api/scenario/*', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_SAVE',      'Save',         8, '/api/scenario/*', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_RUN',       'Run',          9, '/api/scenario/*/run,/api/scenario/*/transition', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_OPEN',      'Open Gantt',   10, '/api/scenario/*/gantt-data', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_PUBLISH',   'Publish',    11, '/api/scenario/*/publish', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_LOCK',      'Lock',           12, '/api/scenario/*/acquire-lock,/api/scenario/*/release-lock,/api/scenario/*/lock-keepalive', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_NOTES',     'Notes',            13, '/api/scenario/*/notes*', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_PATCH',     'Patch Output', 14, '/api/scenario/*/patch-output', 'B'),
    ('SCENARIO_ALL', 'SCENARIO_REMOVE_RESULT','Remove Result', 15, '/api/scenario/*/transition', 'B'),
    ('SCENARIO_PO',  'SCENARIO_PO_ACCESS', 'Pairing View',            1,  '/api/scenario*,/api/workset', 'B'),
    ('SCENARIO_RO',  'SCENARIO_RO_ACCESS', 'Roster View',             1,  '/api/scenario*,/api/workset', 'B'),
    ('SCENARIO_CREW_BIDS', 'SCENARIO_BIDS_ACCESS', 'Crew Bids View',  1, '/api/crew-bids*', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ---- DATA 各页（通用增改删复制） ----
INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type) VALUES
    ('DATA_ORG_BASE',          'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_ORG_BASE',          'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_ORG_BASE',          'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_ORG_BASE',          'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_RANK',              'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_RANK',              'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_RANK',              'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_RANK',              'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_FLEET_AIRCRAFT',    'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_FLEET_AIRCRAFT',    'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_FLEET_AIRCRAFT',    'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_FLEET_AIRCRAFT',    'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_LOCATION_ROUTE',    'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_LOCATION_ROUTE',    'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_LOCATION_ROUTE',    'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_LOCATION_ROUTE',    'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_ASSIGNMENT',        'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_ASSIGNMENT',        'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_ASSIGNMENT',        'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_ASSIGNMENT',        'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_QUALIFICATION',     'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_QUALIFICATION',     'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_QUALIFICATION',     'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_QUALIFICATION',     'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_COMPOSITION',       'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_COMPOSITION',       'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_COMPOSITION',       'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_COMPOSITION',       'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_ROSTER_PERIOD',     'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_ROSTER_PERIOD',     'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_ROSTER_PERIOD',     'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_ROSTER_PERIOD',     'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_CONFIG_DICTIONARY', 'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_CONFIG_DICTIONARY', 'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_CONFIG_DICTIONARY', 'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_CONFIG_DICTIONARY', 'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_QUERY',             'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_QUERY',             'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_QUERY',             'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_QUERY',             'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_HOLIDAY',           'BTN_ADD', 'Add', 1, '/api/data/save', 'B'),
    ('DATA_HOLIDAY',           'BTN_EDIT', 'Edit', 2, '/api/data/save', 'B'),
    ('DATA_HOLIDAY',           'BTN_DELETE', 'Delete', 3, '/api/data/save', 'B'),
    ('DATA_HOLIDAY',           'BTN_COPY', 'Copy', 4, '/api/data/save', 'B'),
    ('DATA_CREW_MASTER',       'BTN_ADD', 'Add', 1, '/api/crew', 'B'),
    ('DATA_CREW_MASTER',       'BTN_EDIT', 'Edit', 2, '/api/crew*', 'B'),
    ('DATA_CREW_MASTER',       'BTN_DELETE', 'Delete', 3, '/api/crew*', 'B'),
    ('DATA_CREW_MASTER',       'BTN_IMPORT', 'Import', 4, '/api/crew/import', 'B'),
    ('DATA_CREW_MASTER',       'BTN_EXPORT', 'Export', 5, '/api/crew/export', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ---- LEGALITY ----
INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type) VALUES
    ('LEGALITY_RULE_SETS', 'BTN_NEW_RULESET', 'New Rule Set', 1, '/api/legality/rulesets', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_ADD_RULES',   'Add Rules',    2, '/api/legality/ruleset/*/rules/*', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_EDIT',        'Edit',             3, '/api/legality/ruleset/*', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_COPY',        'Copy',             4, '/api/legality/ruleset/*/copy', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_DELETE',      'Delete',           5, '/api/legality/ruleset/*', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_REMOVE_RULE', 'Remove Rule',  6, '/api/legality/ruleset/*/rules/*', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_RECHECK',     'Recheck',          7, '/api/legality/recheck', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_EDIT_PARAM',  'Edit Param',   8, '/api/legality/rule/*/params', 'B'),
    ('LEGALITY_RULE_SETS', 'BTN_EDIT_META',   'Edit Meta',  9, '/api/legality/rule/*/meta', 'B'),
    ('LEGALITY_RULE_INSTANCES', 'BTN_EDIT',       'Edit',     1, '/api/legality/rule/*/params', 'B'),
    ('LEGALITY_RULE_INSTANCES', 'BTN_ADD_TO_SET', 'Add to Set', 2, '/api/legality/ruleset/*/rules/*', 'B'),
    ('LEGALITY_RULE_INSTANCES', 'BTN_DELETE',     'Delete',       3, '/api/legality/rules/*', 'B'),
    ('LEGALITY_RULE_INSTANCES', 'BTN_COPY',       'Copy',         4, '/api/legality/rules/*/copy', 'B'),
    ('LEGALITY_COMPOSITION',    'BTN_ADD', 'Add', 1, '/api/composition*', 'B'),
    ('LEGALITY_COMPOSITION',    'BTN_EDIT', 'Edit', 2, '/api/composition*', 'B'),
    ('LEGALITY_COMPOSITION',    'BTN_DELETE', 'Delete', 3, '/api/composition*', 'B'),
    ('LEGALITY_COMP_LOAD',      'BTN_ADD', 'Add', 1, '/api/composition-load*', 'B'),
    ('LEGALITY_COMP_LOAD',      'BTN_EDIT', 'Edit', 2, '/api/composition-load*', 'B'),
    ('LEGALITY_COMP_LOAD',      'BTN_DELETE', 'Delete', 3, '/api/composition-load*', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ---- SYSTEM ----
INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type) VALUES
    ('SYSTEM_SCHEDULER', 'BTN_ENABLE',       'Enable',       1, '/api/admin/scheduler/*/enable', 'B'),
    ('SYSTEM_SCHEDULER', 'BTN_DISABLE',      'Disable',      2, '/api/admin/scheduler/*/disable', 'B'),
    ('SYSTEM_SCHEDULER', 'BTN_RUN_NOW',      'Run Now',  3, '/api/admin/scheduler/*/run', 'B'),
    ('SYSTEM_SCHEDULER', 'BTN_EDIT_SCHEDULE','Edit Schedule', 4, '/api/admin/scheduler/*/schedule', 'B'),
    ('SYSTEM_SCHEDULER', 'BTN_VIEW_RUNS',    'View Runs', 5, '/api/admin/scheduler/*/runs', 'B'),
    ('SYSTEM_DATA_QUALITY', 'BTN_REFRESH', 'Refresh', 1, '/api/admin/data-quality', 'B'),
    ('SYSTEM_USER_MGMT', 'BTN_ADD', 'Add', 1, '/api/admin/users', 'B'),
    ('SYSTEM_USER_MGMT', 'BTN_EDIT', 'Edit', 2, '/api/admin/users/*', 'B'),
    ('SYSTEM_USER_MGMT', 'BTN_DISABLE', 'Disable', 3, '/api/admin/users/*/disable', 'B'),
    ('SYSTEM_USER_MGMT', 'BTN_RESET_PWD', 'Reset Password', 4, '/api/admin/users/*/reset-password', 'B'),
    ('SYSTEM_PROFILE_MGMT', 'BTN_ADD', 'Add', 1, '/api/admin/profiles', 'B'),
    ('SYSTEM_PROFILE_MGMT', 'BTN_EDIT', 'Edit', 2, '/api/admin/profiles/*', 'B'),
    ('SYSTEM_PROFILE_MGMT', 'BTN_DELETE', 'Delete', 3, '/api/admin/profiles/*', 'B'),
    ('SYSTEM_MENU_MGMT', 'BTN_ADD', 'Add', 1, '/api/admin/menus', 'B'),
    ('SYSTEM_MENU_MGMT', 'BTN_EDIT', 'Edit', 2, '/api/admin/menus/*', 'B'),
    ('SYSTEM_MENU_MGMT', 'BTN_DELETE', 'Delete', 3, '/api/admin/menus/*', 'B'),
    ('SYSTEM_PBS_USER_MGMT', 'BTN_EDIT', 'Edit', 1, '/api/admin/pbs-users/*', 'B'),
    ('SYSTEM_PBS_USER_MGMT', 'BTN_DISABLE', 'Disable', 2, '/api/admin/pbs-users/*/disable', 'B'),
    ('SYSTEM_PBS_USER_MGMT', 'BTN_RESET_PWD', 'Reset Password', 3, '/api/admin/pbs-users/*/reset-password', 'B'),
    ('SYSTEM_DEPT_MGMT', 'BTN_ADD', 'Add', 1, '/api/admin/departments', 'B'),
    ('SYSTEM_DEPT_MGMT', 'BTN_EDIT', 'Edit', 2, '/api/admin/departments/*', 'B'),
    ('SYSTEM_DEPT_MGMT', 'BTN_DELETE', 'Delete', 3, '/api/admin/departments/*', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ---- PBS ----
INSERT INTO system_menu (parent_menu_code, menu_code, menu_name, idx, api_uris, system_type) VALUES
    ('PBS_PERIOD', 'BTN_GENERATE_YEAR', 'Generate Year', 1, '/api/pbs/period-admin/generate-year', 'B'),
    ('PBS_PERIOD', 'BTN_ADD', 'Add', 2, '/api/pbs/period-admin', 'B'),
    ('PBS_PERIOD', 'BTN_EDIT', 'Edit', 3, '/api/pbs/period-admin/*', 'B'),
    ('PBS_PERIOD', 'BTN_DELETE', 'Delete', 4, '/api/pbs/period-admin/*', 'B'),
    ('PBS_BID_DEFINITIONS', 'BTN_EDIT', 'Edit', 1, '/api/pbs/bid-definitions/*', 'B'),
    ('PBS_BID_DEFINITIONS', 'BTN_SAVE', 'Save', 2, '/api/pbs/bid-definitions/*', 'B'),
    ('PBS_BUSINESS_TIME', 'BTN_SET', 'Set Business Time', 1, '/api/admin/pbs-business-time', 'B'),
    ('PBS_BUSINESS_TIME', 'BTN_CLEAR', 'Use Live Time', 2, '/api/admin/pbs-business-time', 'B'),
    ('PBS_ADMIN_TOOLS', 'BTN_EXPORT', 'Export Algorithm', 1, '/api/admin/algorithm-export*', 'B'),
    ('PBS_ADMIN_TOOLS', 'BTN_IMPORT', 'Import Bids', 2, '/api/admin/crew-bid-imports*', 'B'),
    ('PBS_ADMIN_TOOLS', 'BTN_DRY_RUN', 'Dry Run', 3, '/api/admin/crew-bid-imports/dry-run', 'B'),
    ('PBS_ADMIN_TOOLS', 'BTN_ROLLBACK', 'Rollback', 4, '/api/admin/crew-bid-imports/*', 'B'),
    ('PBS_SIMULATED_CREW_PORTAL', 'BTN_SIMULATE', 'Simulate', 1, '/api/admin/simulated-crew-portal/sessions', 'B'),
    ('PBS_SIMULATED_CREW_PORTAL', 'BTN_CONFIG', 'Configuration', 2, '/api/admin/simulated-crew-portal/config', 'B'),
    ('PBS_SIMULATED_CREW_PORTAL', 'BTN_LOG', 'Log', 3, '/api/admin/simulated-crew-portal/logs', 'B')
ON CONFLICT (parent_menu_code, menu_code) DO UPDATE SET
    menu_name    = EXCLUDED.menu_name,
    factory_name = EXCLUDED.factory_name,
    system_type  = EXCLUDED.system_type,
    idx          = EXCLUDED.idx,
    api_uris     = EXCLUDED.api_uris,
    updated_by   = 'system',
    updated_at   = now();

-- ============================================================
-- end of 05-system-menu.sql
-- ============================================================
