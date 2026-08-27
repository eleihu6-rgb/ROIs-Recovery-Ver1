-- 2026/01/29 Add "Departure time at base" window to rule 7421 (Table 1).
-- Insert after "Reporting time at base".

-- Header update (only when old header has no Departure time at base).
update rule_parameter
set param_values='Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Departure time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition'
where rule_id in (select id from rule where `function`=7421)
  and param_names like 'table1Header'
  and param_values='Clause,Pattern,Slip station,Group,Priority,Slip Arr Is Operating,Slip Dep Is Operating,Duty Assignment before slip,Duty Assignment after slip,Reporting time at base,Previous Slip Local Nights,Previous Slip had standby,Min slip hours,Min slip local nights,Max slip hours,Slip depart duty report time,Duty After Hours,Duty After Local Nights,Duty After local time,Max Standby periods,Max standby hours,Allowed duty within slip,DO after duty,Extra Condition';

-- Insert default "*" for Departure time at base (old rows have 23 commas / 24 columns).
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 10), ',*,' , SUBSTRING_INDEX(param_values, ',', -14))
where rule_id in (select id from rule where `function`=7421)
  and param_names like 'table1Row%'
  and (LENGTH(param_values) - LENGTH(REPLACE(param_values, ',', ''))) = 23;
