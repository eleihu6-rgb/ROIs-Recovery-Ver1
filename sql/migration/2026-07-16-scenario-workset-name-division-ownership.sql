-- ============================================================
-- 2026-07-16 scenario workset ownership: name + division
-- ============================================================
-- Goals:
--   1. Backfill workset.name from scenario.name
--   2. Backfill workset.division from filter_params (PO flat / RO crew)
--   3. Normalize ALL / empty / A → P for scenario-owned worksets
--   4. Set filiale + category=OPTIMIZER on scenario-linked worksets
--   5. Strip division/base from filter_params JSON
--   6. Delete orphan optimizer worksets (never RULE)
--   7. Drop scenario.name (hard switch — app reads workset.name only)
--
-- Idempotent where practical. Run against F8 remote schema with team approval.
-- ============================================================

BEGIN;

-- 1) Name: scenario.name → workset.name
UPDATE workset w
SET name = s.name,
    updated_at = now(),
    updated_by = 'migration'
FROM scenario s
WHERE s.workset_id = w.id
  AND s.name IS NOT NULL
  AND btrim(s.name) <> ''
  AND w.name IS DISTINCT FROM s.name;

-- 2) Division from filter_params (prefer flat PO, then crew.division)
UPDATE workset w
SET division = COALESCE(
      NULLIF(btrim(s.filter_params #>> '{division}'), ''),
      NULLIF(btrim(s.filter_params #>> '{crew,division}'), ''),
      w.division
    ),
    updated_at = now(),
    updated_by = 'migration'
FROM scenario s
WHERE s.workset_id = w.id
  AND (
    NULLIF(btrim(s.filter_params #>> '{division}'), '') IS NOT NULL
    OR NULLIF(btrim(s.filter_params #>> '{crew,division}'), '') IS NOT NULL
  );

-- 3) Normalize empty / ALL / * / A → P for scenario-linked worksets only
UPDATE workset w
SET division = 'P',
    updated_at = now(),
    updated_by = 'migration'
FROM scenario s
WHERE s.workset_id = w.id
  AND (
    w.division IS NULL
    OR btrim(w.division) = ''
    OR upper(btrim(w.division)) IN ('ALL', '*', 'A')
  );

-- 4) filiale + category for scenario-owned worksets
UPDATE workset w
SET filiale = COALESCE(
      NULLIF(btrim(w.filiale), ''),
      (SELECT NULLIF(btrim(code_value), '') FROM dictionary WHERE parent_code = 'DEFAULT' AND code = 'AIRLINE' LIMIT 1)
    ),
    category = COALESCE(NULLIF(btrim(w.category), ''), 'OPTIMIZER'),
    updated_at = now(),
    updated_by = 'migration'
FROM scenario s
WHERE s.workset_id = w.id;

-- 5a) Strip top-level division / base from filter_params
UPDATE scenario
SET filter_params = (filter_params - 'division' - 'base')
WHERE filter_params ? 'division' OR filter_params ? 'base';

-- 5b) Strip crew.division when present
UPDATE scenario
SET filter_params = jsonb_set(
  filter_params,
  '{crew}',
  COALESCE(filter_params -> 'crew', '{}'::jsonb) - 'division',
  true
)
WHERE filter_params #> '{crew,division}' IS NOT NULL;

-- 6) Orphan optimizer worksets (no scenario, not RULE, not linked via rule_set)
DELETE FROM workset w
WHERE NOT EXISTS (SELECT 1 FROM scenario s WHERE s.workset_id = w.id)
  AND NOT EXISTS (SELECT 1 FROM rule_set rs WHERE rs.workset_id = w.id)
  AND (w.category IS DISTINCT FROM 'RULE')
  AND (
    w.category IS NULL
    OR btrim(w.category) = ''
    OR upper(btrim(w.category)) IN ('OPTIMIZER', 'PO', 'RO', 'TO')
  );

-- 7) Hard switch: drop scenario.name
ALTER TABLE scenario DROP COLUMN IF EXISTS name;

COMMIT;
