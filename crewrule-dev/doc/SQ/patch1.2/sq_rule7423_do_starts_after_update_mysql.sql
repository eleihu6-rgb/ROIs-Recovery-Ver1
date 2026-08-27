-- 2026/02/04 Allow "DO starts after" header for rule 7423 table 2.

update rule_parameter
set param_values=REPLACE(param_values, 'Rest starts after', 'DO starts after')
where rule_id in (select id from rule where `function`=7423)
  and param_names like 'table%Header%'
  and param_values like 'Rest starts after%';
