-- Add "Pairing Length Ends At" support for SQ rules 7422, 7435 and 7465.
-- Idempotent migration: safe to run multiple times.
-- Defaults:
--   - Rule 7422: DEBRIEF
--   - Rule 7435: TRANSPORT
--   - Rule 7465: DEBRIEF

START TRANSACTION;

-- =========================================================
-- 7422 (control table): add column and default row value
-- =========================================================
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',Pairing length ends at')
WHERE r.`function` = 7422
  AND rp.`param_names` = 'table2Header'
  AND rp.`param_values` NOT LIKE '%Pairing length ends at%'
  AND rp.`param_values` NOT LIKE '%Pairing Length Ends At%';

UPDATE `rule_parameter` rp
JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',DEBRIEF')
WHERE r.`function` = 7422
  AND rp.`param_names` LIKE 'table2Row%'
  AND (LENGTH(rp.`param_values`) - LENGTH(REPLACE(rp.`param_values`, ',', ''))) = 5;

-- =========================================================
-- 7435 (single table): add column and default row value
-- =========================================================
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',Pairing Length Ends At')
WHERE r.`function` = 7435
  AND rp.`param_names` IN ('tableHeader', 'table1Header')
  AND rp.`param_values` NOT LIKE '%Pairing Length Ends At%'
  AND rp.`param_values` NOT LIKE '%Pairing length ends at%';

UPDATE `rule_parameter` rp
JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',TRANSPORT')
WHERE r.`function` = 7435
  AND (rp.`param_names` LIKE 'tableRow%' OR rp.`param_names` LIKE 'table1Row%')
  AND (LENGTH(rp.`param_values`) - LENGTH(REPLACE(rp.`param_values`, ',', ''))) = 6;

-- =========================================================
-- 7465 (single table): add column and default row value
-- =========================================================
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',Pairing Length Ends At')
WHERE r.`function` = 7465
  AND rp.`param_names` IN ('tableHeader', 'table1Header')
  AND rp.`param_values` NOT LIKE '%Pairing Length Ends At%'
  AND rp.`param_values` NOT LIKE '%Pairing length ends at%';

UPDATE `rule_parameter` rp
JOIN `rule` r ON r.`id` = rp.`rule_id`
SET rp.`param_values` = CONCAT(rp.`param_values`, ',DEBRIEF')
WHERE r.`function` = 7465
  AND (rp.`param_names` LIKE 'tableRow%' OR rp.`param_names` LIKE 'table1Row%')
  AND (LENGTH(rp.`param_values`) - LENGTH(REPLACE(rp.`param_values`, ',', ''))) = 4;

COMMIT;
