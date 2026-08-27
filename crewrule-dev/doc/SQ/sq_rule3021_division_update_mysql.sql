-- 2026/01/21 Add DIVISION column to rule 3021 (duty sign-in) for SQ.
-- DIVISION values: P (flight crew), C (cabin crew), * (any).
-- If filiale is not 'SQ' in your database, adjust the filter accordingly.

DROP TEMPORARY TABLE IF EXISTS tmp_rule_3021_division;

CREATE TEMPORARY TABLE tmp_rule_3021_division AS
SELECT DISTINCT rp.rule_id
FROM rule_parameter rp
JOIN rule r ON rp.rule_id = r.id
WHERE r.`function` = 3021
  AND r.filiale = 'SQ'
  AND rp.param_names LIKE 'table%Header%'
  AND rp.param_values NOT LIKE '%DIVISION%';

-- Header: add DIVISION column (append at end).
UPDATE rule_parameter rp
JOIN tmp_rule_3021_division t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',DIVISION')
WHERE rp.param_names LIKE 'table%Header%' and rp.rule_id like '3021%';

-- Rows: default DIVISION to '*' for backward compatibility.
UPDATE rule_parameter rp
JOIN tmp_rule_3021_division t ON rp.rule_id = t.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',*')
WHERE rp.param_names LIKE 'table%Row%'and rp.rule_id like '3021%';

DROP TEMPORARY TABLE tmp_rule_3021_division;
