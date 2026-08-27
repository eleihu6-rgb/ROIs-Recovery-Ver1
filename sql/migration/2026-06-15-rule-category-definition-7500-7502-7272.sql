-- =============================================================================
-- 2026-06-15  Reclassify no-violation compute rules → category 'Definition'
-- =============================================================================
-- The `rule.category` column is a display-only taxonomy chip in the Legality tab
-- (gantt legality-rule-row.tsx). No engine or frontend logic branches on its value.
--
-- Three rules emit NO violations — they compute a value that OTHER rules consume —
-- yet they were imported from legacy with category 'Duty', inconsistent with
-- 2014/014 "Local Night Definition" which is already 'Definition'. Group them all
-- under 'Definition' so the Legality tab visually separates these helper/definition
-- rules from the real constraint rules:
--
--   7500/002  "Basic definition of Acc State"   — DEFINITION (acclimatisation TZ),
--             consumed by 7503 WOCL. Description literally says "definition".
--   7502/002  "The Calculation of Credit Hours" — CALCULATOR, produces per-activity
--             credit hours consumed by 8002 (rule-engine-rs lib.rs: "a CALC rule …
--             produces a credit-hour value … NOT a violation").
--   7272/001  "Calculate DP of the Reserves"    — CALCULATOR (duty-period calculator
--             for reserves; ws103-rule-migration-map.md: "计算器类，无参数").
--
-- (2014/014 is already 'Definition' — left untouched.)
--
-- Idempotent (re-running only touches rows still on the old category). Run per
-- airline schema via search_path.
-- =============================================================================

update rule
   set category = 'Definition',
       updated_by = 'rule_category_definition',
       updated_at = now()
 where function in (7500, 7502, 7272)
   and category <> 'Definition';
