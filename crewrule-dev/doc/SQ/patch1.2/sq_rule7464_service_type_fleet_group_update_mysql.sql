-- 2026/01/30 Add Service Type and Fleet Group to rule 7464 (Limit Transport Length).
-- Insert as the first two columns of table 1.

-- Header update (only when old header has no Service Type/Fleet Group).
update rule_parameter
set param_values='Service Type,Fleet Group,Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length'
where rule_id in (select id from rule where `function`=7464)
  and param_names like 'table%Header%'
  and param_values='Flight Flags,Flight Assignments,Exception Flight Routes,Max Transport Length';

-- Row update: prepend defaults for new columns.
update rule_parameter
set param_values=CONCAT('*,*,', param_values)
where rule_id in (select id from rule where `function`=7464)
  and param_names like 'table%Row%'
  and (LENGTH(param_values) - LENGTH(REPLACE(param_values, ',', ''))) = 3;
