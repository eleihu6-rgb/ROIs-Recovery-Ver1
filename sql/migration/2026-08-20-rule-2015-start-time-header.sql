-- Rule 2015/001: rename param column "DO Start Time" → "Start Time".
-- Idempotent: only rows whose first header cell is still the legacy name.

update rule
   set param_json = jsonb_set(param_json, '{tables,0,header,0}', '"Start Time"'::jsonb),
       updated_at = now(),
       updated_by = 'system'
 where function = 2015
   and instance = '001'
   and param_json#>>'{tables,0,header,0}' = 'DO Start Time';
