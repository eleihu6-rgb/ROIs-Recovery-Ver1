-- 2026-09-05  Repair the live rule_violation upsert key.
--
-- Run this migration with the target live schema as current_schema(), for example:
--   SET search_path TO dev_live;
--
-- The live table is partitioned by start_dt.  The NULLS NOT DISTINCT clause is
-- intentional: pairing-level findings normally have a NULL duty_seq and must
-- still participate in ON CONFLICT de-duplication.

DO $$
DECLARE
  live_schema text := current_schema();
  table_name text := format('%I.rule_violation', current_schema());
  duplicate_sql text;
  constraint_name text;
BEGIN
  IF to_regclass(table_name) IS NULL THEN
    RAISE NOTICE 'Skipping rule_violation repair: %.rule_violation does not exist', live_schema;
    RETURN;
  END IF;

  -- Older deployments can contain many copies of the same finding because the
  -- writer had no usable conflict target. Keep the newest identity row.
  duplicate_sql := format($sql$
    DELETE FROM %1$s a
     USING %1$s b
    WHERE a.ctid < b.ctid
      AND a.crew_id IS NOT DISTINCT FROM b.crew_id
      AND a.pairing_id IS NOT DISTINCT FROM b.pairing_id
      AND a.duty_seq IS NOT DISTINCT FROM b.duty_seq
      AND a.ruleset_id IS NOT DISTINCT FROM b.ruleset_id
      AND a.rule_code IS NOT DISTINCT FROM b.rule_code
      AND a.rule_instance IS NOT DISTINCT FROM b.rule_instance
      AND a.scope_key IS NOT DISTINCT FROM b.scope_key
      AND a.start_dt IS NOT DISTINCT FROM b.start_dt
  $sql$, table_name);
  EXECUTE duplicate_sql;

  -- Remove an older standard-NULLS unique constraint if present. It does not
  -- de-duplicate rows whose pairing-level fields are NULL.
  FOR constraint_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = table_name::regclass
       AND contype = 'u'
       AND conname <> 'rule_violation_uq_scope'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', table_name, constraint_name);
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_index i ON i.indexrelid = c.conindid
     WHERE c.conrelid = table_name::regclass
       AND c.conname = 'rule_violation_uq_scope'
       AND NOT i.indnullsnotdistinct
  ) THEN
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT rule_violation_uq_scope', table_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = table_name::regclass
       AND conname = 'rule_violation_uq_scope'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT rule_violation_uq_scope UNIQUE NULLS NOT DISTINCT (crew_id, pairing_id, duty_seq, ruleset_id, rule_code, rule_instance, scope_key, start_dt)',
      table_name
    );
  END IF;
END $$;
