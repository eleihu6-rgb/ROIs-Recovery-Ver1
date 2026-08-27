-- ============================================================
-- 2026-06-10  rule_group 每个 (filiale, usage) 唯一一个默认集合
-- ============================================================
-- 变更内容：
--   新增 partial unique index，DB 层强制每个 (filiale, usage)
--   最多只有一条 is_default = true 的 rule_group
--
-- 设计说明：
--   - 一个 group 包含多个 division 的 rule_instance（P / C / A 均可）
--   - 法规引擎加载规则时传入 crew.division，过滤 ri.division
--   - group 层不区分 division，rule_group.division 字段仅作分类标注
--
-- 幂等：CREATE UNIQUE INDEX IF NOT EXISTS（DO $$ ... $$ 保护）
-- Schema：不含 schema 前缀，通过 SET search_path 切换
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'rule_group'
      AND indexname  = 'uq_rule_group_default'
  ) THEN
    CREATE UNIQUE INDEX uq_rule_group_default
      ON rule_group (filiale, usage)
      WHERE is_default = true AND is_deleted = 0;
  END IF;
END $$;
