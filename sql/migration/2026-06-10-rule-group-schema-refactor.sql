-- ============================================================
-- 2026-06-10  rule 数据模型重构
-- ============================================================
-- 变更内容：
--   1. rule_template.ccar_reference  → reference
--   2. rule_instance.ccar_reference  → reference
--   3. rule_instance 新增 message_template 列（从 rule_group_item 迁移语义）
--   4. 新建 rule_group_instance（纯关联表：group_id, instance_id, enabled, sort_order）
--   5. 从 rule_group_item 迁移数据到 rule_group_instance
--   6. 删除 rule_group_item
--
-- 业务背景：
--   原设计 rule_group_item 同时承担"关联"和"参数覆盖"两个职责，
--   过度设计且引入双层 merge 复杂度。新设计：
--   - 覆盖参数直接写在 rule_instance 上（instance 独立于 group）
--   - rule_group_instance 只做纯关联，持有 enabled / sort_order
--   - message_template 移入 rule_instance，作用范围是实例本身
--
-- 幂等：所有步骤均使用 IF EXISTS / IF NOT EXISTS 保护，可重复执行
-- Schema：不含 schema 前缀，通过 SET search_path 切换
-- ============================================================

-- ------------------------------------------------------------
-- Step 1: rule_template.ccar_reference → reference
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rule_template' AND column_name = 'ccar_reference'
  ) THEN
    ALTER TABLE rule_template RENAME COLUMN ccar_reference TO reference;
    COMMENT ON COLUMN rule_template.reference IS
      '法规条款引用，如 CCAR-121-R5-121.489 / EU-OPS-1.475 / FAR-117.25 / 航司自定义条款';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Step 2: rule_instance.ccar_reference → reference
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rule_instance' AND column_name = 'ccar_reference'
  ) THEN
    ALTER TABLE rule_instance RENAME COLUMN ccar_reference TO reference;
    COMMENT ON COLUMN rule_instance.reference IS
      '法规条款引用，覆盖模板默认值，如 CCAR-121-R5-121.489 / EU-OPS-1.475 / 航司条款';
  END IF;
END $$;

-- ------------------------------------------------------------
-- Step 3: rule_instance 新增 message_template
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rule_instance' AND column_name = 'message_template'
  ) THEN
    ALTER TABLE rule_instance ADD COLUMN message_template text;
    COMMENT ON COLUMN rule_instance.message_template IS
      '自定义违规消息模板，null=使用 checker 内置消息，支持 {变量} 占位符';
  END IF;
END $$;

-- 将 rule_group_item.message_template 的现有非空值合并到 rule_instance
-- （同一 instance 可能在多个 group_item 中设置了不同 message_template，
--   取 rule_group_item.id 最大的那条作为代表值写入 instance）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'rule_group_item'
  ) THEN
    UPDATE rule_instance ri
    SET message_template = sub.message_template
    FROM (
      SELECT DISTINCT ON (gi.instance_id)
             gi.instance_id,
             gi.message_template
      FROM rule_group_item gi
      WHERE gi.message_template IS NOT NULL
      ORDER BY gi.instance_id, gi.id DESC
    ) sub
    WHERE ri.id = sub.instance_id
      AND ri.message_template IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Step 4: 新建 rule_group_instance
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rule_group_instance (
  id          bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_by  varchar(30)  NOT NULL DEFAULT 'system',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  varchar(30)  NOT NULL DEFAULT 'system',
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  group_id    bigint       NOT NULL REFERENCES rule_group(id),
  instance_id bigint       NOT NULL REFERENCES rule_instance(id),
  enabled     boolean      NOT NULL DEFAULT true,
  sort_order  integer      NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'rule_group_instance'
      AND indexname  = 'uq_rule_group_instance'
  ) THEN
    CREATE UNIQUE INDEX uq_rule_group_instance
      ON rule_group_instance (group_id, instance_id);
  END IF;
END $$;

COMMENT ON TABLE  rule_group_instance             IS '法规集合与实例的关联表，同一实例可加入多个集合';
COMMENT ON COLUMN rule_group_instance.group_id    IS '关联 rule_group.id';
COMMENT ON COLUMN rule_group_instance.instance_id IS '关联 rule_instance.id';
COMMENT ON COLUMN rule_group_instance.enabled     IS '在此集合中是否启用';
COMMENT ON COLUMN rule_group_instance.sort_order  IS '执行顺序，数值小的先执行';

-- ------------------------------------------------------------
-- Step 5: 从 rule_group_item 迁移数据
--         只迁移 group_id / instance_id / enabled / sort_order
--         severity_override / param_override 不迁移（语义已废弃）
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'rule_group_item'
  ) THEN
    INSERT INTO rule_group_instance
           (group_id, instance_id, enabled, sort_order, created_by, updated_by, created_at, updated_at)
    SELECT  gi.group_id, gi.instance_id, gi.enabled, gi.sort_order,
            gi.created_by, gi.updated_by, gi.created_at, gi.updated_at
    FROM rule_group_item gi
    ON CONFLICT (group_id, instance_id) DO NOTHING;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Step 6: 删除 rule_group_item
-- ------------------------------------------------------------
DROP TABLE IF EXISTS rule_group_item;
