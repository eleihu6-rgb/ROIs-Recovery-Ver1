-- =============================================================================
-- 2026-08-13 Rule 7305 parameter layout correction
--
-- Converts rule 7305/001 to the Rust-only 12-cell parameter layout. Run with
-- the target airline schema as the active search_path.
-- =============================================================================

begin;

update rule
   set param_json = '{
     "tables": [
       {
         "header": [
           "Bases",
           "Ranks",
           "Positions",
           "Fleets",
           "CREW TEAMS",
           "Assignment Groups",
           "Assignments",
           "Labels",
           "Attributes",
           "Consecutive Type (T/D)",
           "Max Consecutive Times",
           "Severity"
         ],
         "rows": [
           ["*", "*", "*", "*", "*", "*", "*", "*", "*", "T", "0", "0"]
         ]
       }
     ]
   }'::jsonb,
       updated_by = 'migration',
       updated_at = now()
 where rule_id = 7305001
   and function = 7305
   and instance = '001';

commit;
