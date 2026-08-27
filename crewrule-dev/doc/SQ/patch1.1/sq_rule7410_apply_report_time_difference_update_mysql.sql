-- 2026/01/26 Rule 7410 (ANR Max FDP): add Table 2 control parameter "APPLY REPORT TIME DIFFERENCE".
-- Default value for backward compatibility: N (disabled).
-- If you need to scope to a specific airline/tenant, add a `r.filiale = 'XXX'` filter.

-- NOTE:
-- The original version of this patch used a TEMPORARY TABLE to cache target rule_id values.
-- Some production DB users don't have TEMP TABLE privilege, so this script uses
-- pure UPDATE statements (no DDL) and stays idempotent.

-- Rows: append default value 'N' for the new column.
-- Run this BEFORE the header update so the rule_id set is determined by the pre-patch header.
UPDATE rule_parameter rp
JOIN (
  SELECT DISTINCT rule_id
  FROM (
    SELECT rp1.rule_id AS rule_id
    FROM rule_parameter rp1
    JOIN rule r1 ON rp1.rule_id = r1.id
    WHERE r1.`function` = 7410
      AND rp1.param_names = 'table2Header'
      AND UPPER(rp1.param_values) NOT LIKE '%REPORT TIME DIFFERENCE%'
  ) x
) t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',N')
WHERE rp.param_names LIKE 'table2Row%'
  AND rp.rule_id LIKE '7410%';

-- Header: append "APPLY REPORT TIME DIFFERENCE" column at the end.
UPDATE rule_parameter rp
JOIN (
  SELECT DISTINCT rule_id
  FROM (
    SELECT rp1.rule_id AS rule_id
    FROM rule_parameter rp1
    JOIN rule r1 ON rp1.rule_id = r1.id
    WHERE r1.`function` = 7410
      AND rp1.param_names = 'table2Header'
      AND UPPER(rp1.param_values) NOT LIKE '%REPORT TIME DIFFERENCE%'
  ) x
) t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',APPLY REPORT TIME DIFFERENCE')
WHERE rp.param_names = 'table2Header'
  AND rp.rule_id LIKE '7410%';

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
