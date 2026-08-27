-- RULE_SET supports separate LIVE/RO/PBS rule sets and an enabled flag.
ALTER TABLE workset ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
ALTER TABLE workset ALTER COLUMN type TYPE varchar(4);

-- Keep existing rule sets usable after the migration. Existing legacy R sets are
-- treated as RO sets; operators can change the type from the management screen.
UPDATE workset SET type = 'PBS' WHERE id = 103 AND category = 'RULE' AND type = 'R';
UPDATE workset SET type = 'RO' WHERE category = 'RULE' AND type = 'R';

-- The existing full F8 legality set is the initial LIVE set.
UPDATE workset SET type = 'LIVE', enabled = true
 WHERE id = 433 AND category = 'RULE' AND name = 'F8 Full Ruleset';

-- The legacy default is retained as the initial enabled PBS set for pilot division.
UPDATE workset SET enabled = true
 WHERE id = 103 AND category = 'RULE' AND division = 'P' AND type = 'PBS';

CREATE UNIQUE INDEX IF NOT EXISTS uq_workset_enabled_rule_type_division
  ON workset (type, division) WHERE category = 'RULE' AND enabled = true AND type IN ('LIVE', 'PBS');

-- Dictionary-driven choices used by the Rule Set editor.
INSERT INTO dictionary (parent_code, code, name, idx, code_value)
VALUES
  ('RULE_SET_TYPE', 'LIVE', 'Live', 1, 'LIVE'),
  ('RULE_SET_TYPE', 'RO', 'RO', 2, 'RO'),
  ('RULE_SET_TYPE', 'PBS', 'PBS', 3, 'PBS')
ON CONFLICT DO NOTHING;
