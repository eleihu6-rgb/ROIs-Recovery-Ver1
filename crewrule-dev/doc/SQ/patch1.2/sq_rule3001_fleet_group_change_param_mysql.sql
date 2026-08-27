-- 2026/01/29 Add Fleet Group Change parameter after Airline Change for rule 3001.
-- Header update (only when old header has no Fleet Group Change).
update rule_parameter
set param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Fleet Group Change,Max Conn'
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Header%'
  and param_values='Airport,Inbound Duty,Outbound Duty,Aircraft Change,FLT2FERRY,FERRY2FLT,DHD2FLT,FLT2DHD,TRAIN2FLT,FLT2TRAIN,Fleets,Sub Fleets,Mct,Airline Change,Max Conn';

-- Insert default Fleet Group Change before Max Conn for rows with 15 columns (14 commas).
update rule_parameter
set param_values=CONCAT(SUBSTRING_INDEX(param_values, ',', 14), ',*,' , SUBSTRING_INDEX(param_values, ',', -1))
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Row%'
  and (LENGTH(param_values) - LENGTH(REPLACE(param_values, ',', ''))) = 14;

-- Reorder rows when Fleet Group Change was appended after Max Conn (16 columns, 15 commas).
update rule_parameter
set param_values=CONCAT(
    SUBSTRING_INDEX(param_values, ',', 14), ',',
    SUBSTRING_INDEX(param_values, ',', -1), ',',
    SUBSTRING_INDEX(SUBSTRING_INDEX(param_values, ',', -2), ',', 1)
)
where rule_id in (select id from rule where `function`=3001)
  and param_names like 'table%Row%'
  and (LENGTH(param_values) - LENGTH(REPLACE(param_values, ',', ''))) = 15;
