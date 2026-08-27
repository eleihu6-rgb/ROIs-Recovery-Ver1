-- Rule 7460 migration: append TOTAL NUMBER IN PAIRING column for table 1.
-- Default existing rows to 0 so legacy duty-dispatch behavior is preserved.
--
-- Idempotent:
--   - Header is only rewritten when it is still in the old 3-column format.
--   - Rows are only rewritten when they are still in the old 3-value format.
--
-- Optional backup:
-- CREATE TABLE `rule_parameter_backup_7460_total_number_in_pairing` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7460_total_number_in_pairing`
-- SELECT rp.*
-- FROM `rule_parameter` rp
-- JOIN `rule` r ON r.id = rp.rule_id
-- WHERE r.`function` = 7460;

-- 1) Update table 1 header:
--    Duty Start Station,Duty End Station,ACTIVE
-- -> Duty Start Station,Duty End Station,ACTIVE,Total Number In Pairing
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = 'Duty Start Station,Duty End Station,ACTIVE,Total Number In Pairing',
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7460
  AND rp.phase_id = 1
  AND (rp.param_names = 'tableHeader' OR rp.param_names = 'table1Header')
  AND rp.param_values IN ('Duty Start Station,Duty End Station,ACTIVE',
                          'DUTY START STATION,DUTY END STATION,ACTIVE');

-- 2) Backfill table 1 rows with default 0
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',0'),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7460
  AND rp.phase_id = 1
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND LENGTH(rp.param_values) - LENGTH(REPLACE(rp.param_values, ',', '')) = 2;
