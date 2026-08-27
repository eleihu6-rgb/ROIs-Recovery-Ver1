-- =============================================================================
-- 2026-06-15  Rule 8002/006 (Maximum Flight Time) — widen cumulative windows
--             90-day → 100-day, 365-day → 200-day
-- =============================================================================
-- Rule 8002/006 ("Maximum Flight Time", MAX_CUM_BLOCK) defines three rolling
-- cumulative-block windows in rule.param_json (tables[0]):
--   row 0 = 28-day  window, Max 40:00   (left as-is by this migration)
--   row 1 = 90-day  window, Max 300:00  → Period becomes 100
--   row 2 = 365-day window, Max 1000:00 → Period becomes 200
--
-- The "Period" column is index 4 of the header:
--   ["Bases","Ranks","Fleets","Crew Teams","Period","Unit","Prorated",
--    "Max Limits","Min Limits","Type"]
-- so the jsonb paths are {tables,0,rows,1,4} and {tables,0,rows,2,4}.
--
-- This lets us validate the 8002 cumulative-block check across multiple windows
-- (28 / 100 / 200 days). Max Limits are intentionally unchanged.
--
-- Idempotent: each UPDATE only fires while the current Period still holds the
-- pre-migration value (90 / 365), so re-running is a no-op.
-- Applies to the F8 schema (search_path=f8).
-- =============================================================================

-- row 1: 90-day window → 100-day
update rule
   set param_json = jsonb_set(param_json, '{tables,0,rows,1,4}', '"100"'::jsonb)
 where filiale = 'F8'
   and function = 8002
   and instance = '006'
   and param_json #>> '{tables,0,rows,1,4}' = '90';

-- row 2: 365-day window → 200-day
update rule
   set param_json = jsonb_set(param_json, '{tables,0,rows,2,4}', '"200"'::jsonb)
 where filiale = 'F8'
   and function = 8002
   and instance = '006'
   and param_json #>> '{tables,0,rows,2,4}' = '365';
