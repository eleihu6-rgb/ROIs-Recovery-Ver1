-- Rule 2015/001: add Assignments + Assignment Groups for 1001 grace filters.
-- Idempotent: skips rows already on the three-column header.

update rule
   set param_json = '{"tables": [{"header": ["DO Start Time", "Assignments", "Assignment Groups"], "rows": [["01:00", "DO", "DO"]]}]}'::jsonb,
       updated_at = now(),
       updated_by = 'system'
 where rule_id = 2015001
   and coalesce(param_json#>>'{tables,0,header,1}', '') <> 'Assignments';
