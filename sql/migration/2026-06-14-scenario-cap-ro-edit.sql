-- ============================================================
-- 2026-06-14  启用 RO scenario roster 编辑能力（P3-Task1）
-- ============================================================
-- 变更内容：
--   将 dictionary 中 SCENARIO_CAP_RO 的 canAssign / canRemove / canReassign
--   由 '0' 更新为 '1'，使已 seed 的数据库也启用 RO 方案的 roster 编辑能力。
--   （seed 11-scenario-capabilities.sql 用 ON CONFLICT DO NOTHING，
--    已存在的行不会被 seed 覆盖，故需本 migration 做幂等 UPDATE）
--
-- 范围：
--   - 仅 RO；PO/TO 不变
--   - canEditSegments 不变（仍 '0'，P4 接入 pairing 航段编辑）
--
-- 幂等：UPDATE 直接将目标值置为 '1'，重复执行结果一致
-- Schema：不含 schema 前缀，通过 SET search_path 切换
-- ============================================================

UPDATE dictionary
   SET code_value = '1',
       updated_at = now()
 WHERE parent_code = 'SCENARIO_CAP_RO'
   AND code IN ('canAssign', 'canRemove', 'canReassign');
