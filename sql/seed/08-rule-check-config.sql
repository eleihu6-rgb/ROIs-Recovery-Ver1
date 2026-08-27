-- Rule check configuration dictionary node.
--
-- Declares the RULE_CONFIG dictionary parent for any future rule-check config entries.
--
-- Modification history:
--   2026-05-12  Initial creation
--   2026-06-23  Dropped the dead 'default_rule_group_code' entry — the background rule-check
--               default now resolves to the default RULE workset (getDefaultRulesetId), not
--               a dictionary code. See feat/legality/drop-model-b.

-- Ensure unique index exists for idempotent inserts (same pattern as 01-dictionary.sql)
CREATE UNIQUE INDEX IF NOT EXISTS uq_dictionary_parent_code
    ON dictionary (coalesce(parent_code, '___NULL___'), code);

-- Parent node for RULE_CONFIG tree
INSERT INTO dictionary (parent_code, code, name, idx)
VALUES (null, 'RULE_CONFIG', 'Rule Config / 法规检查配置', 50)
ON CONFLICT (coalesce(parent_code, '___NULL___'), code) DO NOTHING;
