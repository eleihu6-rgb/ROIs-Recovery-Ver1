-- ============================================================
-- 11-scenario-capabilities.sql — 方案甘特图能力配置（pane 可见性 + 编辑开关）
-- ============================================================
-- 功能：初始化 dictionary 中各 fileType（PO/RO）对应的 Gantt capabilities，
--       供 GET /api/scenario/:id/gantt-data 派生 capabilities 下发给前端。
--       前端据此决定可显示哪些 pane（roster/pairing/flight）及编辑能力。
--       代码侧（scenario-capabilities.ts FALLBACK）作为兜底，dictionary 缺失时生效；
--       本 seed 的取值与代码兜底保持一致。
-- 表：  dictionary
-- 参数清单（parent_code → code → code_value）：
--   SCENARIO_CAP_RO:
--     panes           = 'roster,pairing,flight'   允许的 pane 列表
--     defaultPanes    = 'roster,pairing'          首次打开默认显示的 pane
--     canAssign       = '1'                        roster 可指派（P3 启用）
--     canRemove       = '1'                        roster 可移除（P3 启用）
--     canReassign     = '1'                        roster 可改派（P3 启用）
--     canEditSegments = '0'                        pairing 可编辑航段（P4）
--   SCENARIO_CAP_PO:
--     panes           = 'pairing,flight'
--     defaultPanes    = 'pairing,flight'
--     canAssign/canRemove/canReassign/canEditSegments = '0'
--   SCENARIO_CAP_TO: 预留，本期不 seed（TO 暂无 pane）
-- 幂等：INSERT ... ON CONFLICT DO NOTHING（依赖 01-dictionary.sql 建立的 uq_dictionary_parent_code）
-- filiale：依赖各航司 schema 的列默认值，seed 不显式写 filiale
-- 修改记录：
--   2026-06-14  初始创建（P2-Task1）
--   2026-06-14  P3-Task1：RO canAssign/canRemove/canReassign 改为 '1'（启用 RO roster 编辑）
-- ============================================================

-- 顶级分类节点
INSERT INTO dictionary (parent_code, code, name, idx) VALUES
    (null, 'SCENARIO_CAP_RO', 'Scenario Gantt Capabilities (RO) / 方案甘特能力(RO)', 25),
    (null, 'SCENARIO_CAP_PO', 'Scenario Gantt Capabilities (PO) / 方案甘特能力(PO)', 26)
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- RO 能力配置
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('SCENARIO_CAP_RO', 'panes',           'Allowed panes / 允许的 pane',          1, 'roster,pairing,flight'),
    ('SCENARIO_CAP_RO', 'defaultPanes',    'Default panes / 默认 pane',            2, 'roster,pairing'),
    ('SCENARIO_CAP_RO', 'canAssign',       'Roster can assign / 可指派',           3, '1'),
    ('SCENARIO_CAP_RO', 'canRemove',       'Roster can remove / 可移除',           4, '1'),
    ('SCENARIO_CAP_RO', 'canReassign',     'Roster can reassign / 可改派',         5, '1'),
    ('SCENARIO_CAP_RO', 'canEditSegments', 'Pairing can edit segments / 可编辑航段', 6, '0')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- PO 能力配置
INSERT INTO dictionary (parent_code, code, name, idx, code_value) VALUES
    ('SCENARIO_CAP_PO', 'panes',           'Allowed panes / 允许的 pane',          1, 'pairing,flight'),
    ('SCENARIO_CAP_PO', 'defaultPanes',    'Default panes / 默认 pane',            2, 'pairing,flight'),
    ('SCENARIO_CAP_PO', 'canAssign',       'Roster can assign / 可指派',           3, '0'),
    ('SCENARIO_CAP_PO', 'canRemove',       'Roster can remove / 可移除',           4, '0'),
    ('SCENARIO_CAP_PO', 'canReassign',     'Roster can reassign / 可改派',         5, '0'),
    ('SCENARIO_CAP_PO', 'canEditSegments', 'Pairing can edit segments / 可编辑航段', 6, '0')
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;

-- SCENARIO_CAP_TO: 预留（TO 暂无 pane）。如需启用，照 RO/PO 模式追加
-- (null, 'SCENARIO_CAP_TO', 'Scenario Gantt Capabilities (TO) / 方案甘特能力(TO)', 27)

-- ============================================================
-- end of 11-scenario-capabilities.sql
-- ============================================================
