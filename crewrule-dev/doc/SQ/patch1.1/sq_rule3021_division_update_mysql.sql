-- 2026/01/21 Add DIVISION column to rule 3021 (duty sign-in) for SQ.
-- DIVISION values: P (flight crew), C (cabin crew), * (any).
-- If filiale is not 'SQ' in your database, adjust the filter accordingly.

-- NOTE:
-- The original version of this patch used a TEMPORARY TABLE to cache target rule_id values.
-- Some production DB users don't have TEMP TABLE privilege, so this script uses
-- pure UPDATE statements (no DDL) and stays idempotent.

-- Rows: default DIVISION to '*' for backward compatibility.
-- Run this BEFORE the header update so the rule_id set is determined by the pre-patch header.
UPDATE rule_parameter rp
JOIN (
  SELECT DISTINCT rule_id
  FROM (
    SELECT rp1.rule_id AS rule_id
    FROM rule_parameter rp1
    JOIN rule r1 ON rp1.rule_id = r1.id
    WHERE r1.`function` = 3021
      AND r1.filiale = 'SQ'
      AND rp1.param_names LIKE 'table%Header%'
      AND rp1.param_values NOT LIKE '%DIVISION%'
  ) x
) t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',*')
WHERE rp.param_names LIKE 'table%Row%'
  AND rp.rule_id LIKE '3021%';

-- Header: add DIVISION column (append at end).
UPDATE rule_parameter rp
JOIN (
  SELECT DISTINCT rule_id
  FROM (
    SELECT rp1.rule_id AS rule_id
    FROM rule_parameter rp1
    JOIN rule r1 ON rp1.rule_id = r1.id
    WHERE r1.`function` = 3021
      AND r1.filiale = 'SQ'
      AND rp1.param_names LIKE 'table%Header%'
      AND rp1.param_values NOT LIKE '%DIVISION%'
  ) x
) t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',DIVISION')
WHERE rp.param_names LIKE 'table%Header%'
  AND rp.rule_id LIKE '3021%';
