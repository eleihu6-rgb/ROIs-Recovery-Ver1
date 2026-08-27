-- 2026/01/26 Rule 7410 (ANR Max FDP): add Table 2 control parameter "APPLY REPORT TIME DIFFERENCE".
-- Default value for backward compatibility: N (disabled).
-- If you need to scope to a specific airline/tenant, add a `r.filiale = 'XXX'` filter.

DROP TEMPORARY TABLE IF EXISTS tmp_rule_7410_apply_report_time_difference;

CREATE TEMPORARY TABLE tmp_rule_7410_apply_report_time_difference AS
SELECT DISTINCT rp.rule_id
FROM rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
WHERE r.`function` = 7410
  AND rp.param_names = 'table2Header'
  AND UPPER(rp.param_values) NOT LIKE '%REPORT TIME DIFFERENCE%';

-- Header: append "APPLY REPORT TIME DIFFERENCE" column at the end.
UPDATE rule_parameter rp
JOIN tmp_rule_7410_apply_report_time_difference t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',APPLY REPORT TIME DIFFERENCE')
WHERE rp.param_names = 'table2Header' and rp.rule_id like '7410%';

-- Rows: append default value 'N' for the new column.
UPDATE rule_parameter rp
JOIN tmp_rule_7410_apply_report_time_difference t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',N')
WHERE rp.param_names LIKE 'table2Row%' and rp.rule_id like '7410%';

-- Safety: if header is already updated but some rows are still missing the last value, append it.
UPDATE rule_parameter rowp
JOIN rule r ON rowp.rule_id = r.id
JOIN rule_parameter headp
  ON headp.rule_id = rowp.rule_id
 AND headp.phase_id = rowp.phase_id
 AND headp.param_names = 'table2Header'
SET rowp.param_values = CONCAT(rowp.param_values, ',N')
WHERE r.`function` = 7410
  AND rowp.param_names LIKE 'table2Row%'
  AND UPPER(headp.param_values) LIKE '%REPORT TIME DIFFERENCE%'
  AND (LENGTH(rowp.param_values) - LENGTH(REPLACE(rowp.param_values, ',', '')))
      = (LENGTH(headp.param_values) - LENGTH(REPLACE(headp.param_values, ',', '')) - 1);

DROP TEMPORARY TABLE tmp_rule_7410_apply_report_time_difference;
