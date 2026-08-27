-- =============================================================================
-- 2026-06-23  rule_violation: add scope_key + widen the unique key with
--             rule_instance + scope_key (live f8 + scenario schemas).
-- =============================================================================
-- Why: the dynamic rule-set recheck enforces EVERY instance of a function and EVERY
-- param row (window) of an instance, emitting "one finding per window". Several findings
-- can otherwise collide on the current unique key, which lacks rule_instance and a window
-- discriminator. scope_key carries the window signature (e.g. "28CD"/"90CD"/"365CD").
--
-- Idempotent. Run per schema (search_path): f8 (live, partitioned parent — the constraint
-- change cascades to all monthly partitions) and scenario (non-partitioned).
-- The old unique constraint is auto-named and Postgres did NOT rename it when
-- rule_group_code → ruleset_id, so we drop whatever single unique constraint exists by
-- discovering its name rather than hardcoding it.
--
-- NOTE (coordination): this changes a shared constraint. Any recheck writer must use the
-- NEW ON CONFLICT target (…, rule_instance, scope_key, …). live-legality.mjs /
-- scenario-legality.mjs in this change set already do.
-- =============================================================================

-- ───────────────────────── LIVE  (run with search_path = f8) ─────────────────────────
ALTER TABLE rule_violation ADD COLUMN IF NOT EXISTS scope_key varchar(40) NOT NULL DEFAULT '';

DO $$
DECLARE c text;
BEGIN
  -- Drop any existing unique constraint on the parent (there is exactly one), unless it is
  -- already the target constraint.
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'rule_violation'::regclass AND contype = 'u'
       AND conname <> 'rule_violation_uq_scope'
  LOOP
    EXECUTE format('ALTER TABLE rule_violation DROP CONSTRAINT %I', c);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'rule_violation'::regclass AND contype = 'u'
       AND conname = 'rule_violation_uq_scope'
  ) THEN
    ALTER TABLE rule_violation ADD CONSTRAINT rule_violation_uq_scope
      UNIQUE (crew_id, pairing_id, duty_seq, ruleset_id, rule_code, rule_instance, scope_key, start_dt);
  END IF;
END $$;

-- ─────────────────────── SCENARIO  (run with search_path = scenario) ───────────────────────
ALTER TABLE rule_violation ADD COLUMN IF NOT EXISTS scope_key varchar(40) NOT NULL DEFAULT '';

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'rule_violation'::regclass AND contype = 'u'
       AND conname <> 'scenario_rule_violation_uq_scope'
  LOOP
    EXECUTE format('ALTER TABLE rule_violation DROP CONSTRAINT %I', c);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'rule_violation'::regclass AND contype = 'u'
       AND conname = 'scenario_rule_violation_uq_scope'
  ) THEN
    ALTER TABLE rule_violation ADD CONSTRAINT scenario_rule_violation_uq_scope
      UNIQUE (scenario_id, crew_id, pairing_id, duty_seq, ruleset_id, rule_code, rule_instance, scope_key);
  END IF;
END $$;
