-- Rule 7462 migration: append DUTY OPERATING TYPE column for table 1.
-- Default existing rows to FLY to preserve legacy pure-fly behavior.
-- Idempotent:
--   - Header is only rewritten when missing the new suffix.
--   - Rows are only rewritten when they do not already end with ',FLY', ',POS', or ',ANY'.

-- Optional backup:
-- CREATE TABLE `rule_parameter_backup_7462_operating_type` LIKE `rule_parameter`;
-- INSERT INTO `rule_parameter_backup_7462_operating_type`
-- SELECT rp.*
-- FROM `rule_parameter` rp
-- JOIN `rule` r ON r.id = rp.rule_id
-- WHERE r.`function` = 7462;

-- 1) Update table 1 header
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',Duty Operating Type'),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7462
  AND rp.phase_id = 1
  AND (rp.param_names = 'tableHeader' OR rp.param_names = 'table1Header')
  AND rp.param_values = 'Service Type,Segment Number In Duty,Allowed Sectors';

-- 2) Update table 1 data rows (default the new column to FLY)
UPDATE `rule_parameter` rp
JOIN `rule` r ON r.id = rp.rule_id
SET rp.param_values = CONCAT(rp.param_values, ',FLY'),
    rp.last_modified = CURRENT_TIMESTAMP
WHERE r.`function` = 7462
  AND rp.phase_id = 1
  AND (rp.param_names LIKE 'tableRow%' OR rp.param_names LIKE 'table1Row%')
  AND rp.param_values NOT LIKE '%,FLY'
  AND rp.param_values NOT LIKE '%,POS'
  AND rp.param_values NOT LIKE '%,ANY';
