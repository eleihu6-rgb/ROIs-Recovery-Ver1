-- 2026-08-10  Rule 7508 "Single Day Free from Duty in Calendar Days" → add to workset 103
--
-- 7508 is the calendar-day variant of 7501 (SDFD in Rolling Hours). It was defined in the
-- RULES ruleset seed (sql/seed/07-rule.sql) and is implemented in the Rust rule engine
-- (check-7508) + legality-recheck-core.mjs, but neither the rule definition nor the
-- rule_set membership for workset 103 was applied to deployed databases. Without it,
-- the preview-draft legality pre-check silently skips 7508 (no instances in rule set).

-- 1. Insert the 7508 rule definition (idempotent — seed id 33).
INSERT INTO rule (id, created_by, created_at, updated_by, updated_at, function, instance, class, description, reference, category, store_structure, source, detail, overridability, severity, filiale, division, owner, locked, exception_code, rule_id, param_json)
OVERRIDING SYSTEM VALUE VALUES
  (33, 'system', now(), 'system', now(), 7508, '001', 'R',
   'Single Day Free from Duty in Calendar Days', 'F8', 'Duty', 'Table', 'F8',
   'Single Day Free from Duty in Calendar Days', 'S', 1, 'F8', 'P', 'S', '1',
   '', 7508001,
   '{"tables": [{"rows": [["*", "*", "*", "*", "168", "RH", "Y", "Y", "00:00", "1"], ["*", "*", "*", "*", "672", "RH", "Y", "Y", "00:00", "4"]], "header": ["Bases", "Ranks", "Fleets", "Teams", "Period", "Unit", "Duty Report", "Duty Release", "Duty End Buffer", "Min Limits"]}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 2. Map 7508001 into workset 103 (idempotent).
insert into rule_set (workset_id, rule_id)
select 103, 7508001
where not exists (select 1 from rule_set where workset_id = 103 and rule_id = 7508001);
