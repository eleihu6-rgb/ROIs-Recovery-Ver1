-- =============================================================================
-- 2026-06-14  Rule 8002/006 (Maximum Flight Time) — 28-day Max Limit 112:00 → 40:00
-- =============================================================================
-- Adjusts the FIRST entry (28-day BH window) Max Limits in rule.param_json from
-- 112:00 to 40:00, in preparation for re-migrating rule 8002 from C++ to Python.
-- param_json path: {tables,0,rows,0,7}  (col 7 = "Max Limits").
--
-- Idempotent: only updates when the current value is still 112:00.
-- Applies to F8 schema (search_path=f8).
-- =============================================================================

update rule
   set param_json = jsonb_set(param_json, '{tables,0,rows,0,7}', '"40:00"'::jsonb)
 where filiale = 'F8'
   and function = 8002
   and instance = '006'
   and param_json #>> '{tables,0,rows,0,7}' = '112:00';
